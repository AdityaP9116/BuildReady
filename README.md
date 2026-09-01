# BuildReady

BuildReady is a WebMCP-powered manufacturing-readiness workspace for a controlled CNC bracket demonstration. It is designed to show how an engineer and an agent can inspect deterministic manufacturing evidence, preview a bounded correction, compare supplier options, and produce a traceable review package while the engineer retains final authority.

## Project status

Gate 10 completes the local submission-readiness package. The feature-frozen application now has an official-form-aligned Devpost draft, sub-three-minute demo script, testing record, challenge-work history, attribution disclosure, and final external-action checklist. The public deployment, YouTube upload, participant-specific form answers, and final Devpost action remain deliberately unclaimed until verified.

## Planned challenge workflow

1. Read the active bracket, revision, material, process, quantity, and selected feature.
2. Run five deterministic CNC manufacturability checks.
3. Highlight measured findings on the visible design.
4. Preview a bounded internal-radius correction.
5. Require an explicit human decision in the interface.
6. Compare two controlled supplier fixtures.
7. Generate an auditable manufacturing-readiness package.

## Toolchain

BuildReady intentionally uses a small, npm-free toolchain. The browser application is plain HTML, CSS, and JavaScript, while Python's standard library handles local serving, validation, tests, and deterministic build output. [`uv`](https://docs.astral.sh/uv/) is the only project runner and environment manager; the project has no PyPI or npm dependencies.

## Architecture

```text
cnc-domain.json + supplier-fixtures.json
                  │
          deterministic engines
        CNC rules · quotes · package
                  │
      audited in-memory workflow state
                  │
     route/state-scoped WebMCP tools
                  │
 canvas evidence · decisions · quotes · exports
```

| Layer | Responsibility |
| --- | --- |
| Controlled fixtures | Freeze BRKT-001-B, five CNC rules, the proposal policy, and two fictional suppliers. |
| Pure engines | Calculate stable findings, configuration hashes, quote totals, completeness, and Markdown serialization. |
| Workflow state | Enforce revision preconditions, record human/tool audit actors, and clear all derived records on reset. |
| WebMCP surface | Register strict tools only on the route and at the state where they are valid; abort obsolete registrations. |
| Visible application | Keep the canvas, measurement evidence, proposal, supplier cards, progress, and package synchronized. |
| uv/Python tooling | Serve SPA fallbacks with security headers, validate sources, run tests, and build `dist/` without packages. |

## Local development

Prerequisites:

- `uv` 0.12 or later
- Python 3.11 or later (the project pins 3.11 to reuse the existing local runtime)

Synchronize and run:

```bash
uv sync --locked
uv run python scripts/serve.py
```

Open `http://127.0.0.1:4173`. The development server provides SPA fallbacks, so `/design`, `/suppliers`, `/review`, and `/about` can all be loaded directly.

Quality checks:

```bash
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
```

## Gate 10 WebMCP tools

| Tool | Availability | Behavior |
| --- | --- | --- |
| `get_active_design_context` | `/design` | Returns the controlled BRKT-001 revision B context, material, process, quantity, selected feature, preview state, inspection state, and rule-set version. |
| `inspect_cnc_manufacturability` | `/design` | Evaluates internal corner radius, pocket aspect ratio, thin-wall thickness, drilled-hole depth ratio, and mounting-hole tolerance against versioned demonstration thresholds. Returns five stable findings for the default fixture. |
| `get_issue_details` | `/design`, after inspection | Returns one finding's deterministic measurements, threshold, calculation, consequence, recommendation, evidence references, and 3D highlight target. Selecting it focuses the same feature in the canvas and text panel. |
| `preview_radius_change` | `/design`, after the corner finding and before a proposal exists | Prepares a 3.5–5.0 mm inside-radius preview with before/after geometry and a pending human decision. It cannot approve, reject, or commit the proposal. |
| `prepare_quote_comparison` | `/design`, after a visible human decision and before quotes exist | Calculates two normalized fictional supplier quotes for a supported quantity. Supplier assumptions and DFM notes are marked as untrusted content. |
| `generate_review_package` | `/suppliers`, after two quotes and before a package exists | Validates completeness and creates a traceable evidence package. Its compact tool response points to the full visible Review page and JSON/Markdown downloads. |
| `load_onshape_design` | `/design`, only when an Onshape proxy is reachable and before an inspection exists | Reads live variable measurements from the connected Onshape Part Studio and makes them the active design. Discards derived state because the geometry changed. Optional; absent on deployments without Onshape credentials. |

The tools use the imperative `document.modelContext.registerTool` API. Registration is guarded for unsupported browsers, scoped to `/design`, and connected to an `AbortController` so route changes unregister the tools. Handlers receive and respect the execution `AbortSignal`.

To test manually in a WebMCP-capable browser:

