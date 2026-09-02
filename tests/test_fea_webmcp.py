from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FeaWebMcpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        cls.state = (ROOT / "web" / "fea-state.js").read_text(encoding="utf-8")
        cls.webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")
        cls.client = (ROOT / "web" / "fea-client.js").read_text(encoding="utf-8")
        cls.server = (ROOT / "scripts" / "serve.py").read_text(encoding="utf-8")
        cls.review = (ROOT / "web" / "review-package.js").read_text(encoding="utf-8")
        cls.fixture = (ROOT / "web" / "fea-recorded-result.json").read_text(encoding="utf-8")

    def test_simulation_route_and_five_stage_progress_are_visible(self) -> None:
        self.assertIn('href="/simulation" data-route', self.index)
        self.assertIn("'/simulation': renderSimulation", self.app)
        self.assertIn('id="onboarding-simulation"', self.app)
        self.assertIn("/5 complete", self.app)

    def test_agent_surface_contains_only_safe_fea_actions(self) -> None:
        for tool_name in (
            "prepare_static_stress_study",
            "get_static_stress_study",
            "get_simulation_status",
            "get_simulation_results",
            "compare_simulation_to_requirements",
        ):
            self.assertIn(f"'{tool_name}'", self.webmcp)

        self.assertNotIn("name: 'approve_and_submit_static_stress_study'", self.webmcp)
        self.assertIn("if (route === '/simulation') return simulationTools()", self.webmcp)
        self.assertIn("feaState.study?.approval", self.webmcp)
        self.assertIn("feaState.study?.lifecycleState === 'COMPLETE'", self.webmcp)
        self.assertIn("untrustedContentHint: true", self.webmcp)

    def test_visible_human_approval_is_separate_from_webmcp(self) -> None:
        self.assertIn('id="fea-cad-consent"', self.app)
        self.assertIn('id="fea-compute-consent"', self.app)
        self.assertIn('id="fea-approve-run"', self.app)
        self.assertIn("approveAndSubmitHuman", self.app)
        self.assertIn("appendAuditEvent('human'", self.state)
        self.assertNotIn("approve_and_submit_static_stress_study:", self.state)

    def test_provider_content_is_rendered_as_text_not_html(self) -> None:
        self.assertIn("const modeDetail = document.querySelector('#fea-mode-detail')", self.app)
        self.assertIn("modeDetail.textContent = capabilities.note", self.app)
        for target in (
            "#fea-study-id",
            "#fea-study-hash",
            "#fea-result-provider",
            "#fea-result-limitations",
        ):
            self.assertIn(f"document.querySelector('{target}').textContent", self.app)
        self.assertNotIn("feaState.result.innerHTML", self.app)

    def test_recorded_result_cannot_create_an_engineering_disposition(self) -> None:
        self.assertIn('"live": false', self.fixture)
        self.assertIn('"status": "not-verified-live"', self.fixture)
        self.assertIn('"outcome": "indeterminate"', self.fixture)
        self.assertIn("usable = result.solver.live === true", self.state)
        self.assertIn("{ minimumSafetyFactor: 'unknown', maximumDisplacement: 'unknown' }", self.state)

    def test_revision_change_marks_local_fea_evidence_stale(self) -> None:
        self.assertIn("window.addEventListener('buildready:statechange'", self.state)
        self.assertIn("currentness: 'STALE'", self.state)
        self.assertIn("currentness: 'stale'", self.state)
        self.assertIn("active-snapshot-changed", self.state)
        self.assertIn("postActiveFeaSnapshot(snapshotKey)", self.state)
        self.assertIn("'/api/fea/current-snapshot'", self.client)
        self.assertIn("FEA_CURRENT_SNAPSHOT_ENDPOINT", self.server)

    def test_simulation_evidence_propagates_into_quotes_and_review_exports(self) -> None:
        self.assertIn("setSimulationEvidence", self.state)
        self.assertIn("simulationStudyHash", (ROOT / "web" / "state.js").read_text(encoding="utf-8"))
        self.assertIn("simulationResultHash", self.review)
        self.assertIn("simulationEvidence.result.resultHash", self.review)
        self.assertIn("## Simulation evidence", self.review)
        self.assertIn('id="review-simulation-provider"', self.app)


if __name__ == "__main__":
    unittest.main()
