"""Contract tests for the optional live Onshape design source.

These mirror `web/onshape-adapter.js` in Python, matching the convention the
rest of this suite already uses to validate browser logic against the shipped
JSON. The most important assertion is the last one: live Onshape measurements
must flow through the *unchanged* deterministic rule engine and reproduce the
same five findings as the controlled fixture.
"""

from __future__ import annotations

import copy
import json
import re
import subprocess
import unittest
from pathlib import Path
from typing import Any

from test_cnc_rules import evaluate_rule, load_domain


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "web" / "onshape-source.json"
PAYLOAD_PATH = ROOT / "tests" / "fixtures" / "onshape-feature-list.json"
FUNCTION_PATH = ROOT / "functions" / "api" / "onshape" / "design.js"

UNIT_TO_MM = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "in": 25.4,
    "ft": 304.8,
}
QUANTITY_PATTERN = re.compile(r"^\s*(-?(?:\d+(?:\.\d+)?|\d+\s*/\s*\d+))\s*\*?\s*([A-Za-z]+)\s*$")


class OnshapeAdapterError(ValueError):
    pass


def parse_quantity_mm(expression: str) -> float:
    match = QUANTITY_PATTERN.match(expression)
    if match is None:
        raise OnshapeAdapterError("ONSHAPE_BAD_QUANTITY")
    factor = UNIT_TO_MM.get(match.group(2).lower())
    if factor is None:
        raise OnshapeAdapterError("ONSHAPE_BAD_QUANTITY")
    magnitude_text = match.group(1)
    if "/" in magnitude_text:
        numerator, denominator = (float(part) for part in magnitude_text.split("/"))
        if denominator == 0:
            raise OnshapeAdapterError("ONSHAPE_BAD_QUANTITY")
        magnitude = numerator / denominator
    else:
        magnitude = float(magnitude_text)
    return round(magnitude * factor, 3)


def collect_variables(node: Any, found: list[dict[str, str]] | None = None) -> list[dict[str, str]]:
    """Structural walk matching `collectVariables` in the Cloudflare function."""
    if found is None:
        found = []
    if isinstance(node, list):
        for item in node:
            collect_variables(item, found)
        return found
    if not isinstance(node, dict):
        return found

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
            found.append({"name": name, "expression": expression})

    for value in node.values():
        if isinstance(value, (dict, list)):
            collect_variables(value, found)
    return found


def load_source() -> dict[str, Any]:
    return json.loads(SOURCE_PATH.read_text(encoding="utf-8"))


class QuantityParsingTests(unittest.TestCase):
    def test_supported_length_units_convert_to_millimetres(self) -> None:
        self.assertEqual(parse_quantity_mm("1 mm"), 1.0)
        self.assertEqual(parse_quantity_mm("0.02 mm"), 0.02)
        self.assertEqual(parse_quantity_mm("2.5cm"), 25.0)
        self.assertEqual(parse_quantity_mm("1 in"), 25.4)
        self.assertEqual(parse_quantity_mm("1/8 in"), 3.175)

    def test_arithmetic_and_variable_references_are_rejected(self) -> None:
        for expression in ("#insideRadius", "1 mm + 2 mm", "2 * #r", "1 furlong", "", "12"):
            with self.subTest(expression=expression):
                with self.assertRaises(OnshapeAdapterError):
                    parse_quantity_mm(expression)


