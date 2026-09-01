from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ActiveDesignSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")

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


if __name__ == "__main__":
    unittest.main()
