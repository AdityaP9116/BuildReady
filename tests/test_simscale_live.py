import copy
import hashlib
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from unittest.mock import Mock

from scripts.live_demo_preparation import PreparationStore, fingerprint
from scripts.onshape_export import StepExport
from scripts.simscale_live import LiveClient, LiveWorkflow, LiveJournal, numeric_csv, verify_readback
from scripts.simscale_transport import CadImportReceipt
from tests import test_live_demo_preparation as preparation_fixtures

SOURCE = preparation_fixtures.SOURCE


def uid(n):
    return f'{n:08x}-0000-0000-0000-000000000000'


class FakeProvider(LiveClient):
    def __init__(self):
        super().__init__(api_key='synthetic', project_id='123456')
        self.calls, self.commands = [], []
        self.mesh_status, self.run_status = 'READY', 'READY'
        self.spec, self.mesh = None, None
        self.estimate = {'computeResource': {'type':'CPU_HOURS','intervalMax':.2}, 'totalRunCount':1}
        self.check = {'severity':'SUCCESS','entries':[]}
        self.entities = [{'name':'body','class':'body'}]+[{'name':f'face{i}','class':'face'} for i in range(6)]

    def import_step(self, *args, **kwargs):
        self.calls.append(('IMPORT',kwargs))
        return CadImportReceipt(self.project_id, 'storage', uid(1), uid(2), 'FINISHED')

    def collection(self, path, maximum=2000):
        if path.endswith('/topology'): return self.entities
        if path.endswith('/results'):
            return [{'resultId':uid(10+i),'name':f'BuildReady {name}', 'type':'TABLE'} for i,name in enumerate(['stress','displacement','reactions'])]
        raise AssertionError(path)

    def command(self, path):
        self.commands.append(path)
        if '/meshoperations/' in path: self.mesh_status = 'QUEUED'
        else: self.run_status = 'QUEUED'

    def csv(self, descriptor):
        return {'BuildReady stress': b'time,max\n1,2000000\n',
                'BuildReady displacement': b'time,max\n1,.0002\n',
                'BuildReady reactions': b'time,x,y,z\n1,0,0,100\n'}[descriptor['name']]

    def _api_json(self, method, path, payload=None):
        self.calls.append((method,path,copy.deepcopy(payload)))
        if path.endswith('/check'): return self.check
        if path.endswith('/estimate'): return self.estimate
        if method == 'POST' and path.endswith('/meshoperations'):
            self.mesh = copy.deepcopy(payload); return {'meshOperationId':uid(3)}
        if method == 'POST' and path.endswith('/simulations'):
            self.spec = copy.deepcopy(payload); return {'simulationId':uid(4)}
        if method == 'POST' and path.endswith('/runs'): return {'runId':uid(5)}
        if method == 'GET' and '/cadimports/' in path:
            return {'name':'BuildReady frozen demo bracket','status':'FINISHED','cadStateId':uid(2)}
        if '/meshoperations/' in path: return {**self.mesh,'status':self.mesh_status,'meshId':uid(6)}
        if '/spec?' in path or path.endswith(uid(4)) or 'simulationSpecSchemaVersion' in path: return copy.deepcopy(self.spec)
        if '/runs/' in path: return {'status':self.run_status}
        raise AssertionError((method,path))


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.now = 1800000000.
        self.store = PreparationStore(Path(self.temp.name), clock=lambda:self.now)
        content = b'ISO-10303-21;\nSI_UNIT($,.METRE.);\nEND-ISO-10303-21;'
        exporter = Mock()
        exporter.export_step.return_value = StepExport(content,'trans','external','sha256-'+hashlib.sha256(content).hexdigest(),len(content),'application/step',SOURCE.version_id,SOURCE.microversion_id,SOURCE.part_id,'')
        receipt = self.store.prepare(SOURCE,exporter,preparation_fixtures.PreparationTests().bracket_geometry())
        self.identity = receipt['preparationId']; self.client = FakeProvider()
        self.flow = LiveWorkflow(self.store,self.identity,self.client,clock=lambda:self.now)
        self.approval = {'setupHash':self.flow.draft['setupHash'],'projectId':self.client.project_id,'expiresAt':self.now+300,'maxSpendUsd':0,'transferAcknowledged':True,
                         'includedComputeConfirmed':True,'entitlementEvidence':'Synthetic entitlement for isolated tests only','maxRuns':3,'maxCoreHoursPerOperation':1}
        self.mapping = {'body':['body'],'supports':[f'face{i}' for i in range(4)],'loads':['face4','face5'],'reviewer':'Synthetic reviewer','geometryParityChecked':True,
                        'setupHash':self.flow.draft['setupHash'],'cadId':uid(1),'stateId':uid(2)}

    def test_full_fake_lifecycle_is_idempotent_and_uses_actual_result_parser(self):
        self.flow.import_cad(self.approval); self.flow.import_cad(self.approval)
        self.assertEqual(1,sum(c[0]=='IMPORT' for c in self.client.calls))
        self.assertEqual('START_REQUESTED',self.flow.advance(self.mapping,self.approval,0)['status'])
        self.assertEqual('QUEUED',self.flow.advance(self.mapping,self.approval,0)['status'])
        self.client.mesh_status = 'FINISHED'
        self.assertEqual('START_REQUESTED',self.flow.advance(self.mapping,self.approval,0)['status'])
        self.client.run_status = 'FINISHED'
        self.assertEqual(3,len(self.flow.advance(self.mapping,self.approval,0)['results']))
        self.assertEqual(2,len(self.client.commands))
        self.assertEqual(-100,self.client.spec['model']['boundaryConditions'][1]['force']['value']['z']['value'])
        selection = {'reviewer':'Reviewer','columnsAndUnitsReviewed':True,
                     'stress':{'resultId':uid(10),'columns':['max'],'unit':'Pa'},
                     'displacement':{'resultId':uid(11),'columns':['max'],'unit':'m'},
                     'reactions':{'resultId':uid(12),'columns':['x','y','z'],'unit':'N'}}
        result = self.flow.capture_metrics(uid(4),uid(5),selection)
        self.assertEqual('buildready-simulation-evidence-2.0.0',result['schemaVersion'])
        self.assertEqual('live',result['evidenceMode'])
        self.assertEqual('pending',result['review']['engineeringVerification'])
        topology = result['setup']['topologyMapping']
        self.assertEqual(self.mapping['supports'], topology['supports'])
        self.assertEqual(0, topology['meshLevel'])
        self.assertTrue(topology['geometryParityChecked'])
        self.assertEqual('123456', result['result']['projectId'])
        self.assertEqual(2,result['result']['metrics']['maximumVonMisesMpa'])
        self.assertEqual(.2,result['result']['metrics']['maximumDisplacementMm'])
        self.assertEqual(0,result['result']['metrics']['reactionBalanceErrorPercent'])
        self.assertEqual([result], self.flow.journal.evidence())
        for resource in result['result']['resources']:
            self.assertTrue(self.store.path(self.identity,'result.'+resource['resultId']+'.csv').is_file())
        self.assertEqual(result, self.flow.capture_metrics(uid(4),uid(5),selection))
        self.client.spec['model']['boundaryConditions'][1]['force']['value']['z']['value'] = -200
        with self.assertRaisesRegex(ValueError,'specification'): self.flow.capture_metrics(uid(4),uid(5),selection)
        with self.store.connect() as db:
            immutable_content = db.execute('SELECT content_json FROM live_evidence_records').fetchone()['content_json']
        self.now += 8*86400
        self.store.cleanup()
        expired = self.flow.journal.evidence()[0]
        self.assertEqual('EXPIRED', expired['currentness'])
        self.assertFalse(expired['retention']['artifactsAvailable'])
        with self.store.connect() as db:
            self.assertEqual(immutable_content, db.execute('SELECT content_json FROM live_evidence_records').fetchone()['content_json'])

    def test_approval_mapping_estimate_and_warning_fail_closed(self):
        for changes in ({'maxSpendUsd':1},{'expiresAt':self.now},{'projectId':'987'},{'transferAcknowledged':False}):
            with self.assertRaises(ValueError): self.flow.import_cad({**self.approval,**changes})
        self.assertFalse(self.client.calls)
        self.flow.import_cad(self.approval)
        with self.assertRaises(ValueError): self.flow.advance({**self.mapping,'loads':['face0','face5']},self.approval,0)
        with self.assertRaises(ValueError): self.flow.advance(self.mapping,{**self.approval,'includedComputeConfirmed':False},0)
        with self.assertRaises(ValueError): self.flow.advance(self.mapping,self.approval,3)
        self.client.check = {'severity':'WARNING','entries':[]}
        with self.assertRaises(ValueError): self.flow.advance(self.mapping,self.approval,0)
        with self.assertRaisesRegex(ValueError, 'different reviewed topology'):
            self.flow.advance({**self.mapping, 'reviewer':'Different reviewer'},self.approval,0)
        self.client.check = {'severity':'SUCCESS','entries':[]}; self.client.estimate = {'computeResource':{'type':'CPU_HOURS','value':.1},'totalRunCount':1}
        with self.assertRaises(ValueError): self.flow.advance(self.mapping,self.approval,0)
        self.assertFalse(self.client.commands)

    def test_journal_blocks_uncertain_writes_changed_slots_and_concurrent_replay(self):
        journal = self.flow.journal
        started, release = Event(), Event()
        def operation():
            started.set(); release.wait(timeout=5); return {'accepted':True}
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(journal.once,'test',{'input':1},operation)
            self.assertTrue(started.wait(timeout=3))
            with self.assertRaisesRegex(ValueError,'uncertain'): journal.once('test',{'input':1},Mock())
            release.set(); self.assertEqual({'accepted':True},first.result())
        completed = journal.summary()[0]
        self.assertTrue(completed['terminal']); self.assertFalse(completed['reconciliationRequired'])
        self.assertEqual(1, completed['attemptCount']); self.assertRegex(completed['requestHash'], r'^sha256-[0-9a-f]{64}$')
        with self.assertRaisesRegex(ValueError,'different inputs'): journal.once('test',{'input':2},Mock())
        call = Mock(side_effect=TimeoutError())
        with self.assertRaises(TimeoutError): journal.once('timeout',{},call)
        with self.assertRaises(ValueError): journal.once('timeout',{},call)
        call.assert_called_once()
        uncertain = journal.summary()[-1]
        self.assertTrue(uncertain['reconciliationRequired']); self.assertFalse(uncertain['retrySafe'])
        restarted = LiveJournal(self.store,self.identity,self.client.project_id,clock=lambda:self.now)
        self.assertEqual(uncertain, restarted.summary()[-1])

    def test_cancel_is_scoped_and_available_after_cad_expiry(self):
        with self.assertRaises(ValueError): self.flow.cancel('mesh',uid(99))
        self.flow.import_cad(self.approval); self.flow.advance(self.mapping,self.approval,0)
        self.now += 8*86400; self.store.cleanup()
        expired = LiveWorkflow(self.store,self.identity,self.client,clock=lambda:self.now,require_cad=False)
        self.assertEqual({'accepted':True},expired.cancel('mesh',uid(3)))

    def test_import_reconciliation_uses_reads_and_never_replays_upload(self):
        self.flow.import_cad(self.approval)
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='import'")
        before_imports = sum(call[0] == 'IMPORT' for call in self.client.calls)
        result = self.flow.reconcile({'stage':'import','reviewer':'Operator','providerEvidenceReviewed':True,
                                      'candidate':{'storageId':'storage','cadId':uid(1),'cadStateId':uid(2),
                                                   'stepSha256':self.flow.draft['stepSha256'],'geometryParityChecked':True}})
        self.assertEqual('RECONCILED',result['status'])
        self.assertEqual(before_imports,sum(call[0] == 'IMPORT' for call in self.client.calls))
        self.assertEqual(uid(1),self.flow.journal.completed_import().cad_id)
        summary = self.flow.journal.summary()[0]
        self.assertTrue(summary['terminal']); self.assertIsNotNone(summary['reconciliationEvidenceHash'])
        with self.assertRaisesRegex(ValueError,'write-uncertain'):
            self.flow.reconcile({'stage':'import','reviewer':'Operator','providerEvidenceReviewed':True,
                                 'candidate':{'storageId':'storage','cadId':uid(1),'cadStateId':uid(2),
                                              'stepSha256':self.flow.draft['stepSha256'],'geometryParityChecked':True}})

    def test_mesh_reconciliation_requires_exact_frozen_readback(self):
        self.flow.import_cad(self.approval)
        self.flow.advance(self.mapping,self.approval,0)
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='mesh-create-0'")
        commands = list(self.client.commands)
        candidate = {'stage':'mesh-create-0','reviewer':'Operator','providerEvidenceReviewed':True,
                     'candidate':{'meshOperationId':uid(3)}}
        self.client.mesh['model']['sizing']['fineness'] = 9
        with self.assertRaisesRegex(ValueError,'frozen request'): self.flow.reconcile(candidate)
        self.client.mesh['model']['sizing']['fineness'] = 3
        self.assertEqual('RECONCILED',self.flow.reconcile(candidate)['status'])
        self.assertEqual(commands,self.client.commands)

    def test_reconciliation_contract_and_unprovable_start_fail_closed(self):
        self.flow.import_cad(self.approval)
        self.flow.advance(self.mapping,self.approval,0)
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='mesh-start-0'")
        base = {'stage':'mesh-start-0','reviewer':'Operator','providerEvidenceReviewed':True,'candidate':{'targetId':uid(3)}}
        self.client.mesh_status = 'READY'
        with self.assertRaisesRegex(ValueError,'does not prove'): self.flow.reconcile(base)
        with self.assertRaises(ValueError): self.flow.reconcile({**base,'providerEvidenceReviewed':False})
        self.client.mesh_status = 'RUNNING'
        self.assertEqual('RECONCILED',self.flow.reconcile(base)['status'])

    def test_run_create_and_start_reconciliation_follow_exact_simulation_chain(self):
        self.flow.import_cad(self.approval)
        self.flow.advance(self.mapping,self.approval,0)
        self.client.mesh_status = 'FINISHED'
        self.flow.advance(self.mapping,self.approval,0)
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='simulation-create-0'")
        self.assertEqual('RECONCILED',self.flow.reconcile({'stage':'simulation-create-0','reviewer':'Operator',
                         'providerEvidenceReviewed':True,'candidate':{'simulationId':uid(4)}})['status'])
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='run-create-0'")
        candidate = {'stage':'run-create-0','reviewer':'Operator','providerEvidenceReviewed':True,
                     'candidate':{'simulationId':uid(4),'runId':uid(5)}}
        with self.assertRaisesRegex(ValueError,'another simulation chain'):
            self.flow.reconcile({**candidate,'candidate':{'simulationId':uid(99),'runId':uid(5)}})
        self.client.spec['model']['boundaryConditions'][1]['force']['value']['z']['value'] = -200
        with self.assertRaisesRegex(ValueError,'original frozen'):
            self.flow.reconcile(candidate)
        self.client.spec['model']['boundaryConditions'][1]['force']['value']['z']['value'] = -100
        commands = list(self.client.commands)
        self.assertEqual('RECONCILED',self.flow.reconcile(candidate)['status'])
        self.assertEqual(commands,self.client.commands)
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage='run-start-0'")
        start = {'stage':'run-start-0','reviewer':'Operator','providerEvidenceReviewed':True,'candidate':{'targetId':uid(5)}}
        self.client.run_status = 'READY'
        with self.assertRaisesRegex(ValueError,'does not prove'): self.flow.reconcile(start)
        self.client.run_status = 'FINISHED'
        self.assertEqual('RECONCILED',self.flow.reconcile(start)['status'])

    def test_cancel_reconciliation_accepts_only_a_terminal_bound_target(self):
        self.flow.import_cad(self.approval)
        self.flow.advance(self.mapping,self.approval,0)
        self.flow.cancel('mesh',uid(3))
        with self.store.connect() as db:
            stage = db.execute("SELECT stage FROM live_writes WHERE stage LIKE 'cancel-%'").fetchone()['stage']
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL WHERE stage=?",(stage,))
        candidate = {'stage':stage,'reviewer':'Operator','providerEvidenceReviewed':True,'candidate':{}}
        self.client.mesh_status = 'RUNNING'
        with self.assertRaisesRegex(ValueError,'still active'): self.flow.reconcile(candidate)
        commands = list(self.client.commands)
        self.client.mesh_status = 'CANCELED'
        result = self.flow.reconcile(candidate)
        self.assertEqual('CANCELED',result['result']['providerStatus'])
        self.assertEqual(commands,self.client.commands)

    def test_csv_and_readback_reject_ambiguous_nonfinite_and_boolean_numbers(self):
        for raw in (b'a,a\n1,2',b'a\nnan',b'a\n',b'b\n1',b'a\n1,2'):
            with self.assertRaises(ValueError): numeric_csv(raw,['a'])
        self.assertFalse(verify_readback({'force':0},{'force':False}))
        self.assertTrue(verify_readback({'force':0},{'force':0.0,'default':True}))
        self.assertFalse(verify_readback({'force':0},{'force':1}))

    def test_provider_collections_are_bounded_and_use_embedded_array(self):
        client = LiveClient(api_key='synthetic',project_id='123')
        client._api_json = Mock(side_effect=[{'_embedded':[{}]*100},{'_embedded':[{}]}])
        self.assertEqual(101,len(client.collection('/v1/test')))
        self.assertIn('page=2',client._api_json.call_args.args[1])
        client._api_json = Mock(return_value={'embedded':[]})
        with self.assertRaises(ValueError): client.collection('/v1/test')

    def test_legacy_live_journal_migrates_without_inventing_request_content(self):
        key = fingerprint({'preparation':self.identity,'project':self.client.project_id,'stage':'legacy-complete','payload':{}})
        with self.store.connect() as db:
            db.execute('DROP TABLE live_writes')
            db.execute('CREATE TABLE live_writes (key TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, project TEXT NOT NULL, stage TEXT NOT NULL, state TEXT NOT NULL, result TEXT)')
            db.execute('INSERT INTO live_writes VALUES (?, ?, ?, ?, ?, ?)',
                       (key, self.identity, self.client.project_id, 'legacy-complete', 'COMPLETE', '{"accepted":true}'))
        journal = LiveJournal(self.store,self.identity,self.client.project_id,clock=lambda:self.now)
        migrated = journal.summary()[0]
        self.assertEqual('sha256-'+key, migrated['requestHash'])
        self.assertTrue(migrated['terminal'])
        self.assertEqual({'accepted':True},journal.once('legacy-complete',{},Mock(side_effect=AssertionError('must not replay'))))
        with self.store.connect() as db:
            row = db.execute('SELECT request_json,attempt_count FROM live_writes').fetchone()
        self.assertIsNone(row['request_json'])
        self.assertEqual(1,row['attempt_count'])
        with self.store.connect() as db:
            db.execute("UPDATE live_writes SET state='WRITE_UNCERTAIN',result=NULL")
        with self.assertRaisesRegex(ValueError,'Legacy operation inputs'):
            journal.uncertain_request('legacy-complete')

    def test_retained_result_expiry_and_digest_are_enforced(self):
        journal = self.flow.journal
        journal.retain_csv(uid(10),uid(5),b'test bytes')
        with self.assertRaises(ValueError): journal.retain_csv(uid(10),uid(5),b'changed bytes')
        self.now += 8*86400; self.store.cleanup()
        self.assertFalse(self.store.path(self.identity,'result.'+uid(10)+'.csv').exists())
