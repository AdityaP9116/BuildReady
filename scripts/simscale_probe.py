"""Run one bounded, read-only SimScale account/API preflight.

The probe never creates a project, uploads CAD, or starts compute. It calls the
official v1 projects collection with a one-item page and prints only sanitized
capability evidence. Project names, identifiers, and the API key are omitted.

Usage:
    uv run python scripts/simscale_probe.py
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
SIMSCALE_API_ORIGIN = "https://api.simscale.com"
PROJECTS_PATH = "/v1/projects?limit=1&page=1"
TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 1_000_000


class SimScaleProbeError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True)
class ProbeResult:
    ok: bool
    provider: str
    mode: str
    endpoint: str
    authenticated: bool
    projectPageCount: int
    totalProjects: int | None
    liveProviderEnabled: bool
    nextAction: str


def load_dotenv() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def api_key_from_environment() -> str:
    api_key = os.environ.get("SIMSCALE_API_KEY", "").strip()
    if not api_key:
        raise SimScaleProbeError(
            "SIMSCALE_NOT_CONFIGURED",
            "Set SIMSCALE_API_KEY in .env. The key must be active and permitted to use the API.",
        )
    return api_key


def _read_json_response(response: Any) -> dict[str, Any]:
    content_length = response.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > MAX_RESPONSE_BYTES:
                raise SimScaleProbeError(
                    "SIMSCALE_RESPONSE_TOO_LARGE", "SimScale returned an unexpectedly large response."
                )
        except ValueError as error:
            raise SimScaleProbeError(
                "SIMSCALE_INVALID_RESPONSE", "SimScale returned an invalid Content-Length."
            ) from error
    body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise SimScaleProbeError(
            "SIMSCALE_RESPONSE_TOO_LARGE", "SimScale returned an unexpectedly large response."
        )
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SimScaleProbeError(
            "SIMSCALE_INVALID_RESPONSE", "SimScale returned a non-JSON response."
        ) from error
    if not isinstance(payload, dict):
        raise SimScaleProbeError(
            "SIMSCALE_INVALID_RESPONSE", "SimScale returned an unexpected response shape."
        )
    return payload


def probe_projects(
    api_key: str,
    *,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> ProbeResult:
    request = urllib.request.Request(
        f"{SIMSCALE_API_ORIGIN}{PROJECTS_PATH}",
        method="GET",
        headers={"X-API-KEY": api_key, "Accept": "application/json"},
    )
    try:
        with opener(request, timeout=TIMEOUT_SECONDS) as response:
            payload = _read_json_response(response)
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            raise SimScaleProbeError(
                "SIMSCALE_AUTHENTICATION_FAILED",
                "SimScale rejected the API key. Confirm the key is active and API access is enabled.",
            ) from error
        if error.code == 429:
            raise SimScaleProbeError(
                "SIMSCALE_RATE_LIMITED",
                "SimScale rate-limited the read-only probe. Retry after the provider limit resets.",
                retryable=True,
            ) from error
        if 500 <= error.code <= 599:
            raise SimScaleProbeError(
                "SIMSCALE_UNAVAILABLE",
                f"SimScale returned a temporary {error.code} response.",
                retryable=True,
            ) from error
        raise SimScaleProbeError(
            "SIMSCALE_REQUEST_FAILED", f"SimScale rejected the read-only request ({error.code})."
        ) from error
    except urllib.error.URLError as error:
        raise SimScaleProbeError(
            "SIMSCALE_UNREACHABLE", "The SimScale API could not be reached.", retryable=True
        ) from error
    except TimeoutError as error:
        raise SimScaleProbeError(
            "SIMSCALE_TIMEOUT", "The SimScale API did not answer within 10 seconds.", retryable=True
        ) from error

    projects = payload.get("_embedded")
    metadata = payload.get("_meta", {})
    if not isinstance(projects, list) or not isinstance(metadata, dict):
        raise SimScaleProbeError(
            "SIMSCALE_INVALID_RESPONSE",
            "The projects response does not match the current v1 collection contract.",
        )
    total = metadata.get("total")
    total_projects = total if isinstance(total, int) and total >= 0 else None
    return ProbeResult(
        ok=True,
        provider="simscale",
        mode="read-only-account-probe",
        endpoint="GET /v1/projects?limit=1&page=1",
        authenticated=True,
        projectPageCount=len(projects),
        totalProjects=total_projects,
        liveProviderEnabled=False,
        nextAction="Complete the manual baseline and capability checklist before enabling live CAD transfer or compute.",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a read-only SimScale API preflight.")
    parser.parse_args()
    load_dotenv()
    try:
        result = probe_projects(api_key_from_environment())
    except SimScaleProbeError as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": error.code,
                        "message": error.message,
                        "retryable": error.retryable,
                    },
                },
                indent=2,
            ),
            file=os.sys.stderr,
        )
        return 1
    print(json.dumps(asdict(result), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
