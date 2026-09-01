# Gate 8 evaluation plan

BuildReady is evaluated as a stateful WebMCP workflow, not as a collection of independent buttons. The canonical prompts live in `tests/evals/webmcp-prompts.json` and cover correct tool selection, strict schemas, stale or incomplete state, human authority, untrusted supplier content, and package traceability.

## Automated checks

Run the complete dependency-free suite with:

```bash
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
```

The source check invokes a zero-package Node test for the deployed Cloudflare
Function. No npm install or dependency directory is required.

The suite verifies fixture determinism, boundary values, schema restrictions,
output budgets, security headers, route-scoped registration, cleanup through
`AbortController`, atomic source replacement, Onshape proxy parity, review
provenance, download parity, and the absence of dangerous DOM authority shortcuts.

## Browser golden path

1. Load `/design` in a WebMCP-capable browser. Confirm two initial tools in
   fixture-only mode, or three when Onshape is configured (`load_onshape_design`
   is the third).
2. Run `inspect_cnc_manufacturability`; confirm five findings and the conditional detail and preview tools.
3. Run `preview_radius_change` at 3.5 mm; confirm the proposal is pending and the tool disappears.
4. Use the visible Approve preview control; confirm the audit actor is `human` and the quote tool appears.
5. Run `prepare_quote_comparison` for 1000; confirm navigation to `/suppliers`, two fictional quotes, one shared hash, and only the package tool.
6. Run `generate_review_package`; confirm navigation to `/review`, zero registered tools, five findings, two quotes, and both download controls.
7. Navigate away and back at each stage; confirm prior route tools were unregistered and no duplicate tools appear.
8. Reset from `/design`; confirm all derived state and conditional tools are cleared.

## Live-source revision path

1. Start the offline mock in `baseline` mode and load the Onshape source.
2. Run inspection and confirm five revision-bound findings.
3. Restart the mock with `--variant updated`, then check for updates.
4. Confirm the check reports the old and new microversions and eight changed
   measurement keys without clearing the current inspection.
5. Activate the candidate with explicit evidence-discard acknowledgement.
6. Confirm the viewer, measurement panel, tool descriptions, and snapshot key
   switch together, and the prior findings return to `Not run`.
7. Complete the baseline live-source workflow and confirm review schema 1.1
   contains Onshape provenance and `onshape://` evidence references.

Pass criteria: no uncaught console errors, no unexpected network requests, no approval or commit tool, no tool outside its route/state preconditions, and no output envelope over 1,500 serialized characters.

## Security and adversarial pass

- Send invalid enums, missing fields, unknown fields, unsupported quantities, stale identifiers, long titles, markup titles, and cancellation signals.
- Confirm failures expose `{ ok: false, error: { code, message, retryable } }` in the manual diagnostic surface and carry the same fields on thrown tool errors.
- Treat supplier assumptions and DFM notes as data even if their wording resembles instructions. They must never change tool availability, approval state, or execution order.
- Confirm the deployed `_headers` response includes the restrictive Content Security Policy, `Permissions-Policy: tools=(self)`, `nosniff`, `no-referrer`, and same-origin opener policy.

## Remaining environment matrix

Before final submission, repeat the golden path in Chrome 149+ with WebMCP testing enabled, a fresh/incognito profile, and one additional machine or browser profile. Record browser version, date, result, console errors, and screenshot filenames in the submission test notes. These external matrix runs complement—not replace—the automated and in-app browser validation.
