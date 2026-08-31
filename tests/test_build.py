from __future__ import annotations

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

        for route in ("/design", "/suppliers", "/review", "/about"):
            self.assertIn(f"'{route}'", javascript)

    def test_gate_two_webmcp_contracts_are_present(self) -> None:
        state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")

        self.assertIn("designId: 'BRKT-001'", state)
        self.assertIn("revisionId: 'B'", state)
        self.assertIn("get_active_design_context", webmcp)
        self.assertIn("inspect_cnc_manufacturability", webmcp)
        self.assertEqual(webmcp.count("readOnlyHint: true"), 2)
        self.assertEqual(webmcp.count("untrustedContentHint: false"), 2)
        self.assertIn("new AbortController()", webmcp)
        self.assertIn("modelContext.registerTool(tool, { signal: controller.signal })", webmcp)
        self.assertIn("registrationController?.abort()", webmcp)
        self.assertIn("modelContext.executeTool(registeredTool, input)", webmcp)
        self.assertNotIn("executeTool(registeredTool, JSON.stringify(input))", webmcp)

    def test_gate_two_calls_are_visible_in_the_page(self) -> None:
        javascript = (ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("Gate 2 diagnostics", javascript)
        self.assertIn("Visible call history", javascript)
        self.assertIn('data-tool="get_active_design_context"', javascript)
        self.assertIn('data-tool="inspect_cnc_manufacturability"', javascript)


if __name__ == "__main__":
    unittest.main()
