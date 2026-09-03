from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from scripts import serve
from scripts.fea_service import FeaService, FeaStore, ServicePaths
from scripts.manufacturing_review_store import ManufacturingReviewStore
from urllib.parse import quote


class QuietHandler(serve.SpaRequestHandler):
    def log_message(self, *args: object) -> None:
        pass


class FeaHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        cleanup_patch = patch.object(serve, 'cleanup_default_preparations', return_value=0)
        cleanup_patch.start()
        self.addCleanup(cleanup_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.service = FeaService(FeaStore(ServicePaths(root / 'fea.sqlite3', root / 'artifacts')))
        self.service_patch = patch.object(serve, '_fea_service', self.service)
        self.service_patch.start()
        self.review_store_patch = patch.object(serve, '_manufacturing_review_store', ManufacturingReviewStore(root / 'reviews.sqlite3'))
        self.review_store_patch.start()
        self.server = serve.LocalWorkspaceServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.service_patch.stop()
        self.review_store_patch.stop()
        self.temp.cleanup()

    def request(self, method: str, path: str, payload=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        merged = {'Origin': self.origin, 'Content-Type': 'application/json', **(headers or {})}
        connection.request(method, path, body=json.dumps(payload) if payload is not None else None, headers=merged)
        response = connection.getresponse()
        data = response.read()
        status = response.status
        result_headers = dict(response.getheaders())
        connection.close()
        return status, data, result_headers

    def test_local_capabilities_and_cross_site_boundary(self) -> None:
        status, data, _ = self.request('GET', '/api/fea/capabilities')
        self.assertEqual(200, status)
        self.assertFalse(json.loads(data)['live'])
        for headers in ({'Origin': 'https://attacker.invalid'}, {'Host': 'attacker.invalid'}, {'Sec-Fetch-Site': 'cross-site'}):
            with self.subTest(headers=headers):
                self.assertEqual(403, self.request('GET', '/api/fea/capabilities', headers=headers)[0])
                self.assertEqual(403, self.request('POST', '/api/fea/prepare', {}, headers)[0])

    def test_prepare_boundary_and_scoped_invalidation(self) -> None:
        self.assertEqual(415, self.request('POST', '/api/fea/prepare', {}, {'Content-Type': 'text/plain'})[0])
        self.assertEqual(400, self.request('POST', '/api/fea/prepare', {})[0])
        self.assertEqual(400, self.request('POST', '/api/fea/current-snapshot', {'snapshotKey': 'next'})[0])
        status, data, _ = self.request('POST', '/api/fea/current-snapshot', {'snapshotKey': 'next', 'previousSnapshotKey': 'old'})
        self.assertEqual(200, status)
        self.assertEqual(0, json.loads(data)['staleStudyCount'])

    def test_local_panel_header_does_not_inherit_frame_denial(self) -> None:
        _, _, main = self.request('GET', '/design')
        _, _, panel = self.request('GET', '/onshape-panel')
        self.assertIn("frame-ancestors 'none'", main['Content-Security-Policy'])
        self.assertNotIn("frame-ancestors 'none'", panel['Content-Security-Policy'])
        self.assertIn('frame-ancestors https://cad.onshape.com', panel['Content-Security-Policy'])

    def test_manufacturing_review_is_private_revision_bound_and_immutable(self) -> None:
        review = {
            'snapshotKey': 'onshape-source-1:doc/w/workspace/element/microversion',
            'reviewer': 'Demo reviewer', 'acknowledged': True,
            'groups': [{'featureId': 'thin-wall', 'reference': 'Face ABC', 'dimensions': {'thicknessMm': 2.5}}],
        }
        status, data, _ = self.request('POST', '/api/manufacturing-reviews', review)
        self.assertEqual(201, status)
        saved = json.loads(data)['record']
        path = '/api/manufacturing-reviews?snapshotKey=' + quote(review['snapshotKey'], safe='')
        status, data, _ = self.request('GET', path)
        self.assertEqual(200, status)
        self.assertEqual(saved, json.loads(data)['record'])
        self.assertEqual(409, self.request('POST', '/api/manufacturing-reviews', {**review, 'reviewer': 'Different'})[0])
        self.assertEqual(422, self.request('POST', '/api/manufacturing-reviews', {**review, 'acknowledged': False})[0])


class CleanupScheduleTests(unittest.TestCase):
    def test_first_sweep_and_minute_boundary_do_not_depend_on_machine_uptime(self) -> None:
        for initial in (0.0, 30.0, 600000.0):
            with self.subTest(initial=initial):
                # No listening socket/background thread can race these calls.
                server = object.__new__(serve.LocalWorkspaceServer)
                service = Mock()
                service.clock.return_value = 1234
                with patch.object(serve, 'local_fea_service', return_value=service), \
                        patch.object(serve.time, 'monotonic', side_effect=[initial, initial, initial + 59.999, initial + 60]), \
                        patch.dict(serve.os.environ, {}, clear=True):
                    server.service_actions()
                    service.store.cleanup_expired.assert_called_once_with(1234)
                    server.service_actions()
                    server.service_actions()
                    service.store.cleanup_expired.assert_called_once()
                    server.service_actions()
                    self.assertEqual(service.store.cleanup_expired.call_count, 2)

    def test_independent_server_instances_each_get_a_first_sweep(self) -> None:
        service = Mock()
        with patch.object(serve, 'local_fea_service', return_value=service), \
                patch.object(serve.time, 'monotonic', return_value=0), \
                patch.dict(serve.os.environ, {}, clear=True):
            for _ in range(2):
                object.__new__(serve.LocalWorkspaceServer).service_actions()
        self.assertEqual(service.store.cleanup_expired.call_count, 2)

    def test_idle_server_invokes_cleanup_without_an_http_request(self) -> None:
        swept = threading.Event()
        service = Mock()
        service.store.cleanup_expired.side_effect = lambda *_: swept.set()
        with patch.object(serve, 'local_fea_service', return_value=service), \
                patch.dict(serve.os.environ, {}, clear=True):
            server = serve.LocalWorkspaceServer(('127.0.0.1', 0), QuietHandler)
            thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
            thread.start()
            try:
                self.assertTrue(swept.wait(timeout=3), 'Idle event loop did not invoke cleanup')
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)
            service.store.cleanup_expired.assert_called_once()


if __name__ == '__main__':
    unittest.main()
