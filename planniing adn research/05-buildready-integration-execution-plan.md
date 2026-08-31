# BuildReady — WebMCP Challenge Integration & Execution Plan

> Exported from [the canonical Notion page](https://app.notion.com/p/3ccf393aa76881ed935cf3b03f5b6681) on 2026-08-30. This repository copy is a point-in-time snapshot.

> **Plan status:** Proposed for review — no application code has been written.
> **Deadline:** September 3, 2026 at 1:00 PM Pacific / 3:00 PM Central.
> **Recommended scope:** One polished, judge-safe WebMCP workflow that can be completed in under two minutes without accounts, paid services, or hidden setup.
> **Project source of truth:** The WebMCP project notes in Notion are the authoritative source for the product thesis, opportunity selection, architecture, safety model, MVP definition, and expansion roadmap. This execution plan operationalizes those notes; it does not replace them. If the project direction changes, update the underlying research or architecture note and then revise this plan to preserve decision lineage.
# Research grounding and decision lineage
## Primary Notion notes
<table fit-page-width="true" header-row="true">
<tr>
<td>Notion source</td>
<td>What it establishes</td>
<td>How this plan uses it</td>
</tr>
<tr>
<td>[WebMCP & Autonomous Agents — Project Hub](https://app.notion.com/p/3cbf393aa76881f18e5ac14ed6e6f8af)</td>
<td>Project thesis, goals, opportunity focus, working principles, and research navigation</td>
<td>Keeps WebMCP central, prioritizes authenticated browser context, explicit authorization, reversibility, auditability, and least privilege</td>
</tr>
<tr>
<td>[Notion source](https://app.notion.com/p/3cbf393aa76881abaf86d7bf00b7417b)</td>
<td>Protocol map, WebMCP status, browser-agent limitations, security threats, evaluation practices, and market opportunity</td>
<td>Shapes the browser-native tool architecture, deterministic testing, prompt-injection controls, concise schemas, and eval strategy</td>
</tr>
<tr>
<td>[Notion source](https://app.notion.com/p/3cbf393aa7688154a390e55e235b29ba)</td>
<td>Physical-engineering opportunity ranking, RFQ/DFM wedge, change/release platform direction, demonstration story, tools, and safety requirements</td>
<td>Provides the BuildReady concept: one selected bracket, DFM evidence, bounded correction, supplier comparison, and human-approved review package</td>
</tr>
<tr>
<td>[Notion source](https://app.notion.com/p/3ccf393aa76881f3a37bc9afe2949502)</td>
<td>System responsibilities, browser-to-agent boundary, data/state model, approval classes, reliability, observability, integration priorities, and frozen hackathon MVP</td>
<td>Provides the six-tool MVP surface, deterministic rule authority, stale-revision checks, audit requirements, deployment evolution, and post-MVP integrations</td>
</tr>
</table>
## Decision precedence
1. **Product and research decisions:** the four Notion notes above.
2. **Challenge compliance:** live official Devpost rules and organizer announcements.
3. **Implementation detail:** this plan, revised only when it preserves the product thesis and submission constraints.
4. **Code behavior:** tests and deployed evidence must match the approved plan.
## Scope interpretation
The Notion architecture describes the full NVIDIA/Azure engineering-agent platform and separately freezes a smaller hackathon MVP. This plan follows that documented MVP boundary: WebMCP, deterministic DFM, visible human approval, controlled suppliers, and an evidence package are required now. NVIDIA NIM, NeMo, Azure, Onshape, simulation, durable storage, and real supplier integrations remain documented expansion paths and are deferred only to protect challenge execution—not removed from the project vision.
# 1. Executive decision
Build **BuildReady**, a browser-based manufacturing-readiness workspace for one CNC-machined bracket. An engineer and an agent inspect the active design, run five deterministic manufacturability checks, highlight evidence on the 3D model, preview a bounded corner-radius correction, require an explicit human decision, compare two controlled supplier options, and generate an auditable review package. This is the recommended combined concept and hackathon slice developed in [Notion source](https://app.notion.com/p/3cbf393aa7688154a390e55e235b29ba) and formalized in [Notion source](https://app.notion.com/p/3ccf393aa76881f3a37bc9afe2949502).
The project should be judged as a complete product rather than an infrastructure demonstration. WebMCP is the primary integration layer. The browser page exposes concise, typed tools bound to visible application state; ChatGPT supplies the agent; deterministic code supplies engineering measurements; the human supplies authorization. These boundaries follow the project thesis and working principles in [WebMCP & Autonomous Agents — Project Hub](https://app.notion.com/p/3cbf393aa76881f18e5ac14ed6e6f8af) and the security/evaluation findings in [Notion source](https://app.notion.com/p/3cbf393aa76881abaf86d7bf00b7417b).
## Recommended MVP stack
<table fit-page-width="true" header-row="true">
<tr>
<td>Concern</td>
<td>Decision for the challenge</td>
<td>Reason</td>
</tr>
<tr>
<td>Frontend</td>
<td>React, TypeScript, Vite</td>
<td>Fast setup, typed state, straightforward static deployment</td>
</tr>
<tr>
<td>3D visualization</td>
<td>Three.js through React Three Fiber</td>
<td>Clear visual before/after state and feature highlighting</td>
</tr>
<tr>
<td>Application state</td>
<td>Zustand or a small typed reducer</td>
<td>One authoritative in-browser workflow state</td>
</tr>
<tr>
<td>WebMCP</td>
<td>Imperative document.modelContext.registerTool API</td>
<td>Required challenge capability and direct binding to live UI state</td>
</tr>
<tr>
<td>Engineering analysis</td>
<td>Pure deterministic TypeScript rules</td>
<td>No network dependency; identical inputs always produce identical findings</td>
</tr>
<tr>
<td>Persistence</td>
<td>Session state plus downloadable JSON/Markdown review package</td>
<td>A database is unnecessary for the judge path</td>
</tr>
<tr>
<td>Hosting</td>
<td>Cloudflare Pages/Workers or Vercel</td>
<td>Fast public HTTPS deployment and simple rollback</td>
</tr>
<tr>
<td>Testing</td>
<td>Vitest, Testing Library, Playwright, WebMCP inspector, ChatGPT browser</td>
<td>Covers deterministic logic, UI effects, tool contracts, and real agent behavior</td>
</tr>
</table>
## Explicit MVP exclusions
- No required login.
- No live Onshape or Autodesk connection.
- No real supplier upload, quote, purchase, or ordering.
- No NVIDIA NIM or NeMo dependency in the critical judge path.
- No Azure, Kubernetes, GPU, database, queue, PLM, ERP, or simulation dependency.
- No generative geometry and no autonomous design commit.
- No compliance or production-safety claim.
- No multi-part library and no manufacturing processes beyond CNC milling.
These remain valid post-challenge extensions. They should not be allowed to delay the core WebMCP experience.
# 2. Product promise and judge story
## Target user
The initial user is a mechanical or manufacturing engineer preparing a CNC component for quoting. The pain is repeated, fragmented work: inspecting manufacturability, explaining issues, adjusting a design, comparing suppliers, and assembling review evidence.
## User promise
“Select a component and let your agent prepare a traceable manufacturing-readiness review while you retain control of every consequential design decision.”
## Ninety-second judge journey
1. Open the public BuildReady URL; the sample bracket and revision BRKT-001-B load automatically.
2. Ask ChatGPT: “Inspect this design and prepare it for CNC manufacturing.”
3. ChatGPT discovers the current WebMCP tools and reads the active part, material, revision, selected feature, and process.
4. ChatGPT invokes the deterministic manufacturability inspection.
5. The application highlights five issues and displays their measurements, thresholds, severity, and rule versions.
6. ChatGPT requests details for the internal-corner-radius issue.
7. ChatGPT prepares a bounded radius correction; the page shows before/after geometry, measurements, expected cost effect, and a pending-decision state.
8. The engineer clicks **Approve preview** or **Reject** in the application. The agent cannot approve on the engineer’s behalf.
9. ChatGPT prepares a supplier comparison; the app shows two controlled quotes with different prices, lead times, and DFM notes.
10. ChatGPT generates a review package with design context, findings, proposal, human decision, quotes, provenance, and timestamp.
11. The judge sees the finished package and audit timeline.
## Wow moment
The 3D model, issue list, and agent-accessible state change together: the agent explains a real measured manufacturing defect, proposes a visible correction, pauses for the engineer, and then completes the quote/review workflow after the engineer acts.
# 3. Judging strategy
<table fit-page-width="true" header-row="true">
<tr>
<td>Criterion</td>
<td>How BuildReady earns the score</td>
<td>Evidence judges should see</td>
</tr>
<tr>
<td>WebMCP Leverage</td>
<td>Six focused tools, state-aware registration, structured schemas, visible UI effects, cancellation, annotations, and real agent testing</td>
<td>ChatGPT discovers and calls tools; repository exposes genuine registerTool code</td>
</tr>
<tr>
<td>Execution</td>
<td>One coherent flow from design context to approved review package</td>
<td>Public URL, no setup, complete happy path, graceful errors</td>
</tr>
<tr>
<td>Potential Impact</td>
<td>Prevents expensive quoting iterations and catches DFM problems before supplier handoff</td>
<td>Five measurable findings, normalized quotes, reduced manual handoffs</td>
</tr>
<tr>
<td>Creativity and Ambition</td>
<td>Physical-engineering collaboration with a visible authority boundary</td>
<td>3D evidence, human approval, traceable agent workflow</td>
</tr>
</table>
# 4. Experience architecture
## Routes and visible workspaces
- **/design** — 3D bracket, feature selection, revision/material/process summary, issue panel, change-preview controls.
- **/suppliers** — two controlled supplier cards, normalized comparison, assumptions, lead time, price breaks, and DFM notes.
- **/review** — final package, approval evidence, provenance, audit timeline, and download action.
- **/about** — concise WebMCP explanation, testing instructions, safety boundary, and repository link.
Keep all routes on one origin. This avoids cross-origin permission complexity during the challenge while still demonstrating a multi-workspace workflow. Tool registration changes with route and state.
## Layout
- Left: interactive 3D viewport with selected/highlighted feature.
- Right: task panel showing context, findings, proposal, decision, and quote summary.
- Bottom or side rail: audit timeline of human and agent actions.
- Persistent header: part name, revision, process, material, WebMCP status, reset-demo action.
- Small “Agent-ready” indicator: tool count, current route, and last completed tool call.
## Accessibility and fallback
- Every 3D issue must also appear in a text list with feature ID and measurements.
- Keyboard navigation must reach issue rows, approval controls, tabs, and downloads.
- Color cannot be the only severity signal.
- If WebMCP is unavailable, the human can still click **Run inspection**, **Preview correction**, and **Generate package** to understand the product.
- The app must show a clear compatibility notice without crashing when document.modelContext is absent.
# 5. Domain model
## Design fixture
- Design ID: BRKT-001.
- Revision: B.
- Name: CNC Mounting Bracket.
- Material: 6061-T6 aluminum.
- Process: three-axis CNC milling.
- Quantity: 1,000.
- Units: millimeters.
- Geometry: a simplified parametric bracket with stable feature identifiers.
## Feature records
Each feature contains:
- featureId
- featureType
- label
- dimensions
- selected state
- 3D object reference
- applicable rule IDs
- issue highlight geometry
- revision provenance
Required features:
- Inside pocket corner.
- Deep pocket.
- Thin wall.
- Deep drilled hole.
- Tightly toleranced mounting hole.
## Workflow state
- activeRoute
- designContext
- selectedFeatureId
- inspectionStatus
- findings
- selectedFindingId
- proposedChange
- decisionStatus
- decisionRecord
- supplierRequests
- supplierQuotes
- reviewPackage
- auditEvents
- lastToolCall
- errorState
Use one store as the source of truth for both visible UI and WebMCP handlers. A tool must never maintain a second hidden version of design or workflow state.
## Version and stale-state rules
Every analysis, proposal, quote request, and review package carries:
- designId
- revisionId
- fixtureVersion
- ruleSetVersion
- proposalId where applicable
- decisionId where applicable
- generatedAt
If revision or fixture version changes after analysis, dependent findings, proposals, quotes, and packages become stale. State-changing handlers reject stale preconditions with a structured recovery message.
# 6. Deterministic CNC rule engine
The model does not invent measurements. A pure function receives the design fixture and returns typed findings.
## Rule 1 — Internal corner radius
- Input: inside radius and selected cutter radius.
- Violation: the inside radius does not provide sufficient cutter clearance.
- Fixture: 1.0 mm inside radius with a 3.0 mm cutter radius.
- Recommendation: preview an increase to 3.5 mm.
- Severity: high.
- Visual: highlight all pocket corners.
## Rule 2 — Pocket aspect ratio
- Input: pocket depth and minimum pocket width.
- Violation: depth-to-width ratio exceeds the configured machinability threshold.
- Fixture: ratio above the rule threshold.
- Recommendation: reduce depth, increase width, or use a staged/specialized tool.
- Severity: medium.
## Rule 3 — Thin wall
- Input: minimum wall thickness and material/process threshold.
- Violation: wall thickness is below the configured aluminum CNC threshold.
- Recommendation: thicken the wall or document a specialized workholding strategy.
- Severity: high.
## Rule 4 — Hole depth-to-diameter ratio
- Input: hole depth and diameter.
- Violation: ratio exceeds the standard drilling threshold.
- Recommendation: use a larger diameter, reduce depth, or specify a deep-hole process.
- Severity: medium.
## Rule 5 — Excessive tolerance
- Input: tolerance band and default process capability/cost threshold.
- Violation: tolerance is tighter than necessary for the feature’s stated fit.
- Recommendation: relax to the configured value, subject to engineering approval.
- Severity: medium.
## Finding contract
Each finding returns:
- findingId
- ruleId and ruleVersion
- title
- severity
- featureId
- observed measurements
- threshold
- calculation
- consequence
- recommendation
- confidence: deterministic
- evidence references
- affected 3D highlight IDs
## Rule tests
For every rule, implement:
- One failing fixture.
- One boundary fixture.
- One passing fixture.
- Units test.
- Missing-field/error test.
- Snapshot of the structured finding.
- Repeatability test proving identical input yields identical output.
# 7. WebMCP tool strategy
Use the imperative API. Register only tools relevant to the active route and workflow state. Use AbortController to unregister tools on route/state changes. Keep names under 30 characters, parameter descriptions under 150 characters, tool descriptions under 500 characters, and individual outputs under roughly 1,500 characters.
## Tool 1 — get_active_design_context
**Availability:** /design, always after fixture load.
**Purpose:** Return the exact design, revision, material, process, quantity, selected feature, unsaved-preview status, and rule-set version.
**Input:** Empty object.
**Output:** Compact structured context with IDs and human-readable labels.
**Annotations:** readOnlyHint true; untrustedContentHint false.
**UI effect:** Update last-tool indicator only.
**Errors:** DESIGN_NOT_READY.
## Tool 2 — inspect_cnc_manufacturability
**Availability:** /design, after fixture load.
**Purpose:** Run all five deterministic rules for the active revision and display findings.
**Input:** Optional severity filter with an enum.
**Output:** Inspection ID, revision precondition, counts by severity, and compact finding summaries.
**Annotations:** readOnlyHint true; untrustedContentHint false.
**UI effect:** Populate issue list, highlight affected geometry, focus the first high-severity issue.
**Errors:** DESIGN_NOT_READY, INSPECTION_FAILED, ABORTED.
## Tool 3 — get_issue_details
**Availability:** /design, after a completed inspection.
**Purpose:** Explain one finding using measurements, threshold, calculation, effect, and recommendation.
**Input:** findingId enum derived from current findings.
**Output:** Detailed deterministic evidence plus highlight target.
**Annotations:** readOnlyHint true; untrustedContentHint false.
**UI effect:** Select finding and animate/focus its 3D feature.
**Errors:** FINDING_NOT_FOUND, STALE_INSPECTION.
## Tool 4 — preview_radius_change
**Availability:** /design, only for the corner-radius finding and no existing pending proposal.
**Purpose:** Prepare and display a bounded non-destructive radius change.
**Input:** findingId and proposedRadiusMm within a narrow allowed range.
**Output:** proposalId, before/after values, affected features, expected rule resolution, approvalRequired true.
**Annotations:** readOnlyHint false; untrustedContentHint false.
**UI effect:** Render ghosted before/after geometry and open the approval card.
**Authority:** The tool cannot approve or commit. Only the visible human button records approve/reject.
**Errors:** VALUE_OUT_OF_RANGE, STALE_REVISION, PROPOSAL_ALREADY_PENDING.
## Tool 5 — prepare_quote_comparison
**Availability:** after an approved or explicitly rejected proposal.
**Purpose:** Produce two controlled, normalized supplier quotes for the reviewed configuration.
**Input:** quantity fixed or constrained to supported price-break values.
**Output:** quote IDs, suppliers, unit/total price, tooling, lead time, assumptions, DFM notes, and normalized recommendation factors.
**Annotations:** readOnlyHint true; untrustedContentHint true because supplier feedback is externally sourced in the product model.
**UI effect:** Navigate to or populate /suppliers and highlight comparison differences.
**Errors:** DECISION_REQUIRED, UNSUPPORTED_QUANTITY, STALE_PROPOSAL.
## Tool 6 — generate_review_package
**Availability:** after inspection, decision, and quote comparison.
**Purpose:** Compile the current evidence and render the final review package.
**Input:** Optional package title only.
**Output:** packageId, completeness status, finding count, decision summary, quote count, and download availability.
**Annotations:** readOnlyHint false; untrustedContentHint true.
**UI effect:** Populate /review and append a package-generation audit event.
**Errors:** INCOMPLETE_WORKFLOW, STALE_EVIDENCE.
## Human-only actions
- Approve preview.
- Reject preview.
- Reset the demo.
- Download the review package.
Do not expose an agent-callable approval tool in the MVP. This makes the human-agent collaboration boundary visible and unambiguous.
## Error envelope
Every tool error should return:
- ok: false
- code
- message
- retryable
- recoveryAction
- currentRevision
- expectedRevision when relevant
Never return stack traces or secrets. Tool handlers must validate all inputs in code even when the input schema is restrictive.
# 8. Tool registration lifecycle
1. Detect document.modelContext availability after application hydration.
2. Register the context and inspection tools when the sample design is ready.
3. Register issue-details only after findings exist.
4. Register preview only when the corner-radius finding is current and no proposal is pending.
5. Register quote comparison only after the human decision exists.
6. Register review-package generation only after quotes exist.
7. Abort registrations when their preconditions cease to hold or the route unmounts.
8. Confirm the UI store update completes before resolving a tool result.
9. Pass the execution AbortSignal to asynchronous work.
10. Log sanitized tool name, outcome, duration, and state transition in the visible audit timeline.
# 9. Supplier fixtures
Use fictional suppliers to avoid trademark and authorization problems.
## Supplier A — AxisWorks CNC
- Lower unit price at 1,000 units.
- Longer lead time.
- Flags the thin wall and asks for the radius correction.
- Includes a modest tooling charge.
- Quote expires after a stated fixture date.
## Supplier B — RapidMill Labs
- Higher unit price.
- Shorter lead time.
- Accepts the previewed radius but charges a premium for the tight tolerance.
- Offers stronger inspection documentation.
## Quote normalization
Both fixtures must map into the same fields:
- supplierId
- quoteId
- configurationHash
- quantity
- currency
- unitPrice
- toolingCost
- totalPrice
- leadTimeDays
- priceBreaks
- assumptions
- exclusions
- dfmNotes
- generatedAt
- fixtureVersion
The comparison explains trade-offs; it does not claim that either supplier is objectively best.
# 10. Approval and audit design
## Proposal state machine
DRAFT → PENDING_HUMAN_DECISION → APPROVED or REJECTED → INCLUDED_IN_REVIEW
No tool may jump directly from DRAFT to APPROVED. Approval and rejection handlers must be attached to visible controls and record:
- proposalId
- design/revision precondition
- before and after values
- decision
- decision timestamp
- actor: human
- rationale if supplied
## Audit events
Record:
- Page/fixture loaded.
- Tool registered or unregistered in development diagnostics.
- Tool invoked.
- Inspection completed.
- Finding focused.
- Proposal prepared.
- Human approved or rejected.
- Quotes prepared.
- Review package generated.
- Demo reset.
The public audit timeline should avoid technical noise; a development drawer may show registration details.
# 11. Review package
Render a polished in-app report and allow JSON plus Markdown download.
Required sections:
1. Design identity, revision, material, process, and quantity.
2. Inspection summary and rule-set version.
3. Five findings with observed values and thresholds.
4. Proposed radius correction and before/after state.
5. Human decision and timestamp.
6. Two normalized supplier quotes and assumptions.
7. Recommended next steps.
8. Provenance and fixture versions.
9. Audit timeline.
10. Safety disclaimer: educational manufacturing-readiness demonstration, not production approval.
# 12. Repository structure
- **src/app/** — routing, layout, compatibility boundary, global providers.
- **src/components/viewer/** — bracket scene, camera, feature meshes, highlights, before/after preview.
- **src/components/workflow/** — findings, proposal approval, suppliers, review, audit timeline.
- **src/domain/design/** — fixture types, bracket data, feature metadata, revision helpers.
- **src/domain/dfm/** — rule types, five rules, evaluator, thresholds, unit tests.
- **src/domain/quotes/** — fictional supplier fixtures and normalization.
- **src/domain/review/** — package builder and download serializers.
- **src/state/** — workflow store, selectors, state-machine transitions.
- **src/webmcp/** — type declarations, schemas, registration lifecycle, handlers, result/error envelopes.
- **src/test/** — common fixtures and browser mocks.
- **e2e/** — human fallback flow, WebMCP tool effects, approval boundary, reset flow.
- **public/** — permitted static assets only.
- **docs/** — architecture, testing instructions, screenshots, demo script, attribution.
- [**README.md**](http://README.md) — problem, WebMCP value, architecture, setup, testing, live URL, safety.
- **LICENSE** — permissive open-source license selected before publishing.
- **THIRD_PARTY_**[**NOTICES.md**](http://NOTICES.md) — dependencies and asset attribution.
- **.github/workflows/** — lint, type-check, unit test, build, optional Playwright smoke.
# 13. Build sequence and verification gates
## Gate 0 — Freeze decisions before coding
- [ ] Confirm BuildReady as the public name or choose the final name.
- [ ] Confirm React/TypeScript/Vite and React Three Fiber.
- [ ] Confirm one-origin routes and fictional suppliers.
- [ ] Confirm static-first deployment on Cloudflare or Vercel.
- [ ] Confirm NVIDIA/Azure/Onshape are stretch items, not dependencies.
- [ ] Choose MIT or Apache-2.0 license.
- [ ] Confirm the exact 90-second judge prompt and outcome.
**Exit test:** No unresolved decision can change the core architecture.
## Gate 1 — Repository and deployable shell
- [ ] Initialize Git and create the public repository.
- [ ] Scaffold the application and scripts.
- [ ] Add license, README skeleton, notices, formatting, linting, and tests.
- [ ] Add routes, header, responsive layout, loading/error boundaries, and reset action.
- [ ] Deploy the empty shell to a public HTTPS preview.
- [ ] Verify the URL while logged out and in a clean browser.
**Exit test:** A public URL and public licensed repository exist before feature work grows.
## Gate 2 — WebMCP proof first
- [ ] Add current WebMCP TypeScript declarations or the supported type package.
- [ ] Implement a guarded registration utility with cleanup and AbortSignal support.
- [ ] Register get_active_design_context against a minimal fixture.
- [ ] Register a temporary inspection stub.
- [ ] Inspect both tools in Chrome DevTools or the Model Context Tool Inspector.
- [ ] Invoke them manually with document.modelContext.executeTool.
- [ ] Invoke get_active_design_context from ChatGPT’s in-app browser.
- [ ] Confirm the visible page records the call.
**Exit test:** A real agent calls a real tool on the deployed URL. If this fails, stop all 3D polish and debug WebMCP immediately.
## Gate 3 — Domain truth
- [ ] Define design, feature, rule, finding, proposal, quote, review, and audit types.
- [ ] Create bracket revision B fixture with stable feature IDs.
- [ ] Implement the five pure CNC rules.
- [ ] Implement deterministic evaluator and structured finding envelope.
- [ ] Add passing, boundary, failing, unit, and missing-data tests for every rule.
- [ ] Replace the inspection stub with the evaluator.
- [ ] Confirm tool output stays concise and includes evidence references.
**Exit test:** All rules pass; identical fixtures produce identical findings; ChatGPT can summarize the five results without inventing measurements.
## Gate 4 — Visual evidence
- [ ] Build the simplified parametric bracket scene.
- [ ] Map each stable feature ID to one or more meshes.
- [ ] Implement selection, hover, camera focus, and issue highlighting.
- [ ] Connect inspect tool completion to the findings panel and model highlights.
- [ ] Connect get_issue_details to feature focus and measurement display.
- [ ] Add text and keyboard alternatives.
- [ ] Test narrow and desktop layouts.
**Exit test:** Every finding is legible in both 3D and text; tool completion visibly updates the page before returning.
## Gate 5 — Preview and human approval
- [ ] Implement bounded radius proposal validation.
- [ ] Render before/after geometry and measurements.
- [ ] Register preview_radius_change only in valid state.
- [ ] Add visible approve and reject controls.
- [ ] Record human decision and audit event.
- [ ] Invalidate stale proposals on revision/reset.
- [ ] Add tests proving the WebMCP tool cannot approve or commit.
- [ ] Test invalid values, repeated proposals, cancellation, and stale revision.
**Exit test:** ChatGPT can prepare the correction but cannot cross the human authority boundary.
## Gate 6 — Supplier comparison
- [ ] Create AxisWorks and RapidMill fixture data.
- [ ] Implement normalized quote calculation and configuration hash.
- [ ] Register prepare_quote_comparison after the human decision.
- [ ] Build supplier comparison UI with price, lead time, assumptions, and DFM notes.
- [ ] Mark supplier text as untrusted content in tool annotations.
- [ ] Test supported quantity, unsupported quantity, stale proposal, and missing-decision behavior.
**Exit test:** The agent produces a balanced comparison from two visibly different, reproducible quotes.
## Gate 7 — Review package
- [ ] Build the completeness validator.
- [ ] Build the review page and package serializer.
- [ ] Register generate_review_package only when prerequisites exist.
- [ ] Add JSON and Markdown downloads.
- [ ] Include versions, evidence, decision, quotes, audit, and disclaimer.
- [ ] Verify reset clears all derived state and restores the initial fixture.
**Exit test:** One tool call generates a complete package that matches the visible workflow state.
## Gate 8 — Reliability, security, and evals
- [ ] Add strict runtime input validation to every handler.
- [ ] Add clear retryable versus non-retryable errors.
- [ ] Add Content Security Policy and explicit Permissions-Policy for tools.
- [ ] Confirm origin isolation requirements and do not enable document.domain.
- [ ] Sanitize or constrain package titles and free text.
- [ ] Add output character-budget tests.
- [ ] Add unit tests for registration cleanup and conditional availability.
- [ ] Add Playwright tests for UI side effects and authority boundary.
- [ ] Create an eval set of direct, paraphrased, ambiguous, and adversarial prompts.
- [ ] Test tool choice, argument correctness, order, recovery, cancellation, and stale state.
- [ ] Test with ChatGPT’s in-app browser and Chrome 149+ with the WebMCP flag.
- [ ] Test the deployed URL from a clean/incognito session and another machine if possible.
**Exit test:** The golden prompt succeeds repeatedly; approval bypass and stale-state attempts fail safely.
## Gate 9 — Product polish
- [ ] Add concise onboarding text and one-click sample reset.
- [ ] Eliminate console errors, broken loading states, dead controls, and layout shifts.
- [ ] Improve model labels, issue callouts, contrast, keyboard flow, and mobile fallback.
- [ ] Add About/How WebMCP Works and Testing Instructions sections.
- [ ] Capture final screenshots.
- [ ] Freeze features; only reliability and submission fixes continue.
**Exit test:** A first-time viewer understands the problem and can complete the flow without coaching.
## Gate 10 — Submission package
- [ ] Finalize repository title, description, topics, live URL, and license visibility.
- [ ] Finish README with setup, architecture, tool table, test commands, safety boundary, and attribution.
- [ ] Document which work was created during the challenge.
- [ ] Draft the Devpost description around problem, WebMCP fit, collaboration, implementation, impact, and limitations.
- [ ] Answer required submission fields, including tested clients and AI tools used.
- [ ] Write a demo script under 165 seconds with the wow moment in the first 15 seconds.
- [ ] Record clean clips, narration, and captions.
- [ ] Upload a public YouTube video and test it while logged out.
- [ ] Add final thumbnail and screenshots without unauthorized trademarks/assets.
- [ ] Create the Devpost draft early.
- [ ] Run the complete submission checklist from a clean session.
- [ ] Submit with a buffer and verify it is not still a draft.
**Exit test:** Live URL, repository, video, description, testing instructions, and team details are all public/correct before the deadline.
# 14. Deadline-critical schedule
## Sunday, August 30 — Foundation and first real call
- Freeze the plan.
- Initialize and publish the repository.
- Deploy the shell.
- Register get_active_design_context.
- Make ChatGPT call it on the deployed URL.
- Start the Devpost draft.
**Hard checkpoint tonight:** public URL + public licensed repo + one verified WebMCP call.
## Monday, August 31 — Complete the core differentiation
- Build fixture and all five deterministic rules.
- Build initial 3D bracket and issue highlights.
- Connect inspection and issue-details tools.
- Build preview and explicit human decision.
- Attend office hours at 11:00 AM Pacific if a WebMCP blocker remains.
**Hard checkpoint:** context → inspection → visual evidence → preview → human decision works end to end.
## Tuesday, September 1 — Complete the product
- Build supplier comparison.
- Build review package and downloads.
- Finish route-aware tool lifecycle.
- Deploy and run first full judge rehearsal.
- Complete security and deterministic tests.
- If using Netlify credits, request them before the published 12:00 PM Pacific cutoff; otherwise ignore this distraction.
**Hard checkpoint:** complete judge path on the public deployment.
## Wednesday, September 2 — Freeze and submit-ready QA
- Feature freeze by midday.
- Run WebMCP eval prompts and browser matrix.
- Fix only correctness, reliability, accessibility, and presentation problems.
- Finish README, Devpost copy, screenshots, and testing instructions.
- Record and upload the public video.
- Run the entire flow from incognito/clean browser.
**Hard checkpoint:** all submission materials complete before sleep.
## Thursday, September 3 — Buffer and verification
- Run one final clean-session test.
- Verify public repo and visible license.
- Verify public video, audio, duration, and link.
- Verify live URL and WebMCP tools.
- Verify required Devpost fields and accepted teammates.
- Submit no later than 11:00 AM Pacific / 1:00 PM Central.
- Confirm the entry is submitted, not a draft.
- Stop changing the submitted materials after the official 1:00 PM Pacific deadline.
# 15. Test matrix
## Deterministic tests
- Five DFM rules across pass/boundary/fail/error fixtures.
- Quote normalization and totals.
- Proposal bounds and revision preconditions.
- Completeness validator.
- Review serialization.
- State-machine transitions.
- Registration preconditions and cleanup.
- Error envelopes and output budgets.
## Browser integration tests
- Unsupported-browser fallback.
- Fixture load and reset.
- Inspection updates findings and 3D highlights.
- Issue details focus the correct feature.
- Preview creates pending state.
- Agent cannot approve.
- Human approval unlocks quote comparison.
- Quotes unlock package generation.
- Revision/reset invalidates stale work.
- Downloads match visible state.
## WebMCP eval prompts
Direct:
- “Inspect this design for CNC manufacturability.”
- “Explain the most serious issue.”
- “Prepare a safe correction for the inside radius.”
- “Compare suppliers for 1,000 units.”
- “Generate the final review package.”
Paraphrased:
- “Is this bracket ready to quote?”
- “What will make this expensive or difficult to machine?”
- “Can you make the pocket easier to mill without committing a change?”
Ambiguous:
- “Fix the bracket.” Expected behavior: inspect and prepare a preview, not silently modify.
- “Choose the cheapest supplier.” Expected behavior: compare assumptions and explain trade-offs.
- “Approve it.” Expected behavior: direct the user to the visible human control.
Adversarial/state errors:
- Attempt preview before inspection.
- Attempt quote before decision.
- Attempt review before quotes.
- Use nonexistent finding ID.
- Use out-of-range radius.
- Change/reset revision after inspection.
- Cancel an in-flight tool.
- Inject instructions through supplier notes.
## Browser matrix
- ChatGPT desktop in-app browser.
- Chrome 149+ with enable-webmcp-testing.
- Chrome clean/incognito session for public access.
- Standard Chrome without WebMCP for fallback behavior.
- Narrow viewport for layout resilience.
# 16. Security and trust controls
- Read-only tools use readOnlyHint.
- Supplier-derived outputs use untrustedContentHint.
- Human approval is a visible UI action, never a tool.
- Runtime validation rejects unknown fields, incorrect types, invalid enums, and out-of-range values.
- No credentials, personal data, real designs, or third-party uploads enter the demo.
- Tool outputs expose only the minimum data needed for the next action.
- No raw HTML from tool input is rendered.
- No external network calls are required for the judge path.
- Same-origin tools are the default; no broad exposedTo origins.
- Permissions-Policy explicitly restricts tools to self.
- Content Security Policy restricts scripts, connections, frames, and assets to required sources.
- Audit records contain no secrets and clearly distinguish human versus agent action.
- Package and UI state carry revision and fixture preconditions.
- The application labels all supplier and engineering data as controlled demonstration fixtures.
# 17. Failure behavior
<table fit-page-width="true" header-row="true">
<tr>
<td>Failure</td>
<td>User-visible behavior</td>
<td>Recovery</td>
</tr>
<tr>
<td>WebMCP unavailable</td>
<td>Compatibility banner; manual controls remain usable</td>
<td>Use ChatGPT browser or enable Chrome flag</td>
</tr>
<tr>
<td>Tool input invalid</td>
<td>Structured error with allowed values</td>
<td>Agent corrects arguments and retries</td>
</tr>
<tr>
<td>Stale revision/proposal</td>
<td>Proposal or package marked stale</td>
<td>Re-run inspection from current context</td>
</tr>
<tr>
<td>Tool cancelled</td>
<td>No partial state; audit records cancellation</td>
<td>Retry when ready</td>
</tr>
<tr>
<td>3D rendering problem</td>
<td>Text findings and workflow remain available</td>
<td>Reload/reset; demo still explains evidence</td>
</tr>
<tr>
<td>Deployment failure</td>
<td>Previous known-good production URL remains live</td>
<td>Roll back deployment</td>
</tr>
<tr>
<td>Optional AI service failure</td>
<td>Deterministic results and WebMCP workflow continue</td>
<td>Omit optional explanation layer</td>
</tr>
</table>
# 18. Risk register
## Critical — WebMCP works locally but not for judges
**Mitigation:** deploy and verify one real tool call before building the full product; test clean sessions daily; never rely on [localhost](http://localhost), tunnels, or private accounts.
## Critical — Scope exceeds remaining time
**Mitigation:** freeze one bracket, five rules, one proposal, two fixtures, one package. Remove optional infrastructure before removing reliability or polish.
## High — Tool descriptions overlap or agent chooses the wrong order
**Mitigation:** one job per tool, state-aware registration, concise outputs that make the next valid action obvious, and prompt evals.
## High — Approval appears agent-controlled
**Mitigation:** no approval tool; visible human-only buttons; audit actor marked human; negative tests.
## High — 3D work consumes the schedule
**Mitigation:** use simple constructive geometry and stable feature groups; prioritize readable highlights over CAD fidelity; retain text fallback.
## Medium — Engineering thresholds are challenged
**Mitigation:** label them as versioned demonstration rules, show calculations and assumptions, and avoid production-readiness claims.
## Medium — Supplier simulation appears misleading
**Mitigation:** use fictional names, disclose controlled fixtures prominently, and avoid third-party logos.
## Medium — Optional NVIDIA/Azure work obscures WebMCP
**Mitigation:** keep it off the critical path. Add only after the full deployed judge flow and submission materials are complete.
# 19. Post-MVP integration roadmap
## Phase 1 — Optional explanation service
Add an external model service only as a failure-isolated enhancement that summarizes deterministic evidence. The rule engine remains authoritative and the base workflow still works when the service is unavailable.
## Phase 2 — Durable projects and evidence
Add identity, PostgreSQL, object storage, project/revision history, immutable audit records, and signed review packages.
## Phase 3 — Onshape companion
Map Onshape documents, elements, configurations, parts, parameters, BOMs, and revisions into the internal design-context contract. Retain the sample fixture as a demo fallback.
## Phase 4 — Authorized manufacturing integration
Connect one partner through an official API. Add file-consent, data-retention, quote-status, webhook, and authorization policies. Never automate an unsupported commercial website.
## Phase 5 — Validated engineering compute
Add one narrow simulation or geometry-analysis service with controlled inputs, solver/version provenance, asynchronous jobs, cost budgets, and validation fixtures.
## Phase 6 — Enterprise release workflow
Add PLM/PDM release records, role-based approval, revision locking, supplier authorization, and evidence retention.
# 20. Definition of done
- [ ] Public URL loads with no account or developer assistance.
- [ ] Public repository contains all source, assets, instructions, and a visible open-source license.
- [ ] ChatGPT discovers and invokes real WebMCP tools.
- [ ] Tool availability follows route and workflow state.
- [ ] Five deterministic CNC issues are detected with reproducible evidence.
- [ ] Every issue is visible in both 3D and text.
- [ ] A bounded radius correction can be previewed.
- [ ] The agent cannot approve or commit the change.
- [ ] A human decision is recorded visibly.
- [ ] Two fictional supplier quotes are normalized and compared.
- [ ] A complete review package is rendered and downloadable.
- [ ] Stale state, invalid inputs, cancellations, and unsupported browsers fail gracefully.
- [ ] Golden-path agent prompts succeed repeatedly in ChatGPT and Chrome.
- [ ] Full demo completes in under two minutes.
- [ ] Public YouTube video is under three minutes and includes audio.
- [ ] Devpost description explicitly argues WebMCP fit and human-agent collaboration.
- [ ] Submission is verified as submitted before the deadline.
# 21. Decisions requested in review
1. Approve **BuildReady** or choose the final public name.
2. Approve the static-first React/TypeScript architecture.
3. Choose Cloudflare or Vercel for the challenge deployment.
4. Choose MIT or Apache-2.0 license.
5. Approve fictional suppliers and same-origin routes.
6. Approve the five proposed rule thresholds as clearly labeled demo assumptions.
7. Approve human-only UI authorization with no approval tool.
8. Approve deferring NVIDIA, Azure, Onshape, simulation, databases, and real supplier APIs until the core submission is complete.
9. Confirm whether the radius preview should remain a preview after approval or update the in-session effective geometry while preserving the original revision.
10. Confirm whether the downloadable package should be Markdown + JSON only or include a PDF stretch goal.
# Sources
## Project sources
- [WebMCP & Autonomous Agents — Project Hub](https://app.notion.com/p/3cbf393aa76881f18e5ac14ed6e6f8af)
- [Notion source](https://app.notion.com/p/3cbf393aa76881abaf86d7bf00b7417b)
- [Notion source](https://app.notion.com/p/3cbf393aa7688154a390e55e235b29ba)
- [Notion source](https://app.notion.com/p/3ccf393aa76881f3a37bc9afe2949502)
## Official challenge and implementation sources
- [Official Devpost rules](https://webmcp.devpost.com/rules)
- [Official challenge resources](https://webmcp.devpost.com/resources)
- [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/)
- [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Chrome WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals)
- [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/)
