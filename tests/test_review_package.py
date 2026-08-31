from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ReviewPackageContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.review = (ROOT / "web" / "review-package.js").read_text(encoding="utf-8")
        cls.state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        cls.webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")
        cls.app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

    def test_completeness_validator_covers_every_prerequisite(self) -> None:
        for error_code in (
            "INSPECTION_REQUIRED",
            "STALE_INSPECTION",
            "DECISION_REQUIRED",
            "STALE_DECISION",
            "QUOTES_REQUIRED",
            "STALE_QUOTES",
        ):
            self.assertIn(error_code, self.review)

    def test_package_contains_traceability_and_safety_fields(self) -> None:
        for field in (
            "schemaVersion",
            "packageId",
            "disclaimer",
            "versions",
            "revisionPrecondition",
            "evidenceReferences",
            "supplierComparison",
            "configurationHash",
            "auditTrail",
        ):
            self.assertIn(field, self.review)
        self.assertIn("not production approval", self.review)

    def test_review_tool_is_conditional_and_compact(self) -> None:
        self.assertIn("name: 'generate_review_package'", self.webmcp)
        self.assertIn("route === '/suppliers'", self.webmcp)
        self.assertIn("workflowState.supplierQuotes.length === 2", self.webmcp)
        self.assertIn("!workflowState.reviewPackage", self.webmcp)
        self.assertIn("formats: ['json', 'markdown']", self.state)

        compact_example = {
            "ok": True,
            "packageId": "review-BRKT-001-B-fnv1a-12345678",
            "title": "BRKT-001-B Manufacturing Review",
            "revisionPrecondition": "BRKT-001/B@1.0.0",
            "configurationHash": "fnv1a-12345678",
            "findingCount": 5,
            "quoteCount": 2,
            "auditEventCount": 5,
            "formats": ["json", "markdown"],
            "nextAction": "Review the visible package and download JSON or Markdown from the Review page.",
        }
        self.assertLess(len(json.dumps(compact_example, separators=(",", ":"))), 1500)

    def test_visible_review_matches_exported_package(self) -> None:
        self.assertIn("serializeReviewPackageMarkdown", self.app)
        self.assertIn('data-download="json"', self.app)
        self.assertIn('data-download="markdown"', self.app)
        self.assertIn("workflowState.reviewPackage", self.app)
        self.assertIn("JSON.stringify(workflowState.reviewPackage, null, 2)", self.app)

    def test_reset_clears_the_complete_package_chain(self) -> None:
        reset_block = self.state.split("export function resetDemoState()", 1)[1].split("function audited", 1)[0]
        for assignment in (
            "workflowState.inspection = null",
            "workflowState.proposedChange = null",
            "workflowState.decisionRecord = null",
            "workflowState.supplierRequests = []",
            "workflowState.supplierQuotes = []",
            "workflowState.reviewPackage = null",
            "workflowState.auditEvents = []",
        ):
            self.assertIn(assignment, reset_block)


if __name__ == "__main__":
    unittest.main()
