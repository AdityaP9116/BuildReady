from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProposalPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.domain = json.loads((ROOT / "web" / "cnc-domain.json").read_text(encoding="utf-8"))
        cls.policy = cls.domain["proposalPolicy"]

    def validate(self, radius: object) -> bool:
        return (
            isinstance(radius, (int, float))
            and not isinstance(radius, bool)
            and self.policy["minimumRadiusMm"] <= radius <= self.policy["maximumRadiusMm"]
        )

    def test_recommended_radius_is_inside_the_bounded_policy(self) -> None:
        self.assertTrue(self.validate(self.policy["recommendedRadiusMm"]))
        self.assertEqual(self.policy["approvalMode"], "visible-human-only")
        self.assertEqual(self.policy["geometryMode"], "non-destructive-session-preview")

    def test_policy_accepts_both_boundaries(self) -> None:
        self.assertTrue(self.validate(self.policy["minimumRadiusMm"]))
        self.assertTrue(self.validate(self.policy["maximumRadiusMm"]))

    def test_policy_rejects_invalid_and_out_of_range_values(self) -> None:
        for value in (None, True, "3.5", 3.499, 5.001):
            with self.subTest(value=value):
                self.assertFalse(self.validate(value))

    def test_runtime_contract_contains_stale_repeat_and_cancellation_guards(self) -> None:
        workflow = (ROOT / "web" / "workflow-rules.js").read_text(encoding="utf-8")
        state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        self.assertIn("STALE_REVISION", workflow)
        self.assertIn("PROPOSAL_ALREADY_PENDING", workflow)
        self.assertIn("VALUE_OUT_OF_RANGE", workflow)
        self.assertGreaterEqual(state.count("abortIfRequested(signal)"), 6)

    def test_only_human_ui_code_can_record_a_decision(self) -> None:
        webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")
        state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        self.assertNotIn("approve_proposal", webmcp)
        self.assertNotIn("reject_proposal", webmcp)
        self.assertIn("actor: 'human'", state)
        self.assertIn("revision B remains unchanged", state)


if __name__ == "__main__":
    unittest.main()