1. Open `/design` and confirm the diagnostic panel initially reports two registered tools.
2. Inspect the page tools in Chrome DevTools or the Model Context Tool Inspector.
3. Execute `get_active_design_context` with `{}`.
4. Execute `inspect_cnc_manufacturability` with `{ "severity": "all" }`.
5. Confirm five issue rows and model highlights appear, and that `get_issue_details` becomes the third registered tool.
6. Call `get_issue_details` with a current finding ID and confirm the model, measurement panel, selected text row, and audit entry focus together.
7. Call `preview_radius_change` with the corner finding and a radius between 3.5 and 5.0 mm.
8. Confirm the tool disappears while the proposal is pending and that no approval or commit tool exists.
9. Use the visible Approve preview or Reject control and confirm the audit actor is human.
10. Confirm `prepare_quote_comparison` appears, call it with `{ "quantity": 1000 }`, and verify the app opens `/suppliers` with two visibly different quotes.
11. Confirm only `generate_review_package` is exposed on `/suppliers`, generate the package, and verify the app opens `/review` with five findings and two quotes.
12. Download JSON and Markdown and confirm both carry the same package ID and configuration hash shown on the page.

Standard browsers can execute the same handlers through the diagnostic panel's manual controls.

### Parametric evidence viewer

`web/bracket-viewer.js` is a small browser-native 3D renderer with no npm dependency. It builds cuboid and ring meshes from numeric parameters, projects them into an isometric canvas scene, depth-sorts polygon faces, and performs feature hit testing. The stable feature-to-mesh map is exported for contract verification.

The canvas supports pointer hover and selection, animated feature focus, arrow-key feature navigation, Home/Escape camera reset, reduced-motion preferences, and a text measurement alternative. Finding rows are keyboard-accessible buttons, and severity is communicated through labels as well as color.

### Human authority boundary

The proposal policy lives in `web/cnc-domain.json` and is enforced by pure validation in `web/workflow-rules.js`. The preview is constrained to the current corner finding, the active revision precondition, and a 3.5–5.0 mm range. Repeated pending proposals, stale inspections, invalid values, and cancelled execution fail before workflow state changes.

Approval is intentionally absent from the WebMCP surface. The visible UI records an `approved` or `rejected` decision with actor `human`; the original BRKT-001-B fixture remains authoritative. Resetting the demo invalidates and clears the inspection, proposal, decision, and related audit state.

### Controlled supplier comparison

`web/supplier-fixtures.json` defines two explicitly fictional suppliers and four supported quantities. `web/quote-engine.js` validates the human decision and revision preconditions, computes normalized totals, and produces the same FNV-1a configuration hash for identical inputs. AxisWorks models the lower-cost option while RapidMill models the faster option; the UI preserves each supplier's assumptions and residual DFM notes instead of choosing a winner.

### Traceable review package

`web/review-package.js` enforces the complete workflow preconditions before serializing evidence. It rejects missing or stale inspections, decisions, and quote sets; normalizes an optional title; and snapshots the visible workflow into schema version `1.0.0`. The WebMCP response stays compact while the Review page renders the full package and exports it without a second calculation.

### Security and evaluation

`web/error-contract.js` normalizes tool failures to `{ ok: false, error: { code, message, retryable } }` for the visible fallback console and attaches the same fields to thrown WebMCP errors. Messages are bounded, workflow errors use stable codes, stale-state failures say when retry is appropriate, and every input schema rejects unknown properties.

`web/_headers` and the local uv-served development response apply the same CSP, same-origin WebMCP permissions policy, referrer isolation, MIME sniffing protection, and opener isolation. The canonical prompt suite and its manual browser matrix are documented in `tests/evals/webmcp-prompts.json` and `docs/evaluation-plan.md`.

### Guided experience and feature freeze

The persistent header shows completed stages across every route and resets the entire derived workflow from anywhere. The initial design workspace explains Inspect → Decide → Compare → Package before presenting the evidence scene, and `/about` documents page-owned contracts, conditional registration, visible evidence, cleanup, and the separation between agent actions, human authority, and untrusted supplier data.

The frozen post–Gate 9 scope and required final screenshot states are recorded in `docs/feature-freeze.md`. Gate 10 is limited to defect fixes, documentation, submission materials, capture guidance, deployment configuration, and external verification.

### Submission packet

The official-form-aligned draft is in `devpost-submission.md`. Supporting artifacts live under `docs/submission/`: the timed demo script, golden-path and browser-matrix testing record, challenge-period work history, attribution disclosure, and final readiness checklist. These files are preparation artifacts only; no Devpost project, video, or final entry is claimed by this repository state.

### Optional live Onshape source

BuildReady can measure a real Onshape Part Studio instead of the controlled
fixture. This is additive: the fixture stays the default, and a deployment
without Onshape credentials behaves exactly as before.

