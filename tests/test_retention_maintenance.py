import tempfile
import unittest
from pathlib import Path
from scripts.evidence_store import EvidenceStore
from scripts.live_demo_preparation import PreparationStore
from scripts.retention_maintenance import maintain


class MaintenanceTests(unittest.TestCase):
    def test_dry_run_and_apply_only_expired_preparations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = EvidenceStore(root/'evidence', clock=lambda:200)
            preparations = PreparationStore(root/'cad', clock=lambda:200)
            expired, current = 'a'*64, 'b'*64
            with preparations.connect() as db:
                for identity, expiry in [(expired,100),(current,300)]:
                    db.execute('INSERT INTO preparations VALUES (?, ?, ?, NULL, NULL, ?)', (identity,'{}','COMPLETE',expiry))
                    preparations.path(identity,'step').touch()
            report = maintain(evidence, preparations)
            self.assertEqual('dry-run', report['mode'])
            self.assertEqual(1, report['expiredPreparations'])
            self.assertTrue(preparations.path(expired,'step').exists())
            result = maintain(evidence, preparations, apply=True)
            self.assertEqual(0, result['deletedOriginals'])
            self.assertEqual(1, result['expiredPreparationsCleaned'])
            self.assertFalse(preparations.path(expired,'step').exists())
            self.assertTrue(preparations.path(current,'step').exists())
            self.assertEqual(0, maintain(evidence,preparations,apply=True)['expiredPreparationsCleaned'])
            self.assertFalse(result['providerCopiesDeleted'])
            self.assertTrue(result['auditMetadataRetained'])
