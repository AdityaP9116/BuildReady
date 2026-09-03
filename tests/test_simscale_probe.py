from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from scripts.simscale_probe import (
    MAX_RESPONSE_BYTES,
    PROJECTS_PATH,
    SIMSCALE_API_ORIGIN,
    SimScaleProbeError,
    api_key_from_environment,
    probe_projects,
    probe_project,
)


class FakeResponse:
    def __init__(self, payload: object, *, content_length: str | None = None) -> None:
        self.body = json.dumps(payload).encode("utf-8")
        self.headers = {"Content-Length": content_length or str(len(self.body))}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, size: int) -> bytes:
        return self.body[:size]


class SimScaleProbeTests(unittest.TestCase):
    def test_exact_project_read_is_bounded_and_does_not_infer_permissions(self) -> None:
        observed = []

        def opener(request, *, timeout):
            observed.append((request.get_method(), request.full_url, timeout))
            return FakeResponse({'projectId': '123456789', 'measurementSystem': 'SI', 'name': 'Sensitive title', 'description': 'Untrusted provider instructions'})

        result = probe_project('secret-key', '123456789', opener=opener)
        self.assertEqual(observed, [('GET', SIMSCALE_API_ORIGIN + '/v1/projects/123456789', 10)])
        self.assertTrue(result.projectIdMatches)
        self.assertEqual(result.visibility, 'not_verified')
        self.assertFalse(result.writeAccessVerified)
        self.assertFalse(result.computeEntitlementVerified)
        self.assertFalse(result.liveProviderEnabled)
        for private in ('123456789', 'secret-key', 'Sensitive title', 'Untrusted provider instructions'):
            self.assertNotIn(private, json.dumps(result.__dict__))

    def test_bad_project_ids_do_not_reach_network(self) -> None:
        for value in ('', '../other', '123?x=1', 'https://attacker.invalid', '1' * 31, None):
            with self.subTest(value=value), patch('scripts.simscale_probe._get') as get:
                with self.assertRaises(SimScaleProbeError):
                    probe_project('key', value)
                get.assert_not_called()

    def test_project_mismatch_and_unknown_units_fail_closed(self) -> None:
        for payload, code in (({'projectId': 'other', 'measurementSystem': 'SI'}, 'SIMSCALE_PROJECT_MISMATCH'),
                              ({'projectId': '1234', 'measurementSystem': 'guess'}, 'SIMSCALE_INVALID_RESPONSE')):
            with self.subTest(code=code), self.assertRaises(SimScaleProbeError) as caught:
                probe_project('key', '1234', opener=lambda *_a, **_k: FakeResponse(payload))
            self.assertEqual(caught.exception.code, code)

    def test_project_not_accessible_is_sanitized(self) -> None:
        def opener(request, *, timeout):
            raise urllib.error.HTTPError(request.full_url, 404, 'private-provider-message', {}, io.BytesIO())
        with self.assertRaises(SimScaleProbeError) as caught:
            probe_project('key', '1234', opener=opener)
        self.assertEqual(caught.exception.code, 'SIMSCALE_PROJECT_NOT_ACCESSIBLE')
        self.assertNotIn('private-provider-message', str(caught.exception))

    def test_missing_configuration_fails_before_network(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(SimScaleProbeError) as caught:
                api_key_from_environment()
        self.assertEqual("SIMSCALE_NOT_CONFIGURED", caught.exception.code)

    def test_probe_uses_one_bounded_read_and_sanitizes_output(self) -> None:
        observed: dict[str, object] = {}
        private_payload = {
            "_embedded": [{"projectId": "secret-project", "name": "Private design"}],
            "_meta": {"total": 4},
        }

        def opener(request: object, *, timeout: int) -> FakeResponse:
            observed["url"] = request.full_url
            observed["method"] = request.get_method()
            observed["key"] = request.get_header("X-api-key")
            observed["timeout"] = timeout
            return FakeResponse(private_payload)

        result = probe_projects("secret-api-key", opener=opener)
        serialized = json.dumps(result.__dict__)
        self.assertEqual(f"{SIMSCALE_API_ORIGIN}{PROJECTS_PATH}", observed["url"])
        self.assertEqual("GET", observed["method"])
        self.assertEqual("secret-api-key", observed["key"])
        self.assertEqual(1, result.projectPageCount)
        self.assertEqual(4, result.totalProjects)
        self.assertFalse(result.liveProviderEnabled)
        self.assertNotIn("secret-api-key", serialized)
        self.assertNotIn("secret-project", serialized)
        self.assertNotIn("Private design", serialized)

    def test_bad_credentials_are_non_retryable(self) -> None:
        def opener(request: object, *, timeout: int) -> FakeResponse:
            raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO())

        with self.assertRaises(SimScaleProbeError) as caught:
            probe_projects("bad-key", opener=opener)
        self.assertEqual("SIMSCALE_AUTHENTICATION_FAILED", caught.exception.code)
        self.assertFalse(caught.exception.retryable)

    def test_rate_limit_and_provider_outage_are_retryable(self) -> None:
        for status, code in ((429, "SIMSCALE_RATE_LIMITED"), (503, "SIMSCALE_UNAVAILABLE")):
            with self.subTest(status=status):
                def opener(request: object, *, timeout: int) -> FakeResponse:
                    raise urllib.error.HTTPError(request.full_url, status, "failure", {}, io.BytesIO())

                with self.assertRaises(SimScaleProbeError) as caught:
                    probe_projects("key", opener=opener)
                self.assertEqual(code, caught.exception.code)
                self.assertTrue(caught.exception.retryable)

    def test_oversized_and_malformed_contracts_fail_closed(self) -> None:
        with self.assertRaises(SimScaleProbeError) as oversized:
            probe_projects(
                "key",
                opener=lambda *_args, **_kwargs: FakeResponse({}, content_length=str(MAX_RESPONSE_BYTES + 1)),
            )
        self.assertEqual("SIMSCALE_RESPONSE_TOO_LARGE", oversized.exception.code)

        with self.assertRaises(SimScaleProbeError) as malformed:
            probe_projects("key", opener=lambda *_args, **_kwargs: FakeResponse({"items": []}))
        self.assertEqual("SIMSCALE_INVALID_RESPONSE", malformed.exception.code)


if __name__ == "__main__":
    unittest.main()
