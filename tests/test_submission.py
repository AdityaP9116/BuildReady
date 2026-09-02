from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SubmissionPacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.draft = (ROOT / "devpost-submission.md").read_text(encoding="utf-8")
        cls.submission_dir = ROOT / "docs" / "submission"

    def test_devpost_draft_has_every_required_section(self) -> None:
        for heading in (
            "# Title",
            "## One-line Summary",
            "## Problem",
            "## Solution",
            "## Why This Matters",
            "## How We Used AI",
            "## How We Used Codex",
            "## Key Features",
            "## Architecture",
            "## Testing Instructions",
            "## Public Demo Link",
            "## Public Repository Link",
            "## Demo Video",
            "## Screenshot Shot List",
            "## Submission Readiness Notes",
            "## Known Limitations",
            "## TODO Official Form Fields",
        ):
            self.assertIn(heading, self.draft)

    def test_public_repo_and_required_external_placeholders_are_honest(self) -> None:
        self.assertIn("https://github.com/AdityaP9116/BuildReady", self.draft)
        self.assertIn("TODO — required", self.draft)
        self.assertIn("public live URL", self.draft)
        self.assertIn("public YouTube", self.draft)
        self.assertNotIn("✅ Submitted to Devpost", self.draft)

    def test_supporting_packet_is_complete(self) -> None:
        required = {
            "DEMO_SCRIPT.md",
            "TESTING.md",
            "CHALLENGE_WORK.md",
            "ATTRIBUTION.md",
            "SUBMISSION_CHECKLIST.md",
        }
        self.assertEqual(required, {path.name for path in self.submission_dir.glob("*.md")})

    def test_demo_script_targets_the_official_time_limit(self) -> None:
        script = (self.submission_dir / "DEMO_SCRIPT.md").read_text(encoding="utf-8")
        self.assertIn("Target runtime: 165–175 seconds", script)
        self.assertIn("Official maximum: under 3 minutes", script)
        self.assertIn("## 2:42–2:55 — Close", script)

    def test_state_is_drafting_and_does_not_claim_completion(self) -> None:
        state_file = ROOT / ".devpost-hackathon-state.json"
        if not state_file.exists():
            self.skipTest("local-only submission state file is gitignored")
        state = json.loads(state_file.read_text(encoding="utf-8"))
        self.assertEqual(state["current_stage"], "prepare-submission")
        self.assertEqual(state["submission"]["status"], "drafting")
        self.assertEqual(state["submission"]["draft_file"], "devpost-submission.md")
        self.assertEqual(state["next_command"], "prepare-submission")
        self.assertNotIn("prepare-submission", state["completed_stages"])


if __name__ == "__main__":
    unittest.main()
