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

        self.assertIn("'modelContext' in document", javascript)


if __name__ == "__main__":
    unittest.main()
