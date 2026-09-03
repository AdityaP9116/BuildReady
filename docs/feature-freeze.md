# Gate 9 feature freeze

Feature scope is frozen after Gate 9. Gate 10 may correct defects, improve documentation, capture demo media, configure deployment, and prepare submission materials, but it must not add a new workflow stage, supplier, machining rule, approval path, external service, or package format.

## Frozen product path

1. Read BRKT-001 revision B and inspect five controlled CNC rules.
2. Focus visible measurements and preview a bounded 3.5–5.0 mm internal-radius correction.
3. Require the engineer to approve or reject from a visible human-only control.
4. Calculate two reproducible fictional supplier quotes for one supported quantity.
5. Generate one traceable review package and download it as JSON or Markdown.

## Frozen authority and safety boundaries

- No WebMCP tool can approve or reject a proposal, commit geometry, release production, contact a supplier, place an order, or submit the challenge entry.
- Supplier assumptions and DFM notes remain untrusted content.
- CNC thresholds, supplier offers, and review outputs remain controlled demonstration fixtures.
- Reset clears the complete derived workflow and returns to `/design`.

## Final visual states to capture

- Initial `/design`: onboarding path, two registered tools, uninspected parametric bracket.
- Inspected `/design`: five finding cards, synchronized model highlights, measurement evidence.
- Pending proposal: ghosted before/after geometry and visible human controls.
- `/suppliers`: AxisWorks and RapidMill, shared hash, differentiated price and schedule.
- `/review`: package identity, five findings, human decision, two quotes, download controls.
- `/about`: WebMCP lifecycle, trust boundary, and testing instructions.
- Narrow viewport: usable header/navigation, stacked onboarding, readable cards, no horizontal overflow.

## Gate 10 allowed work

- README and architecture clarification.
- Devpost draft, demo script, testing record, attribution, and challenge-work summary.
- Screenshot and video capture guidance.
- Deployment configuration and external verification when credentials or account access are available.
- Bug fixes found by final validation.

## Amendment 1 — optional live Onshape source (2026-08-31)

This amendment deliberately reopens one item the Gate 9 freeze closed. It is
recorded here rather than applied silently, because the submission's argument
rests on documented scope discipline.

**What changed.** The Gate 9 freeze forbade adding "an external service", and
the execution plan listed "No live Onshape connection" as an MVP exclusion.
Both were written to protect delivery time, not because the boundary was wrong.
With the core workflow feature-complete and tested, one optional external design
source is now in scope.

**What was added.**

- A read-only, allowlisted Onshape proxy holding credentials server-side
  (`functions/api/onshape/design.js`, mirrored locally in `scripts/serve.py`).
- Deterministic semantic discovery of arbitrary descriptive Part Studio variable
  names plus mapping onto the existing design contract
  (`web/onshape-discovery.js`, `web/onshape-adapter.js`).
- One WebMCP tool, `load_onshape_design`, registered only when the proxy is
  reachable and only before an inspection exists.
- A visible human control to load the live model or restore the fixture.

**What did not change.** The five deterministic rules, the thresholds, the
proposal policy, the human-only approval boundary, the supplier fixtures, and
the review package are all untouched. Onshape supplies measurements and
provenance; `cnc-rules.js` still decides what those measurements mean.

**Why the frozen scope is still protected.**

- The controlled fixture remains the default and the demonstrated judge path.
- A deployment with no Onshape credentials behaves exactly as it did at Gate 10:
  the control and the tool are never offered.
- Every Onshape failure falls back to the fixture with a visible explanation.
- No agent-callable path writes to Onshape. Write-back stays unimplemented, and
  its recorded policy permits a new branch workspace only, after human approval.

**Still frozen.** No new workflow stage, supplier, machining rule, approval
path, or package format.

## Amendment 2 — bounded SimScale FEA integration (2026-09-02)

The user explicitly approved a new simulation stage after the original freeze. The product path is now Inspect → Decide → Simulate → Compare → Package.

**Implemented and verified.** A force-only linear-static contract, deterministic study and result hashes, durable local SQLite records, seven-day private artifact retention, visible human-only CAD-sharing/compute approval, recorded asynchronous provider, five state-scoped FEA WebMCP tools, stale-revision propagation, supplier gating, and schema 1.2 JSON/Markdown review evidence.

**Still blocked from live mode.** The repository has a bounded read-only account probe, but no SimScale key or verified account/template evidence is configured. No STEP upload, project mutation, or paid run was attempted. `SIMULATION_PROVIDER=simscale` continues to fail closed until the manual and numerical checklist in `docs/simscale-setup.md` passes.

**Authority boundary.** The agent may prepare, read, monitor, and compare. Only the visible engineer controls can acknowledge CAD sharing and compute use. Recorded metrics remain `indeterminate` and cannot support an engineering disposition.

## Amendment 3 — grounded Model Insight assistant (2026-09-02)

The conversational surface is an interaction layer over the already-audited
workflow, not a new authority or engineering engine. It may route a bounded
question to an existing handler and summarize the resulting active-revision
evidence. It adds no machining thresholds, suppliers, approval path, CAD write,
purchase action, or production claim.

The amendment includes the embedded/standalone conversation UI, deterministic
intent routing, feature resolution, contextual follow-ups, per-revision session
history, evidence display, cancellation, and transcript exports. All responses
remain subordinate to the existing deterministic rules and visible human-only
decision boundary.
