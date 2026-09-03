from dataclasses import asdict
import hashlib
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from scripts.live_demo_preparation import PreparationStore, discover_source, geometry_summary, fingerprint, illustrative_bracket_setup
from scripts.onshape_export import FrozenPartStudio, StepExport

SOURCE = FrozenPartStudio('a'*24, 'b'*24, 'c'*24, 'd'*24, 'JHD')
STEP = b'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1800000000.0
        self.store = PreparationStore(Path(self.temp.name), clock=lambda: self.now)
        self.geometry = {'source': asdict(SOURCE), 'faceCount': 1}
        self.export = StepExport(STEP, 'translation123456', 'external123456',
            'sha256-'+hashlib.sha256(STEP).hexdigest(), len(STEP), 'application/step',
            SOURCE.version_id, SOURCE.microversion_id, SOURCE.part_id, '')

    def test_completed_export_is_reused_and_tampering_is_rejected(self):
        client = Mock()
        client.export_step.return_value = self.export
        first = self.store.prepare(SOURCE, client, self.geometry)
        self.assertEqual(first, self.store.prepare(SOURCE, client, self.geometry))
        client.export_step.assert_called_once()
        self.assertFalse(first['liveSimulationReady'])
        self.assertFalse(first['geometryParityVerified'])
        self.assertEqual(self.now + 7*86400, first['expiresAt'])
        self.store.path(fingerprint(asdict(SOURCE)), 'step').unlink()
        with self.assertRaises(OSError):
            self.store.prepare(SOURCE, client, self.geometry)
        client.export_step.assert_called_once()

    def test_interrupted_export_never_auto_reposts(self):
        client = Mock()
        client.export_step.side_effect = TimeoutError()
        with self.assertRaises(TimeoutError):
            self.store.prepare(SOURCE, client, self.geometry)
        with self.assertRaisesRegex(ValueError, 'reconciliation'):
            self.store.prepare(SOURCE, client, self.geometry)
        client.export_step.assert_called_once()

    def test_expiry_removes_only_registered_artifacts(self):
        client = Mock()
        client.export_step.return_value = self.export
        receipt = self.store.prepare(SOURCE, client, self.geometry)
        self.assertEqual(0, self.store.cleanup())
        self.now += 7*86400
        self.assertEqual(1, self.store.cleanup())
        self.assertFalse(self.store.path(receipt['preparationId'], 'step').exists())
        self.assertFalse(self.store.path(receipt['preparationId'], 'geometry.json').exists())
        self.assertTrue(self.store.database.exists())
        self.assertEqual(0, self.store.cleanup())
        with self.assertRaisesRegex(ValueError, 'expired'):
            self.store.prepare(SOURCE, client, self.geometry)

    def test_source_and_storage_boundaries_fail_before_export(self):
        client = Mock()
        with self.assertRaises(ValueError):
            self.store.prepare(SOURCE, client, {'source': {}})
        client.export_step.assert_not_called()
        with self.assertRaises(ValueError):
            self.store.path('../outside', 'step')
        with self.assertRaises(ValueError):
            self.store.path('a'*64, '../outside')

    def test_discovery_requires_matching_version_and_one_solid(self):
        responses = [{'microversion': SOURCE.microversion_id},
            [{'id': SOURCE.version_id, 'microversion': SOURCE.microversion_id}],
            [{'partId': 'JHD', 'bodyType': 'solid'}]]
        get = Mock(side_effect=responses)
        self.assertEqual(SOURCE, discover_source(get, SOURCE.document_id, 'e'*24, SOURCE.element_id))
        self.assertIn('/m/'+SOURCE.microversion_id+'/', get.call_args.args[0])
        for versions, parts in (([], responses[2]), (responses[1], []), (responses[1], responses[2]*2)):
            with self.assertRaises(ValueError):
                discover_source(Mock(side_effect=[responses[0], versions, parts]), SOURCE.document_id, 'e'*24, SOURCE.element_id)

    def test_geometry_has_source_identity_and_si_measurements(self):
        body = {'microversionId': SOURCE.microversion_id, 'bodies': [{'id':'JHD','faces': [{
            'id':'face1', 'area':0.001, 'surface':{'type':'PLANE','normal':{'x':0,'y':0,'z':1}},
            'box':{'minCorner':{'x':0,'y':0,'z':0},'maxCorner':{'x':0.1,'y':0.02,'z':0}}}]}]}
        result = geometry_summary(body, SOURCE)
        self.assertEqual([100,20,0], result['overallSizeMm'])
        self.assertFalse(result['simscaleTopologyMapped'])
        self.assertEqual(1, geometry_summary({**body, 'microversionId': {'theId': SOURCE.microversion_id}}, SOURCE)['faceCount'])
        omitted = {**body, 'microversionId': None}
        with self.assertRaises(ValueError):
            geometry_summary(omitted, SOURCE)
        self.assertEqual(1, geometry_summary(omitted, SOURCE, requested_microversion=SOURCE.microversion_id)['faceCount'])
        with self.assertRaises(ValueError):
            geometry_summary({**body, 'microversionId':'wrong'}, SOURCE)
        body['bodies'][0]['faces'][0]['area'] = float('nan')
        with self.assertRaises(ValueError):
            geometry_summary(body, SOURCE)

    def bracket_geometry(self):
        supports = [dict(faceId=f'hole{i}', type='CYLINDER', radiusM=.004,
                         originM=[x,y,-.025], axis=[0,0,1], areaM2=2*math.pi*.004*.019,
                         minM=[x-.004,y-.004,-.019], maxM=[x+.004,y+.004,0])
                    for i,(x,y) in enumerate([(-.06,-.06),(-.06,.06),(.06,-.06),(.06,.06)])]
        tops = [dict(faceId=f'top{i}', type='PLANE', normal=[0,0,1], areaM2=area,
                     minM=[-x,-y,.003], maxM=[x,y,.003])
                for i,(x,y,area) in enumerate([(.025,.042,.00048513843025007144),
                                               (.021,.038,.0018116580301146582)])]
        return dict(source=asdict(SOURCE), units='SI', overallSizeMm=[148.5,148.5,28], faces=supports+tops)

    def test_illustrative_draft_preserves_total_force_and_never_approves_compute(self):
        geometry = self.bracket_geometry()
        client = Mock()
        client.export_step.return_value = self.export
        receipt = self.store.prepare(SOURCE, client, geometry)
        draft = self.store.draft_setup(receipt['preparationId'])
        self.assertEqual(draft, self.store.draft_setup(receipt['preparationId']))
        self.assertEqual([0,0,-100], draft['load']['totalForceN'])
        self.assertAlmostEqual(-100, draft['load']['combinedAreaM2'] * draft['load']['tractionPa'][2])
        self.assertEqual(4, len(draft['support']['onshapeFaces']))
        self.assertFalse(draft['computeAuthorized'])
        self.assertFalse(draft['simscaleTopologyMapped'])
        self.assertFalse(draft['engineeringVerified'])
        self.now += 7*86400
        with self.assertRaises(ValueError):
            self.store.draft_setup(receipt['preparationId'])
        self.store.cleanup()
        with self.store.connect() as db:
            self.assertEqual(0, db.execute('SELECT COUNT(*) FROM illustrative_drafts').fetchone()[0])

    def test_changed_or_ambiguous_geometry_cannot_use_bracket_assumptions(self):
        geometry = self.bracket_geometry()
        receipt = dict(source=asdict(SOURCE), state='COMPLETE', geometrySha256='sha256-'+fingerprint(geometry))
        geometry['faces'].pop()
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            illustrative_bracket_setup(geometry, receipt)
        receipt['geometrySha256'] = 'sha256-'+fingerprint(geometry)
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            illustrative_bracket_setup(geometry, receipt)
