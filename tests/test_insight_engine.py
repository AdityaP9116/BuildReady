from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def run_engine(expression: str, payload: Any) -> Any:
    program = f"""
import fs from 'node:fs'
import * as engine from './web/insight-engine.js'
const payload = JSON.parse(fs.readFileSync(0, 'utf8'))
const result = {expression}
process.stdout.write(JSON.stringify(result))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", program],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def snapshot() -> dict[str, Any]:
    finding = {
        "findingId": "finding-live-CNC-R001", "ruleId": "CNC-R001",
        "title": "Internal corner radius is too small", "severity": "high",
        "featureId": "inside-pocket-corner", "calculation": "1.2 mm < 3.5 mm",
        "consequence": "The selected cutter cannot produce the corner.",
        "recommendation": "Increase the radius to 3.5 mm.",
        "evidenceReferences": ["ruleset://cnc-dfm-1.1.0/CNC-R001"],
    }
    return {
        "design": {
            "designId": "ONSHAPE-203C35E2", "revisionId": "onshape-04bcfe7ec025",
            "name": "Complex Hydraulic Fixture", "material": {"label": "6061-T6 aluminum"},
            "process": {"label": "Three-axis CNC milling"}, "units": "millimeters",
            "features": [{"featureId": "inside-pocket-corner", "label": "Inside pocket corner",
                          "dimensions": {"insideRadiusMm": 1.2, "selectedCutterRadiusMm": 3}}],
        },
        "workflow": {
            "designSource": {"sourceId": "onshape-live"}, "inspectionStatus": "complete",
            "inspection": {"coverage": {"evaluatedRuleCount": 5, "availableRules": 5, "skippedRules": []}},
            "findings": [finding], "selectedFeatureId": "inside-pocket-corner",
            "selectedFindingId": finding["findingId"], "proposedChange": None,
            "decisionStatus": "not_requested", "supplierQuotes": [], "reviewPackage": None,
            "auditEvents": [],
        },
        "provenance": {
            "microversionId": "04bcfe7ec025e0936c20f58a", "measurementCount": 3,
            "inferredMeasurementCount": 2,
            "discovery": {
                "mappings": [
                    {"roleId": "cornerRadius", "variableName": "internal_relief_rad", "valueMm": 1.2, "confidence": "high"},
                    {"roleId": "cutterRadius", "variableName": "endmill_tool_rad", "valueMm": 3, "confidence": "high"},
                ],
                "unmapped": [{"name": "stock_length"}],
            },
        },
    }


class InsightIntentTests(unittest.TestCase):
    def test_routes_core_natural_language_questions(self) -> None:
        cases = {
            "Run a full manufacturability check": "inspect", "What is the highest-risk issue?": "risks",
            "Explain the thin wall specifically": "explain", "How were these variables inferred?": "variables",
            "Compare suppliers for quantity 1000": "suppliers", "Preview the radius at 4.2 mm": "preview",
            "Generate the review package": "package", "Load the live Onshape Part Studio": "live_source",
        }
        for query, expected in cases.items():
            with self.subTest(query=query):
                actual = run_engine("engine.classifyInsightQuery(payload)", query)
                self.assertEqual(actual["kind"], expected)

    def test_extracts_feature_quantity_and_preview_value(self) -> None:
        supplier = run_engine("engine.classifyInsightQuery(payload)", "Quote suppliers for quantity 2500")
        preview = run_engine("engine.classifyInsightQuery(payload)", "Preview corner radius 4.25 mm")
        self.assertEqual(supplier["quantity"], 2500)
        self.assertEqual(preview["featureId"], "inside-pocket-corner")
        self.assertEqual(preview["proposedRadiusMm"], 4.25)

    def test_authority_requests_are_refused_before_action_routing(self) -> None:
        for query in ("Approve the preview for me", "Write to Onshape", "Release this to production"):
            with self.subTest(query=query):
                self.assertEqual(run_engine("engine.classifyInsightQuery(payload)", query)["kind"], "authority_boundary")


class GroundedResponseTests(unittest.TestCase):
    def test_risk_answer_uses_finding_and_evidence(self) -> None:
        payload = {"intent": {"kind": "risks", "featureId": None}, "snapshot": snapshot()}
        answer = run_engine("engine.composeInsightResponse(payload.intent, payload.snapshot)", payload)
        self.assertIn("1 high", answer["text"])
        self.assertIn("1.2 mm < 3.5 mm", answer["text"])
        self.assertEqual(answer["citations"][0]["reference"], "ruleset://cnc-dfm-1.1.0/CNC-R001")

    def test_risk_summary_lists_every_current_finding(self) -> None:
        current = snapshot()
        for rule_id, feature_id, title, calculation, severity in (
            ("CNC-R003", "thin-wall", "Wall is too thin", "0.9 mm < 1.5 mm", "high"),
            ("CNC-R004", "deep-drilled-hole", "Hole is too deep", "34 / 5 = 6.8 > 4", "medium"),
            ("CNC-R005", "mounting-hole-tolerance", "Tolerance is too tight", "0.018 mm < 0.05 mm", "medium"),
        ):
            finding = dict(current["workflow"]["findings"][0])
            finding.update({
                "findingId": f"finding-live-{rule_id}", "ruleId": rule_id,
                "featureId": feature_id, "title": title,
                "calculation": calculation, "severity": severity,
            })
            current["workflow"]["findings"].append(finding)
        payload = {"intent": {"kind": "risks", "featureId": None}, "snapshot": current}
        answer = run_engine("engine.composeInsightResponse(payload.intent, payload.snapshot)", payload)
        self.assertIn("1. HIGH", answer["text"])
        self.assertIn("4. MEDIUM", answer["text"])
        self.assertIn("Wall is too thin", answer["text"])
        self.assertIn("Tolerance is too tight", answer["text"])
        self.assertEqual(4, len(answer["citations"]))

    def test_variable_answer_exposes_confidence_and_unused_inventory(self) -> None:
        payload = {"intent": {"kind": "variables", "featureId": None}, "snapshot": snapshot()}
        answer = run_engine("engine.composeInsightResponse(payload.intent, payload.snapshot)", payload)
        self.assertIn("#internal_relief_rad", answer["text"])
        self.assertIn("high match", answer["text"])
        self.assertIn("#stock_length", answer["text"])

    def test_authority_answer_never_claims_a_write_or_approval(self) -> None:
        payload = {"intent": {"kind": "authority_boundary", "featureId": None}, "snapshot": snapshot()}
        answer = run_engine("engine.composeInsightResponse(payload.intent, payload.snapshot)", payload)
        self.assertIn("cannot approve", answer["text"])
        self.assertIn("visible human action", answer["text"])

    def test_unsupported_supplier_quantity_is_explained_not_substituted(self) -> None:
        current = snapshot()
        current["workflow"]["decisionStatus"] = "approved"
        payload = {"intent": {"kind": "suppliers", "featureId": None, "quantity": 777}, "snapshot": current}
        answer = run_engine("engine.composeInsightResponse(payload.intent, payload.snapshot)", payload)
        self.assertIn("Quantity 777 is unsupported", answer["text"])
        self.assertIn("250, 500, 1000, or 2500", answer["text"])

    def test_transcript_export_has_revision_and_disclaimer(self) -> None:
        payload = {"messages": [{"role": "user", "text": "What is the risk?", "citations": []}], "snapshot": snapshot()}
        markdown = run_engine("engine.transcriptMarkdown(payload.messages, payload.snapshot)", payload)
        self.assertIn("ONSHAPE-203C35E2/onshape-04bcfe7ec025", markdown)
        self.assertIn("not production manufacturing approval", markdown)


class AssistantPipelineTests(unittest.TestCase):
    def test_old_unversioned_transcript_is_not_restored(self) -> None:
        source = (ROOT / "web" / "insight-assistant.js").read_text(encoding="utf-8")
        self.assertIn("TRANSCRIPT_SCHEMA_VERSION = '3'", source)
        self.assertIn("parsed?.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION", source)
        self.assertIn("messages: this.messages.slice(-MAX_MESSAGES)", source)

    def test_questions_drive_the_real_audited_state_machine(self) -> None:
        program = r"""
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
globalThis.fetch = async (input) => new Response(
  fs.readFileSync(fileURLToPath(input instanceof URL ? input : new URL(String(input)))),
  { status: 200, headers: { 'content-type': 'application/json' } },
)
globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
const values = new Map()
const sessionStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
}
globalThis.window = { dispatchEvent() {}, addEventListener() {}, setTimeout, sessionStorage }
const { createModelInsightAssistant } = await import('./web/insight-assistant.js')
const { selectFinding, workflowState } = await import('./web/state.js?v=20260903-3')
const assistant = createModelInsightAssistant(sessionStorage)
const risk = await assistant.ask('What is the highest-risk issue?')
selectFinding(workflowState.findings.find((finding) => finding.featureId === 'thin-wall').findingId)
const detail = await assistant.ask('Explain the selected finding.')
const selectedAfterDetail = workflowState.selectedFeatureId
const preview = await assistant.ask('Preview the recommended radius.')
const refused = await assistant.ask('Approve the preview and write it to Onshape.')
process.stdout.write(JSON.stringify({
  risk: risk.text,
  detail: detail.text,
  preview: preview.text,
  refused: refused.text,
  inspectionStatus: workflowState.inspectionStatus,
  findingCount: workflowState.findings.length,
  selectedAfterDetail,
  proposalStatus: workflowState.decisionStatus,
  decisionRecord: workflowState.decisionRecord,
  auditActions: workflowState.auditEvents.map((event) => event.toolName),
}))
"""
        result = subprocess.run(
            ["node", "--input-type=module"],
            cwd=ROOT,
            input=program,
            text=True,
            capture_output=True,
            check=True,
        )
        actual = json.loads(result.stdout)
        self.assertEqual(actual["inspectionStatus"], "complete")
        self.assertEqual(actual["findingCount"], 5)
        self.assertEqual(actual["selectedAfterDetail"], "thin-wall")
        self.assertEqual(actual["proposalStatus"], "pending")
        self.assertIsNone(actual["decisionRecord"])
        self.assertIn("inspect_cnc_manufacturability", actual["auditActions"])
        self.assertIn("get_issue_details", actual["auditActions"])
        self.assertIn("preview_radius_change", actual["auditActions"])
        self.assertIn("cannot approve", actual["refused"])


if __name__ == "__main__":
    unittest.main()
