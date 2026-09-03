"""Opt-in operator workflow for SimScale v1; no account writes on import/startup.

Every external write is journaled before submission. An uncertain response stops
replay. The operator must verify included/no-charge entitlement independently:
the public API estimate reports resources, not a binding price or free balance.
"""
from __future__ import annotations

import argparse
import csv
import io
from dataclasses import asdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time

try:
    from scripts.live_evidence import build_live_evidence, validate_evidence
    from scripts.job_lifecycle import lifecycle
    from scripts.live_demo_preparation import PreparationStore, encoded, fingerprint
    from scripts.simscale_transport import SimScaleTransportClient, SimScaleTransportError, CadImportReceipt, SIMSCALE_API_ORIGIN
    from scripts.simscale_probe import load_dotenv
except ModuleNotFoundError:
    from live_evidence import build_live_evidence, validate_evidence
    from job_lifecycle import lifecycle
    from live_demo_preparation import PreparationStore, encoded, fingerprint
    from simscale_transport import SimScaleTransportClient, SimScaleTransportError, CadImportReceipt, SIMSCALE_API_ORIGIN
    from simscale_probe import load_dotenv


def require(condition, message):
    if not condition:
        raise ValueError(message)


def positive(value, maximum):
    return type(value) in (int, float) and math.isfinite(value) and 0 < value <= maximum


def constant(value):
    return {'type': 'CONSTANT', 'value': value}


def static_spec(draft, receipt, mapping, mesh_id):
    """Explicit, bounded linear-static demo; mapping must be reviewed externally."""
    reference = lambda entities: {'entities': entities, 'sets': []}
    material = draft['material']
    return {'name': 'BuildReady illustrative static study', 'version': '34.0',
            'cadId': receipt.cad_id, 'stateId': receipt.cad_state_id, 'meshId': mesh_id,
            'model': {'type': 'STATIC_ANALYSIS', 'nonLinearAnalysis': False, 'meshOrder': 'SECOND',
                      'model': {'magnitude': {'value': constant(0), 'unit': 'm/s²'}},
                      'materials': [{'name': material['label'],
                                     'materialBehavior': {'type': 'LINEAR_ELASTIC', 'directionalDependency': {
                                         'type': 'ISOTROPIC', 'youngsModulus': {'value': constant(material['youngModulusPa']), 'unit': 'Pa'},
                                         'poissonsRatio': constant(material['poissonRatio'])}},
                                     'density': {'value': constant(material['densityKgM3']), 'unit': 'kg/m³'},
                                     'topologicalReference': reference(mapping['body'])}],
                      'boundaryConditions': [
                          {'type': 'FIXED_SUPPORT', 'name': 'Reviewed mounting holes', 'topologicalReference': reference(mapping['supports'])},
                          {'type': 'FORCE_LOAD', 'name': '100 N total toward base',
                           'force': {'unit': 'N', 'value': {'type': 'COMPONENT', **dict(zip(('x','y','z'), map(constant, draft['load']['totalForceN'])))}},
                           'topologicalReference': reference(mapping['loads'])}],
                      'simulationControl': {'processors': {'numOfProcessors': 2}, 'maxRunTime': {'value': 600, 'unit': 's'}},
                      'resultControl': {
                          'solutionFields': [{'type': 'DISPLACEMENT', 'name': 'Displacement', 'displacementType': {'type': 'GLOBAL'}},
                                             {'type': 'STRESS', 'name': 'Von Mises stress', 'stressType': {'type': 'VON_MISES'}}],
                          'volumeCalculation': [
                              {'type': 'MIN_MAX_FIELDS_CALCULATION', 'name': 'BuildReady displacement', 'fieldSelection': {'type': 'DISPLACEMENT'}, 'topologicalReference': reference(mapping['body'])},
                              {'type': 'MIN_MAX_FIELDS_CALCULATION', 'name': 'BuildReady stress', 'fieldSelection': {'type': 'STRESS', 'stressType': {'type': 'VON_MISES'}}, 'topologicalReference': reference(mapping['body'])}],
                          'areaCalculation': [{'type': 'SUM_FIELDS_CALCULATION', 'name': 'BuildReady reactions',
                                               'fieldSelection': {'type': 'FORCE', 'forceType': {'type': 'REACTION'}},
                                               'topologicalReference': reference(mapping['supports'])}]}}}


