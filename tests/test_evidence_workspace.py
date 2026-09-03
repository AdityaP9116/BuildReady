from __future__ import annotations

import copy
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from scripts.evidence_store import EvidenceError, EvidenceStore, digest
from scripts.sourcing_service import SourcingService, CHARGES, decimal_amount


STEP = b'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
PDF = b'%PDF-1.4\nsynthetic quotation, never supplier evidence\n%%EOF'
SOURCE = {'documentId': '0123456789abcdef01234567', 'elementId': '1123456789abcdef01234567',
          'microversionId': '2123456789abcdef01234567', 'versionId': '3123456789abcdef01234567',
          'configuration': {}, 'partIds': ['test-part']}
REQUIREMENTS = {'material': {'grade': '6061', 'condition': 'T6', 'substitutions': 'none'},
                'process': 'CNC', 'quantity': 10, 'purchaseUnit': 'each', 'tolerances': 'drawing A',
                'finish': 'none_required', 'inspection': 'standard_supplier_inspection_requested',
                'delivery': {'country': 'US', 'region': 'IL', 'shippingBasis': 'delivered', 'targetDate': None},
                'exceptions': 'none'}


class EvidenceWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.now = 1800000000.0
        self.store = EvidenceStore(Path(self.temp.name), clock=lambda: self.now)
        self.service = SourcingService(self.store)
        self.owners = {'alice': 'a' * 40, 'bob': 'b' * 40}
        self.session, self.csrf = self.store.login('a' * 40, self.owners)
        self.principal = self.store.authenticate(self.session, self.csrf, write=True)
        other, _ = self.store.login('b' * 40, self.owners)
        self.other = self.store.authenticate(other)
        self.scope = self.store.create_workspace(self.principal, 'Synthetic test',
            {'cadDays': 7, 'quoteDays': 30, 'metadataUntilDeletion': True, 'accepted': True})['id']

    def tearDown(self):
        self.temp.cleanup()

    def request_draft(self, **changes):
        artifact = self.store.ingest(self.principal, self.scope, 'step', 'fixture.step', STEP)
        payload = {'source': SOURCE, 'stepArtifactId': artifact['id'], 'requirements': REQUIREMENTS,
                   'requestId': None, 'expectedVersion': None, 'idempotencyKey': artifact['id'], **changes}
        return self.service.prepare_request(self.principal, self.scope, payload), payload

    def frozen(self):
        draft, _ = self.request_draft()
        challenge = self.service.request_challenge(self.principal, self.scope, draft['id'], draft['version'], 'freeze_rfq')
        return self.service.freeze(self.principal, self.scope, draft['id'], draft['version'], challenge['nonce'])

    def quote_payload(self, rfq, name='supplier-a'):
        artifact = self.store.ingest(self.principal, self.scope, 'supplier_pdf', 'fixture.pdf', PDF)
        charge = {'state': 'not_applicable', 'amount': None, 'basis': 'per_order', 'includedIn': None}
        charges = {key: dict(charge) for key in CHARGES}
        charges['setup'] = {**charge, 'state': 'quoted_separately', 'amount': '80.00'}
        charges['shipping'] = {**charge, 'state': 'unknown'}
        charges['tax'] = {**charge, 'state': 'excluded'}
        fields = ['supplier', 'quoteReference', 'issuedAt', 'quantity', 'currency', 'offerType', 'unitPrice', 'scopeMatch', 'validUntil', 'leadTime'] + ['charges.' + key for key in CHARGES]
        return {'requestId': rfq['id'], 'requestVersion': rfq['version'], 'artifactId': artifact['id'],
                'supplier': {'identity': name, 'name': name, 'independenceAttested': True},
                'quoteReference': 'SYNTHETIC-ONLY', 'issuedAt': '2026-09-01', 'validUntil': '2027-12-31',
                'offerType': 'supplier_quote', 'scopeMatch': 'supplier_confirmed', 'deviations': [],
                'quantity': 10, 'currency': 'USD', 'unitPrice': '42.50', 'charges': charges,
                'leadTime': '10 business days from order approval',
                'citations': {key: {'artifactId': artifact['id'], 'locator': 'synthetic test page 1', 'rawValue': 'fictional test terms'} for key in fields},
                'quoteId': None, 'expectedVersion': None}

    def reviewed(self, payload):
        draft = self.service.quote_draft(self.principal, self.scope, payload)
        challenge = self.service.request_challenge(self.principal, self.scope, draft['id'], draft['version'], 'review_quote')
        return self.service.review(self.principal, self.scope, draft['id'], draft['version'], challenge['nonce'])

    def compare(self, rfq, quotes):
        return self.service.compare(self.principal, self.scope, {
            'requestId': rfq['id'], 'requestVersion': rfq['version'], 'requestHash': rfq['content']['requestHash'],
            'offers': [{'id': quote['id'], 'version': quote['version']} for quote in quotes]})['content']

    def test_sessions_csrf_expiry_and_cross_owner_access(self):
        with self.assertRaises(EvidenceError):
            self.store.authenticate(self.session, 'wrong', write=True)
        with self.assertRaises(EvidenceError):
            self.store.login('a' * 40, {'alice': 'short'})
        record, _ = self.request_draft()
        with self.assertRaises(EvidenceError) as denied:
            self.store.get_record(self.other, self.scope, record['id'])
        self.assertEqual(404, denied.exception.status)
        with self.assertRaises(EvidenceError):
            self.store.ingest(self.other, self.scope, 'step', 'test.step', STEP)
        self.now += 9 * 3600
        with self.assertRaises(EvidenceError):
            self.store.authenticate(self.session)

    def test_challenge_replay_tamper_and_two_session_isolation(self):
        draft, _ = self.request_draft()
        challenge = self.service.request_challenge(self.principal, self.scope, draft['id'], 1, 'freeze_rfq')
        session, csrf = self.store.login('a' * 40, self.owners)
        second = self.store.authenticate(session, csrf, write=True)
        with self.assertRaises(EvidenceError):
            self.service.freeze(second, self.scope, draft['id'], 1, challenge['nonce'])
        frozen = self.service.freeze(self.principal, self.scope, draft['id'], 1, challenge['nonce'])
        self.assertEqual('frozen', frozen['state'])
        with self.assertRaises(EvidenceError):
            self.service.freeze(self.principal, self.scope, draft['id'], 1, challenge['nonce'])
        self.assertEqual('draft', self.store.get_record(self.principal, self.scope, draft['id'], version=1)['state'])

    def test_edited_draft_invalidates_challenge_and_idempotency_conflicts(self):
        draft, payload = self.request_draft()
        challenge = self.service.request_challenge(self.principal, self.scope, draft['id'], 1, 'freeze_rfq')
        self.assertEqual(draft['id'], self.service.prepare_request(self.principal, self.scope, payload)['id'])
        changed = copy.deepcopy(payload)
        changed['requirements']['quantity'] = 20
        with self.assertRaises(EvidenceError):
            self.service.prepare_request(self.principal, self.scope, changed)
        changed.update(requestId=draft['id'], expectedVersion=1, idempotencyKey='new-edit')
        updated = self.service.prepare_request(self.principal, self.scope, changed)
        self.assertNotEqual(draft['content']['requestHash'], updated['content']['requestHash'])
        with self.assertRaises(EvidenceError):
            self.service.freeze(self.principal, self.scope, draft['id'], 2, challenge['nonce'])

    def test_artifact_integrity_retention_and_metadata_survival(self):
        artifact = self.store.ingest(self.principal, self.scope, 'step', 'test.step', STEP)
        with self.assertRaises(EvidenceError):
            self.store.content(self.other, self.scope, artifact['id'])
        self.now += 8 * 86400
        with self.assertRaises(EvidenceError):
            self.store.content(self.principal, self.scope, artifact['id'])
        self.assertEqual(1, self.store.cleanup()['deleted'])
        self.assertEqual('expired_deleted', self.store.artifact(self.principal, self.scope, artifact['id'])['availability'])
        self.assertEqual(0, self.store.cleanup()['deleted'])

    def test_money_rejects_coercion_and_unbounded_exponents(self):
        self.assertEqual('42.5', decimal_amount('42.500000'))
        for value in [False, 42.5, '-1', 'NaN', 'Infinity', '1e2', '01.5', '0.1234567']:
            with self.subTest(value=value), self.assertRaises(EvidenceError):
                decimal_amount(value)

    def test_unknown_shipping_is_not_zero_and_fea_is_not_required(self):
        rfq = self.frozen()
        quote = self.reviewed(self.quote_payload(rfq))
        result = self.compare(rfq, [quote])
        self.assertEqual('505.00', result['offers'][0]['knownCostTotal'])
        self.assertIsNone(result['offers'][0]['landedCostTotal'])
        self.assertIn('charges.shipping', result['offers'][0]['missingFields'])
        self.assertIsNone(result['ranking'])
        self.assertEqual('not_evaluated', result['engineeringReadiness']['status'])

    def test_complete_offers_rank_only_after_independent_scope_review(self):
        rfq = self.frozen()
        quotes = []
        for name in ['supplier-a', 'supplier-b']:
            payload = self.quote_payload(rfq, name)
            for key in ['shipping', 'tax']:
                payload['charges'][key]['state'] = 'explicit_zero'
            quotes.append(self.reviewed(payload))
        result = self.compare(rfq, quotes)
        self.assertEqual('eligible', result['outcome'])
        self.assertEqual(2, len(result['ranking']))
        self.now += 500 * 86400
        expired = self.compare(rfq, quotes)
        self.assertEqual('blocked', expired['outcome'])
        self.assertIsNone(expired['ranking'])
        self.assertEqual('eligible', result['outcome'], 'Historical evaluation must not be mutated')

    def test_unreviewed_or_changed_quantity_and_currency_block_ranking(self):
        rfq = self.frozen()
        payload = self.quote_payload(rfq)
        payload['quantity'], payload['currency'] = 20, 'EUR'
        quote = self.service.quote_draft(self.principal, self.scope, payload)
        result = self.compare(rfq, [quote])
        self.assertEqual('blocked', result['outcome'])
        self.assertIn('review_pending', result['offers'][0]['blockingReasons'])
        self.assertIn('different_request_or_quantity', result['offers'][0]['blockingReasons'])

    def test_full_identity_and_step_binding_are_not_export_verification(self):
        draft, _ = self.request_draft()
        self.assertFalse(draft['content']['exportVerified'])
        self.assertEqual('user_attested', draft['content']['cadBinding'])
        self.assertEqual(digest(SOURCE), draft['content']['designSourceHash'])
        with self.assertRaises(EvidenceError):
            self.request_draft(source={**SOURCE, 'microversionId': 'unknown'})

    def test_atomic_duplicate_freeze_has_one_winner(self):
        draft, _ = self.request_draft()
        challenge = self.service.request_challenge(self.principal, self.scope, draft['id'], 1, 'freeze_rfq')
        def freeze(_):
            peer = SourcingService(EvidenceStore(Path(self.temp.name), clock=lambda: self.now))
            try:
                return peer.freeze(self.principal, self.scope, draft['id'], 1, challenge['nonce'])['state']
            except EvidenceError:
                return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(['conflict', 'frozen'], sorted(pool.map(freeze, range(2))))


if __name__ == '__main__':
    unittest.main()
