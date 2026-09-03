import json
import tempfile
import unittest
from pathlib import Path

from scripts.manufacturing_review_store import ManufacturingReviewStore


class ManufacturingReviewStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.now = 1_800_000_000.0
        self.store = ManufacturingReviewStore(Path(self.temp.name) / 'reviews.sqlite3', clock=lambda: self.now)
        self.review = {
            'snapshotKey': 'onshape-source-1:doc/w/workspace/element/microversion',
            'reviewer': 'Demo reviewer', 'acknowledged': True,
            'groups': [{'featureId': 'thin-wall', 'reference': 'Face ABC, drawing section A',
                        'dimensions': {'thicknessMm': 2.5}}],
        }

    def test_record_is_idempotent_revision_bound_and_expires(self):
        first = self.store.put(self.review)
        self.assertEqual(first, self.store.put(self.review))
        self.assertEqual(first, self.store.get(self.review['snapshotKey']))
        with self.assertRaisesRegex(ValueError, 'different review'):
            self.store.put({**self.review, 'reviewer': 'Another reviewer'})
        self.assertIsNone(self.store.get(self.review['snapshotKey'] + '-new'))
        self.now += 7 * 86400
        self.assertIsNone(self.store.get(self.review['snapshotKey']))
        self.assertEqual(1, self.store.cleanup())

    def test_contract_and_integrity_fail_closed(self):
        for bad in (
            {**self.review, 'acknowledged': False},
            {**self.review, 'snapshotKey': '../escape'},
            {**self.review, 'groups': []},
            {**self.review, 'groups': [{**self.review['groups'][0], 'dimensions': {'thicknessMm': None}}]},
        ):
            with self.assertRaises(ValueError):
                self.store.put(bad)
        self.store.put(self.review)
        with self.store.connect() as db:
            db.execute("UPDATE manufacturing_reviews SET review_json=?", (json.dumps({'tampered': True}),))
        with self.assertRaisesRegex(ValueError, 'integrity'):
            self.store.get(self.review['snapshotKey'])


if __name__ == '__main__':
    unittest.main()
