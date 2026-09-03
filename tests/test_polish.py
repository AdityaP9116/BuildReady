from __future__ import annotations

import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.ids.update(value for name, value in attrs if name == "id" and value)


class ProductPolishTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")

    def test_persistent_header_has_progress_and_reset(self) -> None:
        parser = IdParser()
        parser.feed(self.index)
        self.assertIn("workflow-progress", parser.ids)
        self.assertIn("global-reset-button", parser.ids)
        self.assertIn("globalResetButton.addEventListener", self.app)
        self.assertIn("resetDemoState()", self.app)
        self.assertIn("window.history.pushState({}, '', '/design')", self.app)

    def test_onboarding_explains_the_complete_five_stage_path(self) -> None:
        for stage in (
            "onboarding-inspection",
            "onboarding-decision",
            "onboarding-simulation",
            "onboarding-quotes",
            "onboarding-package",
        ):
            self.assertIn(stage, self.app)
        self.assertIn("Guided challenge path", self.app)
        self.assertIn("completedStages.filter(Boolean)", self.app)

    def test_about_page_explains_protocol_and_trust_boundaries(self) -> None:
        for phrase in (
            "How WebMCP works here",
            "Conditional registration",
            "Cleanup by default",
            "Agent may",
            "Human only",
            "Untrusted data",
            "Testing the complete challenge path",
        ):
            self.assertIn(phrase, self.app)

    def test_narrow_layout_and_focus_styles_are_explicit(self) -> None:
        self.assertIn(":focus-visible", self.styles)
        self.assertIn("@media (max-width: 850px)", self.styles)
        self.assertIn("@media (max-width: 520px)", self.styles)
        self.assertIn(".onboarding-card", self.styles)
        self.assertIn(".onboarding-steps", self.styles)
        self.assertIn("min-width: 320px", self.styles)

    def test_feature_freeze_records_gate_ten_boundaries(self) -> None:
        freeze = (ROOT / "docs" / "feature-freeze.md").read_text(encoding="utf-8")
        self.assertIn("Feature scope is frozen", freeze)
        self.assertIn("Gate 10 allowed work", freeze)
        self.assertIn("Final visual states to capture", freeze)

    def test_model_insight_is_embedded_with_accessible_chat_controls(self) -> None:
        for marker in (
            "Ask BuildReady",
            "Check this model",
            "How dimensions were recognized",
            'id="insight-transcript" role="log"',
            'id="insight-input"',
            'id="insight-export-md"',
            'id="insight-export-json"',
            "bindModelInsightAssistant()",
            "renderModelInsightAssistant('embedded')",
        ):
            self.assertIn(marker, self.app)
        self.assertIn(".insight-assistant", self.styles)
        self.assertIn(".insight-message[data-role='user']", self.styles)
        self.assertIn("html.onshape-embedded-root", self.styles)


if __name__ == "__main__":
    unittest.main()