**Why a proxy exists.** The Onshape REST API does not serve browser origins, and
[API keys](https://onshape-public.github.io/docs/auth/apikeys/) are Basic auth
credentials that must never reach a client. `functions/api/onshape/design.js` is
a Cloudflare Pages Function holding those credentials. It is not a pass-through:
no caller-supplied path, document, or query reaches Onshape. It resolves exactly
one configured Part Studio, reads its feature list, extracts the named variables
BuildReady understands, and returns a small sanitized payload. `scripts/serve.py`
mirrors the same endpoint locally so `uv` remains the only toolchain.

**Onshape supplies parameters, not pixels.** The Part Studio drives its geometry
from named variables (`insideRadius`, `pocketDepth`, `wallThickness`, and so on).
`web/onshape-adapter.js` maps those variables onto the design contract the rule
engine already consumes, so `cnc-rules.js` is completely untouched: live CAD
measurements flow through the same five deterministic rules and produce findings
identical in form to fixture findings. `tests/test_onshape_adapter.py` asserts
exactly that, and asserts that correcting the radius in Onshape clears the corner
finding — proving the engine reacts to real model state rather than a canned
answer. Only literal length expressions are accepted; arithmetic and
variable references are rejected rather than guessed at.

**Trust boundary.** Onshape document text is external content: the tool carries
`untrustedContentHint`, the proxy bounds every string, and the UI renders
document names with `textContent` only. `connect-src 'self'` is unchanged
because the proxy is same-origin. The Onshape microversion becomes the revision
precondition, so an inspection taken before a model edit is detectably stale.
No agent-callable path writes to Onshape; the recorded write-back policy permits
a new branch workspace only, after a visible human approval, and is not yet
implemented.

**Robustness.** Bad credentials and deleted elements fail fast; rate limits and
transient 5xx are retried with exponential backoff honouring `Retry-After`; each
attempt has its own 8-second timeout; responses are size-capped; successful reads
are cached for 15 seconds and concurrent callers share one upstream read, so a
chatty agent cannot exhaust the Onshape quota. Every failure leaves the app on
the controlled fixture with a visible explanation.
`tests/test_onshape_proxy.py` exercises each of these against an in-process mock.

**Trying it.** `docs/onshape-setup.md` covers all three paths. In short:

```bash
# No Onshape account needed — full pipeline against a recorded response
uv run python scripts/mock_onshape.py           # add --fail <mode> to test degradation

# With your own account: see what BuildReady can read from your CAD
uv run python scripts/onshape_probe.py documents
uv run python scripts/onshape_probe.py inspect <onshape-url>
```

Configure with the variables in `.env.example` (Cloudflare secrets in production).

### Controlled rule set

The machine-readable fixture and rule definitions live in `web/cnc-domain.json`. Rule set `cnc-demo-1.0.0` intentionally freezes challenge-specific assumptions so identical fixture input produces identical findings. These thresholds are demonstration data, not production machining guidance.

The default BRKT-001-B fixture produces two high- and three medium-severity findings. Each finding includes its rule/version, feature ID, observed measurements, threshold, calculation, consequence, recommendation, deterministic confidence, evidence references, and future 3D highlight IDs. The tool response is a compact envelope kept below 1,500 serialized characters; the complete finding records remain in visible page state.

## Deployment

The production target remains Cloudflare Pages. Connect the GitHub repository to Pages, leave the build command empty, and set the output directory to `web`. The tracked `web/_redirects` file preserves direct loading for client-side routes such as `/design`, `/suppliers`, and `/review`.

The optional Onshape proxy lives in `functions/` at the repository root, outside the `web` output directory, so Pages serves it as a Function rather than a static asset. It activates only when the `ONSHAPE_*` secrets from `.env.example` are set in the Pages project; without them the endpoint returns `ONSHAPE_NOT_CONFIGURED` and the application stays on the controlled fixture.

For a locally verified artifact, run `uv run python scripts/build.py`; the command recreates `dist/` from the deployable `web/` source without installing another toolchain.

## Browser compatibility

The application remains usable in a standard browser. WebMCP capabilities are detected at runtime behind a guarded compatibility boundary, and manual controls call the same audited handlers when `document.modelContext` is unavailable.

Challenge testing will target:

- ChatGPT's in-app browser
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled

## Safety boundary

BuildReady uses controlled fixtures and versioned demonstration rules. It does not approve production designs, submit real supplier data, place orders, or make compliance claims. The agent can prepare a proposal; only a visible human control can approve or reject it.

## Documentation

The product research, architecture, integration plan, and decision lineage are maintained in the project's Notion workspace. This repository will contain implementation-specific architecture, testing, and submission documentation as the build progresses.

## License

Licensed under the [MIT License](LICENSE).
