"""Inspect a real Onshape document and report what BuildReady can measure from it.

This is the tool to run first. It authenticates with your own API keys, walks a
document you already own, and reports which of BuildReady's five CNC dimensions
it can infer, which variables remain unused, and why.

Usage:
    uv run python scripts/onshape_probe.py documents
    uv run python scripts/onshape_probe.py inspect <onshape-url>
    uv run python scripts/onshape_probe.py inspect <onshape-url> --raw

Credentials come from the environment (see .env.example):
    ONSHAPE_ACCESS_KEY, ONSHAPE_SECRET_KEY
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "https://cad.onshape.com"
TIMEOUT_SECONDS = 20

# https://cad.onshape.com/documents/{did}/w/{wid}/e/{eid}
URL_PATTERN = re.compile(
    r"/documents/(?P<did>[0-9a-f]{24})"
    r"(?:/(?P<wvm>[wvm])/(?P<wvmid>[0-9a-f]{24}))?"
    r"(?:/e/(?P<eid>[0-9a-f]{24}))?"
)


class ProbeError(RuntimeError):
    pass


def load_dotenv() -> None:
    """Read .env if present so the probe works without exporting variables."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def credentials() -> str:
    access = os.environ.get("ONSHAPE_ACCESS_KEY")
    secret = os.environ.get("ONSHAPE_SECRET_KEY")
    if not access or not secret:
        raise ProbeError(
            "Set ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY.\n"
            "Create a key pair at https://dev-portal.onshape.com/keys "
            "(read scopes are enough), then copy .env.example to .env and fill it in."
        )
    return base64.b64encode(f"{access}:{secret}".encode()).decode()


