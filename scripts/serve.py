from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

try:
    from scripts.fea_service import FeaService, FeaServiceError, error_payload
except ModuleNotFoundError:  # Direct `python scripts/serve.py` execution.
    from fea_service import FeaService, FeaServiceError, error_payload


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
BASE_CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
SECURITY_HEADERS = {
    "Content-Security-Policy": f"{BASE_CONTENT_SECURITY_POLICY}; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), tools=(self)",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
}


ONSHAPE_ENDPOINT = "/api/onshape/design"
FEA_CAPABILITIES_ENDPOINT = "/api/fea/capabilities"
FEA_STUDIES_ENDPOINT = "/api/fea/studies"
FEA_CURRENT_SNAPSHOT_ENDPOINT = "/api/fea/current-snapshot"
FEA_STUDY_PATTERN = re.compile(
    r"^/api/fea/studies/(?P<study_id>study-[a-f0-9]{16})(?:/(?P<action>approve-and-submit|status|results))?$"
)
MAX_FEA_REQUEST_BYTES = 64 * 1024
ONSHAPE_REQUIRED_ENV = (
    "ONSHAPE_ACCESS_KEY",
    "ONSHAPE_SECRET_KEY",
    "ONSHAPE_DOCUMENT_ID",
    "ONSHAPE_WORKSPACE_ID",
    "ONSHAPE_ELEMENT_ID",
)


MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_VARIABLES = 40
MAX_NAME_LENGTH = 64
MAX_DEPTH = 12
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 0.25
CACHE_TTL_SECONDS = 15
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
ID_PATTERN = re.compile(r"^[A-Za-z0-9]{8,40}$")

_cache: dict[str, dict[str, Any]] = {}
_inflight: dict[str, threading.Event] = {}
_cache_lock = threading.Lock()
_fea_service: FeaService | None = None
_fea_service_lock = threading.Lock()


def local_fea_service() -> FeaService:
    global _fea_service
    with _fea_service_lock:
        if _fea_service is None:
            _fea_service = FeaService.from_environment()
        return _fea_service


