"""Exact-microversion STEP export client for the live FEA transport boundary.

The client is intentionally independent from the browser-facing design proxy. It
accepts only frozen identifiers, never a caller-provided URL, keeps credentials
server-side, bounds every response, and returns compact provenance instead of
exposing CAD bytes to the browser.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable


ID_PATTERN = re.compile(r"^[A-Za-z0-9]{8,40}$")
TRANSLATION_STATES = frozenset({"ACTIVE", "DONE", "FAILED"})
MAX_JSON_BYTES = 1_000_000
DEFAULT_MAX_CAD_BYTES = 25 * 1024 * 1024


class OnshapeExportError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True)
class FrozenPartStudio:
    document_id: str
    element_id: str
    microversion_id: str

    def validate(self) -> None:
        if not all(
            ID_PATTERN.fullmatch(value)
            for value in (self.document_id, self.element_id, self.microversion_id)
        ):
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_ID",
                "The frozen Onshape identifiers are malformed.",
            )


@dataclass(frozen=True)
class StepExport:
    content: bytes
    translation_id: str
    external_data_id: str
    sha256: str
    byte_size: int
    content_type: str


class OnshapeExportClient:
    def __init__(
        self,
        *,
        access_key: str,
        secret_key: str,
        base_url: str = "https://cad.onshape.com",
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleeper: Callable[[float], None] = time.sleep,
        max_cad_bytes: int = DEFAULT_MAX_CAD_BYTES,
    ) -> None:
        if not access_key or not secret_key:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_NOT_CONFIGURED", "Onshape export credentials are missing."
            )
        if not base_url.startswith("https://") and not base_url.startswith("http://127.0.0.1:"):
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_ORIGIN", "The Onshape API origin is not allowed."
            )
        if not 1 <= max_cad_bytes <= 100 * 1024 * 1024:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_LIMIT", "The CAD export size limit is invalid."
            )
        self.base_url = base_url.rstrip("/")
        self.authorization = "Basic " + base64.b64encode(
            f"{access_key}:{secret_key}".encode("utf-8")
        ).decode("ascii")
        self.opener = opener
        self.sleeper = sleeper
        self.max_cad_bytes = max_cad_bytes

    def export_step(
        self,
        snapshot: FrozenPartStudio,
        *,
        poll_attempts: int = 12,
        poll_interval_seconds: float = 1.0,
    ) -> StepExport:
        snapshot.validate()
        if not 1 <= poll_attempts <= 120:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_POLL", "The translation polling limit is invalid."
            )
        translation = self._json_request(
            "POST",
            (
                f"/api/v11/partstudios/d/{snapshot.document_id}/m/"
                f"{snapshot.microversion_id}/e/{snapshot.element_id}/translations"
            ),
            {
                "formatName": "STEP",
                "storeInDocument": False,
                "translate": True,
            },
        )
        translation_id = self._identifier(translation.get("id"), "translation")

        final = translation
        for attempt in range(poll_attempts):
            state = final.get("requestState")
            if state not in TRANSLATION_STATES:
                raise OnshapeExportError(
                    "ONSHAPE_EXPORT_INVALID_RESPONSE",
                    "Onshape returned an unknown translation state.",
                )
            if state == "DONE":
                break
            if state == "FAILED":
                raise OnshapeExportError(
                    "ONSHAPE_EXPORT_FAILED", "Onshape could not export the frozen Part Studio."
                )
            if attempt + 1 == poll_attempts:
                raise OnshapeExportError(
                    "ONSHAPE_EXPORT_TIMEOUT",
                    "The Onshape STEP translation did not finish within the polling window.",
                    retryable=True,
                )
            self.sleeper(poll_interval_seconds)
            final = self._json_request("GET", f"/api/v11/translations/{translation_id}")

        external_ids = final.get("resultExternalDataIds")
        if not isinstance(external_ids, list) or len(external_ids) != 1:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_RESULT",
                "The MVP requires exactly one external STEP export artifact.",
            )
        external_id = self._identifier(external_ids[0], "external data")
        content, content_type = self._binary_request(
            f"/api/v11/documents/d/{snapshot.document_id}/externaldata/{external_id}"
        )
        if not content.startswith(b"ISO-10303-21"):
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_STEP",
                "Onshape returned an artifact that is not a single STEP file.",
            )
        digest = hashlib.sha256(content).hexdigest()
        return StepExport(
            content=content,
            translation_id=translation_id,
            external_data_id=external_id,
            sha256=f"sha256-{digest}",
            byte_size=len(content),
            content_type=content_type,
        )

    @staticmethod
    def _identifier(value: object, label: str) -> str:
        if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_RESPONSE",
                f"Onshape returned an invalid {label} identifier.",
            )
        return value

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        headers = {
            "Authorization": self.authorization,
            "Accept": "application/json;charset=UTF-8; qs=0.09",
        }
        if body is not None:
            headers["Content-Type"] = "application/json;charset=UTF-8; qs=0.09"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, method=method, headers=headers
        )
        try:
            return self.opener(request, timeout=15)
        except urllib.error.HTTPError as error:
            code = "ONSHAPE_EXPORT_AUTH" if error.code in {401, 403} else "ONSHAPE_EXPORT_UPSTREAM"
            retryable = error.code in {408, 425, 429, 500, 502, 503, 504}
            error.close()
            raise OnshapeExportError(
                code, f"Onshape rejected the export request ({error.code}).", retryable=retryable
            ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_UNREACHABLE",
                "The Onshape export service could not be reached.",
                retryable=True,
            ) from error

    def _json_request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        with self._request(method, path, payload) as response:
            body = response.read(MAX_JSON_BYTES + 1)
        if len(body) > MAX_JSON_BYTES:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_RESPONSE_TOO_LARGE", "Onshape returned too much metadata."
            )
        try:
            value = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_RESPONSE", "Onshape returned invalid export metadata."
            ) from error
        if not isinstance(value, dict):
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_INVALID_RESPONSE", "Onshape returned invalid export metadata."
            )
        return value

    def _binary_request(self, path: str) -> tuple[bytes, str]:
        with self._request("GET", path) as response:
            content_type = response.headers.get("Content-Type", "application/octet-stream")
            body = response.read(self.max_cad_bytes + 1)
        if len(body) > self.max_cad_bytes:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_TOO_LARGE", "The STEP export exceeds the configured size limit."
            )
        if not body:
            raise OnshapeExportError(
                "ONSHAPE_EXPORT_EMPTY", "Onshape returned an empty STEP export."
            )
        return body, content_type.split(";", 1)[0].strip().lower()
