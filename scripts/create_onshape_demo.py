"""Create BuildReady's complex native Onshape validation part.

The generated document intentionally uses descriptive variable names that do
not match BuildReady's historical fixture names. Extra manufacturing variables
are included as distractors. This proves the application discovers and infers
semantic roles instead of reading a nine-name allowlist.

Usage:
    python scripts/create_onshape_demo.py           # describe only
    python scripts/create_onshape_demo.py --apply   # create in Onshape
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://cad.onshape.com"
API_VERSION = "v10"

VARIABLES = [
    ("stock_length", "140 mm"),
    ("stock_width", "90 mm"),
    ("base_plate_gauge", "8 mm"),
    ("cavity_z_depth", "26 mm"),
    ("cavity_min_span", "14 mm"),
    ("internal_relief_rad", "1.2 mm"),
    ("endmill_tool_rad", "3 mm"),
    ("rib_web_gauge", "0.9 mm"),
    ("coolant_bore_depth", "34 mm"),
    ("coolant_bore_dia", "5 mm"),
    ("fixture_bolt_bore_dia", "8 mm"),
    ("fixture_bolt_fit_tol", "0.018 mm"),
    ("boss_outer_dia", "20 mm"),
    ("boss_rise", "18 mm"),
    ("wall_rise", "38 mm"),
    ("mount_pitch_x", "104 mm"),
    ("mount_pitch_y", "58 mm"),
    ("counterbore_dia", "13 mm"),
    ("counterbore_depth", "3 mm"),
    ("edge_break_size", "0.6 mm"),
    ("stock_allowance", "1.5 mm"),
    ("gasket_land_width", "4 mm"),
    ("sensor_port_dia", "6 mm"),
    ("datum_pad_height", "2 mm"),
]


class OnshapeCreateError(RuntimeError):
    pass


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def credentials() -> str:
    access = os.environ.get("ONSHAPE_ACCESS_KEY")
    secret = os.environ.get("ONSHAPE_SECRET_KEY")
    if not access or not secret:
        raise OnshapeCreateError("ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY are required.")
    return base64.b64encode(f"{access}:{secret}".encode()).decode()


def request_json(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    encoded = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{os.environ.get('ONSHAPE_BASE_URL', BASE_URL)}{path}",
        method=method,
        data=encoded,
        headers={
            "Authorization": f"Basic {credentials()}",
            "Accept": "application/json;charset=UTF-8; qs=0.09",
            "Content-Type": "application/json;charset=UTF-8; qs=0.09",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
            return json.loads(data.decode()) if data else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:1000]
        raise OnshapeCreateError(f"Onshape returned {error.code} for {method} {path}: {detail}") from error


def enum(parameter_id: str, enum_name: str, value: str) -> dict[str, Any]:
    return {
        "btType": "BTMParameterEnum-145",
        "enumName": enum_name,
        "value": value,
        "parameterId": parameter_id,
    }


def quantity(parameter_id: str, expression: str) -> dict[str, Any]:
    return {
        "btType": "BTMParameterQuantity-147",
        "expression": expression,
        "parameterId": parameter_id,
    }


def boolean(parameter_id: str, value: bool) -> dict[str, Any]:
    return {"btType": "BTMParameterBoolean-144", "value": value, "parameterId": parameter_id}


def variable_feature(name: str, expression: str) -> dict[str, Any]:
    return {
        "feature": {
            "btType": "BTMFeature-134",
            "featureType": "assignVariable",
            "name": f"Manufacturing variable · {name}",
            "suppressed": False,
            "parameters": [
                enum("mode", "VariableMode", "ASSIGNED"),
                enum("variableType", "VariableType", "LENGTH"),
                enum("measurementMode", "VariableMeasurementMode", "DISTANCE"),
                {"btType": "BTMParameterString-149", "value": name, "parameterId": "name"},
                quantity("lengthValue", expression),
                quantity("value", expression),
            ],
        }
    }


def line_entity(entity_id: str, x1: float, y1: float, x2: float, y2: float) -> dict[str, Any]:
    dx, dy = x2 - x1, y2 - y1
    length = (dx * dx + dy * dy) ** 0.5
    return {
        "btType": "BTMSketchCurveSegment-155",
        "geometry": {
            "btType": "BTCurveGeometryLine-117",
            "pntX": (x1 + x2) / 2,
            "pntY": (y1 + y2) / 2,
            "dirX": dx / length,
            "dirY": dy / length,
        },
        "startPointId": f"{entity_id}.start",
        "endPointId": f"{entity_id}.end",
        "startParam": -length / 2,
        "endParam": length / 2,
        "entityId": entity_id,
        "isConstruction": False,
    }


def rectangle(prefix: str, center_x_mm: float, center_y_mm: float, width_mm: float, height_mm: float) -> list[dict[str, Any]]:
    x0 = (center_x_mm - width_mm / 2) / 1000
    x1 = (center_x_mm + width_mm / 2) / 1000
    y0 = (center_y_mm - height_mm / 2) / 1000
    y1 = (center_y_mm + height_mm / 2) / 1000
    return [
        line_entity(f"{prefix}.bottom", x0, y0, x1, y0),
        line_entity(f"{prefix}.right", x1, y0, x1, y1),
        line_entity(f"{prefix}.top", x1, y1, x0, y1),
        line_entity(f"{prefix}.left", x0, y1, x0, y0),
    ]


def circle(entity_id: str, x_mm: float, y_mm: float, radius_mm: float) -> dict[str, Any]:
    return {
        "btType": "BTMSketchCurve-4",
        "geometry": {
            "btType": "BTCurveGeometryCircle-115",
            "radius": radius_mm / 1000,
            "xCenter": x_mm / 1000,
            "yCenter": y_mm / 1000,
            "xDir": 1,
            "yDir": 0,
            "clockwise": False,
        },
        "centerId": f"{entity_id}.center",
        "entityId": entity_id,
        "isConstruction": False,
    }


def sketch_feature(name: str, entities: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "feature": {
            "btType": "BTMSketch-151",
            "featureType": "newSketch",
            "name": name,
            "suppressed": False,
            "parameters": [{
                "btType": "BTMParameterQueryList-148",
                "queries": [{
                    "btType": "BTMIndividualQuery-138",
                    "queryString": 'query=qCreatedBy(makeId("Top"), EntityType.FACE);',
                }],
                "parameterId": "sketchPlane",
            }],
            "entities": entities,
            "constraints": [],
        }
    }


def extrude_feature(name: str, sketch_id: str, depth: str, operation: str) -> dict[str, Any]:
    return {
        "feature": {
            "btType": "BTMFeature-134",
            "featureType": "extrude",
            "name": name,
            "suppressed": False,
            "parameters": [
                enum("bodyType", "ExtendedToolBodyType", "SOLID"),
                enum("operationType", "NewBodyOperationType", operation),
                {
                    "btType": "BTMParameterQueryList-148",
                    "queries": [{"btType": "BTMIndividualSketchRegionQuery-140", "featureId": sketch_id}],
                    "parameterId": "entities",
                },
                enum("endBound", "BoundingType", "BLIND"),
                quantity("depth", depth),
                boolean("oppositeDirection", False),
            ],
        }
    }


def add_feature(did: str, wid: str, eid: str, definition: dict[str, Any]) -> str:
    response = request_json(
        "POST",
        f"/api/v9/partstudios/d/{did}/w/{wid}/e/{eid}/features",
        definition,
    )
    feature = response.get("feature", response)
    feature_id = feature.get("featureId")
    if not feature_id:
        raise OnshapeCreateError(f"Feature creation returned no featureId: {str(response)[:500]}")
    return feature_id


def add_sketch_extrude(
    did: str,
    wid: str,
    eid: str,
    name: str,
    entities: list[dict[str, Any]],
    depth: str,
    operation: str,
) -> None:
    sketch_id = add_feature(did, wid, eid, sketch_feature(f"{name} Profile", entities))
    add_feature(did, wid, eid, extrude_feature(name, sketch_id, depth, operation))
    print(f"  [ok] {name}")


def create() -> str:
    document = request_json("POST", f"/api/{API_VERSION}/documents", {
        "name": "BuildReady Adaptive DFM — Complex Hydraulic Fixture",
    })
    did = document.get("id")
    workspace = document.get("defaultWorkspace") or {}
    wid = workspace.get("id")
    if not did or not wid:
        raise OnshapeCreateError(f"Document response did not include IDs: {str(document)[:500]}")

    # New documents create their initial Part Studio asynchronously on some
    # accounts, so allow a short bounded discovery window.
    elements: list[dict[str, Any]] = []
    for _ in range(10):
        elements = request_json("GET", f"/api/{API_VERSION}/documents/d/{did}/w/{wid}/elements")
        if any(element.get("elementType") == "PARTSTUDIO" for element in elements):
            break
        time.sleep(0.5)
    part_studio = next((element for element in elements if element.get("elementType") == "PARTSTUDIO"), None)
    if not part_studio:
        raise OnshapeCreateError("The new document did not create a Part Studio.")
    eid = part_studio["id"]
    url = f"{os.environ.get('ONSHAPE_BASE_URL', BASE_URL)}/documents/{did}/w/{wid}/e/{eid}"
    print(f"Created document: {url}")

    print(f"Adding {len(VARIABLES)} discoverable variables…")
    for name, expression in VARIABLES:
        add_feature(did, wid, eid, variable_feature(name, expression))

    print("Building native geometry…")
    add_sketch_extrude(did, wid, eid, "Base Plate", rectangle("base", 0, 0, 140, 90), "#base_plate_gauge", "NEW")

    walls = []
    walls += rectangle("wall.left", -36, 0, 8, 60)
    walls += rectangle("wall.right", 36, 0, 8, 60)
    walls += rectangle("wall.front", 0, -26, 64, 8)
    walls += rectangle("wall.back", 0, 26, 64, 8)
    add_sketch_extrude(did, wid, eid, "Raised Cavity Walls", walls, "#wall_rise", "ADD")

    bosses = [
        circle(f"boss.{index}", x, y, 10)
        for index, (x, y) in enumerate(((-52, -29), (52, -29), (-52, 29), (52, 29)), start=1)
    ]
    add_sketch_extrude(did, wid, eid, "Four Reinforced Bosses", bosses, "#boss_rise", "ADD")

    ribs = []
    ribs += rectangle("rib.left", -44, 0, 8, 18)
    ribs += rectangle("rib.right", 44, 0, 8, 18)
    add_sketch_extrude(did, wid, eid, "Side Support Ribs", ribs, "24 mm", "ADD")

    mount_holes = [
        circle(f"mount.{index}", x, y, 4)
        for index, (x, y) in enumerate(((-52, -29), (52, -29), (-52, 29), (52, 29)), start=1)
    ]
    add_sketch_extrude(did, wid, eid, "Mounting Through Holes", mount_holes, "45 mm", "REMOVE")

    counterbores = [
        circle(f"counterbore.{index}", x, y, 6.5)
        for index, (x, y) in enumerate(((-52, -29), (52, -29), (-52, 29), (52, 29)), start=1)
    ]
    add_sketch_extrude(did, wid, eid, "Mounting Counterbores", counterbores, "#counterbore_depth", "REMOVE")

    ports = [circle("port.coolant", 0, -26, 2.5), circle("port.sensor", 0, 26, 3)]
    add_sketch_extrude(did, wid, eid, "Deep Coolant and Sensor Ports", ports, "#coolant_bore_depth", "REMOVE")

    print("Complex fixture complete.")
    print(f"DOCUMENT_ID={did}")
    print(f"WORKSPACE_ID={wid}")
    print(f"ELEMENT_ID={eid}")
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create the document and geometry in Onshape.")
    args = parser.parse_args()
    if not args.apply:
        print("Dry run: would create a new private Onshape document with:")
        print(f"  {len(VARIABLES)} named variables")
        print("  base plate, cavity walls, bosses, ribs, through holes, counterbores, and ports")
        print("Run with --apply to create it.")
        return 0

    load_dotenv()
    try:
        create()
        return 0
    except OnshapeCreateError as error:
        print(f"\nCreation stopped: {error}\n", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
