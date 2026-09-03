from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import serve
from scripts.fea_service import FeaService, FeaStore, ServicePaths


class QuietHandler(serve.SpaRequestHandler):
    def log_message(self, *args: object) -> None:
        pass


class FeaHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.service = FeaService(FeaStore(ServicePaths(root / 'fea.sqlite3', root / 'artifacts')))
        self.service_patch = patch.object(serve, '_fea_service', self.service)
        self.service_patch.start()
        self.server = serve.LocalWorkspaceServer(('127.0.0.1', 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.service_patch.stop()
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

    def test_explicit_https_tunnel_origin_is_allowed(self) -> None:
        tunnel_origin = 'https://buildready-demo.example'
        with patch.dict('os.environ', {'BUILDREADY_ALLOWED_ORIGINS': tunnel_origin}):
            headers = {
                'Host': 'buildready-demo.example',
                'Origin': tunnel_origin,
                'Sec-Fetch-Site': 'same-origin',
            }
            self.assertEqual(200, self.request('GET', '/api/fea/capabilities', headers=headers)[0])
            # The request crosses the origin boundary, then reaches payload validation.
            self.assertEqual(400, self.request('POST', '/api/fea/prepare', {}, headers=headers)[0])

    def test_tunnel_origin_requires_exact_https_allowlist_match(self) -> None:
        with patch.dict('os.environ', {'BUILDREADY_ALLOWED_ORIGINS': 'https://buildready-demo.example'}):
            self.assertEqual(403, self.request(
                'GET',
                '/api/fea/capabilities',
                headers={'Host': 'attacker.example', 'Origin': 'https://attacker.example'},
            )[0])

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

    def test_idle_server_has_periodic_cleanup_without_requests(self) -> None:
        with patch.object(self.service.store, 'cleanup_expired') as cleanup:
            self.server._last_cleanup = 0
            self.server.service_actions()
            cleanup.assert_called_once()
            self.server.service_actions()
            cleanup.assert_called_once()


if __name__ == '__main__':
    unittest.main()
