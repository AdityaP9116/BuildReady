"""Bounded SimScale CAD upload/import client.

This implements the credential-free contract work for FEA Gate 1. Runtime live
mode remains disabled until the account preflight and manual engineering
verification are complete.
"""

from __future__ import annotations

import ipaddress
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlsplit


SIMSCALE_API_ORIGIN = "https://api.simscale.com"
UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
OPAQUE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,255}$")
IMPORT_STATES = frozenset({"READY", "QUEUED", "RUNNING", "FINISHED", "CANCELED", "FAILED"})
MAX_JSON_BYTES = 2_000_000
UPLOAD_HOST_SUFFIXES = (".amazonaws.com", ".simscale.com")


class SimScaleTransportError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True)
class CadImportReceipt:
    project_id: str
    storage_id: str
    cad_id: str
    cad_state_id: str
    status: str


class SimScaleTransportClient:
    def __init__(
        self,
        *,
        api_key: str,
        project_id: str,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        if not api_key:
            raise SimScaleTransportError(
                "SIMSCALE_NOT_CONFIGURED", "The SimScale API key is missing."
            )
        self.project_id = self._uuid(project_id, "project")
        self.api_key = api_key
        self.opener = opener
        self.sleeper = sleeper

    def import_step(
        self,
        step_content: bytes,
        *,
        name: str,
        input_unit: str = "mm",
        poll_attempts: int = 20,
        poll_interval_seconds: float = 1.0,
    ) -> CadImportReceipt:
        if not step_content.startswith(b"ISO-10303-21"):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_STEP", "Only a single validated STEP artifact can be uploaded."
            )
        if not 1 <= len(step_content) <= 100 * 1024 * 1024:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_CAD_SIZE", "The STEP artifact size is outside the controlled range."
            )
        clean_name = " ".join(name.split())
        if not 1 <= len(clean_name) <= 120:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_CAD_NAME", "The SimScale CAD name is invalid."
            )
        if input_unit not in {"m", "cm", "mm", "ft", "in", "yd"}:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_CAD_UNIT", "The SimScale CAD input unit is invalid."
            )
        if not 1 <= poll_attempts <= 120:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_POLL", "The CAD import polling limit is invalid."
            )

        storage = self._api_json("POST", "/v1/storage")
        storage_id = self._opaque_id(storage.get("storageId"), "storage")
        upload_url = self._validated_upload_url(storage.get("url"))
        self._upload(upload_url, step_content)

        imported = self._api_json(
            "POST",
            f"/v1/projects/{self.project_id}/cadimports",
            {
                "name": clean_name,
                "location": {"storageId": storage_id},
                "format": "STEP",
                "inputUnit": input_unit,
                "options": {
                    "facetSplit": False,
                    "sewing": False,
                    "improve": True,
                    "optimizeForLBMSolver": False,
                },
            },
        )
        cad_id = self._uuid(imported.get("cadId"), "CAD")
        final = imported
        for attempt in range(poll_attempts):
            status = final.get("status")
            if status not in IMPORT_STATES:
                raise SimScaleTransportError(
                    "SIMSCALE_IMPORT_INVALID_RESPONSE",
                    "SimScale returned an unknown CAD import status.",
                )
            if status == "FINISHED":
                break
            if status in {"FAILED", "CANCELED"}:
                raise SimScaleTransportError(
                    "SIMSCALE_IMPORT_FAILED", "SimScale could not import the approved STEP geometry."
                )
            if attempt + 1 == poll_attempts:
                raise SimScaleTransportError(
                    "SIMSCALE_IMPORT_TIMEOUT",
                    "The SimScale CAD import did not finish within the polling window.",
                    retryable=True,
                )
            self.sleeper(poll_interval_seconds)
            final = self._api_json(
                "GET", f"/v1/projects/{self.project_id}/cadimports/{cad_id}"
            )

        cad_state_id = self._uuid(final.get("cadStateId"), "CAD state")
        return CadImportReceipt(
            project_id=self.project_id,
            storage_id=storage_id,
            cad_id=cad_id,
            cad_state_id=cad_state_id,
            status="FINISHED",
        )

    def get_topology(self, receipt: CadImportReceipt) -> dict[str, Any]:
        self._validate_receipt(receipt)
        return self._api_json(
            "GET", f"/v1/cads/{receipt.cad_id}/states/{receipt.cad_state_id}/topology"
        )

    def get_saved_selections(self, receipt: CadImportReceipt) -> dict[str, Any]:
        self._validate_receipt(receipt)
        return self._api_json(
            "GET",
            f"/v1/cads/{receipt.cad_id}/states/{receipt.cad_state_id}/savedselections",
        )

    @staticmethod
    def _uuid(value: object, label: str) -> str:
        if not isinstance(value, str) or not UUID_PATTERN.fullmatch(value):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_IDENTIFIER", f"The SimScale {label} identifier is invalid."
            )
        return value.lower()

    @staticmethod
    def _opaque_id(value: object, label: str) -> str:
        if not isinstance(value, str) or not OPAQUE_ID_PATTERN.fullmatch(value):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_IDENTIFIER", f"The SimScale {label} identifier is invalid."
            )
        return value

    def _validate_receipt(self, receipt: CadImportReceipt) -> None:
        if receipt.project_id != self.project_id:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_IDENTIFIER", "The CAD receipt belongs to another project."
            )
        self._uuid(receipt.cad_id, "CAD")
        self._uuid(receipt.cad_state_id, "CAD state")

    @staticmethod
    def _validated_upload_url(value: object) -> str:
        if not isinstance(value, str):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_UPLOAD_URL", "SimScale returned an invalid upload URL."
            )
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.port not in {None, 443}
        ):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_UPLOAD_URL", "SimScale returned an unsafe upload URL."
            )
        try:
            address = ipaddress.ip_address(parsed.hostname)
        except ValueError:
            address = None
        if address and not address.is_global:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_UPLOAD_URL", "SimScale returned an unsafe upload URL."
            )
        hostname = parsed.hostname.lower()
        if not any(hostname.endswith(suffix) for suffix in UPLOAD_HOST_SUFFIXES):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_UPLOAD_URL",
                "SimScale returned an upload URL outside the approved storage domains.",
            )
        return value

    def _request(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        api_request: bool,
        content_type: str | None = None,
    ) -> Any:
        headers = {"Accept": "application/json"}
        if api_request:
            headers["X-API-KEY"] = self.api_key
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            return self.opener(request, timeout=20)
        except urllib.error.HTTPError as error:
            retryable = error.code in {408, 425, 429, 500, 502, 503, 504}
            error.close()
            code = (
                "SIMSCALE_AUTHENTICATION_FAILED"
                if error.code in {401, 403}
                else "SIMSCALE_UPSTREAM_ERROR"
            )
            raise SimScaleTransportError(
                code, f"SimScale rejected the request ({error.code}).", retryable=retryable
            ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise SimScaleTransportError(
                "SIMSCALE_UNREACHABLE", "The SimScale API could not be reached.", retryable=True
            ) from error

    def _api_json(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        with self._request(
            method,
            f"{SIMSCALE_API_ORIGIN}{path}",
            body=body,
            api_request=True,
            content_type="application/json" if body is not None else None,
        ) as response:
            raw = response.read(MAX_JSON_BYTES + 1)
        if len(raw) > MAX_JSON_BYTES:
            raise SimScaleTransportError(
                "SIMSCALE_RESPONSE_TOO_LARGE", "SimScale returned an oversized response."
            )
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_RESPONSE", "SimScale returned invalid JSON."
            ) from error
        if not isinstance(value, dict):
            raise SimScaleTransportError(
                "SIMSCALE_INVALID_RESPONSE", "SimScale returned an unexpected response shape."
            )
        return value

    def _upload(self, upload_url: str, content: bytes) -> None:
        with self._request(
            "PUT",
            upload_url,
            body=content,
            api_request=False,
            content_type="application/step",
        ) as response:
            response.read(1)