def validate_mapping(mapping, topology, draft, receipt):
    require(isinstance(mapping, dict) and set(mapping) == {'body', 'supports', 'loads', 'reviewer', 'geometryParityChecked', 'setupHash', 'cadId', 'stateId'}, 'Use the complete reviewed mapping contract.')
    require(mapping['setupHash'] == draft['setupHash'] and mapping['cadId'] == receipt.cad_id and mapping['stateId'] == receipt.cad_state_id, 'Mapping belongs to another CAD/setup.')
    require(mapping['geometryParityChecked'] is True and isinstance(mapping['reviewer'], str) and 0 < len(mapping['reviewer'].strip()) <= 100, 'Review imported units, shape, orientation and face selections before mapping.')
    inventory = {item['name']: item['class'] for item in topology}
    seen = set()
    expected = {'body': 1, 'supports': len(draft['support']['onshapeFaces']), 'loads': len(draft['load']['onshapeFaces'])}
    require(all(1 <= expected[key] <= 100 for key in expected), 'The reviewed setup has unsupported selection cardinality.')
    for key, count, kind in [('body', expected['body'], 'body'), ('supports', expected['supports'], 'face'), ('loads', expected['loads'], 'face')]:
        values = mapping[key]
        require(isinstance(values, list) and len(values) == count and all(isinstance(v, str) for v in values), 'The controlled bracket mapping requires 1 body, 4 support faces and 2 load faces.')
        require(len(set(values)) == count and not seen.intersection(values), 'Selections overlap or contain duplicates.')
        require(all(inventory.get(v) == kind for v in values), 'Selection is absent from current imported topology.')
        seen.update(values)
    return mapping


def verify_readback(expected, actual):
    # Provider-added defaults are permitted, but all submitted critical values
    # and ordered boundary conditions must remain unchanged.
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and verify_readback(v, actual[k]) for k,v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(expected) == len(actual) and all(verify_readback(a,b) for a,b in zip(expected, actual))
    if isinstance(expected, bool):
        return type(actual) is bool and expected == actual
    if type(expected) in (int,float):
        return type(actual) in (int,float) and math.isfinite(actual) and expected == actual
    return type(expected) is type(actual) and expected == actual


class LiveClient(SimScaleTransportClient):
    def command(self, path):
        # Start/cancel endpoints return 204, not JSON.
        with self._request('POST', SIMSCALE_API_ORIGIN + path, api_request=True) as response:
            response.read(1)

    def collection(self, path, maximum=2000):
        result = []
        for page in range(1, 22):
            value = self._api_json('GET', f'{path}?limit=100&page={page}')
            items = value.get('_embedded')
            require(isinstance(items, list), 'Provider collection response is unsupported.')
            result.extend(items)
            require(len(result) <= maximum, 'Provider collection exceeds the controlled limit.')
            if len(items) < 100:
                return result
        raise ValueError('Provider pagination did not finish within the bounded limit.')

    def csv(self, descriptor):
        download = descriptor.get('download', {})
        require(download.get('format') == 'CSV' and download.get('compression') == 'NONE', 'Only uncompressed provider CSV result resources are supported.')
        url = self._validated_upload_url(download.get('url'))
        with self._request('GET', url, api_request=False) as response:
            content = response.read(10_000_001)
        require(0 < len(content) <= 10_000_000, 'Result CSV exceeds the bounded read limit.')
        return content


def numeric_csv(content, columns):
    require(isinstance(columns, list) and 1 <= len(columns) <= 3 and len(set(columns)) == len(columns), 'Select distinct numeric result columns.')
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    require(reader.fieldnames and len(set(reader.fieldnames)) == len(reader.fieldnames) and all(c in reader.fieldnames for c in columns), 'Reviewed CSV columns are missing or duplicated.')
    values = []
    for row in reader:
        require(len(values) < 100000 and None not in row, 'CSV has too many rows or malformed columns.')
        parsed = [float(row[c]) for c in columns]
        require(all(math.isfinite(n) for n in parsed), 'Result data is missing or non-finite.')
        values.append(parsed)
    require(values, 'Result CSV contains no numeric rows.')
    return values


