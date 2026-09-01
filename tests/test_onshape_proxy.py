"""End-to-end tests for the Onshape proxy against an in-process mock API.

These exercise the real `scripts/serve.py` proxy code over real HTTP, covering
the failure modes that decide whether a live demo degrades gracefully or breaks:
bad credentials, missing elements, malformed bodies, empty models, rate limits,
and transient outages that should recover on retry.
"""

from __future__ import annotations

import json
import os
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from unittest import mock

import scripts.serve as serve


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "onshape-feature-list.json").read_text())

ENVIRONMENT = {
    "ONSHAPE_ACCESS_KEY": "test-access",
    "ONSHAPE_SECRET_KEY": "test-secret",
    "ONSHAPE_DOCUMENT_ID": "000000000000000000000001",
    "ONSHAPE_WORKSPACE_ID": "000000000000000000000002",
    "ONSHAPE_ELEMENT_ID": "000000000000000000000003",
}


class MockOnshape:
    """A controllable Onshape stand-in bound to an ephemeral port."""

    def __init__(self) -> None:
        self.mode = "healthy"
        self.request_count = 0
        self.fail_first = 0
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: Any) -> None:
                pass

            def _send(self, status: int, payload: Any, headers: dict[str, str] | None = None) -> None:
                body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                for name, value in (headers or {}).items():
                    self.send_header(name, value)
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:  # noqa: N802
                outer.request_count += 1

                # Transient outage that should recover within the retry budget.
                if outer.fail_first > 0:
                    outer.fail_first -= 1
                    self._send(503, {"message": "temporarily unavailable"})
                    return

                if outer.mode == "unauthorized":
                    self._send(401, {"message": "Unauthorized"})
                    return
                if outer.mode == "notfound":
                    self._send(404, {"message": "Not found"})
                    return
                if outer.mode == "garbage":
                    self._send(200, b"<html>not json</html>")
                    return
                if outer.mode == "ratelimited":
                    self._send(429, {"message": "Too many requests"}, {"Retry-After": "1"})
                    return

                if "/features" in self.path:
                    self._send(200, {
                        "features": [] if outer.mode == "empty" else FIXTURE["features"],
                        "microversionId": FIXTURE["microversionId"],
                        "serializationVersion": FIXTURE["serializationVersion"],
                    })
                    return
                self._send(200, {"name": "Mock <script>x</script>", "modifiedAt": "2026-08-30T12:00:00Z"})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> MockOnshape:
        self.thread.start()
        return self

    def __exit__(self, *args: object) -> None:
        self.server.shutdown()
        self.server.server_close()


class OnshapeProxyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock = MockOnshape().__enter__()
        self.addCleanup(self.mock.__exit__)

        self._saved = {k: os.environ.get(k) for k in (*ENVIRONMENT, "ONSHAPE_BASE_URL")}
        os.environ.update(ENVIRONMENT)
        os.environ["ONSHAPE_BASE_URL"] = f"http://127.0.0.1:{self.mock.port}"
        self.addCleanup(self._restore_environment)

        # The proxy caches successful reads; every test starts cold.
        serve._cache.clear()
        serve._inflight.clear()
        self.addCleanup(serve._cache.clear)
        self.addCleanup(serve._inflight.clear)

        # Keep retry backoff from dominating the suite runtime.
        self._saved_backoff = serve.BACKOFF_BASE_SECONDS
        serve.BACKOFF_BASE_SECONDS = 0.01
        self.addCleanup(lambda: setattr(serve, "BACKOFF_BASE_SECONDS", self._saved_backoff))

    def _restore_environment(self) -> None:
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_healthy_read_returns_every_mapped_variable(self) -> None:
        status, payload = serve.local_onshape_payload()
        self.assertEqual(200, status)
        self.assertTrue(payload["ok"])
        self.assertEqual(9, len(payload["variables"]))
        self.assertEqual(FIXTURE["microversionId"], payload["microversionId"])

    def test_bad_credentials_fail_fast_without_retrying(self) -> None:
        self.mock.mode = "unauthorized"
        self.mock.request_count = 0
        status, payload = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertEqual("ONSHAPE_UNAUTHORIZED", payload["error"]["code"])
        self.assertFalse(payload["error"]["retryable"])
        # A rejected credential will never succeed; retrying only burns quota.
        self.assertEqual(2, self.mock.request_count)

    def test_missing_element_fails_fast(self) -> None:
        self.mock.mode = "notfound"
        self.mock.request_count = 0
        status, payload = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertEqual("ONSHAPE_NOT_FOUND", payload["error"]["code"])
        self.assertEqual(2, self.mock.request_count)

    def test_non_json_body_is_retried_then_reported(self) -> None:
        self.mock.mode = "garbage"
        self.mock.request_count = 0
        status, payload = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertEqual("ONSHAPE_UNAVAILABLE", payload["error"]["code"])
        self.assertEqual(serve.MAX_ATTEMPTS * 2, self.mock.request_count)

    def test_model_without_variables_is_reported_distinctly(self) -> None:
        self.mock.mode = "empty"
        status, payload = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertEqual("ONSHAPE_NO_VARIABLES", payload["error"]["code"])

    def test_transient_outage_recovers_within_the_retry_budget(self) -> None:
        self.mock.fail_first = 2
        status, payload = serve.local_onshape_payload()
        self.assertEqual(200, status)
        self.assertTrue(payload["ok"])

    def test_outage_beyond_the_retry_budget_is_reported_as_retryable(self) -> None:
        self.mock.fail_first = 99
        status, payload = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertTrue(payload["error"]["retryable"])

    def test_rate_limiting_is_retried_and_honours_retry_after(self) -> None:
        self.mock.mode = "ratelimited"
        self.mock.request_count = 0
        with mock.patch("scripts.serve.time.sleep") as sleep:
            status, _ = serve.local_onshape_payload()
        self.assertEqual(502, status)
        self.assertEqual(serve.MAX_ATTEMPTS * 2, self.mock.request_count)
        self.assertTrue(sleep.call_args_list)
        self.assertTrue(all(call.args == (1.0,) for call in sleep.call_args_list))

    def test_successful_reads_are_cached_so_agents_cannot_exhaust_quota(self) -> None:
        serve.local_onshape_payload()
        first_count = self.mock.request_count
        status, payload = serve.local_onshape_payload()
        self.assertEqual(200, status)
        self.assertTrue(payload["cached"])
        self.assertEqual(first_count, self.mock.request_count)

    def test_missing_configuration_never_reaches_the_network(self) -> None:
        os.environ.pop("ONSHAPE_ACCESS_KEY")
        self.mock.request_count = 0
        status, payload = serve.local_onshape_payload()
        self.assertEqual(503, status)
        self.assertEqual("ONSHAPE_NOT_CONFIGURED", payload["error"]["code"])
        self.assertEqual(0, self.mock.request_count)

    def test_malformed_identifier_never_reaches_the_network(self) -> None:
        os.environ["ONSHAPE_ELEMENT_ID"] = "../../caller-controlled"
        self.mock.request_count = 0
        status, payload = serve.local_onshape_payload()
        self.assertEqual(503, status)
        self.assertEqual("ONSHAPE_NOT_CONFIGURED", payload["error"]["code"])
        self.assertFalse(payload["error"]["retryable"])
        self.assertEqual(0, self.mock.request_count)

    def test_cache_is_scoped_to_the_configured_document(self) -> None:
        serve.local_onshape_payload()
        first_count = self.mock.request_count
        os.environ["ONSHAPE_ELEMENT_ID"] = "000000000000000000000009"
        status, payload = serve.local_onshape_payload()
        self.assertEqual(200, status)
        self.assertEqual("000000000000000000000009", payload["document"]["elementId"])
        self.assertEqual(first_count + 2, self.mock.request_count)

    def test_concurrent_callers_share_one_upstream_read(self) -> None:
        self.mock.request_count = 0
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: serve.local_onshape_payload(), range(5)))
        self.assertTrue(all(status == 200 for status, _ in results))
        self.assertEqual(2, self.mock.request_count)

    def test_variable_walk_is_depth_bounded(self) -> None:
        shallow = {"parameters": [
            {"parameterId": "name", "value": "insideRadius"},
            {"parameterId": "value", "expression": "4 mm"},
        ]}
        node: dict[str, Any] = shallow
        for _ in range(serve.MAX_DEPTH + 2):
            node = {"child": node}
        found: list[dict[str, str]] = []
        serve.collect_variables(node, found)
        self.assertEqual([], found)

    def test_untrusted_document_name_is_passed_through_bounded_not_executed(self) -> None:
        _, payload = serve.local_onshape_payload()
        # The proxy must not sanitise-by-rewriting; it bounds the text and the
        # UI renders it as text. Silent rewriting would hide tampering.
        self.assertIn("<script>", payload["document"]["name"])
        self.assertLessEqual(len(payload["document"]["name"]), 120)


if __name__ == "__main__":
    unittest.main()