def api_get(path: str) -> Any:
    base_url = os.environ.get("ONSHAPE_BASE_URL", DEFAULT_BASE_URL)
    request = urllib.request.Request(
        f"{base_url}{path}",
        headers={
            "Authorization": f"Basic {credentials()}",
            "Accept": "application/json;charset=UTF-8; qs=0.09",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        if error.code in (401, 403):
            raise ProbeError(
                f"Onshape rejected the credentials ({error.code}).\n"
                "Check the key pair is active and has read scopes for this document."
            ) from error
        if error.code == 404:
            raise ProbeError(f"Not found: {path}\nCheck the URL is a Part Studio you can open.") from error
        raise ProbeError(f"Onshape returned {error.code} for {path}\n{detail}") from error
    except urllib.error.URLError as error:
        raise ProbeError(f"Could not reach Onshape: {error.reason}") from error


def parse_document_url(url: str) -> dict[str, str]:
    match = URL_PATTERN.search(url)
    if not match:
        raise ProbeError(
            "Could not read that Onshape URL.\n"
            "Open the Part Studio in Onshape and copy the address bar, which looks like:\n"
            "  https://cad.onshape.com/documents/<24 hex>/w/<24 hex>/e/<24 hex>"
        )
    parts = match.groupdict()
    if not parts.get("wvmid"):
        raise ProbeError("That URL has no workspace segment (/w/...). Open the document first.")
    return parts


# --- Extraction ------------------------------------------------------------

# Feature types worth reporting even when they are not named variables, because
# they carry the quantities BuildReady's rules care about.
INTERESTING_FEATURE_TYPES = {
    "fillet": "corner radius",
    "chamfer": "edge break",
    "hole": "hole diameter/depth",
    "extrude": "depth",
    "shell": "wall thickness",
    "draft": "draft angle",
}


def walk_variables(node: Any, found: list[dict[str, str]]) -> None:
    """Same structural walk the proxy uses, so the probe reports exactly what it would see."""
    if node is None or len(found) >= 200:
        return
    if isinstance(node, list):
        for item in node:
            walk_variables(item, found)
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
        if name and expression:
            found.append({
                "name": name,
                "expression": expression,
                "sourceFeatureId": node.get("featureId"),
                "sourceFeatureName": node.get("name"),
            })

    for value in node.values():
        if isinstance(value, (dict, list)):
            walk_variables(value, found)


def summarize_features(features: list[dict[str, Any]]) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        feature_type = str(feature.get("featureType", "?"))
        name = str(feature.get("name", "unnamed"))[:44]
        relevance = INTERESTING_FEATURE_TYPES.get(feature_type, "")
        rows.append((feature_type, name, relevance))
    return rows


def discover_variables(variables: list[dict[str, Any]]) -> dict[str, Any]:
    """Run the exact browser inference module; the CLI has no duplicate name map."""
    program = """
import fs from 'node:fs'
import { discoverManufacturingVariables } from './web/onshape-discovery.js'
import { parseQuantityMm } from './web/onshape-adapter.js'
const variables = JSON.parse(fs.readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify(discoverManufacturingVariables(variables, parseQuantityMm)))
"""
    try:
        result = subprocess.run(
            ["node", "--experimental-default-type=module", "--input-type=module", "-e", program],
            cwd=ROOT,
            input=json.dumps(variables),
            text=True,
            capture_output=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        detail = getattr(error, "stderr", "")
        raise ProbeError(f"Could not run semantic discovery with Node.js: {detail}") from error
    return json.loads(result.stdout)


def command_documents() -> int:
    payload = api_get("/api/v6/documents?filter=0&limit=20&sortColumn=modifiedAt&sortOrder=desc")
    items = payload.get("items", [])
    if not items:
        print("No documents found for these credentials.")
        return 1

    print(f"\n{len(items)} most recently modified documents:\n")
    for item in items:
        did = item.get("id", "")
        name = str(item.get("name", "untitled"))[:52]
        default = item.get("defaultWorkspace", {}) or {}
        wid = default.get("id", "")
        base = os.environ.get("ONSHAPE_BASE_URL", DEFAULT_BASE_URL)
        print(f"  {name}")
        print(f"    {base}/documents/{did}/w/{wid}\n")
    print("Inspect one with:\n  uv run python scripts/onshape_probe.py inspect <url>\n")
    return 0


def command_inspect(url: str, show_raw: bool) -> int:
    parts = parse_document_url(url)
    did, wvmid, eid = parts["did"], parts["wvmid"], parts.get("eid")
    wvm = parts.get("wvm") or "w"

    document = api_get(f"/api/v6/documents/{did}")
    print(f"\nDocument: {document.get('name', 'untitled')}")

    elements = api_get(f"/api/v6/documents/d/{did}/{wvm}/{wvmid}/elements")
    if not isinstance(elements, list):
        raise ProbeError(
            "Onshape returned an unexpected element list for this document.\n"
            "Check the URL points at a document you can open."
        )
    part_studios = [
        element
        for element in elements
        if isinstance(element, dict) and element.get("elementType") == "PARTSTUDIO"
    ]

    if not part_studios:
        print("\nThis document has no Part Studios. BuildReady measures Part Studios.")
        return 1

    print(f"\nPart Studios ({len(part_studios)}):")
    for element in part_studios:
        marker = " <- selected" if element.get("id") == eid else ""
        print(f"  {element.get('name')}  [{element.get('id')}]{marker}")

    if not eid or eid not in {e.get("id") for e in part_studios}:
        eid = part_studios[0]["id"]
        print(f"\nNo Part Studio in the URL; using '{part_studios[0].get('name')}'.")

    scope = f"/d/{did}/{wvm}/{wvmid}/e/{eid}"
    features_payload = api_get(f"/api/v6/partstudios{scope}/features")
    features = features_payload.get("features", [])

    if features_payload.get("microversionId"):
        microversion_id = features_payload["microversionId"]
    elif wvm == "w":
        current = api_get(f"/api/v6/documents/d/{did}/w/{wvmid}/currentmicroversion")
        microversion_id = current.get("microversion", "unknown")
    else:
        versions = api_get(f"/api/v6/documents/d/{did}/versions?offset=0&limit=0")
        selected_version = next(
            (version for version in versions if version.get("id") == wvmid),
            {},
        )
        microversion_id = selected_version.get("microversion", "unknown")

    if show_raw:
        print(json.dumps(features_payload, indent=2)[:20000])
        return 0

    print(f"\nMicroversion: {microversion_id}")
    print(f"Features: {len(features)}")

    rows = summarize_features(features)
    if rows:
        print("\n  type                 name                                    relevance")
        print("  " + "-" * 76)
        for feature_type, name, relevance in rows[:40]:
            print(f"  {feature_type:<20} {name:<40} {relevance}")

    variables: list[dict[str, str]] = []
    walk_variables(features, variables)
    by_name = {v["name"]: v["expression"] for v in variables}

    print(f"\nNamed variables found: {len(by_name)}")
    for name, expression in list(by_name.items())[:40]:
        print(f"  #{name} = {expression}")

    discovery = discover_variables(variables)
    print("\nBuildReady semantic inference:")
    for mapping in discovery["mappings"]:
        print(
            f"  [{mapping['confidence']:<6}] #{mapping['variableName']:<28} "
            f"-> {mapping['roleId']} ({mapping['valueMm']:g} mm)"
        )
    print(
        f"\n{len(discovery['mappings'])}/{discovery['roleCount']} semantic roles inferred; "
        f"{len(discovery['unmapped'])} valid variables intentionally left unmapped."
    )

    if not discovery["mappings"]:
        print(
            "\nNo applicable manufacturing groups were found. Use descriptive variable names "
            "that combine a measurement and context, such as cavity_min_span, "
            "internal_relief_rad, or coolant_bore_depth. Literal length expressions are required."
        )
    else:
        print("\nThis Part Studio can be connected. Add to .env:\n")
        print(f"  ONSHAPE_DOCUMENT_ID={did}")
        print(f"  ONSHAPE_WORKSPACE_ID={wvmid}")
        print(f"  ONSHAPE_ELEMENT_ID={eid}")
        print("\nThen: .venv/bin/python scripts/serve.py")

    return 0


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("documents", help="List your most recent Onshape documents.")
    inspect = subparsers.add_parser("inspect", help="Report what BuildReady can measure from a document.")
    inspect.add_argument("url", help="Onshape document URL.")
    inspect.add_argument("--raw", action="store_true", help="Dump the raw feature list instead.")

    args = parser.parse_args()
    try:
        if args.command == "documents":
            return command_documents()
        return command_inspect(args.url, args.raw)
    except ProbeError as error:
        print(f"\n{error}\n", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