def load_dotenv() -> None:
    """Load the repo-local development environment without logging secrets."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class FatalOnshapeError(RuntimeError):
    """An upstream condition no retry can fix."""

    def __init__(self, code: str, message: str, status: int, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def failure(code: str, message: str, status: int, retryable: bool = False) -> tuple[int, dict[str, Any]]:
    return status, {
        "ok": False,
        "error": {"code": code, "message": message, "retryable": retryable},
    }


def release_inflight(cache_key: str) -> None:
    with _cache_lock:
        event = _inflight.pop(cache_key, None)
        if event:
            event.set()


def onshape_get(path: str) -> dict[str, Any]:
    """Mirrors the Cloudflare function: bounded retries, size cap, fail-fast on auth."""
    base_url = os.environ.get("ONSHAPE_BASE_URL", "https://cad.onshape.com")
    credentials = base64.b64encode(
        f"{os.environ['ONSHAPE_ACCESS_KEY']}:{os.environ['ONSHAPE_SECRET_KEY']}".encode()
    ).decode()
    request = urllib.request.Request(
        f"{base_url}{path}",
        headers={
            "Authorization": f"Basic {credentials}",
            "Accept": "application/json;charset=UTF-8; qs=0.09",
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        retry_after_seconds: float | None = None
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise FatalOnshapeError(
                        "ONSHAPE_RESPONSE_TOO_LARGE",
                        "The Onshape response exceeded the configured size limit.",
                        502,
                    )
                return json.loads(body.decode("utf-8"))
        except FatalOnshapeError:
            raise
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                error.close()
                raise FatalOnshapeError(
                    "ONSHAPE_UNAUTHORIZED",
                    "BuildReady is not authorized for this document.",
                    502,
                ) from error
            if error.code == 404:
                error.close()
                raise FatalOnshapeError(
                    "ONSHAPE_NOT_FOUND",
                    "The configured Onshape element was not found.",
                    502,
                ) from error
            if error.code not in RETRYABLE_STATUS:
                error.close()
                raise FatalOnshapeError(
                    "ONSHAPE_UNAVAILABLE",
                    "The live Onshape source is unavailable.",
                    502,
                ) from error
            if error.code == 429:
                try:
                    declared_retry = float(error.headers.get("Retry-After", ""))
                    if 0 < declared_retry <= 5:
                        retry_after_seconds = declared_retry
                except (TypeError, ValueError):
                    retry_after_seconds = None
            error.close()
            last_error = error
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, socket.timeout) as error:
            last_error = error

        if attempt < MAX_ATTEMPTS:
            time.sleep(retry_after_seconds or BACKOFF_BASE_SECONDS * 2 ** (attempt - 1))

    if isinstance(last_error, (TimeoutError, socket.timeout)):
        raise FatalOnshapeError(
            "ONSHAPE_TIMEOUT", "Onshape did not respond in time.", 504, True
        ) from last_error
    raise FatalOnshapeError(
        "ONSHAPE_UNAVAILABLE", "The live Onshape source is unavailable.", 502, True
    ) from last_error


def resolve_onshape_context(query: dict[str, list[str]] | None = None) -> tuple[int, dict[str, Any]]:
    query = query or {}
    supplied = any(name in query for name in (
        "documentId", "workspaceOrVersion", "workspaceOrVersionId", "elementId"
    ))
    if not supplied:
        return 200, {
            "documentId": os.environ["ONSHAPE_DOCUMENT_ID"],
            "workspaceOrVersion": "w",
            "workspaceOrVersionId": os.environ["ONSHAPE_WORKSPACE_ID"],
            "elementId": os.environ["ONSHAPE_ELEMENT_ID"],
        }

    context = {
        "documentId": (query.get("documentId") or [""])[0],
        "workspaceOrVersion": (query.get("workspaceOrVersion") or [""])[0],
        "workspaceOrVersionId": (query.get("workspaceOrVersionId") or [""])[0],
        "elementId": (query.get("elementId") or [""])[0],
    }
    ids = (context["documentId"], context["workspaceOrVersionId"], context["elementId"])
    if not all(ID_PATTERN.fullmatch(identifier) for identifier in ids) \
            or context["workspaceOrVersion"] not in {"w", "v"}:
        return 400, {
            "code": "ONSHAPE_BAD_CONTEXT",
            "message": "The Onshape extension context is malformed.",
        }

    allowed = {os.environ["ONSHAPE_DOCUMENT_ID"]}
    allowed.update(
        item.strip()
        for item in os.environ.get("ONSHAPE_ALLOWED_DOCUMENT_IDS", "").split(",")
        if item.strip()
    )
    if context["documentId"] not in allowed:
        return 403, {
            "code": "ONSHAPE_CONTEXT_FORBIDDEN",
            "message": "This Onshape document is not allowed for this deployment.",
        }
    return 200, context


def local_onshape_payload(query: dict[str, list[str]] | None = None) -> tuple[int, dict[str, Any]]:
    """Local counterpart to `functions/api/onshape/design.js`.

    Kept deliberately small and behaviourally identical at the response contract
    level; production always serves this endpoint from the Cloudflare function.
    """
    if any(name not in os.environ for name in ONSHAPE_REQUIRED_ENV):
        return failure(
            "ONSHAPE_NOT_CONFIGURED", "The live Onshape source is not configured.", 503
        )

    context_status, context = resolve_onshape_context(query)
    if context_status != 200:
        return context_status, {
            "ok": False,
            "error": {
                "code": context["code"],
                "message": context["message"],
                "retryable": False,
            },
        }

    document_id = context["documentId"]
    workspace_or_version = context["workspaceOrVersion"]
    workspace_or_version_id = context["workspaceOrVersionId"]
    element_id = context["elementId"]
    base_url = os.environ.get("ONSHAPE_BASE_URL", "https://cad.onshape.com")
    if not all(ID_PATTERN.fullmatch(value) for value in (document_id, workspace_or_version_id, element_id)):
        return failure(
            "ONSHAPE_NOT_CONFIGURED", "The configured Onshape identifiers are malformed.", 503
        )
    cache_key = "|".join(
        (base_url, document_id, workspace_or_version, workspace_or_version_id, element_id)
    )

    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and time.monotonic() - cached["stored_at"] < CACHE_TTL_SECONDS:
            return 200, {**cached["payload"], "cached": True}
        wait_for = _inflight.get(cache_key)
        if wait_for is None:
            wait_for = threading.Event()
            _inflight[cache_key] = wait_for
            is_leader = True
        else:
            is_leader = False

    if not is_leader:
        wait_for.wait(timeout=MAX_ATTEMPTS * 8 + 6)
        with _cache_lock:
            cached = _cache.get(cache_key)
            if cached and time.monotonic() - cached["stored_at"] < CACHE_TTL_SECONDS:
                return 200, {**cached["payload"], "cached": True}

    try:
        scope = f"/d/{document_id}/{workspace_or_version}/{workspace_or_version_id}/e/{element_id}"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            features_future = pool.submit(onshape_get, f"/api/v6/partstudios{scope}/features")
            metadata_future = pool.submit(onshape_get, f"/api/v6/documents/{document_id}")
            features = features_future.result()
            metadata = metadata_future.result()
        microversion_payload: dict[str, Any] | list[Any] | None = None
        if not features.get("microversionId"):
            microversion_path = (
                f"/api/v6/documents/d/{document_id}/w/{workspace_or_version_id}/currentmicroversion"
                if workspace_or_version == "w"
                else f"/api/v6/documents/d/{document_id}/versions?offset=0&limit=0"
            )
            microversion_payload = onshape_get(microversion_path)
    except FatalOnshapeError as error:
        release_inflight(cache_key)
        return failure(error.code, error.message, error.status, error.retryable)
    except Exception:  # noqa: BLE001 - local dev surface mirrors the proxy contract
        release_inflight(cache_key)
        return failure(
            "ONSHAPE_UNAVAILABLE", "The live Onshape source is unavailable.", 502, True
        )

    variables: list[dict[str, str]] = []
    collect_variables(features.get("features", features), variables)

    if not variables:
        release_inflight(cache_key)
        return failure(
            "ONSHAPE_NO_VARIABLES",
            "The configured Part Studio exposes no named variables.",
            502,
        )

    if workspace_or_version == "w":
        microversion_id = features.get("microversionId") or (
            microversion_payload.get("microversion") if isinstance(microversion_payload, dict) else None
        )
    else:
        selected_version = next(
            (
                version for version in microversion_payload
                if isinstance(version, dict) and version.get("id") == workspace_or_version_id
            ),
            {},
        ) if isinstance(microversion_payload, list) else {}
        microversion_id = features.get("microversionId") or selected_version.get("microversion")
    if not isinstance(microversion_id, str) or not ID_PATTERN.fullmatch(microversion_id):
        return 502, {
            "ok": False,
            "error": {
                "code": "ONSHAPE_NO_MICROVERSION",
                "message": "Onshape did not identify the current model revision.",
                "retryable": False,
            },
        }

    payload = {
        "ok": True,
        "source": "onshape-live",
        "document": {
            "documentId": document_id,
            "workspaceId": workspace_or_version_id if workspace_or_version == "w" else None,
            "versionId": workspace_or_version_id if workspace_or_version == "v" else None,
            "workspaceOrVersion": workspace_or_version,
            "workspaceOrVersionId": workspace_or_version_id,
            "elementId": element_id,
            "name": str(metadata.get("name", "Onshape document"))[:120],
            "modifiedAt": metadata.get("modifiedAt"),
            "href": f"{base_url}/documents/{document_id}/{workspace_or_version}/{workspace_or_version_id}/e/{element_id}",
        },
        "microversionId": microversion_id,
        "serializationVersion": features.get("serializationVersion"),
        "variables": variables,
        "featureSummary": [
            {
                "featureId": str(feature.get("featureId", ""))[:64] or None,
                "featureType": str(feature.get("featureType", "unknown"))[:48],
                "name": str(feature.get("name", "Unnamed feature"))[:80],
                "suppressed": bool(feature.get("suppressed", False)),
            }
            for feature in features.get("features", [])[:100]
            if isinstance(feature, dict)
        ],
        "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    with _cache_lock:
        _cache[cache_key] = {"payload": payload, "stored_at": time.monotonic()}
        event = _inflight.pop(cache_key, None)
        if event:
            event.set()

    return 200, payload


def collect_variables(node: Any, found: list[dict[str, Any]], depth: int = 0) -> None:
    if depth > MAX_DEPTH or len(found) >= MAX_VARIABLES or node is None:
        return
    if isinstance(node, list):
        for item in node:
            collect_variables(item, found, depth + 1)
        return
    if not isinstance(node, dict):
        return

    parameters = node.get("parameters")
    if isinstance(parameters, list):
        name = None
        expression = None
        for parameter in parameters:
            if not isinstance(parameter, dict):
                continue
            if parameter.get("parameterId") == "name" and isinstance(parameter.get("value"), str):
                name = parameter["value"]
            if parameter.get("parameterId") == "value" and isinstance(parameter.get("expression"), str):
                expression = parameter["expression"]
        if name and expression and len(name) <= MAX_NAME_LENGTH:
            found.append({
                "name": name,
                "expression": expression[:MAX_NAME_LENGTH],
                "sourceFeatureId": str(node.get("featureId", ""))[:MAX_NAME_LENGTH] or None,
                "sourceFeatureName": str(node.get("name", ""))[:MAX_NAME_LENGTH] or None,
            })

    for value in node.values():
        if isinstance(value, (dict, list)):
            collect_variables(value, found, depth + 1)


class SpaRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self) -> None:
        request_path = urlsplit(self.path).path
        self.is_onshape_panel = request_path == "/onshape-panel"
        self.is_api_request = request_path == ONSHAPE_ENDPOINT

        if request_path == ONSHAPE_ENDPOINT:
            status, payload = local_onshape_payload(parse_qs(urlsplit(self.path).query))
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if request_path == FEA_CAPABILITIES_ENDPOINT:
            self.send_json(200, local_fea_service().capabilities())
            return

        fea_match = FEA_STUDY_PATTERN.fullmatch(request_path)
        if fea_match:
            try:
                study_id = fea_match.group("study_id")
                action = fea_match.group("action")
                if action == "status":
                    payload = local_fea_service().get_study(study_id, advance=True)
                elif action == "results":
                    payload = local_fea_service().get_results(study_id)
                elif action is None:
                    payload = local_fea_service().get_study(study_id)
                else:
                    raise FeaServiceError("FEA_METHOD_NOT_ALLOWED", "Use POST for this FEA action.", 405)
                self.send_json(200, payload)
            except FeaServiceError as error:
                self.send_json(*error_payload(error))
            return

        relative_path = request_path.lstrip("/")
        requested_file = WEB_ROOT / relative_path

        if request_path != "/" and not requested_file.is_file():
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self) -> None:
        request_path = urlsplit(self.path).path
        try:
            payload = self.read_json()
            if request_path == FEA_STUDIES_ENDPOINT:
                response = local_fea_service().create_study(payload)
                self.send_json(201 if response["created"] else 200, response)
                return

            if request_path == FEA_CURRENT_SNAPSHOT_ENDPOINT:
                if set(payload) != {"snapshotKey"}:
                    raise FeaServiceError(
                        "FEA_INVALID_REQUEST", "Expected exactly one snapshotKey."
                    )
                snapshot_key = payload["snapshotKey"]
                if (
                    not isinstance(snapshot_key, str)
                    or not 1 <= len(snapshot_key) <= 240
                    or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:/@-" for character in snapshot_key)
                ):
                    raise FeaServiceError(
                        "FEA_INVALID_REQUEST", "The active snapshot key is invalid."
                    )
                stale_count = local_fea_service().mark_snapshot_current(snapshot_key)
                self.send_json(
                    200,
                    {"ok": True, "snapshotKey": snapshot_key, "staleStudyCount": stale_count},
                )
                return

            fea_match = FEA_STUDY_PATTERN.fullmatch(request_path)
            if fea_match and fea_match.group("action") == "approve-and-submit":
                response = local_fea_service().approve_and_submit(
                    fea_match.group("study_id"), payload
                )
                self.send_json(202, response)
                return
            raise FeaServiceError("FEA_ROUTE_NOT_FOUND", "The requested FEA endpoint does not exist.", 404)
        except FeaServiceError as error:
            self.send_json(*error_payload(error))

    def read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise FeaServiceError("FEA_INVALID_REQUEST", "Content-Length is invalid.") from error
        if length <= 0 or length > MAX_FEA_REQUEST_BYTES:
            raise FeaServiceError("FEA_INVALID_REQUEST", "The JSON request size is invalid.", 413)
        try:
            payload = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise FeaServiceError("FEA_INVALID_REQUEST", "The request body must be valid JSON.") from error
        if not isinstance(payload, dict):
            raise FeaServiceError("FEA_INVALID_REQUEST", "The request body must be a JSON object.")
        return payload

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        headers = dict(SECURITY_HEADERS)
        if getattr(self, "is_onshape_panel", False):
            headers["Content-Security-Policy"] = (
                f"{BASE_CONTENT_SECURITY_POLICY}; "
                "frame-ancestors https://cad.onshape.com https://*.onshape.com"
            )
        for name, value in headers.items():
            self.send_header(name, value)
        if not getattr(self, "is_api_request", False):
            self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
        super().end_headers()


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Serve BuildReady locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SpaRequestHandler)
    print(f"BuildReady available at http://{args.host}:{args.port}")
    configured = all(os.environ.get(name) for name in ONSHAPE_REQUIRED_ENV)
    print(f"Onshape source: {'configured' if configured else 'not configured (fixture-only mode)'}")
    print(f"FEA provider: {local_fea_service().provider}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
