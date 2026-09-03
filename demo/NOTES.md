# BuildReady demo video — what this is

`buildready-demo.mp4` — 1920×1080, 30 fps, 2:15, no audio, one unbroken take of the real app
running at `http://127.0.0.1:4173` (uv-served `web/`, controlled BRKT-001-B fixture).

Nothing on screen is mocked: every number, finding, quote, and package ID is
produced by the shipped engines. The run follows `docs/submission/DEMO_SCRIPT.md`.

## Beats

1. Title card, design workspace, problem framing
2. Agent-ready WebMCP surface — registered tool count and route scope
3. `get_active_design_context`
4. `inspect_cnc_manufacturability` — 2 high / 3 medium findings
5. Finding selection focusing the same geometry + measurement panel
6. `get_issue_details`
7. `preview_radius_change` (3.5 mm) — tool count drops 4 → 3 while pending
8. Human-only **Approve preview**
9. Model Insight answering a grounded question with evidence references
10. `prepare_quote_comparison` → AxisWorks $12,080 / 18 d vs RapidMill $13,200 / 11 d, shared hash
11. `generate_review_package` → 4/4 complete, JSON + Markdown downloads
12. Closing card

## Two things added for the capture only (not product changes)

- **WebMCP shim.** Stock Chrome does not ship `document.modelContext` yet, so the
  recording injects a faithful minimal implementation (`registerTool` /
  `getTools` / `executeTool`) so the header reads *Available · N tools* instead of
  *Compatibility mode · 0 tools*. Tool definitions, gating, and handlers are the
  app's own.
- **Overlay chrome.** Lower-third captions, a synthetic cursor, and the title
  cards are injected DOM. The app's CSP was bypassed in the recording browser to
  allow them; the shipped CSP is untouched.

## Known nits worth a look before publishing

- The console still shows internal wording: **"Gate 6 diagnostics"** eyebrow, and
  the empty states say "Gate 6" / "Gate 7". Reads as internal jargon on a public
  channel.
- There is no voiceover. Captions carry the narration, so either publish as-is
  with music, or record voice over `docs/submission/DEMO_SCRIPT.md`, which the
  pacing already matches.
