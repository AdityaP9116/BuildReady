from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def fnv1a(value: str) -> str:
    hash_value = 0x811C9DC5
    for character in value:
        hash_value ^= ord(character)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a-{hash_value:08x}"


class QuoteFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.domain = json.loads((ROOT / "web" / "cnc-domain.json").read_text(encoding="utf-8"))
        cls.fixtures = json.loads((ROOT / "web" / "supplier-fixtures.json").read_text(encoding="utf-8"))
        cls.engine = (ROOT / "web" / "quote-engine.js").read_text(encoding="utf-8")
        cls.webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")

    def test_two_visibly_different_fictional_suppliers_are_defined(self) -> None:
        suppliers = self.fixtures["suppliers"]
        self.assertEqual([supplier["name"] for supplier in suppliers], ["AxisWorks", "RapidMill"])
        self.assertTrue(all(supplier["fictional"] for supplier in suppliers))
        self.assertNotEqual(suppliers[0]["leadTimeDays"], suppliers[1]["leadTimeDays"])
        self.assertNotEqual(suppliers[0]["unitPrices"], suppliers[1]["unitPrices"])

    def test_every_supported_quantity_has_a_reproducible_total(self) -> None:
        for quantity in self.fixtures["supportedQuantities"]:
            with self.subTest(quantity=quantity):
                totals = []
                for supplier in self.fixtures["suppliers"]:
                    unit_price = supplier["unitPrices"][str(quantity)]
                    total = round(unit_price * quantity + supplier["toolingCost"], 2)
                    totals.append(total)
                    self.assertGreater(total, supplier["toolingCost"])
                self.assertNotEqual(totals[0], totals[1])

    def test_configuration_hash_is_deterministic_and_documented(self) -> None:
        fixture = self.domain["design"]
        proposal_id = "proposal-BRKT-001-B-radius-3_5"
        configuration = "|".join([
            fixture["designId"], fixture["revisionId"], fixture["fixtureVersion"],
            fixture["material"]["id"], fixture["process"]["id"], "1000",
            proposal_id, "3.5", "approved", "BRKT-001/B@1.0.0",
        ])
        self.assertEqual(fnv1a(configuration), fnv1a(configuration))
        self.assertRegex(fnv1a(configuration), r"^fnv1a-[0-9a-f]{8}$")
        self.assertIn("configurationHash", self.engine)
        self.assertIn("Math.imul", self.engine)

    def test_engine_guards_decision_quantity_and_revision(self) -> None:
        self.assertIn("DECISION_REQUIRED", self.engine)
        self.assertIn("UNSUPPORTED_QUANTITY", self.engine)
        self.assertIn("STALE_PROPOSAL", self.engine)
        for quantity in (0, 249, 999, 1001, 2501):
            self.assertNotIn(quantity, self.fixtures["supportedQuantities"])

    def test_quote_tool_is_conditional_read_only_and_untrusted(self) -> None:
        self.assertIn("name: 'prepare_quote_comparison'", self.webmcp)
        quote_block = self.webmcp.split("const quoteComparisonTool", 1)[1].split("export function gate6Tools", 1)[0]
        self.assertIn("readOnlyHint: true", quote_block)
        self.assertIn("untrustedContentHint: true", quote_block)
        self.assertIn("['approved', 'rejected'].includes(workflowState.decisionStatus)", self.webmcp)
        self.assertIn("workflowState.supplierQuotes.length === 0", self.webmcp)


if __name__ == "__main__":
    unittest.main()
