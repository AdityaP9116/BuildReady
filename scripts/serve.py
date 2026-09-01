from __future__ import annotations

import argparse
import base64
import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), tools=(self)",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
}


ONSHAPE_ENDPOINT = "/api/onshape/design"
ONSHAPE_REQUIRED_ENV = (
    "ONSHAPE_ACCESS_KEY",
    "ONSHAPE_SECRET_KEY",
    "ONSHAPE_DOCUMENT_ID",
    "ONSHAPE_WORKSPACE_ID",
    "ONSHAPE_ELEMENT_ID",
)


MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 0.25
CACHE_TTL_SECONDS = 15
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}

_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


class FatalOnshapeError(RuntimeError):
    """An upstream condition no retry can fix."""

    def __init__(self, code: str, status: int) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


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
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise FatalOnshapeError("ONSHAPE_RESPONSE_TOO_LARGE", 502)
                return json.loads(body.decode("utf-8"))
        except FatalOnshapeError:
            raise
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise FatalOnshapeError("ONSHAPE_UNAUTHORIZED", 502) from error
            if error.code == 404:
                raise FatalOnshapeError("ONSHAPE_NOT_FOUND", 502) from error
            if error.code not in RETRYABLE_STATUS:
                raise FatalOnshapeError("ONSHAPE_UNAVAILABLE", 502) from error
            last_error = error
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as error:
            last_error = error

        if attempt < MAX_ATTEMPTS:
            time.sleep(BACKOFF_BASE_SECONDS * 2 ** (attempt - 1))

    raise last_error or RuntimeError("Onshape request failed")


def local_onshape_payload() -> tuple[int, dict[str, Any]]:
    """Local counterpart to `functions/api/onshape/design.js`.

    Kept deliberately small and behaviourally identical at the response contract
    level; production always serves this endpoint from the Cloudflare function.
    """
    if any(name not in os.environ for name in ONSHAPE_REQUIRED_ENV):
        return 503, {
            "ok": False,
            "error": {
                "code": "ONSHAPE_NOT_CONFIGURED",
                "message": "The live Onshape source is not configured.",
                "retryable": False,
            },
        }

    document_id = os.environ["ONSHAPE_DOCUMENT_ID"]
    workspace_id = os.environ["ONSHAPE_WORKSPACE_ID"]
    element_id = os.environ["ONSHAPE_ELEMENT_ID"]
    base_url = os.environ.get("ONSHAPE_BASE_URL", "https://cad.onshape.com")

    with _cache_lock:
        cached = _cache.get("payload")
        if cached and time.monotonic() - cached["stored_at"] < CACHE_TTL_SECONDS:
            return 200, {**cached["payload"], "cached": True}

    try:
        scope = f"/d/{document_id}/w/{workspace_id}/e/{element_id}"
        features = onshape_get(f"/api/v6/partstudios{scope}/features")
        metadata = onshape_get(f"/api/v6/documents/{document_id}")
    except FatalOnshapeError as error:
        return error.status, {
            "ok": False,
            "error": {
                "code": error.code,
                "message": "The live Onshape source could not be read.",
                "retryable": False,
            },
        }
    except Exception:  # noqa: BLE001 - local dev surface mirrors the proxy contract
        return 502, {
            "ok": False,
            "error": {
                "code": "ONSHAPE_UNAVAILABLE",
                "message": "The live Onshape source is unavailable.",
                "retryable": True,
            },
        }

    variables: list[dict[str, str]] = []
    collect_variables(features.get("features", features), variables)

    if not variables:
        return 502, {
            "ok": False,
            "error": {
                "code": "ONSHAPE_NO_VARIABLES",
                "message": "The configured Part Studio exposes no named variables.",
                "retryable": False,
            },
        }

    payload = {
        "ok": True,
        "source": "onshape-live",
        "document": {
            "documentId": document_id,
            "workspaceId": workspace_id,
            "elementId": element_id,
            "name": str(metadata.get("name", "Onshape document"))[:120],
            "modifiedAt": metadata.get("modifiedAt"),
            "href": f"{base_url}/documents/{document_id}/w/{workspace_id}/e/{element_id}",
        },
        "microversionId": features.get("microversionId"),
        "serializationVersion": features.get("serializationVersion"),
        "variables": variables,
        "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    with _cache_lock:
        _cache["payload"] = {"payload": payload, "stored_at": time.monotonic()}

    return 200, payload


def collect_variables(node: Any, found: list[dict[str, str]]) -> None:
    if len(found) >= 40 or node is None:
        return
    if isinstance(node, list):
        for item in node:
            collect_variables(item, found)
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
        if name and expression and len(name) <= 64:
            found.append({"name": name, "expression": expression[:64]})

    for value in node.values():
        if isinstance(value, (dict, list)):
            collect_variables(value, found)


class SpaRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self) -> None:
        request_path = urlsplit(self.path).path

        if request_path == ONSHAPE_ENDPOINT:
            status, payload = local_onshape_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        relative_path = request_path.lstrip("/")
        requested_file = WEB_ROOT / relative_path

        if request_path != "/" and not requested_file.is_file():
            self.path = "/index.html"

        super().do_GET()

    def end_headers(self) -> None:
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve BuildReady locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), SpaRequestHandler)
    print(f"BuildReady available at http://{args.host}:{args.port}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
