from __future__ import annotations

import unittest
from pathlib import Path

from scripts.mock_onshape import UPDATED_VARIABLES


ROOT = Path(__file__).resolve().parents[1]


class ActiveDesignSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        cls.app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        cls.viewer = (ROOT / "web" / "bracket-viewer.js").read_text(encoding="utf-8")
        cls.webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")

    def test_one_snapshot_owns_design_source_and_revision(self) -> None:
        self.assertIn("activeDesignSnapshot: createDesignSnapshot", self.state)
        self.assertIn("snapshotKey: revisionPrecondition(design)", self.state)
        self.assertNotIn("let activeDesignSource", self.state)
        self.assertNotIn("designContext: DESIGN_FIXTURE", self.state)

    def test_source_replacement_is_one_observable_transition(self) -> None:
        start = self.state.index("export function replaceActiveDesignSnapshot")
        end = self.state.index("export const setActiveDesign", start)
        replacement = self.state[start:end]
        self.assertEqual(1, replacement.count("emitStateChange("))
        self.assertIn("clearDerivedState()", replacement)
        self.assertIn("previousSnapshotKey", replacement)
        self.assertIn("snapshotKey: nextSnapshot.snapshotKey", replacement)

    def test_older_onshape_response_cannot_replace_a_newer_request(self) -> None:
        self.assertIn("let onshapeLoadSequence = 0", self.state)
        self.assertIn("requestSequence !== onshapeLoadSequence", self.state)
        self.assertIn("STALE_SOURCE_LOAD", self.state)

    def test_visible_workspace_reads_the_active_design(self) -> None:
        self.assertNotIn("DESIGN_FIXTURE.features", self.app)
        self.assertIn("activeDesign().features.find", self.app)
        self.assertIn("function synchronizeDesignWorkspace()", self.app)
        self.assertIn("bracketViewer.setDesign(activeDesign())", self.app)
        self.assertIn("activeDesign().quantity", self.app)

    def test_viewer_can_replace_its_design_and_geometry(self) -> None:
        self.assertIn("setDesign(fixture)", self.viewer)
        self.assertIn("createParametricBracketScene(fixture)", self.viewer)
        self.assertIn("revision ${this.fixture.revisionId}", self.viewer)

    def test_browser_regression_variant_differs_from_the_fixture(self) -> None:
        self.assertEqual("4 mm", UPDATED_VARIABLES["insideRadius"])
        self.assertEqual("2 mm", UPDATED_VARIABLES["wallThickness"])
        self.assertEqual("0.08 mm", UPDATED_VARIABLES["mountingTolerance"])

    def test_revision_check_is_non_destructive_until_activation(self) -> None:
        check = self.state.split("async function checkOnshapeRevision", 1)[1].split(
            "async function activateOnshapeRevision", 1
        )[0]
        self.assertIn("pendingDesignSnapshot", check)
        self.assertNotIn("replaceActiveDesignSnapshot(", check)
        activate = self.state.split("async function activateOnshapeRevision", 1)[1].split(
            "function audited", 1
        )[0]
        self.assertIn("DERIVED_EVIDENCE_EXISTS", activate)
        self.assertIn("expectedCurrentRevisionId", activate)
        self.assertIn("replaceActiveDesignSnapshot", activate)

    def test_webmcp_exposes_source_aware_revision_tools(self) -> None:
        self.assertIn("function designContextTool()", self.webmcp)
        self.assertIn("function inspectionTool()", self.webmcp)
        self.assertIn("name: 'check_onshape_revision'", self.webmcp)
        self.assertIn("name: 'activate_onshape_revision'", self.webmcp)
        self.assertIn("candidate ? [candidate.design.revisionId] : []", self.webmcp)


if __name__ == "__main__":
    unittest.main()
