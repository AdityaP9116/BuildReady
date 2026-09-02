from __future__ import annotations

import json
import unittest
from typing import Any

from scripts.simscale_transport import SimScaleTransportClient, SimScaleTransportError


PROJECT_ID = "11111111-1111-4111-8111-111111111111"
CAD_ID = "22222222-2222-4222-8222-222222222222"
STATE_ID = "33333333-3333-4333-8333-333333333333"
STEP = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n"


class FakeResponse:
    def __init__(self, payload: object) -> None:
        self.body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.headers = {"Content-Length": str(len(self.body))}

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        return self.body if size < 0 else self.body[:size]


class SimScaleTransportTests(unittest.TestCase):
    def test_storage_upload_and_import_follow_the_frozen_contract(self) -> None:
        requests: list[Any] = []
        responses = iter(
            [
                FakeResponse(
                    {
                        "storageId": "storage_123",
                        "url": "https://datumflow-test.s3.amazonaws.com/cad?signature=secret",
                        "expiresAt": "2026-09-03T00:00:00Z",
                    }
                ),
                FakeResponse(b""),
                FakeResponse({"cadId": CAD_ID, "cadStateId": STATE_ID, "status": "RUNNING"}),
                FakeResponse({"cadId": CAD_ID, "cadStateId": STATE_ID, "status": "FINISHED"}),
            ]
        )

        def opener(request: Any, *, timeout: int) -> FakeResponse:
            requests.append(request)
            self.assertEqual(20, timeout)
            return next(responses)

        client = SimScaleTransportClient(
            api_key="private-api-key", project_id=PROJECT_ID, opener=opener, sleeper=lambda _: None
        )
        receipt = client.import_step(STEP, name="DatumFlow bracket", poll_attempts=2)

        self.assertEqual("POST", requests[0].get_method())
        self.assertEqual("https://api.simscale.com/v1/storage", requests[0].full_url)
        self.assertEqual("private-api-key", requests[0].get_header("X-api-key"))
        self.assertEqual("PUT", requests[1].get_method())
        self.assertIsNone(requests[1].get_header("X-api-key"))
        self.assertEqual(STEP, requests[1].data)
        request_body = json.loads(requests[2].data)
        self.assertEqual("STEP", request_body["format"])
        self.assertEqual("mm", request_body["inputUnit"])
        self.assertEqual(
            {"facetSplit": False, "sewing": False, "improve": True, "optimizeForLBMSolver": False},
            request_body["options"],
        )
        self.assertEqual("FINISHED", receipt.status)
        self.assertEqual(CAD_ID, receipt.cad_id)
        self.assertEqual(STATE_ID, receipt.cad_state_id)

    def test_rejects_unsafe_upload_url_before_put(self) -> None:
        responses = iter(
            [FakeResponse({"storageId": "storage_123", "url": "http://127.0.0.1/private"})]
        )
        calls: list[Any] = []

        def opener(request: Any, *, timeout: int) -> FakeResponse:
            calls.append(request)
            return next(responses)

        client = SimScaleTransportClient(api_key="key", project_id=PROJECT_ID, opener=opener)
        with self.assertRaises(SimScaleTransportError) as caught:
            client.import_step(STEP, name="Bracket")
        self.assertEqual("SIMSCALE_INVALID_UPLOAD_URL", caught.exception.code)
        self.assertEqual(1, len(calls))

    def test_rejects_unapproved_public_upload_domain(self) -> None:
        responses = iter(
            [FakeResponse({"storageId": "storage_123", "url": "https://uploads.example.com/cad"})]
        )
        client = SimScaleTransportClient(
            api_key="key", project_id=PROJECT_ID, opener=lambda *_args, **_kwargs: next(responses)
        )
        with self.assertRaises(SimScaleTransportError) as caught:
            client.import_step(STEP, name="Bracket")
        self.assertEqual("SIMSCALE_INVALID_UPLOAD_URL", caught.exception.code)

    def test_rejects_invalid_project_and_non_step_before_network(self) -> None:
        with self.assertRaises(SimScaleTransportError):
            SimScaleTransportClient(api_key="key", project_id="../../project")

        calls = 0

        def opener(*_args: object, **_kwargs: object) -> FakeResponse:
            nonlocal calls
            calls += 1
            return FakeResponse({})

        client = SimScaleTransportClient(api_key="key", project_id=PROJECT_ID, opener=opener)
        with self.assertRaises(SimScaleTransportError) as caught:
            client.import_step(b"not a step", name="Bracket")
        self.assertEqual("SIMSCALE_INVALID_STEP", caught.exception.code)
        self.assertEqual(0, calls)

    def test_failed_import_does_not_expose_provider_details(self) -> None:
        responses = iter(
            [
                FakeResponse({"storageId": "storage_123", "url": "https://datumflow-test.s3.amazonaws.com/cad"}),
                FakeResponse(b""),
                FakeResponse(
                    {
                        "cadId": CAD_ID,
                        "cadStateId": STATE_ID,
                        "status": "FAILED",
                        "failureReason": {"message": "sensitive CAD name"},
                    }
                ),
            ]
        )
        client = SimScaleTransportClient(
            api_key="key", project_id=PROJECT_ID, opener=lambda *_args, **_kwargs: next(responses)
        )
        with self.assertRaises(SimScaleTransportError) as caught:
            client.import_step(STEP, name="Bracket")
        self.assertEqual("SIMSCALE_IMPORT_FAILED", caught.exception.code)
        self.assertNotIn("sensitive", caught.exception.message)

    def test_topology_and_saved_selection_reads_use_only_receipt_ids(self) -> None:
        responses = iter(
            [
                FakeResponse({"storageId": "storage_123", "url": "https://datumflow-test.s3.amazonaws.com/cad"}),
                FakeResponse(b""),
                FakeResponse({"cadId": CAD_ID, "cadStateId": STATE_ID, "status": "FINISHED"}),
                FakeResponse({"volumes": []}),
                FakeResponse({"_embedded": []}),
            ]
        )
        urls: list[str] = []

        def opener(request: Any, *, timeout: int) -> FakeResponse:
            urls.append(request.full_url)
            return next(responses)

        client = SimScaleTransportClient(api_key="key", project_id=PROJECT_ID, opener=opener)
        receipt = client.import_step(STEP, name="Bracket")
        self.assertEqual({"volumes": []}, client.get_topology(receipt))
        self.assertEqual({"_embedded": []}, client.get_saved_selections(receipt))
        self.assertTrue(urls[-2].endswith(f"/cads/{CAD_ID}/states/{STATE_ID}/topology"))
        self.assertTrue(urls[-1].endswith(f"/cads/{CAD_ID}/states/{STATE_ID}/savedselections"))


if __name__ == "__main__":
    unittest.main()