def map_with_shipped_javascript(variables: list[dict[str, str]]) -> dict[str, Any]:
    """Exercise the browser's real discovery and adapter modules in Node."""
    program = r"""
import fs from 'node:fs'
import { mapOnshapeToDesign } from './web/onshape-adapter.js'
const variables = JSON.parse(fs.readFileSync(0, 'utf8'))
const source = JSON.parse(fs.readFileSync('./web/onshape-source.json', 'utf8'))
const domain = JSON.parse(fs.readFileSync('./web/cnc-domain.json', 'utf8'))
const payload = {
  ok: true,
  variables,
  document: {
    documentId: '123456789012345678901234',
    workspaceId: '234567890123456789012345',
    elementId: '345678901234567890123456',
    name: 'Semantic discovery test',
    href: 'https://cad.onshape.com/documents/123456789012345678901234',
  },
  microversionId: '456789012345678901234567',
  retrievedAt: '2026-09-02T00:00:00Z',
}
process.stdout.write(JSON.stringify(mapOnshapeToDesign(payload, source, domain.design)))
"""
    # Embed the payload as a JSON literal so stdin remains the module source.
    embedded = program.replace(
        "JSON.parse(fs.readFileSync(0, 'utf8'))",
        json.dumps(variables),
    )
    result = subprocess.run(
        ["node", "--experimental-default-type=module", "--input-type=module"],
        cwd=ROOT,
        input=embedded,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


class SemanticDiscoveryContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = load_source()
        cls.domain = load_domain()

    def test_source_uses_inference_instead_of_an_exact_name_map(self) -> None:
        self.assertNotIn("variableMap", self.source)
        self.assertEqual(self.source["discovery"]["strategy"], "semantic-token-scoring")
        self.assertTrue(self.source["discovery"]["partialCoverage"])

    def test_write_back_policy_never_targets_the_source_workspace(self) -> None:
        policy = self.source["writeBackPolicy"]
        self.assertEqual(policy["requiresHumanDecision"], "approved")
        self.assertEqual(policy["targetMode"], "new-branch-workspace-only")
        self.assertIn("main-workspace", policy["forbiddenTargets"])
        self.assertIn("released-version", policy["forbiddenTargets"])

    def test_write_back_policy_targets_an_inferred_semantic_role(self) -> None:
        self.assertEqual(self.source["writeBackPolicy"]["semanticRole"], "cornerRadius")

    def test_unfamiliar_names_are_inferred_and_distractors_are_not_forced(self) -> None:
        values = {
            "cavity_z_depth": "26 mm",
            "cavity_min_span": "14 mm",
            "internal_relief_rad": "1.2 mm",
            "endmill_tool_rad": "3 mm",
            "rib_web_gauge": "0.9 mm",
            "coolant_bore_depth": "34 mm",
            "coolant_bore_dia": "5 mm",
            "fixture_bolt_bore_dia": "8 mm",
            "fixture_bolt_fit_tol": "0.018 mm",
            "stock_length": "140 mm",
            "boss_outer_dia": "20 mm",
            "sensor_port_dia": "6 mm",
        }
        mapped = map_with_shipped_javascript([
            {
                "name": name,
                "expression": expression,
                "sourceFeatureName": f"Manufacturing variable · {name}",
            }
            for name, expression in values.items()
        ])
        discovery = mapped["provenance"]["discovery"]
        roles = {item["roleId"]: item["variableName"] for item in discovery["mappings"]}
        self.assertEqual(len(roles), 9)
        self.assertEqual(roles["cornerRadius"], "internal_relief_rad")
        self.assertEqual(roles["mountTolerance"], "fixture_bolt_fit_tol")
        self.assertEqual(mapped["provenance"]["applicableRuleCount"], 5)
        self.assertEqual(mapped["provenance"]["availableRuleCount"], 5)
        self.assertEqual(mapped["design"]["material"]["id"], "unspecified")
        self.assertIsNone(mapped["design"]["quantity"])
        self.assertIn("stock_length", {item["name"] for item in discovery["unmapped"]})

    def test_partial_coverage_builds_only_complete_rule_groups(self) -> None:
        mapped = map_with_shipped_javascript([
            {"name": "internal_relief_rad", "expression": "1.2 mm"},
            {"name": "endmill_tool_rad", "expression": "3 mm"},
            {"name": "cavity_z_depth", "expression": "26 mm"},
        ])
        self.assertEqual(
            [feature["featureId"] for feature in mapped["design"]["features"]],
            ["inside-pocket-corner"],
        )
        self.assertEqual(mapped["provenance"]["applicableRuleCount"], 1)


class ProxyBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.function_source = FUNCTION_PATH.read_text(encoding="utf-8")

    def test_extension_context_is_validated_and_document_allowlisted(self) -> None:
        """Context may select an explicitly allowed document, never arbitrary API-key scope."""
        self.assertIn("ID_PATTERN.test(id)", self.function_source)
        self.assertIn("['w', 'v'].includes(context.workspaceOrVersion)", self.function_source)
        self.assertIn("ONSHAPE_ALLOWED_DOCUMENT_IDS", self.function_source)
        self.assertIn("ONSHAPE_CONTEXT_FORBIDDEN", self.function_source)
        self.assertIn("allowedDocuments.has(context.documentId)", self.function_source)

    def test_proxy_only_exposes_a_get_handler(self) -> None:
        self.assertIn("export async function onRequestGet", self.function_source)
        for method in ("onRequestPost", "onRequestPut", "onRequestDelete", "onRequest("):
            self.assertNotIn(f"export async function {method}", self.function_source)

    def test_secrets_are_read_from_bindings_and_not_hardcoded(self) -> None:
        self.assertIn("env.ONSHAPE_SECRET_KEY", self.function_source)
        self.assertNotIn("sk_", self.function_source)


class LiveSourceReachesTheSameFindingsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = load_source()
        cls.domain = load_domain()
        cls.payload = json.loads(PAYLOAD_PATH.read_text(encoding="utf-8"))

    def mapped_design(self) -> dict[str, Any]:
        variables = collect_variables(self.payload["features"])
        return map_with_shipped_javascript(variables)["design"]

    def test_extraction_ignores_non_variable_features(self) -> None:
        variables = collect_variables(self.payload["features"])
        self.assertEqual(len(variables), 9)
        self.assertNotIn("extrude", {variable["name"] for variable in variables})

    def test_mapped_design_matches_the_controlled_fixture_dimensions(self) -> None:
        design = self.mapped_design()
        for mapped, fixture in zip(design["features"], self.domain["design"]["features"]):
            self.assertEqual(fixture["featureId"], mapped["featureId"])
            self.assertEqual(fixture["dimensions"], mapped["dimensions"])

    def test_live_measurements_reproduce_the_same_five_findings(self) -> None:
        live_domain = copy.deepcopy(self.domain)
        live_domain["design"] = self.mapped_design()

        fixture_findings = [
            finding
            for rule in self.domain["rules"]
            if (finding := evaluate_rule(self.domain, rule)) is not None
        ]
        live_findings = [
            finding
            for rule in live_domain["rules"]
            if (finding := evaluate_rule(live_domain, rule)) is not None
        ]

        self.assertEqual(5, len(live_findings))
        for fixture_finding, live_finding in zip(fixture_findings, live_findings):
            fixture_finding = {key: value for key, value in fixture_finding.items() if key != "findingId"}
            live_finding = {key: value for key, value in live_finding.items() if key != "findingId"}
            self.assertEqual(fixture_finding, live_finding)

    def test_a_corrected_radius_in_onshape_clears_the_corner_finding(self) -> None:
        """Proves the rule engine reacts to real model state, not a canned answer."""
        corrected = copy.deepcopy(self.domain)
        corrected["design"] = self.mapped_design()
        corner = next(
            feature
            for feature in corrected["design"]["features"]
            if feature["featureId"] == "inside-pocket-corner"
        )
        corner["dimensions"]["insideRadiusMm"] = 3.5

        rule = next(item for item in corrected["rules"] if item["ruleId"] == "CNC-R001")
        self.assertIsNone(evaluate_rule(corrected, rule))


if __name__ == "__main__":
    unittest.main()