class LiveJournal:
    def __init__(self, store, preparation_id, project_id, *, clock=time.time):
        self.store, self.preparation_id, self.project_id, self.clock = store, preparation_id, project_id, clock
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS live_writes (key TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, project TEXT NOT NULL, stage TEXT NOT NULL, state TEXT NOT NULL, result TEXT)')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(live_writes)')}
            for name, definition in (
                ('request_hash', 'TEXT'), ('request_json', 'TEXT'), ('created', 'REAL'),
                ('updated', 'REAL'), ('attempt_count', 'INTEGER NOT NULL DEFAULT 1'),
            ):
                if name not in columns:
                    db.execute(f'ALTER TABLE live_writes ADD COLUMN {name} {definition}')
            # Older records remain usable. Their request JSON is intentionally
            # unknown rather than reconstructed after the external action.
            db.execute("UPDATE live_writes SET request_hash=COALESCE(request_hash,'sha256-'||key), created=COALESCE(created,0), updated=COALESCE(updated,0), attempt_count=COALESCE(attempt_count,1)")
            db.execute('CREATE TABLE IF NOT EXISTS live_run_specs (run_id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, project TEXT NOT NULL, simulation_id TEXT NOT NULL, spec_json TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS live_result_files (result_id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, run_id TEXT NOT NULL, digest TEXT NOT NULL, size INTEGER NOT NULL)')
            db.execute('''CREATE TABLE IF NOT EXISTS live_evidence_records (
                evidence_id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL,
                project TEXT NOT NULL, run_id TEXT NOT NULL, content_hash TEXT NOT NULL,
                content_json TEXT NOT NULL, created REAL NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS live_topology_mappings (
                preparation_id TEXT NOT NULL, project TEXT NOT NULL, level INTEGER NOT NULL,
                mapping_hash TEXT NOT NULL, mapping_json TEXT NOT NULL,
                PRIMARY KEY (preparation_id,project,level))''')
            db.execute('''CREATE TABLE IF NOT EXISTS live_run_bindings (
                run_id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, project TEXT NOT NULL,
                level INTEGER NOT NULL, mapping_hash TEXT NOT NULL, mapping_json TEXT NOT NULL)''')

    def once(self, stage, payload, operation):
        key = fingerprint({'preparation': self.preparation_id, 'project': self.project_id, 'stage': stage, 'payload': payload})
        request_hash, request_json, now = 'sha256-'+fingerprint(payload), encoded(payload), self.clock()
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT key FROM live_writes WHERE preparation_id=? AND project=? AND stage=?', (self.preparation_id, self.project_id, stage)).fetchone()
            require(prior is None or prior['key'] == key, 'This operation slot is already bound to different inputs. No additional compute was scheduled.')
            row = db.execute('SELECT * FROM live_writes WHERE key=?', (key,)).fetchone()
            if row:
                require(row['request_hash'] == request_hash and (row['request_json'] is None or row['request_json'] == request_json), 'The durable operation request no longer matches its frozen inputs.')
                require(row['state'] == 'COMPLETE', 'An external write is uncertain. Reconcile in SimScale; do not resubmit.')
                return json.loads(row['result'])
            db.execute('''INSERT INTO live_writes
                (key,preparation_id,project,stage,state,result,request_hash,request_json,created,updated,attempt_count)
                VALUES (?, ?, ?, ?, 'WRITE_UNCERTAIN', NULL, ?, ?, ?, ?, 1)''',
                (key, self.preparation_id, self.project_id, stage, request_hash, request_json, now, now))
        result = operation()
        with self.store.connect() as db:
            updated = db.execute("UPDATE live_writes SET state='COMPLETE',result=?,updated=? WHERE key=? AND state='WRITE_UNCERTAIN'",
                                 (encoded(result), self.clock(), key))
            require(updated.rowcount == 1, 'The durable operation changed while its provider write was in progress.')
        return result

    def completed_import(self):
        with self.store.connect() as db:
            rows = db.execute("SELECT result FROM live_writes WHERE preparation_id=? AND project=? AND stage='import' AND state='COMPLETE'", (self.preparation_id, self.project_id)).fetchall()
        require(len(rows) == 1, 'Import the exact prepared CAD first; uncertain imports require reconciliation.')
        return CadImportReceipt(**json.loads(rows[0]['result']))

    def retain_csv(self, result_id, run_id, content):
        result_id = SimScaleTransportClient._uuid(result_id, 'result')
        content_hash = 'sha256-'+hashlib.sha256(content).hexdigest()
        path = self.store.path(self.preparation_id, 'result.'+result_id+'.csv')
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM live_result_files WHERE result_id=?', (result_id,)).fetchone()
            if row:
                require(row['preparation_id'] == self.preparation_id and row['run_id'] == run_id and row['digest'] == content_hash, 'Result identity or bytes changed; retained evidence is immutable.')
                require('sha256-'+hashlib.sha256(path.read_bytes()).hexdigest() == content_hash, 'Retained result integrity failed.')
                return content_hash
            size = db.execute('SELECT COALESCE(SUM(size),0) FROM live_result_files WHERE preparation_id=?', (self.preparation_id,)).fetchone()[0]
            require(size+len(content) <= 100_000_000, 'Private result quota exceeded.')
            # Register before writing: interruption stays visible and cleanup can
            # remove a partial file rather than leaving an untracked artifact.
            db.execute('INSERT INTO live_result_files VALUES (?, ?, ?, ?, ?)', (result_id, self.preparation_id, run_id, content_hash, len(content)))
        with path.open('xb') as stream:
            stream.write(content); stream.flush(); os.fsync(stream.fileno())
        return content_hash

    def retain_mapping(self, level, mapping):
        content, mapping_hash = encoded(mapping), 'sha256-' + fingerprint(mapping)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM live_topology_mappings WHERE preparation_id=? AND project=? AND level=?',
                               (self.preparation_id, self.project_id, level)).fetchone()
            if prior:
                require(prior['mapping_hash'] == mapping_hash and prior['mapping_json'] == content,
                        'This mesh level is already bound to a different reviewed topology mapping.')
            else:
                db.execute('INSERT INTO live_topology_mappings VALUES (?, ?, ?, ?, ?)',
                           (self.preparation_id, self.project_id, level, mapping_hash, content))
        return mapping_hash

    def bind_run(self, run_id, level, mapping_hash, mapping):
        content = encoded(mapping)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM live_run_bindings WHERE run_id=?', (run_id,)).fetchone()
            require(prior is None or (prior['preparation_id'] == self.preparation_id and prior['project'] == self.project_id
                    and prior['level'] == level and prior['mapping_hash'] == mapping_hash and prior['mapping_json'] == content),
                    'Run identity is already bound to another topology mapping.')
            db.execute('INSERT OR IGNORE INTO live_run_bindings VALUES (?, ?, ?, ?, ?, ?)',
                       (run_id, self.preparation_id, self.project_id, level, mapping_hash, content))

    def mapping_for_run(self, run_id):
        with self.store.connect() as db:
            row = db.execute('SELECT level,mapping_hash,mapping_json FROM live_run_bindings WHERE run_id=? AND preparation_id=? AND project=?',
                             (run_id, self.preparation_id, self.project_id)).fetchone()
        require(row is not None, 'The run has no retained reviewed topology binding.')
        return row['level'], row['mapping_hash'], json.loads(row['mapping_json'])

    def summary(self):
        with self.store.connect() as db:
            rows = db.execute('''SELECT key,stage,state,request_hash,created,updated,attempt_count,result
                FROM live_writes WHERE preparation_id=? AND project=? ORDER BY rowid''',
                (self.preparation_id, self.project_id)).fetchall()
        output = []
        for row in rows:
            result = json.loads(row['result']) if row['result'] else None
            remote = {key: value for key, value in (result or {}).items()
                      if key in {'storage_id','cad_id','cad_state_id','meshOperationId','simulationId','runId'} and isinstance(value, str)}
            output.append({
                'jobId': 'live-'+row['key'][:16], 'stage': row['stage'],
                'requestHash': row['request_hash'], **lifecycle(row['state']),
                'attemptCount': row['attempt_count'], 'createdAt': row['created'],
                'updatedAt': row['updated'], 'remote': remote,
            })
        return output

    def retain_evidence(self, record):
        validate_evidence(record)
        content = encoded(record)
        content_hash = 'sha256-' + hashlib.sha256(content.encode('utf-8')).hexdigest()
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM live_evidence_records WHERE evidence_id=?', (record['evidenceId'],)).fetchone()
            if row:
                require(row['preparation_id'] == self.preparation_id and row['project'] == self.project_id
                        and row['run_id'] == record['result']['runId'] and row['content_hash'] == content_hash,
                        'Simulation evidence identity was rebound or changed; retained evidence is immutable.')
                return json.loads(row['content_json'])
            prior = db.execute('SELECT evidence_id FROM live_evidence_records WHERE preparation_id=? AND project=? AND run_id=?',
                               (self.preparation_id, self.project_id, record['result']['runId'])).fetchone()
            require(prior is None, 'This provider run already has a different retained evidence record; explicit reconciliation is required.')
            db.execute('INSERT INTO live_evidence_records VALUES (?, ?, ?, ?, ?, ?, ?)',
                       (record['evidenceId'], self.preparation_id, self.project_id, record['result']['runId'], content_hash, content, self.clock()))
        return record

    def evidence(self):
        with self.store.connect() as db:
            rows = db.execute('SELECT content_json FROM live_evidence_records WHERE preparation_id=? AND project=? ORDER BY created,evidence_id',
                              (self.preparation_id, self.project_id)).fetchall()
            preparation = db.execute('SELECT state,expires FROM preparations WHERE id=?', (self.preparation_id,)).fetchone()
        expired = preparation is None or preparation['state'] == 'EXPIRED' or preparation['expires'] <= self.clock()
        records = []
        for row in rows:
            record = json.loads(row['content_json'])
            if expired:
                # Retained content remains immutable. Availability/currentness
                # are a read-time view over the preparation retention state.
                record['currentness'] = 'EXPIRED'
                record['retention']['artifactsAvailable'] = False
            records.append(validate_evidence(record))
        return records


