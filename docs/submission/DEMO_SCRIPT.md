# BuildReady demo script

Target runtime: 145–155 seconds. Official maximum: under 3 minutes. Record at 1080p with clear voice audio and the browser zoomed so the WebMCP tool surface and evidence cards remain legible.

## 0:00–0:18 — Problem

**Visual:** BuildReady initial design screen and four-stage onboarding.

**Narration:** “Manufacturing handoff is scattered across CAD review, DFM notes, supplier comparisons, and approval records. BuildReady explores a better open web: a shared engineering workspace where the page gives an agent precise tools, while the engineer keeps final authority.”

## 0:18–0:38 — WebMCP surface

**Visual:** Show the WebMCP indicator and the two initial tools; call `get_active_design_context`.

**Narration:** “The page starts with only two valid tools. The context call returns the exact bracket, revision, material, process, quantity, selected feature, and versioned fixture—no screenshot guessing.”

## 0:38–1:03 — Deterministic inspection

**Visual:** Run `inspect_cnc_manufacturability`, then `get_issue_details` for the corner finding. Show highlights and measurement panel.

**Narration:** “Five deterministic CNC rules find two high and three medium issues. Every finding carries measurements, thresholds, calculations, stable IDs, and evidence references. Selecting an issue focuses the same geometry and text the engineer sees.”

## 1:03–1:27 — Human authority

**Visual:** Run `preview_radius_change` at 3.5 mm. Pause on ghosted before/after geometry and pending controls; click **Approve preview**.

**Narration:** “The agent can prepare a bounded, non-destructive radius preview, but it cannot approve or commit it. The tool disappears while the proposal is pending. Only this visible human control records the decision, and revision B remains unchanged.”

## 1:27–1:50 — Supplier comparison

**Visual:** Run `prepare_quote_comparison` for 1000; show both supplier cards and shared hash.

**Narration:** “After the human decision, one quote tool appears. Two fictional suppliers produce reproducible but different tradeoffs: AxisWorks is lower cost, while RapidMill is faster. Assumptions and DFM notes are explicitly marked untrusted, and both quotes share one configuration hash.”

## 1:50–2:12 — Review package

**Visual:** Run `generate_review_package`; show summary, findings, quotes, and download buttons.

**Narration:** “When the evidence chain is complete, the supplier route exposes exactly one package tool. It validates the inspection, decision, and quotes, then creates the same traceable record shown here and downloadable as JSON or Markdown.”

## 2:12–2:34 — Implementation and safety

**Visual:** Open About page, then briefly show repository tool registration code and test output.

**Narration:** “BuildReady uses imperative `document.modelContext.registerTool` contracts with strict schemas, safety annotations, route cleanup, structured errors, and restrictive headers. The entire project is static, uv-run, npm-free, and covered by 43 deterministic tests.”

## 2:34–2:48 — Close

**Visual:** Return to Review, then click persistent Reset and show 0/4 complete.

**Narration:** “BuildReady shows what humans and agents can do together when the web exposes meaning, evidence, and boundaries—not just pixels. The agent accelerates the review; the engineer remains accountable.”

## Capture notes

- Keep the WebMCP tool panel visible during each call.
- Do not edit out the pending human-decision pause.
- Show the fictional-data disclaimer on the supplier screen.
- Avoid claims of production readiness or real supplier pricing.
- Record one clean take below 165 seconds to leave upload-processing margin.
