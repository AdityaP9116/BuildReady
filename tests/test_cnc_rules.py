from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DOMAIN_PATH = ROOT / "web" / "cnc-domain.json"
SNAPSHOT_PATH = ROOT / "tests" / "snapshots" / "cnc-findings.json"


class RuleEvaluationError(ValueError):
    pass


def load_domain() -> dict[str, Any]:
    return json.loads(DOMAIN_PATH.read_text(encoding="utf-8"))


def find_feature(domain: dict[str, Any], feature_id: str) -> dict[str, Any]:
    return next(
        feature
        for feature in domain["design"]["features"]
        if feature["featureId"] == feature_id
    )


def require_measurement(feature: dict[str, Any], key: str) -> float:
    value = feature.get("dimensions", {}).get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise RuleEvaluationError(f"MISSING_MEASUREMENT: {key}")
    return value


def evaluate_rule(domain: dict[str, Any], rule: dict[str, Any]) -> dict[str, Any] | None:
    if domain["design"].get("units") != "millimeters":
        raise RuleEvaluationError("UNSUPPORTED_UNITS")

    feature = find_feature(domain, rule["featureId"])
    calculation = rule["calculation"]

    if calculation["kind"] == "minimum":
        observed = require_measurement(feature, calculation["measurementKey"])
        violated = observed < calculation["threshold"]
        measurements = {calculation["measurementKey"]: observed}
        threshold = {
            "operator": "minimum",
            "value": calculation["threshold"],
            "unit": calculation["unit"],
        }
        explanation = (
            f"{observed:g} {calculation['unit']} < "
            f"{calculation['threshold']:g} {calculation['unit']}"
        )
    elif calculation["kind"] == "maximum_ratio":
        numerator = require_measurement(feature, calculation["numeratorKey"])
        denominator = require_measurement(feature, calculation["denominatorKey"])
        if denominator <= 0:
            raise RuleEvaluationError("INVALID_MEASUREMENT")
        ratio = numerator / denominator
        violated = ratio > calculation["threshold"]
        measurements = {
            calculation["numeratorKey"]: numerator,
            calculation["denominatorKey"]: denominator,
            "calculatedRatio": ratio,
        }
        threshold = {
            "operator": "maximum",
            "value": calculation["threshold"],
            "unit": calculation["unit"],
        }
        explanation = (
            f"{numerator:g} / {denominator:g} = {ratio:g} > "
            f"{calculation['threshold']:g}"
        )
    else:
        raise RuleEvaluationError("UNKNOWN_CALCULATION")

    if not violated:
        return None

    design = domain["design"]
    return {
        "findingId": (
            f"finding-{design['designId']}-{design['revisionId']}-{rule['ruleId']}"
        ),
        "ruleId": rule["ruleId"],
        "severity": rule["severity"],
        "featureId": rule["featureId"],
        "observedMeasurements": measurements,
        "threshold": threshold,
        "calculation": explanation,
        "evidenceReferences": rule["evidenceReferences"],
    }


