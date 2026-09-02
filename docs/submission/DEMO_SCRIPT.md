# BuildReady demo script

Target runtime: 165–175 seconds. Official maximum: under 3 minutes. Record at 1080p with clear voice audio and the browser zoomed so the WebMCP tool surface and evidence cards remain legible.

## 0:00–0:15 — Problem

**Visual:** BuildReady initial design screen and five-stage onboarding.

**Narration:** “Manufacturing handoff is scattered across CAD review, DFM notes, supplier comparisons, and approval records. BuildReady explores a better open web: a shared engineering workspace where the page gives an agent precise tools, while the engineer keeps final authority.”

## 0:15–0:32 — WebMCP surface

**Visual:** Show the WebMCP indicator and the two initial tools; call `get_active_design_context`.

**Narration:** “The page starts with only two valid tools. The context call returns the exact bracket, revision, material, process, quantity, selected feature, and versioned fixture—no screenshot guessing.”

## 0:32–0:52 — Deterministic inspection

**Visual:** Run `inspect_cnc_manufacturability`, then `get_issue_details` for the corner finding. Show highlights and measurement panel.

**Narration:** “Five deterministic CNC rules find two high and three medium issues. Every finding carries measurements, thresholds, calculations, stable IDs, and evidence references. Selecting an issue focuses the same geometry and text the engineer sees.”

## 0:52–1:10 — Design authority

**Visual:** Run `preview_radius_change` at 3.5 mm. Pause on ghosted before/after geometry and pending controls; click **Approve preview**.

**Narration:** “The agent can prepare a bounded, non-destructive radius preview, but it cannot approve or commit it. The tool disappears while the proposal is pending. Only this visible human control records the decision, and revision B remains unchanged.”

## 1:10–1:40 — Bounded simulation

**Visual:** Open Simulation; run `prepare_static_stress_study`; show the frozen hash and two consent checkboxes. Check both and click **Approve and run**. Refresh status, then show the completed recorded evidence.

**Narration:** “The agent can validate and freeze a force-only study, but CAD sharing and compute approval are human-only and absent from WebMCP. The durable recorded provider exercises the asynchronous job path. Its metrics are clearly not live or numerically verified, so requirement comparison returns unknown—not a misleading pass.”

## 1:40–2:00 — Supplier comparison

**Visual:** Run `prepare_quote_comparison` for 1000; show both supplier cards and shared hash.

**Narration:** “Only after current simulation evidence exists does the quote tool appear. Two fictional suppliers produce reproducible tradeoffs: AxisWorks is lower cost, while RapidMill is faster. Both quotes share one configuration hash and are bound to the simulation result hash.”

## 2:00–2:22 — Review package

**Visual:** Run `generate_review_package`; show summary, findings, quotes, and download buttons.

**Narration:** “The package tool validates the inspection, decisions, current simulation, and quotes. Schema 1.2 carries the exact study and result hashes, inputs, metrics, verification state, limitations, supplier evidence, and audit trail into both JSON and Markdown.”

## 2:22–2:42 — Implementation and safety

**Visual:** Open About page, then briefly show repository tool registration code and test output.

**Narration:** “BuildReady uses imperative `document.modelContext.registerTool` contracts with strict schemas, safety annotations, route cleanup, structured errors, and restrictive headers. It is uv-run, npm-free, and covered by more than one hundred deterministic tests.”

## 2:42–2:55 — Close

**Visual:** Return to Review, then click persistent Reset and show 0/5 complete.

**Narration:** “BuildReady shows what humans and agents can do together when the web exposes meaning, evidence, and boundaries—not just pixels. The agent accelerates the review; the engineer remains accountable.”

## Capture notes

- Keep the WebMCP tool panel visible during each call.
- Do not edit out the pending human-decision pause.
- Show the recorded/not-verified-live limitation and the fictional-data disclaimer.
- Avoid claims of production readiness or real supplier pricing.
- Record one clean take below 165 seconds to leave upload-processing margin.
