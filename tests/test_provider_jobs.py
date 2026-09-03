import tempfile
import unittest
from pathlib import Path

from scripts.evidence_store import EvidenceStore, EvidenceError, digest
from scripts.provider_jobs import ProviderJobs


class ProviderJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.now = 1800000000.
        self.store = EvidenceStore(Path(self.temp.name), clock=lambda:self.now)
        session, csrf = self.store.login('a'*40, {'test':'a'*40})
        self.principal = self.store.authenticate(session,csrf,write=True)
        self.workspace = self.store.create_workspace(self.principal,'Test',{'cadDays':7,'quoteDays':30,'metadataUntilDeletion':True,'accepted':True})['id']
        self.jobs = ProviderJobs(self.store); self.hash = digest({'test':1})

    def authorize(self, setup=None):
        setup = setup or self.hash
        expiry = self.now+300
        content = digest({'setupHash':setup,'maxRuns':1,'expiresAt':expiry})
        challenge = self.store.challenge(self.principal,self.workspace,'solve','test',content)
        return self.jobs.authorize_runs(self.principal,self.workspace,setup,1,expiry,'test',challenge['nonce'])

    def test_reservation_checks_stored_inputs_lease_and_duplicate_authorizations(self):
        job = self.jobs.create(self.principal,self.workspace,'simscale_solve',{'setupHash':self.hash},'one')['id']
        self.jobs.claim(self.principal,self.workspace,job)
        other_hash = digest({'test':2})
        with self.assertRaises(EvidenceError): self.jobs.reserve_run(self.principal,self.workspace,self.authorize(other_hash),job,other_hash)
        first, second = self.authorize(), self.authorize()
        self.jobs.reserve_run(self.principal,self.workspace,first,job,self.hash)
        self.jobs.reserve_run(self.principal,self.workspace,first,job,self.hash)
        with self.assertRaises(EvidenceError): self.jobs.reserve_run(self.principal,self.workspace,second,job,self.hash)
        self.now += 61
        with self.assertRaises(EvidenceError): self.jobs.reserve_run(self.principal,self.workspace,first,job,self.hash)

    def test_uncertain_writes_stay_locked_and_receipt_ids_are_immutable(self):
        job = self.jobs.create(self.principal,self.workspace,'simscale_import',{},'one')['id']
        lease = self.jobs.claim(self.principal,self.workspace,job)
        self.jobs.before_external_write(self.principal,self.workspace,job,lease,'import')
        self.now += 61
        self.assertEqual(1,self.jobs.recover()['uncertainWrites'])
        with self.assertRaises(EvidenceError): self.jobs.claim(self.principal,self.workspace,job)
        other = self.jobs.create(self.principal,self.workspace,'simscale_import',{},'two')['id']
        lease = self.jobs.claim(self.principal,self.workspace,other)
        self.jobs.receipt(self.principal,self.workspace,other,lease,{'cadId':'one'},complete=True,result={'ok':True})
        with self.assertRaises(EvidenceError): self.jobs.receipt(self.principal,self.workspace,other,lease,{'cadId':'two'},complete=True,result={'ok':True})