class LiveWorkflow:
    def __init__(self, store, preparation_id, client, *, clock=time.time, require_cad=True):
        self.store, self.identity, self.client, self.clock = store, preparation_id, client, clock
        self.draft = store.draft_setup(preparation_id) if require_cad else None
        self.journal = LiveJournal(store, preparation_id, client.project_id, clock=clock)
        self.base = f'/v1/projects/{client.project_id}'

    def approval(self, value, action):
        require(isinstance(value, dict), 'Explicit operator approval is required.')
        require(value.get('setupHash') == self.draft['setupHash'] and value.get('projectId') == self.client.project_id, 'Approval does not match this exact setup/project.')
        require(positive(value.get('expiresAt'), self.clock()+3600) and value['expiresAt'] > self.clock(), 'Approval expired or exceeds one hour.')
        require(value.get('maxSpendUsd') == 0 and type(value.get('maxSpendUsd')) in (int,float), 'Only a zero-dollar approval is supported.')
        require(value.get('transferAcknowledged') is True, 'Approve this exact demo CAD transfer, including project visibility.')
        if action == 'compute':
            require(value.get('includedComputeConfirmed') is True and isinstance(value.get('entitlementEvidence'), str) and 10 <= len(value['entitlementEvidence']) <= 500, 'The operator must verify included no-charge static/mesh entitlement; an API key or estimate is insufficient.')
            require(type(value.get('maxRuns')) is int and 1 <= value['maxRuns'] <= 3, 'Approve at most three controlled runs.')
            require(positive(value.get('maxCoreHoursPerOperation'), 1), 'Set a finite per-operation core-hour allowance no larger than one.')
        return value

    def import_cad(self, approval):
        self.approval(approval, 'transfer')
        content = self.store.path(self.identity, 'step').read_bytes()
        require('sha256-'+hashlib.sha256(content).hexdigest() == self.draft['stepSha256'], 'CAD bytes changed.')
        units = re.findall(rb'SI_UNIT\s*\(\s*([^,]+),\s*\.METRE\.\s*\)', content)
        require(units and all(unit.strip() == b'$' for unit in units) and b'CONVERSION_BASED_UNIT' not in content, 'This export path requires explicitly meter-based STEP units.')
        return self.journal.once('import', {'stepHash': self.draft['stepSha256']}, lambda: asdict(self.client.import_step(content, name='BuildReady frozen demo bracket', input_unit='m')))

    def topology(self):
        receipt = self.journal.completed_import()
        items = self.client.collection(f'/v1/cads/{receipt.cad_id}/states/{receipt.cad_state_id}/topology')
        return {'cadId': receipt.cad_id, 'stateId': receipt.cad_state_id, 'setupHash': self.draft['setupHash'],
                'entities': [{'name': i['name'], 'class': i['class']} for i in items]}

    def _create(self, stage, path, payload, id_field):
        def operation():
            response = self.client._api_json('POST', path, payload)
            return {id_field: self.client._uuid(response.get(id_field), id_field)}
        return self.journal.once(stage, payload, operation)[id_field]

    def _start(self, stage, path, spec, approval):
        self.approval(approval, 'compute')
        check = self.client._api_json('POST', path + '/check')
        require(check.get('severity') in {'SUCCESS','INFO'} and isinstance(check.get('entries'), list)
                and all(e.get('severity') in {'SUCCESS','INFO'} for e in check['entries']), 'Provider setup check requires operator attention; warnings are not silently accepted.')
        estimate = self.client._api_json('POST', path + '/estimate')
        resource = estimate.get('computeResource', {})
        require(resource.get('type') == 'CPU_HOURS' and positive(resource.get('intervalMax'), approval['maxCoreHoursPerOperation'])
                and estimate.get('totalRunCount') == 1, 'Resource estimate is missing, unsupported or above the approved limit.')
        require(verify_readback(spec, self.client._api_json('GET', path+'?meshingSpecSchemaVersion=10.0')), 'Provider read-back changed reviewed setup values.')
        self.approval(approval, 'compute')
        return self.journal.once(stage, spec, lambda: self._command_receipt(path+'/start'))

    def _command_receipt(self, path):
        self.client.command(path)
        return {'accepted': True}

    def advance(self, mapping, approval, level):
        self.approval(approval, 'compute')
        require(type(level) is int and 0 <= level < approval['maxRuns'], 'Mesh/run level is outside the approved count.')
        receipt = self.journal.completed_import()
        topology = self.topology()['entities']
        validate_mapping(mapping, topology, self.draft, receipt)
        mapping_hash = self.journal.retain_mapping(level, mapping)
        mesh_spec = {'name': f'BuildReady mesh level {level}', 'version': '10.0', 'cadId': receipt.cad_id, 'stateId': receipt.cad_state_id,
                     'model': {'type': 'SIMMETRIX_MESHING_SOLID', 'sizing': {'type': 'AUTOMATIC_V9', 'fineness': 3+level*2},
                               'numOfProcessors': 4, 'maxMeshingRunTime': {'value': 600, 'unit': 's'}}}
        # Maximum runtime/core caps are part of the read-back-checked contract.
        require(approval['maxCoreHoursPerOperation'] >= 4*600/3600, 'Approved resource cap is below the bounded mesh runtime envelope.')
        mesh_operation = self._create(f'mesh-create-{level}', self.base+'/meshoperations', mesh_spec, 'meshOperationId')
        mesh_path = self.base+'/meshoperations/'+mesh_operation
        mesh = self.client._api_json('GET', mesh_path+'?meshingSpecSchemaVersion=10.0')
        if mesh.get('status') == 'READY':
            self._start(f'mesh-start-{level}', mesh_path, mesh_spec, approval)
            return {'stage': 'mesh', 'status': 'START_REQUESTED', 'meshOperationId': mesh_operation}
        require(mesh.get('status') in {'QUEUED','RUNNING','FINISHED','FAILED','CANCELED'}, 'Unknown mesh status.')
        if mesh['status'] != 'FINISHED':
            return {'stage': 'mesh', 'status': mesh['status'], 'meshOperationId': mesh_operation}
        mesh_id = self.client._uuid(mesh.get('meshId'), 'mesh')
        require(verify_readback(mesh_spec, mesh), 'Completed mesh no longer matches its requested settings.')
        spec = static_spec(self.draft, receipt, mapping, mesh_id)
        simulation = self._create(f'simulation-create-{level}', self.base+'/simulations', spec, 'simulationId')
        sim_path = self.base+'/simulations/'+simulation
        require(verify_readback(spec, self.client._api_json('GET', sim_path+'?simulationSpecSchemaVersion=34.0')), 'Simulation read-back differs from approved inputs.')
        run = self._create(f'run-create-{level}', sim_path+'/runs', {'name': f'BuildReady verification level {level}'}, 'runId')
        with self.store.connect() as db:
            prior = db.execute('SELECT spec_json FROM live_run_specs WHERE run_id=?', (run,)).fetchone()
            require(prior is None or prior['spec_json'] == encoded(spec), 'Run identity was rebound to another setup.')
            db.execute('INSERT OR IGNORE INTO live_run_specs VALUES (?, ?, ?, ?, ?)', (run, self.identity, self.client.project_id, simulation, encoded(spec)))
        self.journal.bind_run(run, level, mapping_hash, mapping)
        run_path = sim_path+'/runs/'+run
        state = self.client._api_json('GET', run_path)
        require(verify_readback(spec, self.client._api_json('GET', run_path+'/spec?simulationSpecSchemaVersion=34.0')), 'Frozen run does not match the reviewed simulation.')
        if state.get('status') == 'READY':
            # Check/estimate belong to the simulation, start belongs to the run.
            check = self.client._api_json('POST', sim_path+'/check')
            estimate = self.client._api_json('POST', sim_path+'/estimate')
            require(check.get('severity') in {'SUCCESS','INFO'} and all(e.get('severity') in {'SUCCESS','INFO'} for e in check.get('entries', [{'severity':'ERROR'}])), 'Simulation check needs review.')
            resource = estimate.get('computeResource', {})
            require(resource.get('type') == 'CPU_HOURS' and positive(resource.get('intervalMax'), approval['maxCoreHoursPerOperation']) and estimate.get('totalRunCount') == 1, 'Simulation estimate exceeds the allowance or is unknown.')
            self.approval(approval, 'compute')
            require(verify_readback(spec, self.client._api_json('GET', run_path+'/spec?simulationSpecSchemaVersion=34.0')), 'Run setup changed before start.')
            self.journal.once(f'run-start-{level}', spec, lambda: self._command_receipt(run_path+'/start'))
            state = {'status': 'START_REQUESTED'}
        require(state.get('status') in {'START_REQUESTED','QUEUED','RUNNING','FINISHED','FAILED','CANCELED'}, 'Unknown simulation status.')
        result = {'stage': 'simulation', 'status': state['status'], 'simulationId': simulation, 'runId': run,
                  'setupHash': self.draft['setupHash'], 'stepSha256': self.draft['stepSha256'], 'engineeringVerified': False}
        if state['status'] == 'FINISHED':
            result['results'] = self.results(simulation, run)
        return result

    def results(self, simulation, run):
        simulation, run = self.client._uuid(simulation, 'simulation'), self.client._uuid(run, 'run')
        path = f'{self.base}/simulations/{simulation}/runs/{run}'
        require(self.client._api_json('GET', path).get('status') == 'FINISHED', 'Results require a finished run.')
        return [{k: item[k] for k in ('resultId','type','category','name','quantity') if k in item}
                for item in self.client.collection(path+'/results')]

    def capture_metrics(self, simulation, run, selection):
        """Operator-reviewed CSV columns; never invent a schema or engineering pass."""
        simulation, run = self.client._uuid(simulation, 'simulation'), self.client._uuid(run, 'run')
        with self.store.connect() as db:
            known = [json.loads(r['result']) for r in db.execute("SELECT result FROM live_writes WHERE preparation_id=? AND project=? AND state='COMPLETE' AND stage LIKE 'run-create-%'", (self.identity, self.client.project_id))]
        require(any(r.get('runId') == run for r in known), 'Only a run created by this preparation can supply metrics.')
        require(isinstance(selection, dict) and set(selection) == {'reviewer','columnsAndUnitsReviewed','stress','displacement','reactions'}, 'Use the complete reviewed result-column contract.')
        require(selection['columnsAndUnitsReviewed'] is True and isinstance(selection['reviewer'], str) and 0 < len(selection['reviewer'].strip()) <= 100, 'Review CSV column meaning, units and final-step reaction rows first.')
        path = f'{self.base}/simulations/{simulation}/runs/{run}'
        require(self.client._api_json('GET', path).get('status') == 'FINISHED', 'Result capture requires a finished run.')
        spec = self.client._api_json('GET', path+'/spec?simulationSpecSchemaVersion=34.0')
        require(spec.get('cadId') == self.journal.completed_import().cad_id and spec.get('stateId') == self.journal.completed_import().cad_state_id, 'Run references different CAD.')
        with self.store.connect() as db:
            saved = db.execute('SELECT spec_json FROM live_run_specs WHERE run_id=? AND preparation_id=? AND project=? AND simulation_id=?', (run, self.identity, self.client.project_id, simulation)).fetchone()
        require(saved is not None and verify_readback(json.loads(saved['spec_json']), spec), 'Result run no longer matches the submitted frozen specification.')
        # Retain a read-back fingerprint in addition to the requested setup hash.
        writable = {k: spec[k] for k in ('name','version','cadId','stateId','meshId','model')}
        require(writable['model'].get('type') == 'STATIC_ANALYSIS' and writable['model'].get('nonLinearAnalysis') is False, 'Only controlled linear static result capture is supported.')
        descriptors = self.client.collection(path+'/results')
        resources, metrics = [], {}
        for key, expected_name, units in [('stress','BuildReady stress',{'Pa':1e-6,'MPa':1}), ('displacement','BuildReady displacement',{'m':1000,'mm':1}), ('reactions','BuildReady reactions',{'N':1})]:
            choice = selection[key]
            require(isinstance(choice, dict) and set(choice) == {'resultId','columns','unit'} and choice['unit'] in units, 'Unsupported metric columns or units.')
            matches = [r for r in descriptors if r.get('resultId') == choice['resultId'] and r.get('name') == expected_name and r.get('type') in {'TABLE','PLOT'}]
            require(len(matches) == 1 and len(choice['columns']) == (3 if key == 'reactions' else 1), 'Choose the exact generated metric resource and its required columns.')
            content = self.client.csv(matches[0])
            values = numeric_csv(content, choice['columns'])
            factor = units[choice['unit']]
            if key == 'reactions': metrics['reactionForceN'] = [n*factor for n in values[-1]]
            else:
                require(all(row[0] >= 0 for row in values), 'Stress magnitude and displacement magnitude cannot be negative.')
                metrics['maximumVonMisesMpa' if key == 'stress' else 'maximumDisplacementMm'] = max(row[0] for row in values)*factor
            content_hash = self.journal.retain_csv(choice['resultId'], run, content)
            resources.append({'resultId': choice['resultId'], 'sha256': content_hash, 'columns': choice['columns'], 'unit': choice['unit']})
        force = self.draft['load']['totalForceN']
        metrics['reactionBalanceErrorPercent'] = 100 * math.sqrt(sum((a+b)**2 for a,b in zip(force, metrics['reactionForceN']))) / math.sqrt(sum(a*a for a in force))
        with self.store.connect() as db:
            retained = db.execute('SELECT expires FROM preparations WHERE id=?', (self.identity,)).fetchone()
        require(retained is not None, 'The CAD preparation retention record is missing.')
        mesh_level, mapping_hash, topology_mapping = self.journal.mapping_for_run(run)
        evidence = build_live_evidence(
            preparation_id=self.identity, draft=self.draft, project_id=self.client.project_id,
            simulation_id=simulation, run_id=run, run_spec_hash='sha256-'+fingerprint(writable),
            resources=resources, metrics=metrics, reviewer=selection['reviewer'], topology_mapping=topology_mapping,
            mapping_hash=mapping_hash, mesh_level=mesh_level, expires_at=retained['expires'])
        return self.journal.retain_evidence(evidence)

    def cancel(self, kind, identity, simulation=None):
        identity = self.client._uuid(identity, kind)
        require(kind in {'mesh', 'run'}, 'Only mesh/run cancellation is supported.')
        with self.store.connect() as db:
            receipts = [json.loads(r['result']) for r in db.execute("SELECT result FROM live_writes WHERE preparation_id=? AND project=? AND state='COMPLETE'", (self.identity, self.client.project_id))]
        field = 'runId' if kind == 'run' else 'meshOperationId'
        require(any(r.get(field) == identity for r in receipts), 'Cancellation is limited to resources created by this preparation.')
        if kind == 'run':
            simulation = self.client._uuid(simulation, 'simulation')
            path = f'{self.base}/simulations/{simulation}/runs/{identity}'
        else:
            path = f'{self.base}/meshoperations/{identity}'
        state = self.client._api_json('GET', path)
        if state.get('status') in {'FINISHED','FAILED','CANCELED'}:
            return {'status': state['status']}
        return self.journal.once('cancel-'+identity, {'path': path}, lambda: self._command_receipt(path+'/cancel'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['status','evidence','import','topology','advance','cancel','results'])
    parser.add_argument('--preparation', required=True)
    parser.add_argument('--approval', type=Path)
    parser.add_argument('--mapping', type=Path)
    parser.add_argument('--level', type=int, default=0)
    parser.add_argument('--kind', choices=['mesh','run'])
    parser.add_argument('--id')
    parser.add_argument('--simulation')
    args = parser.parse_args()
    load_dotenv()
    client = LiveClient(api_key=os.environ.get('SIMSCALE_API_KEY',''), project_id=os.environ.get('SIMSCALE_PROJECT_ID',''))
    workflow = LiveWorkflow(PreparationStore(), args.preparation, client, require_cad=args.action not in {'status','cancel','evidence'})
    def read(path):
        require(path is not None and path.stat().st_size <= 65536, 'Supply a bounded local approval/mapping JSON file.')
        return json.loads(path.read_text(encoding='utf-8'))
    if args.action == 'status':
        result = {'operations': workflow.journal.summary(), 'evidenceCount': len(workflow.journal.evidence()), 'engineeringVerified': False}
    elif args.action == 'evidence': result = {'records': workflow.journal.evidence()}
    elif args.action == 'import': result = workflow.import_cad(read(args.approval))
    elif args.action == 'topology': result = workflow.topology()
    elif args.action == 'advance': result = workflow.advance(read(args.mapping), read(args.approval), args.level)
    elif args.action == 'results': result = workflow.capture_metrics(args.simulation, args.id, read(args.mapping))
    else: result = workflow.cancel(args.kind, args.id, args.simulation)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, sqlite3.Error, SimScaleTransportError) as error:
        print(json.dumps({'ok': False, 'code': getattr(error, 'code', 'LIVE_OPERATION_BLOCKED'),
                          'message': 'Operation stopped. Review setup, approvals, provider checks and the local journal. Do not replay an uncertain write.'}))
        raise SystemExit(1) from None
