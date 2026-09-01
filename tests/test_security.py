from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from scripts.serve import SECURITY_HEADERS


ROOT = Path(__file__).resolve().parents[1]


class SecurityAndEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.headers = (ROOT / "web" / "_headers").read_text(encoding="utf-8")
        cls.webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")
        cls.state = (ROOT / "web" / "state.js").read_text(encoding="utf-8")
        cls.error_contract = (ROOT / "web" / "error-contract.js").read_text(encoding="utf-8")
        cls.eval_data = json.loads(
            (ROOT / "tests" / "evals" / "webmcp-prompts.json").read_text(encoding="utf-8")
        )

    def test_deployment_and_local_server_share_security_headers(self) -> None:
        for name, value in SECURITY_HEADERS.items():
            self.assertIn(f"{name}: {value}", self.headers)
        self.assertIn("tools=(self)", SECURITY_HEADERS["Permissions-Policy"])
        self.assertIn("object-src 'none'", SECURITY_HEADERS["Content-Security-Policy"])
        self.assertIn("frame-ancestors 'none'", SECURITY_HEADERS["Content-Security-Policy"])

    def test_error_envelope_is_bounded_and_machine_readable(self) -> None:
        for field in ("ok: false", "code", "message", "retryable"):
            self.assertIn(field, self.error_contract)
        self.assertIn("slice(0, 300)", self.error_contract)
        self.assertIn("attachToolErrorContract(error)", self.state)

    def test_webmcp_surface_cleans_up_and_has_no_authority_tool(self) -> None:
        self.assertIn("registrationController?.abort()", self.webmcp)
        self.assertIn("beforeunload", self.webmcp)
        self.assertIn("buildready:toolavailabilitychange", self.webmcp)
        self.assertNotIn("name: 'approve", self.webmcp)
        self.assertNotIn("name: 'commit", self.webmcp)

    def test_browser_code_does_not_relax_origin_or_inject_scripts(self) -> None:
        browser_sources = "\n".join(
            path.read_text(encoding="utf-8") for path in (ROOT / "web").glob("*.js")
        )
        self.assertNotIn("document.domain", browser_sources)
        self.assertNotIn("eval(", browser_sources)
        self.assertNotIn("new Function(", browser_sources)
        self.assertNotIn("innerHTML = input", browser_sources)

    def test_onshape_document_text_is_never_written_as_markup(self) -> None:
        """External Onshape text is untrusted; it may only reach the DOM as text."""
        app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
        source_render = app[app.index("function renderDesignSource"):app.index("function bindDesignSourceControls")]
        self.assertIn("textContent", source_render)
        self.assertNotIn("innerHTML", source_render)

        webmcp = (ROOT / "web" / "webmcp.js").read_text(encoding="utf-8")
        onshape_tool = webmcp[webmcp.index("name: 'load_onshape_design'"):]
        self.assertIn("untrustedContentHint: true", onshape_tool.split("})")[0])

    def test_onshape_proxy_is_read_only_and_never_writes_to_cad(self) -> None:
        proxy = (ROOT / "functions" / "api" / "onshape" / "design.js").read_text(encoding="utf-8")
        self.assertNotIn("method: 'POST'", proxy)
        self.assertNotIn("method: 'DELETE'", proxy)
        browser_sources = "\n".join(
            path.read_text(encoding="utf-8") for path in (ROOT / "web").glob("*.js")
        )
        self.assertNotIn("cad.onshape.com", browser_sources)

    def test_eval_suite_covers_success_failure_authority_and_injection(self) -> None:
        cases = self.eval_data["cases"]
        self.assertGreaterEqual(len(cases), 12)
        case_ids = {case["id"] for case in cases}
        for required in (
            "context-exact",
            "inspect-all",
            "invalid-radius",
            "authority-boundary",
            "quote-too-early",
            "quote-unsupported",
            "supplier-injection",
            "review-complete",
            "title-injection",
        ):
            self.assertIn(required, case_ids)
        self.assertEqual(len(case_ids), len(cases))


class ModuleResolutionTests(unittest.TestCase):
    """Every constructor a browser module uses must be defined or imported in it.

    Regression guard: `state.js` once threw `WorkflowRuleError` without importing
    it, so all nine documented validation codes collapsed to `INTERNAL_ERROR`
    and leaked the internal ReferenceError message into the tool response.
    """

    BUILTINS = {
        "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
        "Map", "Set", "WeakMap", "WeakSet", "Date", "RegExp", "Promise",
        "AbortController", "AbortSignal", "DOMException", "CustomEvent", "Event",
        "URL", "URLSearchParams", "Blob", "File", "FormData", "Headers",
        "Request", "Response", "Array", "Object", "Function", "Proxy",
        "Int8Array", "Uint8Array", "Float32Array", "Float64Array", "TextEncoder",
        "TextDecoder", "Intl", "Number", "String", "Boolean", "Image",
        "ResizeObserver", "IntersectionObserver", "MutationObserver",
    }

    def test_every_constructed_class_resolves_in_its_module(self) -> None:
        web_root = ROOT / "web"
        for path in sorted(web_root.glob("*.js")):
            source = path.read_text(encoding="utf-8")
            constructed = set(re.findall(r"\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\(", source))
            for name in sorted(constructed - self.BUILTINS):
                declared = re.search(rf"\b(?:class|const|let|var|function)\s+{name}\b", source)
                imported = re.search(rf"import[^;]*\b{name}\b[^;]*from", source, re.S)
                with self.subTest(module=path.name, symbol=name):
                    self.assertTrue(
                        declared or imported,
                        f"{path.name} constructs {name} without defining or importing it",
                    )


if __name__ == "__main__":
    unittest.main()
