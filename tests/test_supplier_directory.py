import tempfile
import unittest
from pathlib import Path

from scripts.evidence_store import EvidenceStore, EvidenceError, Principal
from scripts.sourcing_service import SourcingService


class SupplierDirectoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = EvidenceStore(Path(self.temp.name))
        self.principal = Principal('owner', 'test')
        self.workspace = self.store.create_workspace(self.principal, 'Test',
            {'cadDays':7,'quoteDays':30,'metadataUntilDeletion':True,'accepted':True})['id']
        self.service = SourcingService(self.store)
        self.payload = dict(supplierId=None, expectedVersion=None, name='Illustrative supplier',
                            contact=None, website='https://supplier.invalid', active=True)

    def test_versioned_edits_archive_and_owner_isolation(self):
        record = self.service.save_supplier(self.principal, self.workspace, self.payload)
        self.assertFalse(record['content']['sharingAuthorized'])
        self.assertFalse(record['content']['verified'])
        revised = {**self.payload,'supplierId':record['id'],'expectedVersion':1,'name':'Renamed','active':False}
        self.assertEqual('archived', self.service.save_supplier(self.principal,self.workspace,revised)['state'])
        self.assertEqual('Illustrative supplier', self.store.get_record(self.principal,self.workspace,record['id'],version=1)['content']['name'])
        with self.assertRaises(EvidenceError): self.service.save_supplier(self.principal,self.workspace,revised)
        with self.assertRaises(EvidenceError): self.store.list_records(Principal('other','test'),self.workspace,'supplier')
        with self.assertRaises(EvidenceError): self.service.save_supplier(Principal('other','test'),self.workspace,self.payload)

    def test_invalid_websites_and_contracts(self):
        for url in ['javascript:alert(1)', 'http://supplier.invalid', 'https://user:secret@supplier.invalid', 'https://[bad']:
            with self.assertRaises(EvidenceError):
                self.service.save_supplier(self.principal,self.workspace,{**self.payload,'website':url})
        with self.assertRaises(EvidenceError):
            self.service.save_supplier(self.principal,self.workspace,{**self.payload,'active':'true'})