def boundary_and_pass(domain: dict[str, Any], rule: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    boundary = copy.deepcopy(domain)
    passing = copy.deepcopy(domain)
    boundary_feature = find_feature(boundary, rule["featureId"])
    passing_feature = find_feature(passing, rule["featureId"])
    calculation = rule["calculation"]

    if calculation["kind"] == "minimum":
        key = calculation["measurementKey"]
        boundary_feature["dimensions"][key] = calculation["threshold"]
        passing_feature["dimensions"][key] = calculation["threshold"] + 0.1
    else:
        numerator_key = calculation["numeratorKey"]
        denominator_key = calculation["denominatorKey"]
        denominator = boundary_feature["dimensions"][denominator_key]
        boundary_feature["dimensions"][numerator_key] = calculation["threshold"] * denominator
        passing_feature["dimensions"][numerator_key] = (calculation["threshold"] - 0.5) * denominator

    return boundary, passing


class CncRuleTests(unittest.TestCase):
    def test_rule_specs_cover_five_stable_features(self) -> None:
        domain = load_domain()
        self.assertEqual(len(domain["rules"]), 5)
        self.assertEqual(len(domain["design"]["features"]), 5)
        self.assertEqual(
            {rule["featureId"] for rule in domain["rules"]},
            {feature["featureId"] for feature in domain["design"]["features"]},
        )

    def test_every_rule_has_failing_boundary_and_passing_cases(self) -> None:
        domain = load_domain()
        for rule in domain["rules"]:
            with self.subTest(rule=rule["ruleId"], case="failing"):
                self.assertIsNotNone(evaluate_rule(domain, rule))

            boundary, passing = boundary_and_pass(domain, rule)
            with self.subTest(rule=rule["ruleId"], case="boundary"):
                self.assertIsNone(evaluate_rule(boundary, rule))
            with self.subTest(rule=rule["ruleId"], case="passing"):
                self.assertIsNone(evaluate_rule(passing, rule))

    def test_every_rule_rejects_missing_measurements_and_wrong_units(self) -> None:
        domain = load_domain()
        for rule in domain["rules"]:
            missing = copy.deepcopy(domain)
            feature = find_feature(missing, rule["featureId"])
            calculation = rule["calculation"]
            key = calculation.get("measurementKey", calculation.get("numeratorKey"))
            feature["dimensions"].pop(key)
            with self.subTest(rule=rule["ruleId"], case="missing"):
                with self.assertRaisesRegex(RuleEvaluationError, "MISSING_MEASUREMENT"):
                    evaluate_rule(missing, rule)

            wrong_units = copy.deepcopy(domain)
            wrong_units["design"]["units"] = "inches"
            with self.subTest(rule=rule["ruleId"], case="units"):
                with self.assertRaisesRegex(RuleEvaluationError, "UNSUPPORTED_UNITS"):
                    evaluate_rule(wrong_units, rule)

    def test_every_rule_is_repeatable(self) -> None:
        domain = load_domain()
        for rule in domain["rules"]:
            with self.subTest(rule=rule["ruleId"]):
                first = evaluate_rule(copy.deepcopy(domain), rule)
                second = evaluate_rule(copy.deepcopy(domain), rule)
                self.assertEqual(first, second)

    def test_default_findings_match_the_reviewed_snapshot(self) -> None:
        domain = load_domain()
        actual = [evaluate_rule(domain, rule) for rule in domain["rules"]]
        expected = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
        self.assertEqual(actual, expected)

    def test_compact_agent_envelope_stays_within_output_budget(self) -> None:
        domain = load_domain()
        findings = [evaluate_rule(domain, rule) for rule in domain["rules"]]
        compact_findings = [
            {
                "findingId": finding["findingId"],
                "severity": finding["severity"],
                "featureId": finding["featureId"],
                "observed": finding["observedMeasurements"],
                "threshold": {
                    "operator": finding["threshold"]["operator"],
                    "value": finding["threshold"]["value"],
                },
                "evidenceRef": finding["evidenceReferences"][0],
            }
            for finding in findings
            if finding
        ]
        envelope = {
            "ok": True,
            "inspectionId": "inspection-BRKT-001-B-cnc-demo-1.0.0",
            "revisionPrecondition": "BRKT-001/B@1.0.0",
            "ruleSetVersion": "cnc-demo-1.0.0",
            "generatedAt": "2026-08-30T00:00:00.000Z",
            "counts": {"total": 5, "high": 2, "medium": 3},
            "findings": compact_findings,
        }
        serialized = json.dumps(envelope, separators=(",", ":"))
        self.assertLessEqual(len(serialized), 1500)

    def test_issue_detail_envelope_stays_within_output_budget(self) -> None:
        domain = load_domain()
        rule = domain["rules"][0]
        feature = find_feature(domain, rule["featureId"])
        finding = evaluate_rule(domain, rule)
        envelope = {
            "ok": True,
            "inspectionId": "inspection-BRKT-001-B-cnc-demo-1.0.0",
            "revisionPrecondition": "BRKT-001/B@1.0.0",
            "finding": {
                "findingId": finding["findingId"],
                "rule": f"{rule['ruleId']}@{rule['version']}",
                "title": rule["title"],
                "severity": finding["severity"],
                "featureId": finding["featureId"],
                "observedMeasurements": finding["observedMeasurements"],
                "threshold": finding["threshold"],
                "calculation": finding["calculation"],
                "consequence": rule["consequence"],
                "recommendation": rule["recommendation"],
                "confidence": "deterministic",
                "evidenceReferences": rule["evidenceReferences"],
                "highlightTarget": {
                    "objectReference": feature["objectReference"],
                    "highlightIds": feature["highlightIds"],
                },
            },
        }
        serialized = json.dumps(envelope, separators=(",", ":"))
        self.assertLessEqual(len(serialized), 1500)


if __name__ == "__main__":
    unittest.main()
