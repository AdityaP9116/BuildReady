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
QUANTITY_PATTERN = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*\*?\s*([A-Za-z]+)\s*$")


class OnshapeAdapterError(ValueError):
    pass


def parse_quantity_mm(expression: str) -> float:
    match = QUANTITY_PATTERN.match(expression)
    if match is None:
        raise OnshapeAdapterError("ONSHAPE_BAD_QUANTITY")
    factor = UNIT_TO_MM.get(match.group(2).lower())
    if factor is None:
        raise OnshapeAdapterError("ONSHAPE_BAD_QUANTITY")
    return round(float(match.group(1)) * factor, 3)


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


def resolve_variables(variables: list[dict[str, str]], variable_map: list[dict[str, Any]]) -> dict[str, float]:
    by_name: dict[str, str] = {}
    for variable in variables:
        by_name.setdefault(variable["name"], variable["expression"])

    resolved: dict[str, float] = {}
    missing: list[str] = []
    for entry in variable_map:
        if entry["variableName"] not in by_name:
            missing.append(entry["variableName"])
            continue
        millimetres = parse_quantity_mm(by_name[entry["variableName"]])
        if not entry["minimumMm"] <= millimetres <= entry["maximumMm"]:
            raise OnshapeAdapterError("ONSHAPE_VALUE_OUT_OF_RANGE")
        resolved[entry["variableName"]] = millimetres
    if missing:
        raise OnshapeAdapterError("ONSHAPE_MISSING_VARIABLES")
    return resolved


def map_onshape_to_design(resolved: dict[str, float], source: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    dimensions_by_feature: dict[str, dict[str, float]] = {}
    for entry in source["variableMap"]:
        dimensions_by_feature.setdefault(entry["featureId"], {})[entry["dimensionKey"]] = resolved[
            entry["variableName"]
        ]

    design = copy.deepcopy(base)
    for feature in design["features"]:
        if feature["featureId"] not in dimensions_by_feature:
            raise OnshapeAdapterError("ONSHAPE_INCOMPLETE_MAPPING")
        feature["dimensions"] = dimensions_by_feature[feature["featureId"]]
    return design


class QuantityParsingTests(unittest.TestCase):
    def test_supported_length_units_convert_to_millimetres(self) -> None:
        self.assertEqual(parse_quantity_mm("1 mm"), 1.0)
        self.assertEqual(parse_quantity_mm("0.02 mm"), 0.02)
        self.assertEqual(parse_quantity_mm("2.5cm"), 25.0)
        self.assertEqual(parse_quantity_mm("1 in"), 25.4)

    def test_arithmetic_and_variable_references_are_rejected(self) -> None:
        for expression in ("#insideRadius", "1 mm + 2 mm", "2 * #r", "1 furlong", "", "12"):
            with self.subTest(expression=expression):
                with self.assertRaises(OnshapeAdapterError):
                    parse_quantity_mm(expression)


class VariableMapContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = load_source()
        cls.domain = load_domain()

    def test_variable_map_covers_every_fixture_dimension_exactly(self) -> None:
        mapped = {
            (entry["featureId"], entry["dimensionKey"]) for entry in self.source["variableMap"]
        }
        expected = {
            (feature["featureId"], key)
            for feature in self.domain["design"]["features"]
            for key in feature["dimensions"]
        }
        self.assertEqual(expected, mapped)

    def test_variable_names_are_unique(self) -> None:
        names = [entry["variableName"] for entry in self.source["variableMap"]]
        self.assertEqual(len(names), len(set(names)))

    def test_write_back_policy_never_targets_the_source_workspace(self) -> None:
        policy = self.source["writeBackPolicy"]
        self.assertEqual(policy["requiresHumanDecision"], "approved")
        self.assertEqual(policy["targetMode"], "new-branch-workspace-only")
        self.assertIn("main-workspace", policy["forbiddenTargets"])
        self.assertIn("released-version", policy["forbiddenTargets"])

    def test_write_back_variable_matches_the_proposal_policy_feature(self) -> None:
        write_back = self.source["writeBackPolicy"]["variableName"]
        entry = next(
            item for item in self.source["variableMap"] if item["variableName"] == write_back
        )
        self.assertEqual(entry["featureId"], self.domain["proposalPolicy"]["featureId"])


class ProxyBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.function_source = FUNCTION_PATH.read_text(encoding="utf-8")

    def test_proxy_never_reads_caller_supplied_routing_input(self) -> None:
        """Document/workspace/element ids must come from env bindings only."""
        for forbidden in ("params.", "searchParams", "request.url"):
            self.assertNotIn(forbidden, self.function_source)

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
        resolved = resolve_variables(variables, self.source["variableMap"])
        return map_onshape_to_design(resolved, self.source, self.domain["design"])

    def test_extraction_ignores_non_variable_features(self) -> None:
        variables = collect_variables(self.payload["features"])
        self.assertEqual(len(variables), len(self.source["variableMap"]))
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
        self.assertEqual(fixture_findings, live_findings)

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
