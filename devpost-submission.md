# Title

BuildReady

## One-line Summary

An evidence-first CNC readiness workspace where an agent inspects a design, prepares a bounded correction, compares suppliers, and packages the result while the engineer retains approval authority.

## Problem

Manufacturing handoff is fragmented. An engineer may review geometry in one tool, discuss design-for-manufacturing concerns in another, compare supplier estimates in spreadsheets, and manually reconstruct the reasoning for approval. General-purpose browser agents make this worse when they must infer meaning from pixels and can click consequential controls without a reliable contract.

For small hardware teams, the missing piece is not another autonomous approval system. It is a shared, inspectable workspace where the page can tell an agent exactly what design is active, which evidence is valid, what action is currently safe, and where human authority begins.

## Solution

BuildReady turns the browser into a controlled manufacturing-readiness workspace. The page exposes state-aware WebMCP tools for BRKT-001 revision B. An agent can read the design context, run five deterministic CNC checks, focus the same evidence the engineer sees, preview a bounded internal-radius correction, calculate two normalized fictional supplier quotes, and generate a portable review package.

The workflow deliberately stops the agent at the approval boundary. The radius preview is non-destructive, the original revision remains authoritative, and only visible human controls can approve or reject it. Tool availability changes with route and workflow state, so stale or premature actions are unavailable instead of merely discouraged.

## Why This Matters

WebMCP is a strong fit because manufacturing review is both semantic and stateful. The agent needs structured design IDs, revision preconditions, measurements, rule versions, supplier assumptions, and audit events—not guesses about what a canvas or button means. Page-owned tool contracts make those semantics explicit while keeping the engineer in the same visible loop.

This creates a better experience than click automation:

- The agent receives deterministic evidence instead of interpreting screenshots.
- The engineer sees every finding, preview, decision, quote, and audit event in the page.
- Conditional registration prevents invalid workflow jumps.
- A human-only decision proves that WebMCP can support collaboration without erasing authority.
- The final JSON and Markdown artifacts preserve the same state shown in the browser.

What was previously difficult—maintaining one traceable chain from geometry evidence through human review and supplier comparison—becomes one coherent interaction between the page, the agent, and the engineer.

## How We Used AI

AI acts as the workflow collaborator, not the source of engineering truth. The page's deterministic rule engine provides the measurements and thresholds. Through WebMCP, the agent selects the correct page-owned tool, summarizes compact results, focuses evidence, prepares a reversible proposal, and advances only when the required visible state exists.

Supplier assumptions and DFM notes are annotated as untrusted content. Tool errors use bounded machine-readable codes. The agent cannot approve, commit geometry, release production, contact suppliers, or place orders. This division lets AI reduce navigation and synthesis work while preserving evidence, safety, and human accountability.

## How We Used Codex

Codex was used throughout planning and implementation to:

- Translate the Notion research and ten-gate execution plan into a dependency-free architecture.
- Build the static application, deterministic CNC rule engine, parametric canvas renderer, workflow state machine, supplier quote engine, and review-package serializer.
- Implement and inspect the imperative `document.modelContext.registerTool` lifecycle.
- Run the application in the WebMCP-capable in-app browser, exercise every conditional tool transition, inspect visible state, and check console errors.
- Add 43 automated tests for determinism, boundaries, authority, security headers, output budgets, route cleanup, package completeness, onboarding, responsive contracts, and submission-packet integrity.
- Diagnose a review-summary mismatch during browser validation, correct it, and rerun the complete path before pushing the gate.
- Preserve the uv-only, npm-free and PyPI-dependency-free constraint across the entire repository.

## Key Features

1. **State-aware WebMCP surface** — tools appear only on the correct route and after their prerequisites are satisfied.
2. **Deterministic CNC inspection** — five versioned rules return stable findings, measurements, calculations, and evidence references.
3. **Parametric visual evidence** — a browser-native isometric renderer maps every stable feature ID to selectable geometry and synchronized text evidence.
4. **Human authority boundary** — the agent can preview a 3.5–5.0 mm radius, but only visible human controls can approve or reject it.
5. **Reproducible supplier comparison** — AxisWorks and RapidMill fixtures produce different price/schedule tradeoffs tied to one configuration hash.
6. **Traceable review package** — one conditional tool validates completeness and creates matching visible, JSON, and Markdown records.
7. **Security and adversarial hardening** — strict schemas, structured errors, untrusted-content annotations, abort cleanup, CSP, permissions policy, and a 14-case prompt suite.
8. **Guided product experience** — persistent progress/reset controls, onboarding, explicit trust guidance, keyboard access, reduced motion, and responsive layouts.

## Architecture

BuildReady is a browser-native application with a Python-standard-library local orchestration service and no npm packages or PyPI dependencies.

```text
Versioned JSON fixtures
        ↓
Deterministic CNC + FEA + quote engines
        ↓
Audited browser state + durable provider-neutral FEA records
        ↓
Route/state-scoped WebMCP registrations
        ↓
Visible canvas, evidence cards, quotes, review package
```

The imperative WebMCP layer registers tools with strict JSON schemas and `readOnlyHint` / `untrustedContentHint` annotations. An `AbortController` removes prior registrations on route or state changes. The same audited handlers power both WebMCP calls and visible fallback controls. Python's standard library provides local serving, checks, tests, and deterministic static build output through `uv`.

