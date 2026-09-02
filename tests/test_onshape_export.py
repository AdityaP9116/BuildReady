from __future__ import annotations

import hashlib
import io
import json
import unittest
import urllib.error
from typing import Any

from scripts.onshape_export import (
    FrozenPartStudio,
    OnshapeExportClient,
    OnshapeExportError,
)


SNAPSHOT = FrozenPartStudio(
    document_id="000000000000000000000001",
    element_id="000000000000000000000002",
    microversion_id="000000000000000000000003",
)
STEP = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"


class FakeResponse:
    def __init__(self, payload: object, *, content_type: str = "application/json") -> None:
        self.body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(self.body))}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        return self.body if size < 0 else self.body[:size]


class OnshapeExportTests(unittest.TestCase):
    def test_exports_the_exact_microversion_and_downloads_one_step(self) -> None:
        requests: list[Any] = []
        responses = iter(
            [
                FakeResponse({"id": "translation00000001", "requestState": "ACTIVE"}),
                FakeResponse(
                    {
                        "id": "translation00000001",
                        "requestState": "DONE",
                        "resultExternalDataIds": ["externaldata0000001"],
                    }
                ),
                FakeResponse(STEP, content_type="application/step"),
            ]
        )

        def opener(request: Any, *, timeout: int) -> FakeResponse:
            requests.append(request)
            self.assertEqual(15, timeout)
            return next(responses)

        client = OnshapeExportClient(
            access_key="access", secret_key="secret", opener=opener, sleeper=lambda _: None
        )
        result = client.export_step(SNAPSHOT, poll_attempts=2)

        self.assertIn(
            "/d/000000000000000000000001/m/000000000000000000000003/",
            requests[0].full_url,
        )
        self.assertNotIn("/w/", requests[0].full_url)
        self.assertEqual("POST", requests[0].get_method())
        self.assertEqual("GET", requests[1].get_method())
        self.assertEqual("GET", requests[2].get_method())
        self.assertEqual(STEP, result.content)
        self.assertEqual(f"sha256-{hashlib.sha256(STEP).hexdigest()}", result.sha256)
        self.assertEqual(len(STEP), result.byte_size)

    def test_rejects_mutable_or_malformed_identifiers_before_network(self) -> None:
        calls = 0

        def opener(*_args: object, **_kwargs: object) -> FakeResponse:
            nonlocal calls
            calls += 1
            return FakeResponse({})

        client = OnshapeExportClient(access_key="a", secret_key="b", opener=opener)
        with self.assertRaises(OnshapeExportError) as caught:
            client.export_step(
                FrozenPartStudio("../../document", SNAPSHOT.element_id, SNAPSHOT.microversion_id)
            )
        self.assertEqual("ONSHAPE_EXPORT_INVALID_ID", caught.exception.code)
        self.assertEqual(0, calls)

    def test_failed_translation_is_sanitized_and_not_downloaded(self) -> None:
        responses = iter(
            [
                FakeResponse({"id": "translation00000001", "requestState": "ACTIVE"}),
                FakeResponse(
                    {
                        "id": "translation00000001",
                        "requestState": "FAILED",
                        "failureReason": "private upstream details",
                    }
                ),
            ]
        )
        client = OnshapeExportClient(
            access_key="a", secret_key="b", opener=lambda *_args, **_kwargs: next(responses), sleeper=lambda _: None
        )
        with self.assertRaises(OnshapeExportError) as caught:
            client.export_step(SNAPSHOT, poll_attempts=2)
        self.assertEqual("ONSHAPE_EXPORT_FAILED", caught.exception.code)
        self.assertNotIn("private", caught.exception.message)

    def test_rejects_non_step_and_oversized_artifacts(self) -> None:
        metadata = {
            "id": "translation00000001",
            "requestState": "DONE",
            "resultExternalDataIds": ["externaldata0000001"],
        }
        for artifact, expected in ((b"<html>error</html>", "ONSHAPE_EXPORT_INVALID_STEP"), (STEP, "ONSHAPE_EXPORT_TOO_LARGE")):
            with self.subTest(expected=expected):
                responses = iter([FakeResponse(metadata), FakeResponse(artifact, content_type="application/octet-stream")])
                client = OnshapeExportClient(
                    access_key="a",
                    secret_key="b",
                    opener=lambda *_args, **_kwargs: next(responses),
                    max_cad_bytes=len(artifact) - 1 if expected.endswith("TOO_LARGE") else 1000,
                )
                with self.assertRaises(OnshapeExportError) as caught:
                    client.export_step(SNAPSHOT)
                self.assertEqual(expected, caught.exception.code)

    def test_authentication_failure_is_non_retryable(self) -> None:
        def opener(request: Any, *, timeout: int) -> FakeResponse:
            raise urllib.error.HTTPError(request.full_url, 401, "no", {}, io.BytesIO())

        client = OnshapeExportClient(access_key="a", secret_key="b", opener=opener)
        with self.assertRaises(OnshapeExportError) as caught:
            client.export_step(SNAPSHOT)
        self.assertEqual("ONSHAPE_EXPORT_AUTH", caught.exception.code)
        self.assertFalse(caught.exception.retryable)


if __name__ == "__main__":
    unittest.main()
