from __future__ import annotations

import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from scripts.build import ROOT, build


class LandmarkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tags: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append(tag)
        self.ids.update(value for name, value in attrs if name == "id" and value)


class BuildTests(unittest.TestCase):
    def test_build_copies_the_static_application(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "dist"
            build(output=output)

            self.assertTrue((output / "index.html").is_file())
            self.assertTrue((output / "app.js").is_file())
            self.assertTrue((output / "state.js").is_file())
            self.assertTrue((output / "webmcp.js").is_file())
            self.assertTrue((output / "domain.js").is_file())
            self.assertTrue((output / "cnc-rules.js").is_file())
            self.assertTrue((output / "cnc-domain.json").is_file())
            self.assertTrue((output / "bracket-viewer.js").is_file())
            self.assertTrue((output / "onshape-extension.js").is_file())
            self.assertTrue((output / "onshape-discovery.js").is_file())
            self.assertTrue((output / "insight-engine.js").is_file())
            self.assertTrue((output / "insight-assistant.js").is_file())
            self.assertTrue((output / "buildready-onshape-icon.svg").is_file())
            self.assertTrue((output / "workflow-rules.js").is_file())
            self.assertTrue((output / "quote-engine.js").is_file())
            self.assertTrue((output / "supplier-fixtures.json").is_file())
            self.assertTrue((output / "review-package.js").is_file())
            self.assertTrue((output / "error-contract.js").is_file())
            self.assertTrue((output / "_headers").is_file())
            self.assertTrue((output / "styles.css").is_file())
            self.assertEqual((output / "_redirects").read_text().strip(), "/* /index.html 200")

    def test_index_contains_accessible_application_landmarks(self) -> None:
        parser = LandmarkParser()
        parser.feed((ROOT / "web" / "index.html").read_text(encoding="utf-8"))

        self.assertIn("header", parser.tags)
        self.assertIn("nav", parser.tags)
        self.assertIn("main", parser.tags)
        self.assertIn("app", parser.ids)
        self.assertIn("webmcp-status", parser.ids)

    def test_javascript_defines_every_planned_route(self) -> None:
        javascript = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

        for route in ("/design", "/simulation", "/suppliers", "/review", "/about", "/onshape-panel"):
            self.assertIn(f"'{route}'", javascript)

    def test_gate_five_webmcp_contracts_are_present(self) -> None:
        domain = (ROOT / "web" / "cnc-domain.json").read_text(encoding="utf-8")
        domain_data = json.loads(domain)
        rules = (ROOT / "web" / "cnc-rules.js").read_text(encoding="utf-8")
        webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")

        self.assertIn('"designId": "BRKT-001"', domain)
        self.assertIn('"revisionId": "B"', domain)
        self.assertIn('"ruleSetVersion": "cnc-dfm-1.1.0"', domain)
        self.assertEqual(len(domain_data["rules"]), 5)
        for evaluator in (
            "evaluateInternalCornerRadius",
            "evaluatePocketAspectRatio",
            "evaluateThinWall",
            "evaluateHoleDepthRatio",
            "evaluateExcessiveTolerance",
        ):
            self.assertIn(evaluator, rules)
        self.assertIn("get_active_design_context", webmcp)
        self.assertIn("inspect_cnc_manufacturability", webmcp)
        self.assertIn("get_issue_details", webmcp)
        self.assertIn("preview_radius_change", webmcp)
        self.assertIn("workflowState.inspectionStatus === 'complete'", webmcp)
        self.assertIn("enum: workflowState.findings.map", webmcp)
        self.assertIn("load_onshape_design", webmcp)
        self.assertIn("check_onshape_revision", webmcp)
        self.assertIn("activate_onshape_revision", webmcp)
        self.assertGreaterEqual(webmcp.count("readOnlyHint: true"), 5)
        self.assertGreaterEqual(webmcp.count("readOnlyHint: false"), 4)
        self.assertGreaterEqual(webmcp.count("untrustedContentHint: true"), 5)
        self.assertNotIn("name: 'approve", webmcp)
        self.assertNotIn("name: 'commit", webmcp)
        self.assertIn("new AbortController()", webmcp)
        self.assertIn("modelContext.registerTool(tool, { signal: controller.signal })", webmcp)
        self.assertIn("registrationController?.abort()", webmcp)
        self.assertIn("modelContext.executeTool(registeredTool, input)", webmcp)
        self.assertNotIn("executeTool(registeredTool, JSON.stringify(input))", webmcp)

    def test_gate_five_authority_controls_are_visible_and_human_only(self) -> None:
        javascript = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("Gate 6 diagnostics", javascript)
        self.assertIn("Visible call history", javascript)
        self.assertIn("Deterministic findings", javascript)
        self.assertIn('id="bracket-canvas" tabindex="0" role="img"', javascript)
        self.assertIn('class="measurement-panel" aria-live="polite"', javascript)
        self.assertIn('class="finding-card" data-finding-id=', javascript)
        self.assertIn('data-tool="get_active_design_context"', javascript)
        self.assertIn('data-tool="inspect_cnc_manufacturability"', javascript)
        self.assertIn('data-tool="get_issue_details"', javascript)
        self.assertIn('data-tool="preview_radius_change"', javascript)
        self.assertIn('id="approve-proposal"', javascript)
        self.assertIn('id="reject-proposal"', javascript)
        self.assertIn("recordHumanDecision('approved')", javascript)
        self.assertIn("recordHumanDecision('rejected')", javascript)

    def test_every_stable_feature_maps_to_interactive_meshes(self) -> None:
        viewer = (ROOT / "web" / "bracket-viewer.js").read_text(encoding="utf-8")
        for feature_id in (
            "inside-pocket-corner",
            "deep-pocket",
            "thin-wall",
            "deep-drilled-hole",
            "mounting-hole-tolerance",
        ):
            self.assertIn(f"'{feature_id}'", viewer)

        self.assertIn("FEATURE_MESH_MAP", viewer)
        self.assertIn("createParametricBracketScene", viewer)
        self.assertIn("pointInPolygon", viewer)
        self.assertIn("handlePointerMove", viewer)
        self.assertIn("handleKeyDown", viewer)
        self.assertIn("focusFeature", viewer)
        self.assertIn("prefers-reduced-motion", viewer)


if __name__ == "__main__":
    unittest.main()