## Testing Instructions

1. Open the live URL in ChatGPT's in-app browser, or Chrome 149+ with WebMCP testing enabled.
2. On `/design`, confirm two initial tools: `get_active_design_context` and `inspect_cnc_manufacturability`.
3. Run the inspection with severity `all`; confirm five findings (two high, three medium).
4. Call `get_issue_details` for the corner finding; confirm the canvas and measurement card focus the same feature.
5. Call `preview_radius_change` with the current corner finding and `3.5`; confirm it stops at `pending_human_decision`.
6. Use the visible **Approve preview** control; confirm the audit actor is human and the quote tool remains unavailable.
7. Open `/simulation`; call `prepare_static_stress_study`; review the hash, check both human consent boxes, and click **Approve and run**.
8. Call `get_simulation_status`, `get_simulation_results`, and `compare_simulation_to_requirements`; confirm recorded evidence is `indeterminate` and comparisons are `unknown`.
9. Return to `/design`; call `prepare_quote_comparison` with quantity `1000`; confirm `/suppliers` shows AxisWorks at $12,080 / 18 days and RapidMill at $13,200 / 11 days with hash `fnv1a-28daab8d`.
10. Call `generate_review_package`; confirm `/review` shows findings, human decision, simulation hashes/limitations, two quotes, and JSON/Markdown download controls.
11. Click persistent **Reset**; confirm `/design` returns to 0/5 complete with two initial tools and no findings.

Local verification:

```bash
uv sync --locked
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
uv run python scripts/serve.py
```

## Public Demo Link

**TODO — required:** Add the deployed public URL after Cloudflare Pages (or another static host) is configured and the WebMCP golden path is verified there.

## Public Repository Link

https://github.com/AdityaP9116/BuildReady

Repository includes the MIT License, complete source, controlled fixtures, tests, planning/research export, and uv-only run instructions.

## Demo Video

**TODO — required:** Add the public YouTube URL for the final demo video. The script in `docs/submission/DEMO_SCRIPT.md` targets approximately 150 seconds, below the official three-minute maximum, and includes audio coverage of the product and WebMCP implementation.

## Screenshot Shot List

1. Initial `/design` — onboarding, bracket, WebMCP available, 0/5 progress, two tools.
2. Inspected design — five findings, synchronized visual highlight and measurement evidence.
3. Pending proposal — ghosted 1.0 → 3.5 mm geometry and visible human-only controls.
4. Simulation approval — frozen study hash, visible human consent, no approval WebMCP tool.
5. Completed simulation — recorded/not-verified-live evidence and indeterminate limitation.
6. Supplier comparison — two quote cards, shared hash, price/schedule tradeoff, fictional-data notice.
7. Review package — package ID, five findings, approved decision, simulation hash, two quotes, JSON/Markdown downloads.
8. About page — conditional registration lifecycle and agent/human/untrusted-data boundaries.

## Submission Readiness Notes

- Official event: The WebMCP Challenge; account authentication and registration verified live on 2026-08-31.
- Official phase: submissions open; deadline is 2026-09-03 20:00 UTC (Pacific Time event setting).
- Repository: complete and pushed through Gate 9; Gate 10 documentation is the final local gate.
- Automated verification: 38 tests passing before Gate 10 documentation.
- In-app browser: complete golden path, conditional tool lifecycle, security headers, progress/reset, and zero new console errors verified.
- Required external assets still missing: public live URL and public YouTube demo URL.
- Required participant answers still need confirmation in the official-field section below.

## Known Limitations

- The bracket, five thresholds, and two suppliers are controlled demonstration fixtures, not production machining guidance or commercial offers.
- Design/quote UI state is session-only. FEA study/job/result state is durable locally in a gitignored SQLite database with private expiring artifacts; production storage and authentication remain unselected.
- Live SimScale mode is disabled until the account, exact template payload, CAD transport, and numerical verification checklist pass.
- The canvas is a purpose-built parametric evidence renderer, not a general CAD parser.
- Chrome 149+ incognito and second-machine verification remain to be recorded after public deployment.
- The application does not modify source CAD, contact suppliers, place orders, or approve production.

## TODO Official Form Fields

Live requirements fetched from Devpost on 2026-08-31:

- **Submitter Type (required):** TODO confirm `Individual`, `Team of Individuals`, or `Organization`.
- **Country of residence (required):** TODO confirm country/countries for the submitter and any team members.
- **Organization name (optional):** TODO only if submitting for an organization.
- **App Status (required):** Draft answer: `New` (repository work began during the submission period); confirm before entry.
- **Existing-project updates (optional):** Not applicable if App Status is confirmed as New.
- **Live URL (required):** TODO deploy and paste URL.
- **Private judge testing instructions (optional):** Use the numbered golden path above; no credentials are required.
- **Public repo (required):** https://github.com/AdityaP9116/BuildReady
- **Tested agents/clients (required):** ChatGPT in-app browser verified. TODO add Chrome 149+ result after deployed testing.
- **AI tools used (required):** OpenAI Codex, ChatGPT in-app browser/WebMCP tooling, and Notion research context.
- **Learning level (required):** TODO confirm `None`, `Moderate`, or `Significant`.
- **Career AI value (required):** TODO confirm `Yes` or `No`.
- **Demo video (required):** TODO public YouTube URL.
