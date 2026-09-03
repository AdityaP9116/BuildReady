# DatumFlow — Priority Plan for Live SimScale and Real Supplier Quotes

Status: IMPLEMENTATION IN PROGRESS — revision 4, checkpoint prepared for the user's requested GitHub push. Stabilization, recorded FEA reliability, and a partial local private quotation workflow are implemented; the complete integration is not delivered. Specific CAD transfer, provider computation, supplier contact, real-file retention and hosting decisions remain gated. See document 09 for current implementation and verification limits.

**Superseding cost constraint (2026-09-02): $0.** The user does not authorize paid services, hosting, subscriptions, provider computation, supplier quotation fees, purchases or orders. Earlier references below to paid execution or a monetary budget are not spending authority. A finite run/resource allowance is still a safety limit, but live execution additionally requires verified no-charge account entitlement and the existing source/transfer/setup approvals. Unverified pricing or entitlement blocks that live action; it does not block offline work. No trial, billing enrollment, or public CAD publication may be used to bypass this constraint. Supplier API and hosted operation remain optional and disabled until a suitable no-charge route and their other gates are satisfied.

Prepared: 2026-09-02; reprioritized after review of partner commit [`deb87ba`](https://github.com/AdityaP9116/BuildReady/commit/deb87baba1537cb33fa31795e8f1d093c781b003), “feat: ship adaptive Onshape review extension.” At execution start, reviewed the additional `4903386` proxy-check compatibility fix and fast-forwarded the checkout to it, preserving all planning edits. Current changes are uncommitted on that baseline. The earlier `cb88682`/`deb87ba` observations below remain historical, not current test results.

### Implementation checkpoint: stabilization and recorded FEA reliability

Detailed evidence and outstanding work: [09 — Implementation checkpoint](./09-integration-implementation-checkpoint.md).

- Implemented: shared versioned Onshape client; exact document/element/full-microversion snapshot keys; response-context mismatch rejection; changed/checking/unresolved source status; stale-action and delayed-response guards; unknown live material/process; inferred-input provenance and coverage; guarded panel preview and identity-only top-level handoff; safe audit text rendering; consistent variable limit; normal Node/uv test execution.
- Implemented for the recorded/local foundation: server-authoritative unsigned study preparation; serialized read/modify/finalize transactions across independent SQLite connections; immutable result artifacts; separate current applicability; exact prior-snapshot invalidation; stricter numerical evidence validation; loopback/Origin protection; scheduled local cleanup; visible frozen setup.
- Added in the subsequent checkpoint: a local authenticated `/api/private/` evidence service and `/sourcing.html` interface, owner-scoped records, original-file digests, explicit retention acceptance, immutable RFQ/quote versions, session-bound freeze/review challenges, manual transcription/citations and Decimal comparison. The Onshape export client now uses a version-bound route with microversion validation and explicit single-part/default-configuration restrictions. These are partial implementations, not passed end-to-end gates.
- Still incomplete: account-verified exact STEP export, complete live SimScale setup/jobs/results/verification, quotation withdrawal/supersession handling, full private HTTP/browser acceptance, and hardened private WebMCP state/schema behavior. The provider job ledger is unconnected scaffolding and not a working live worker. Parameter snapshot keys are not CAD export fingerprints; uploaded STEP associations remain user-attested, not verified exports.
- No F1–F6 or Q0–Q6 gate is marked complete by these foundation changes. S0 local regressions/checks are substantially addressed; deployed iframe acceptance and expanded embedded workflows remain deferred. Live account/engineering/compute/supplier dependencies remain explicit.

This plan expands [07 — Real, Traceable Supplier Quotes](./07-datumflow-real-traceable-quotes-plan.md), preserved unchanged, and the [original FEA plan](./06-datumflow-simscale-fea-integration-plan.md). The detailed Q0–Q6 and F0–F6 tasks remain; the priority order and delivery boundaries below supersede earlier sourcing-first rollout wording. Earlier implementation-status statements do not prove a live solver, genuine quotation, or numerical verification works.

**Review first:** section 0 defines priorities, section 2 records the partner-code changes and stabilization checkpoint S0, and section 22 gives the execution order and approval decisions. Sections 1–16 retain sourcing contracts and seven Q gates; sections 17–21 retain FEA contracts, numerical acceptance, and seven F gates. S0 is one shared entry checkpoint, not another supplier or solver implementation track.

## 0. Priority decision and reviewable delivery sequence

The user has set two outcomes above interface expansion: **a fully working, numerically verified SimScale integration** and **proper, traceable real supplier quotations**. SimScale is the main engineering delivery track. Real quote acquisition starts early because supplier turnaround is external; it does not wait for solver completion or access to a supplier API.

| Order | Deliverable | Completion evidence |
| --- | --- | --- |
| 1 | Small shared stabilization checkpoint, S0 | Normal test commands pass; correct selected CAD reaches shared state; unsafe/incomplete panel actions are fixed or clearly unavailable |
| 2 | Account/source feasibility and exact shared CAD foundation, F0/F1 plus Q0/Q1 shared tasks | Approved full Onshape version/configuration/part, actual STEP receipt/digest, scoped authentication, private storage and working retention |
| 3 — primary | Real SimScale pipeline, F2–F5 plus local F6 checks | Approved CAD import → reviewed mapping/setup → approved mesh/solve → retrieved numeric evidence → benchmark and target-part verification → restart/recovery proof |
| 3 — supporting | Genuine supplier evidence, Q0–Q4 | Actual RFQ, deliberate human supplier handoff, preserved supplier-issued quote, reviewed terms and a truthful sourcing report; two actual compatible offers are needed only to claim a real comparison |
| 4 | Combined local acceptance | Both outcomes work against traceable design identities; changing the design updates every active consumer while retaining qualified history |
| Later / conditional | Supplier API Q5, public hosting Q6/hosted F6, expanded embedded experience | Separate access, deployment, security and acceptance evidence; not prerequisites for genuine manual quotes or local verified FEA |

**Primary delivery surface:** the existing top-level browser workspace: `/design`, `/simulation`, `/suppliers`, and versioned reports. Keep the partner's panel/discovery/Model Insight work, but do not make a complete embedded Onshape release, new conversation features, a visual redesign, another demo video, renaming, generalized CAD recognition, or per-user Onshape OAuth prerequisites for these two local outcomes. The embedded panel must not advertise unavailable simulation/quote actions as complete.

**Not deferred:** correct design identity, reviewed material/load/scope, secure human approvals, private evidence, seven-day CAD/FEA policy enforcement, job recovery, truthful labels, numerical verification, and testing. “Local first” does not waive authorization or permit unprotected real CAD/quote data.

**Definition of success for review:** at least one real target-part SimScale result with the required verification evidence and at least one genuine supplier-issued quote associated with a frozen manufacturing request. A request submission, price estimate, mock response, imported fixture, or a status of “run finished” does not satisfy these outcomes. If two quotes are obtained, compare only compatible reviewed offers and preserve unknown costs; obtaining the second quote remains a separately reported external dependency.

**Execution boundary:** this sequence is approved for implementation. Missing account/source/budget information blocks the affected live operation, not safe offline work. No mock milestone can be renamed “real” to bypass that dependency.

## 1. Outcome and completion boundaries

Deliver a sourcing workspace that can answer: **what exact part was requested, what did each supplier actually offer, where is the original evidence, who reviewed it, and which comparisons are justified?**

Also deliver an engineering workspace that can answer: **what exact geometry and setup were solved, what did SimScale actually return, is that result applicable to this design, and what verification supports its use?** “Fully functional” here means the bounded single-part linear-static workflow, not a general-purpose FEA system or certification of a manufactured part.

Within the sourcing lane, build in this order: frozen RFQ package → private source evidence → structured human review → compatible comparisons → WebMCP and exports. Add one authorized read-only API adapter only when access is secured. This lane fits around the primary SimScale sequence in sections 0 and 22; it is not a requirement to finish all sourcing work before starting FEA.

The three sourcing milestones must be reported separately:

1. **Software milestone:** the complete workflow passes synthetic contract, security, browser, and recovery tests. Every synthetic item remains labeled. This is possible without supplier access.
2. **Real-evidence milestone:** one actual supplier-issued quote is privately retained, transcribed, reviewed, and linked to an actual frozen request. If design association is only user-attested, that qualification stays visible.
3. **Real-comparison milestone:** two independently issued supplier offers can be compared on a documented common basis, with all disqualifications and missing terms exposed. A single quote is a valid sourcing report, not a two-supplier comparison.

An API is an acquisition channel, not a prerequisite for milestones 1–3. A supplier quote, a low price, or supplier DFM feedback never constitutes structural validation or manufacturing release.

FEA has three additional, independent milestones: **reliable software** (recorded and mocked behavioral/recovery tests), **live integration** (an approved real CAD-to-SimScale-to-results trace), and **verified supported analysis** (analytical checks, manual parity, mesh convergence, force balance, and engineer review). A successful mock, account probe, or live run does not substitute for the next milestone. Public operation adds the deployment gates for both tracks.

### Scope

- One supported Onshape Part Studio configuration and selected solid part per RFQ revision.
- CNC machining, explicit material/specification, quantity, tolerances/drawing, finish, inspection, and delivery requirements.
- Original PDF plus controlled JSON evidence; manual transcription is the guaranteed baseline.
- USD comparison initially; preserve other currencies without automatic currency conversion or ranking.
- Local Python/SQLite implementation with private filesystem artifacts; hosted operation is separately gated.
- Zero, one, or multiple quotes; immutable versions; historical retrieval; evidence-specific labels.
- Preserve the existing fictional supplier demonstration.
- Restore reliable FEA state and implement real Onshape export, SimScale import/setup/mesh/run/results, bounded human approvals, and numerical verification for one isotropic, linear-elastic, small-displacement solid part with a force load and fixed support.
- Preserve the explicitly recorded FEA demonstration; never silently fall back to it after a live failure.

Excluded: CAD modification, purchasing, orders, payments, contract acceptance, automatic RFQ sending, unattended website scraping, arbitrary document OCR, FX conversion, tariff/tax estimation, and supplier quality scoring. The FEA release excludes assemblies/contact, nonlinear or plastic behavior, large deformation, buckling, fatigue, thermal/CFD analysis, unrestricted materials/loads, unattended optimization, and automated engineering sign-off.

## 2. Baseline, prerequisites, and migration decisions

### 2.1 Partner update: reuse, repair, and keep out of the critical path

The reviewed `deb87ba` update adds an Onshape right panel, semantic variable discovery with partial-rule coverage, Model Insight (a deterministic conversational router), workspace/version proxy contexts with document allowlisting, feature metadata, tests and demo/setup material. It does **not** add real supplier evidence storage/acquisition or live SimScale execution. The FEA state-file changes are import-version changes, not numerical or durable-worker implementation.

| Partner work | Treatment in this plan |
| --- | --- |
| Adaptive dimension inventory and confidence | Reuse as draft evidence only; retain native variable/feature IDs, ambiguity, units and scope. It is not a B-rep measurement engine, material source, or FEA face-selection mechanism |
| Model Insight and current UI | Reuse as consumers of the authoritative backend manifests/status. Add only the quote/FEA intents and freshness safeguards needed for these outcomes; do not add an LLM service or independent engineering calculations |
| Proxy allowlist and workspace/version support | Preserve and test in both Python and hosted implementations. Missing-microversion rejection is useful partial progress, not complete identity/export verification |
| Embedded panel | Repair shared-context hazards; fix small route-specific defects or gate unsupported actions. Full embedded FEA/quote delivery and iframe authentication are deferred until the top-level workflows pass |
| Tests, docs and recording | Reuse tests after repairing their contracts/runtime assumptions. The recording uses fixture evidence and a WebMCP shim; it is not proof of live solver, real quotes, or native embedded WebMCP |

Observed review results: the partner snapshot's static build passed; JavaScript checks had 5 passes and 3 failures because callers did not provide the newly required request object. The Python suite ran 134 tests with 24 errors and one skip on local Node 24.11.0 because new tests used an unsupported Node flag. A diagnostic runner omitting only that flag produced 133 passes and one skip; that workaround is **not** a passing unmodified release baseline. The [reviewed GitHub quality run](https://github.com/AdityaP9116/BuildReady/actions/runs/33712041557) failed at Check, with Test and Build skipped. S0 must establish a fresh normal-command baseline; these observations are not claims about future CI runs.

### S0 — Stabilize only what protects the two priority workflows

**Dependency:** explicit instruction to begin implementation after this plan review. No application change is performed during the planning turn.

1. S0.1 Preserve all local changes and reconcile the reviewed partner commit without overwriting the planning documents or unrelated work. Review any newer delta. Record the final code revision and test runtime; do not reset the worktree or silently discard partner features.
2. S0.2 Make tests run through normal uv commands without a compatibility shim. Replace the unsupported Node test flag with a supported module strategy, make the JS runtime reproducible in CI, and update proxy contract tests to supply real request objects. Add positive/negative workspace/version/allowlist tests to both proxy implementations; reconcile the local 40-variable and hosted 100-variable limits.
3. S0.3 Fix the split Onshape-client module instance caused by mixed versioned/unversioned imports. Both initial load and revision refresh must send the selected document/workspace-or-version/element context. Add a regression with two allowed documents and multiple Part Studios; a fallback to a different configured document must fail, not appear connected.
4. S0.4 Repair or explicitly gate the embedded preview's missing-element error and simulation-dependent quote dead end. Until full panel support passes, direct the human to the top-level workspace using validated identity-only context and an explicit source recheck; do not pass secrets/evidence through URLs or claim its separate tab has shared in-memory state. Preserve the working top-level fixture path.
5. S0.5 Prevent stale CAD claims: expose deliberate refresh/read-and-activate in the primary workspace, scope context by full source, and show last checked/changed/unresolved status. Refresh must invalidate approval/assessment projections immediately across controls, Model Insight, WebMCP and JSON. A panel without a safe refresh path is labeled a snapshot, not automatically current.
6. S0.6 Separate inferred input confidence from deterministic rule arithmetic. Remove fixture material/process/geometry assumptions from real RFQ and FEA drafts; require explicit reviewed inputs. Make any retained DFM explanations use actual observed dimensions, label demonstration thresholds honestly, and retain coverage/native evidence references in JSON/reports. Hide an unsupported live conclusion rather than presenting fixture-specific statements as measured facts.
7. S0.7 Add focused behavioral regressions for the above and the conflicting panel framing policy. The global `frame-ancestors 'none'` must not unintentionally combine with an allowing panel policy when hosted embedding is later enabled. Keep framing restrictions on other routes; deployed iframe acceptance remains a hosted release check. Run standard tests/check/build and record pass/fail/skip reasons before advancing.

**Exit:** shared source loading is trustworthy, test commands pass without ad hoc runtime patches, and enabled controls have no known wrong-model/preview/quote dead end. Route-specific features may be explicitly unavailable; this is not a mandate to finish the entire extension first. Every deferred embedded item remains listed with its eventual acceptance test. Account feasibility preparation can be organized alongside S0, but no unsafe live flow bypasses it.

### 2.2 Existing quotation/FEA foundation

The existing `web/quote-engine.js` calculates two fictional quotes, uses a preview-dependent FNV hash, and has four supported quantities. `web/state.js` requires both a preview decision and completed simulation evidence. `web/review-package.js` requires exactly two quotes and binds them to a simulation result. There is no durable real-quote backend.

The local Python server and SQLite FEA service provide useful patterns, but their known gaps must not be copied into quoting: shortened CAD identity, browser/server numeric hashing differences, mutable concurrent completion, unscheduled expiry cleanup, missing browser restoration, and unauthenticated approval assertions. The partner's partial identity improvements do not resolve these downstream defects.

| Existing assumption | Required change | Compatibility rule |
| --- | --- | --- |
| A preview defines the quoted configuration | Actual exported CAD and explicit requirements define the RFQ | Retain previews as separate design proposals |
| A quote requires completed FEA | Commercial sourcing is independent of simulation completion | Display engineering readiness separately |
| Exactly two offers exist | Support empty, single-offer, and multi-offer states | Never insert a fixture to complete a real comparison |
| A new FEA hash invalidates quotes | Only changed commercial scope or evidence affects quote applicability | An aggregate engineering report may need refreshing without changing quote history |
| Reset deletes visible quote state | Reset clears view selection, not stored real records | Existing fixture reset behavior remains available |
| Price calculations occur in browser JavaScript | Python `Decimal` is authoritative | Browser formats server values only |
| One global demo disclaimer is enough | Each evidence item retains its origin and review status | Real supplier evidence can sit beside explicitly recorded FEA |
| Static hosting serves everything | Quote APIs require a real persistent authenticated backend | Do not expose real mode on a static-only deployment |

### Proposed defaults and open decisions

| Decision | Proposed implementation | Confirmation or dependency |
| --- | --- | --- |
| First acquisition route | Human uploads an original supplier PDF | No supplier selected or contacted by this plan |
| First API adapter | Read-only retrieval from one authorized shop; Paperless Parts is a candidate from document 07 | Provider, entitlement, contract, and specific quote access must be verified at Q5 |
| CAD export | Export an existing immutable Onshape version after verifying its full microversion/configuration/part mapping | Do not create an Onshape version automatically; the engineer supplies or explicitly authorizes it |
| Quote runtime | Existing Python process, separate `.runtime/quotes/` SQLite database | No new backend stack, pip, npm, or cloud account |
| CAD retention | Preserve the previously agreed seven-day CAD/FEA policy | Supplier handing-off does not silently extend retention |
| Original quote retention | Propose 30 days for local quote PDFs/API evidence, as in document 07 | Not yet approved; real uploads require an explicitly accepted quote-retention policy |
| Metadata/review history | Retain until explicit project deletion for local use | Hosted retention and backup policy require approval before Q6 |
| Public hosting | Host Python with durable private storage behind authentication | Host, storage provider, budget, and identity provider remain undecided |

Synthetic development can proceed without supplier evidence, API access, or retention decisions. Real acquisition/release checkpoints cannot be marked complete using synthetic substitutes.

## 3. System boundary and responsibilities

```text
Onshape immutable source + manufacturing requirements
                         |
                 Frozen RFQ revision
                         |
           Human-reviewed package download
                         |
             Human supplier handoff outside app
                         |
     Original supplier file      Authorized read-only API
                 \                    /
                  Private evidence ingestion
                            |
                  Draft terms + field citations
                            |
                    Human review event
                            |
              Immutable reviewed quote version
                            |
            Compatibility policy + Decimal arithmetic
                            |
          UI / WebMCP explanation / versioned report

FEA evidence ──> Separate engineering-readiness panel/report section
```

- **Engineer:** checks actual geometry and specifications, chooses local files, reviews transcription and association, authorizes each external recipient, and makes commercial decisions outside the application.
- **ChatGPT:** reads bounded context, prepares local drafts, identifies missing terms, and explains server-computed comparisons. Suggestions remain unreviewed. It cannot approve sharing, attest scope, mark reviewed, choose a binding winner, or purchase.
- **Python backend:** owns identity, hashes, validation, storage, money arithmetic, authorization, review records, lifecycle transitions, and provider jobs.
- **Browser:** presents authoritative records, collects deliberate review actions, rejects late responses for a different active request, and restores selections after reload.
- **Supplier adapter:** acquires permitted evidence and maps it into the common contract; it never decides review or engineering status.

Do not hold a database transaction open during an upstream request, upload, document display, or agent call. Long-running operations return durable job IDs.

## 4. Trust model and independent status dimensions

Persist supplier claims and human decisions independently. Do not add a single misleading `verified: true` flag.

| Dimension | Values | How it changes |
| --- | --- | --- |
| Source kind | `supplier_document_upload`, `authorized_api`, `manual_estimate`, `fictional_fixture` | Immutable on the source record; API-shaped uploaded JSON remains a user upload |
| Review | `pending`, `reviewed`, `disputed` | Append-only human review/dispute events bound to a content hash |
| Design/scope association | `supplier_confirmed`, `user_attested`, `unresolved` | Per-field evidence and explicit attestations; never inferred from a request dropdown |
| Applicability | `current_basis`, `different_basis`, `unresolved` | Computed against the selected RFQ hash, not written into immutable source content |
| Validity | `current`, `expired`, `withdrawn`, `unknown` | Computed from source dates and withdrawal events at `evaluatedAt` |
| Completeness | Explicit missing-cost and missing-term arrays | Computed for the chosen comparison policy; not a generic boolean |
| Evidence availability | `available`, `quarantined`, `expired_deleted`, `user_deleted`, `integrity_failed` | Artifact lifecycle, independent of commercial expiration and past review |
| Offer type | `supplier_quote`, `indicative_estimate`, `unknown` | Supplier wording and source reference; API transport does not imply a firm offer |
| Supersession | Latest version or reference to a superseding version | Append-only relation; old versions remain readable |

`Supplier_confirmed` means the retained supplier evidence explicitly identifies the relevant scope, not that DatumFlow authenticated a PDF's author. A hash proves byte integrity, not authorship. Contradictory supplier terms cannot be overridden into an exact match by user attestation; record a deviation or a separate alternative request.

Historical reports preserve their original evaluation time and status snapshot. Opening one also shows a clearly separate present-day warning if it has since expired, been withdrawn, or lost source evidence. Do not modify historical report bytes to update its badges.

## 5. RFQ contract and authoritative CAD binding

### 5.1 Source identity

Introduce a shared, versioned identity helper for quoting and future FEA reuse:

- Full document ID, element ID, microversion ID, explicit configuration, and selected part/body IDs.
- Original workspace and, when used for export, immutable version ID as provenance.
- Sorted sets for selected IDs; canonical configuration representation, not caller-supplied arbitrary query strings.
- Reject absent/`unknown` microversions. Truncated IDs are display labels only.
- Keep `designSourceHash` distinct from an RFQ's manufacturing requirements and from a file's byte digest.

The existing STEP translation `/m/` assumption must be corrected. Onshape's published translation/STEP-export paths use workspace/version (`w`/`v`) parameters. Prefer an existing immutable version whose resolved microversion matches the approved source; freeze export settings and validate returned provenance. Do not substitute mutable workspace-head export or silently create a version. Verify the account contract before implementation claims of exact transport. [Official Onshape Part Studio API](https://github.com/onshape-public/go-client/blob/master/onshape/docs/PartStudioApi.md#createpartstudiotranslation).

A manually uploaded STEP may be retained, but its connection to Onshape is `user_attested`, not `export_verified`. It cannot satisfy the automated exact-export gate. Reject multi-body/configuration uncertainty rather than guessing which part was exported.

### 5.2 Request fields

The `rfq-manifest-1.0` contract must include:

| Group | Required representation |
| --- | --- |
| Identity | Request UUID, revision, workspace scope, schema/canonicalization versions |
| CAD | Full source identity, export method/settings, verified version mapping, selected part IDs |
| Artifacts | STEP ID, digest, size; drawing/specification IDs, digests and revisions |
| Material | Grade/specification, temper/condition, permitted substitutions or explicit none |
| Process | Supported manufacturing process and relevant special requirements |
| Quantity | Positive integer and requested purchase unit; one quantity per RFQ revision initially |
| Tolerances | Drawing/GD&T references or explicit dimension-level requirements; a supplier-standard request is explicit, not invented numeric tolerances |
| Finish | Specific finish or explicit `none_required`; unspecified remains a draft blocker |
| Inspection | Requirements or explicit `standard_supplier_inspection_requested`; certifications explicitly requested/not required |
| Delivery | Country/region, shipping basis, target date or explicit not specified, address disclosure level |
| Exceptions | Requested alternatives, exclusions, and reviewed assumptions |

Missing information is visible. A frozen RFQ may explicitly request clarification, but must carry `scopeIncomplete` fields; offers cannot later be ranked as exact matches until the corresponding scope is resolved in a new request revision or evidenced clarification. Missing STEP binding always blocks real-mode freeze.

### 5.3 Hashes and revisions

- Backend computes `requestHash = SHA256(canonical RFQ pricing content)`. Browser submits structured inputs and receives the digest; it never independently implements money hashing.
- Canonical content includes complete CAD identity, file digests, configuration, material/process/quantity, drawing/tolerances, finish, inspection, and delivery requirements.
- Exclude request UUID, upload filenames, local storage paths, access URLs, review timestamps, supplier recipient, and FEA result hashes. Recipient approval has its own action digest.
- Financial and dimensional decimals are finite validated strings. Normalize equivalent values (`1.0`/`1.00`), units, explicit nulls, object keys, and semantically unordered sets under `rfq-canonical-1.0`.
- Preserve raw source values beside normalized ones. Normalization must not alter the supplier's original document or statement.
- Freeze is a compare-and-set transaction on the draft revision. Changes afterwards create a child revision with a new hash; no in-place overwrites.
- Keep a byte digest for each artifact as well as the semantic source hash. Byte-different STEP exports require renewed binding review; do not claim geometric equivalence based on filenames or nearly identical sizes.

### 5.4 Preparation, export, freeze, handoff

1. Agent or human prepares the local RFQ draft. No export, supplier contact, or external upload occurs through the preparation tool.
2. Visible human action requests the supported Onshape export. Persist the job before starting; resume by job/translation ID after restart.
3. Backend stages, size-checks, hashes, and privately stores STEP; validates the chosen source/configuration/part and drawing links.
4. Human reviews a read-only server manifest, including all requirements and actual files; edited form fields cannot masquerade as frozen values.
5. A short-lived approval challenge binds session, action, draft version, request hash, and file digests. Freeze consumes it atomically.
6. Human explicitly selects and reviews files for package download. Download is not a supplier submission.
7. Optional handoff record captures chosen recipient, package hash, user-declared channel/date, and supplied receipt. Label an uncorroborated handoff `user_reported`, not `supplier_received`.

If active CAD changes, offer “view historical request” or “prepare new request.” Historical handoff requires a renewed explicit confirmation of that old revision; never replace its files with the new CAD.

## 6. Supplier evidence and transcription workflow

### 6.1 Artifact ingestion

1. Human selects a local PDF or controlled JSON file and the request it is intended to answer.
2. Authorize the workspace and accepted retention policy before reading the body. Apply proposed limits: PDF 10 MiB, JSON 1 MiB, STEP 25 MiB; reject archives and unsupported formats.
3. Stream bytes into a random-ID quarantine file outside static directories. Check the actual streamed byte count, media signature, and allowed content type; do not trust extension or declared length.
4. Compute SHA-256 on the original bytes. Preserve the original filename only as bounded display metadata, never a filesystem path.
5. Move to the private artifact area and finalize metadata transactionally. A reconciler cleans abandoned staging files and flags missing blobs after crashes.
6. Return an artifact ID, digest, availability, media type, size, and retention dates. Never return a filesystem path, credential, or reusable public URL.

No uploaded original is rewritten for redaction. If redaction is necessary for display/export, store a derived artifact with its own digest and a link to the restricted original. Retain original permitted API quote payload bytes when safe. If a full response contains transient signed URLs or unrelated private information, retain a minimized snapshot plus transformation metadata and the transient response digest; explicitly label it as a minimized API snapshot, not a byte-for-byte original. Preserve all permitted quoted terms and identifiers. Never retain authentication headers or presigned URLs as source evidence.

### 6.2 Manual-first review

- Two-pane workspace: source viewer/download and structured terms with field-level citations.
- Original evidence is required for `supplier_document_upload`; unsupported prices without it become `manual_estimate`.
- Record supplier legal/display identity, platform identity separately, quote number/revision, issuance date, line item, quantity/basis, currency, price components, lead time, validity, deviations, and exclusions.
- Each field holds `rawValue`, `normalizedValue`, `evidenceRefs`, and `enteredBy`. Unknown values carry a reason, not an empty string or zero.
- Citations use artifact ID and PDF page/section, or JSON Pointer for structured sources. Human-supplied page references are attested unless a parser has verified page counts/content.
- Agent suggestions remain draft values and are visibly attributed. The five initial WebMCP tools do not expose a review/attestation operation. Optional suggested transcription can be pasted into the human form and remains pending.
- Review the supplier's association to geometry/specifications separately from transcription accuracy. A clearly transcribed quote may still have unresolved design match or validity.
- Corrections create new immutable quote versions. The original and old review remain accessible; a review for version 1 cannot approve version 2.
- A PDF containing multiple options/line items produces distinct quote-line versions referencing the same source. Alternatives are not independent suppliers.

### 6.3 Human authority

Use server-established session identity, authorized scope, CSRF/Origin checks, exact record version, action digest, and one-time review challenge. Store who reviewed which fields, what they attested, the artifact hashes, and the date.

Changing source bytes, transcription, or association invalidates the pending challenge. Two concurrent reviewers receive a conflict rather than silently overwriting each other. An API client sending `actor: human` or checkbox booleans is not sufficient authorization. A nonce and omitted WebMCP approval tool enforce the application workflow; neither proves a biological human acted.

## 7. Comparison and arithmetic contract

### 7.1 Gate scope before calculating rankings

Comparison policy `quote-comparison-1.0` evaluates exact RFQ revision, independent supplier identity, quoted line/quantity/unit, material, process, tolerances/drawing, finish, inspection, shipping/delivery basis, currency, validity, review, evidence availability, deviations, and offer type.

| Result | Meaning | Allowed presentation |
| --- | --- | --- |
| `eligible` | Supplier-confirmed common scope, reviewed available evidence, current firm offers, equal currency/cost basis, no unresolved deviation | Rank the explicitly chosen complete cost metric; never auto-select/order |
| `conditional` | User-attested scope, unknown validity, indicative offer, or comparable partial costs with disclosed gaps | Side-by-side comparison and qualified arithmetic; no unqualified winner |
| `blocked` | Different/unresolved scope, withdrawn/expired offer, missing/integrity-failed source, pending/disputed review, mixed real/fixture data, incompatible units/currency | Show evidence and exact blockers; no automatic price ranking |

Retain all selected offers in the response with `blockingReasons`, `caveats`, and `missingFields`. Do not hide an expensive or incompatible offer silently. Compare supplier independence using supplier identity, not platform, quote count, or version count. If independence is unknown, disclose it and do not claim the two-independent-offer milestone.

### 7.2 Money and charge states

Every monetary input is a bounded decimal string plus currency; reject NaN, infinity, boolean/numeric coercion, arbitrary exponents, and ambiguous currency symbols. Initial proposals: quantity 1–100,000 each; at most six input decimal places; policy-bounded maximum amounts. USD display uses two decimal places; retain quoted precision and record the rounding policy.

Each setup, finish, inspection, packaging, shipping, tax, discount, and other fee has an explicit treatment:

- `quoted_separately`: stated nonnegative amount and its basis.
- `included`: point to the quoted component that already includes it; do not add twice.
- `explicit_zero` / `not_applicable`: source-backed reason; only these justify a zero incremental amount without another price.
- `excluded`: supplier excluded it; buyer's eventual cost remains unknown unless separately evidenced.
- `unknown`: no usable amount or inclusion statement.

Discounts are typed deductions with explicit scope; do not allow negative setup/shipping as disguised discounts. Minimum-lot charges and packs require an explicit quantity/price basis. Preserve unsupported pricing structures and block automated arithmetic rather than approximating. No quantity extrapolation or price-break substitution without supplier evidence for that break.

Calculate and persist separately:

1. `supplierStatedTotal`: verbatim normalized supplier total and declared inclusions, not overwritten by our arithmetic.
2. `calculatedKnownTotal`: sum of supported extended line prices, separately quoted charges, and explicit discounts. Its label lists inclusions and gaps.
3. `landedCostTotal`: only non-null when every required cost component through the stated destination is known or evidenced as included/not applicable.
4. `reconciliation`: difference, compared coverage, rounding policy, and discrepancy flag. Compare totals only when they cover the same items.

Use `Decimal`, not floating point, throughout. Initially use an explicitly versioned USD rounding rule and flag supplier discrepancies exceeding one cent on matching coverage; if supplier rounding is unknown, retain a review question. Tax is transcribed, not calculated as tax advice.

**Acceptance example:** 10 parts × USD 42.50 plus USD 80.00 setup = USD 505.00 known cost. Unknown shipping and excluded-but-unknown tax produce `landedCostTotal: null`, not USD 505.00 landed. A second offer with USD 490.00 known cost but different missing charges is not automatically “USD 15.00 cheaper.”

### 7.3 Time, validity, and re-evaluation

- Store issuance, retrieval, review, expiration, and withdrawal separately; preserve the supplier's original date text and ambiguity.
- A date-only expiry needs an explicit source timezone/end-of-day policy. Without a supported interpretation, validity is `unknown`; never invent perpetual validity.
- Lead time retains min/max, business/calendar basis, trigger (order acceptance/payment/material receipt), and ship-versus-delivery semantics. Do not promise an arrival date without a calendar and transit basis.
- Comparisons store `evaluatedAt`, policy version, exact quote-version hashes, RFQ hash, and completeness/validity projections. UI refresh recalculates present-day eligibility; stored report bytes remain immutable.
- A new supplier version, withdrawal, changed active RFQ, evidence deletion, or review dispute invalidates a current comparison view. It does not delete old reports.

## 8. Persistence, artifacts, and retention

### 8.1 Proposed local layout

```text
.runtime/quotes/
  quotes.sqlite3
  artifacts/<workspace-id>/<random-artifact-id>/original
  staging/<random-upload-id>
```

`web/`, `dist/`, Git, browser storage, and WebMCP outputs must never contain original private quote/CAD bytes. A user's downloaded evidence package is a separate deliberate copy; disclose that server retention cannot delete copies the user or supplier keeps.

### 8.2 Tables and integrity rules

| Table | Core fields and constraints |
| --- | --- |
| `quote_schema_migrations` | Applied version/checksum/timestamp; fail startup on unsupported schema |
| `quote_workspaces` | Workspace/owner scope and accepted retention-policy version |
| `design_sources` | Full normalized immutable CAD identity, hash, provenance; unique by workspace/source hash |
| `quote_requests` | Request ID, draft revision, latest frozen revision, optimistic-lock version |
| `quote_request_versions` | Immutable manifest, request hash, source FK, frozen actor/date; unique request/revision |
| `quote_artifacts` | Random ID, private key, original digest/size/type, retention category/dates, availability; no bytes in SQL |
| `request_artifacts` | RFQ-version/artifact/role links including exact file digest |
| `suppliers` | Scoped supplier identity, platform relationship, independence confidence |
| `quote_sources` | Acquisition kind, original artifact FK, supplier-native identifiers, permitted provider account/connection; immutable |
| `quote_drafts` | Mutable transcription, citations, source link, row version; not eligible for comparison |
| `quote_versions` | Immutable reviewed/published content, version/hash, supplier quote/revision/line, RFQ association, supersession relation |
| `quote_review_events` | Append-only review/dispute/association events, actor, action digest, quote hash and source digests |
| `quote_handoffs` | Recipient and RFQ hash, download/user-reported-send/receipt distinction, external-sharing approval reference |
| `quote_comparisons` | Immutable policy/evaluation snapshot, exact included versions/hashes and exclusions |
| `quote_reports` | Immutable sanitized JSON/Markdown, report digest, explicit FEA attachment references if any |
| `quote_jobs` | Durable export/provider job, stage, leases, retries, safe external IDs, bounded errors and next-poll time |
| `quote_approvals` | Session/action digest, nonce hash, expiry, consumed state; never trust client-supplied actor |
| `quote_idempotency` | Workspace/operation/key/request digest/response reference; conflict on key reuse with different content |
| `quote_audit_events` | Append-only scoped events, versions, actors, timestamps, safe metadata; no secrets or raw documents |

Enable SQLite foreign keys on every connection. Use WAL, a bounded busy timeout, short transactions, explicit migrations, scoped indexes, and compare-and-set row versions. All reads and joins enforce workspace/owner scope, including artifacts referenced through another object. UUIDs are not authorization.

Deduplicate network retries by idempotency key and source identity. A repeated file may support multiple legitimate quote lines; do not deduplicate solely by filename or blob digest. If the supplier reuses a quote revision number but changes bytes/content, create a new local evidence version and flag the conflict.

### 8.3 Crash safety and immutable completion

- Stream to staging, hash, safely publish the blob, then finalize its database association. Reconcile orphaned blobs, missing files, and interrupted uploads on restart.
- Lease durable jobs transactionally; only one worker owns each active lease. A completed job cannot generate a second result/report/artifact set under concurrent polling.
- Persist upstream operation IDs as soon as available. On timeout, resume/read the known operation rather than restart an export or import blindly.
- Content/review/report writes use exact version preconditions; concurrent updates return `409 VERSION_CONFLICT`.
- Hash validation on authorized reads detects a tampered blob. Mark it `integrity_failed`; do not silently regenerate or claim it is the original.

### 8.4 Retention and deletion

Retention is category-specific and displayed before ingestion. Previously agreed seven-day CAD retention remains unchanged. The 30-day quotation-source proposal is pending user approval; selecting a longer period is not implicit in requesting a historical view.

Implement a cleanup entry point plus actual invocation: bounded cleanup at server startup, periodic background invocation while running, and a scheduled production job at Q6. It records attempted/completed deletion receipts and propagates unavailable evidence to current comparisons and future report generation. Test the invocation, not merely the cleanup function.

After source deletion:

- Keep historical commercial terms, hashes, past review, and audit references under the metadata policy; do not claim the original is still retrievable.
- New source-verifiable exports/comparisons are blocked or explicitly downgraded; a metadata-only history report must say source unavailable.
- Re-import identical bytes may restore availability only through an authorized ingestion event and accepted retention policy; it does not rewrite past deletion events.
- A changed active design does not delete quotes. A user deletion action is distinct from expiration, withdrawal, supersession, and UI reset.
- Backups and provider-retained copies need their own disclosed retention/deletion policy. Never promise that local cleanup deletes a supplier's copy or all external backups.

## 9. Backend API contracts

Use the existing same-origin Python service. Add quote routing before `serve.py`'s unconditional JSON-body read so binary uploads cannot pass through `read_json`. Apply consistent security/error middleware across quote routes.

### 9.1 Shared rules

- IDs are server-issued; resolve artifacts, source identity, provider account, actor, and ownership server-side.
- Strict schemas reject unknown fields, type coercion, overlong strings, non-finite numbers, unsupported units, and traversal identifiers.
- Mutations require a session, allowed Origin/Host, CSRF token, idempotency key, and exact version precondition where applicable. Real external-sharing/review actions additionally consume the bound challenge.
- JSON bodies are capped at 64 KiB; list queries use cursor pagination (proposed default 25, maximum 100). File bodies have separate streamed limits.
- `201` creates a record, `202` returns a durable job, `409` reports stale/conflicting state, `413` rejects size, `422` reports domain errors; unauthorized object access is not leaked through detail differences.
- Clients receive bounded stable error codes; provider responses, raw paths, customer PII, keys, and presigned URLs never become error text.

### 9.2 Endpoint inventory

| Method and path | Contract and authority |
| --- | --- |
| `GET /api/quotes/capabilities` | Modes, policy/schema versions, allowed operations, readiness blockers; no secrets |
| `POST /api/quote-requests` | Agent/human local draft from controlled requirements and server-resolved source |
| `GET /api/quote-requests` | Authorized paginated current/historical requests for reload/navigation |
| `GET /api/quote-requests/{id}` | Draft/frozen version, manifest, missing requirements, applicability and evidence availability |
| `PATCH /api/quote-requests/{id}/draft` | Exact-version update; editing frozen content forks a draft revision |
| `POST /api/quote-requests/{id}/exports` | Visible human action initiates verified Onshape export job; never supplier sharing |
| `POST /api/quote-approvals/challenges` | Visible UI obtains a session/action/version-bound short-lived challenge |
| `POST /api/quote-requests/{id}/freeze` | Human consumes freeze challenge, binding actual files and requirements |
| `GET /api/quote-requests/{id}/package` | Authorized human download of exact frozen package; record download, not supplier receipt |
| `POST /api/quote-handoffs` | Human records recipient, request hash and attested handoff/receipt; does not send anything |
| `POST /api/quote-artifacts` | Human binary file upload; media/size/scope/retention checked before ingest |
| `GET /api/quote-artifacts/{id}` | Authorized metadata and availability only |
| `GET /api/quote-artifacts/{id}/content` | Human private source download or separately secured preview; no public link |
| `POST /api/quotes/imports` | Human creates transcription draft tied to existing source artifact(s) and RFQ |
| `PATCH /api/quotes/{id}/draft` | Human edits values/citations with exact draft version |
| `POST /api/quotes/{id}/review` | Human challenge confirms immutable quote version plus explicit scope attestation |
| `POST /api/quotes/{id}/events` | Human records dispute, withdrawal evidence, or correction request without altering original terms |
| `GET /api/quotes` | Authorized summaries with explicit real/fixture filtering and pagination |
| `GET /api/quotes/{id}` | Normalized terms, selected immutable version, citations and independent statuses |
| `POST /api/quote-comparisons` | Agent/human computes and saves comparison of exact quote versions against a frozen RFQ |
| `GET /api/quote-comparisons/{id}` | Historical calculation plus separately computed current applicability/validity |
| `POST /api/quote-reports` | Human creates sourcing/comparison export from stored versions; optional separately labeled FEA |
| `GET /api/quote-reports/{id}` | Authorized immutable report download; no bundled originals by default |
| `POST /api/quote-provider-syncs` | Human-authorized Q5 read-only sync of an allowed supplier quote; returns job ID |
| `GET /api/quote-jobs/{id}` | Bounded cached progress; never blocks until upstream completion |
| `POST /api/quote-artifacts/{id}/deletion` | Human-confirmed scoped deletion; receipt and eligibility propagation |

There is no order, payment, supplier submission, or purchase endpoint. If outbound automation is later proposed, it requires a separately reviewed scope and recipient-bound consent contract.

### 9.3 Example comparison response

```json
{
  "ok": true,
  "comparisonId": "cmp-example",
  "policyVersion": "quote-comparison-1.0",
  "requestHash": "sha256-example",
  "evaluatedAt": "2026-09-02T12:00:00Z",
  "outcome": "conditional",
  "ranking": null,
  "offers": [
    {
      "quoteId": "quote-example",
      "version": 1,
      "sourceKind": "supplier_document_upload",
      "reviewStatus": "reviewed",
      "designMatch": "user_attested",
      "validity": "unknown",
      "knownCostTotal": "505.00",
      "landedCostTotal": null,
      "currency": "USD",
      "missingFields": ["shipping.amount", "tax.amount", "validUntil"],
      "caveats": ["Exact CAD association is user-attested, not supplier-confirmed."]
    }
  ],
  "engineeringReadiness": {
    "status": "not_evaluated",
    "manufacturingRelease": false
  }
}
```

The identifiers and numbers above are illustrative, not supplier evidence. For one offer, label this a sourcing assessment with insufficient independent offers for comparative ranking.

## 10. Browser, WebMCP, and evidence export

### 10.1 User interface

Retain `/suppliers` as the entry point, with request, import/review, quote-history, and comparison subviews. Use authorized IDs in routes or server-managed selection to reopen the exact record after reload. Do not persist private source bytes or whole quotations in local/session storage.

Implement the first real workflow on the top-level authenticated workspace. Model Insight and WebMCP call the same bounded server-backed handlers; neither may directly reuse the fictional quote engine for real requests. Remove the real-mode preview/FEA prerequisite when introducing the new request route, not only after building the entire agent layer. Expanded embedded panels are a later surface over these same contracts.

- Empty view: prepare a request, import evidence, or explicitly switch to fictional demo mode.
- One-offer view: usable sourcing report, no invented competitor.
- Import review: source beside transcription, unresolved fields highlighted, citations, precise draft/version status.
- Freeze/review panels: display immutable server values separately from editable fields; reset approval checkboxes/challenges when the draft changes.
- Comparison: cost inclusions, omissions, unit/quantity basis, expiry, lead-time semantics, deviations, and independence visible before price ordering.
- History: previous design/request/quote versions remain accessible with current-basis warnings.
- Engineering panel: no FEA, recorded FEA, stale FEA, or verified live FEA displayed separately. Commercial data never upgrades a recorded run.
- Reset: clear selection; do not delete real objects. Destructive deletion has a separate confirmation and affected-record preview.

Use request-generation tokens and abort signals. Before applying a response, check workspace, request ID/revision and selection generation. A late response for RFQ A cannot replace RFQ B. Refresh tools after the visible state is updated.

### 10.2 Exactly five initial quote tools

| Tool | Required scope/input | Effect and availability |
| --- | --- | --- |
| `get_quote_request_context` | Optional authorized request ID; otherwise active selection | Read server manifest, source identity, missing requirements, and limits; never raw files |
| `prepare_quote_request` | Bounded requirements, expected full source key/draft version | Creates/updates only a local draft; `readOnlyHint: false`; no CAD export or sharing |
| `list_supplier_quotes` | Authorized request/filter/cursor/limit | Read zero-or-more summaries, including exclusions; no broad provider-account listing |
| `get_supplier_quote_details` | Quote ID and immutable version | Read redacted terms, citations, statuses and unknowns; not source bytes or download credentials |
| `compare_supplier_quotes` | Frozen request hash, explicit quote IDs/versions, allowed policy | Persists a local deterministic comparison; `readOnlyHint: false`; no winner selection or purchase |

Mark provider/document strings as untrusted content; strict `additionalProperties: false` schemas and server validation both apply. Schema enums/IDs may narrow choices but never substitute for access checks. Tool errors remain structured and bounded.

No tool selects local files, confirms transcription, attests supplier scope, freezes/shares an RFQ, consumes review challenges, deletes originals, starts supplier sync, or purchases. Humans use visible controls for these operations. ChatGPT may explain a comparison even when ranking is blocked, but must repeat the material limitations returned by the backend.

### 10.3 Reports and existing schema compatibility

- Introduce `sourcing-report-1.0` for zero/one/many evidence records and `quote-comparison-1.0` for deterministic comparisons. Reports reference exact RFQ/quote/content hashes, source availability, field citations, review events, exclusions, and policy/evaluation versions.
- Existing demo review schema `1.2.0` stays readable and labeled fictional/recorded. Do not migrate old fixtures into real supplier records.
- Extend the aggregate manufacturing-review schema only through an explicit new version. Include a sourcing section without requiring an invented proposal or completed simulation; missing engineering evidence is an explicit incomplete engineering section, not an export failure for the sourcing report.
- Generate JSON/Markdown from the same server-computed values; no independent browser price arithmetic.
- Include only scoped review/audit events and deliberately selected FEA references. Default reports omit customer contacts, raw source files, private locations, API tokens, and signed URLs.
- Escape hostile strings, links and Markdown. CSV is deferred; if later introduced, add spreadsheet formula-injection protection.
- Carry discovery review state, actual variable/native feature references, applicable/skipped rule coverage, material/process source and unresolved assumptions into aggregate reports. Keep inferred measurements distinct from reviewed geometry and supplier-confirmed scope; do not turn the partner's role names into invented native face/feature IDs.

### 10.4 Invalidation matrix

| Event | RFQ/quotes | Comparison/report behavior |
| --- | --- | --- |
| New actual CAD, configuration or selected part | New request revision; old quotes historical/different basis | Current comparison invalidated; history retained |
| Changed quantity/material/finish/tolerance/inspection/delivery basis | New request hash and review | Require renewed scope match; do not reuse a price break implicitly |
| Approved visual preview only | Actual RFQ unchanged | Show preview separately; no claim it was priced |
| New FEA result, same manufacturing request | Quote applicability unchanged | Refresh engineering attachment only; old combined report remains historical |
| Supplier correction/revision | New quote version, old preserved | Compare explicit versions; invalidate current latest-version selection |
| Expiration/withdrawal | Original content preserved | Re-evaluate present eligibility; do not rewrite historical results |
| Source expiry/deletion/tampering | Terms/history retained, source availability downgraded | Block new source-verifiable ranking/export as policy requires |
| Browser reload/reset | Stored objects unchanged | Restore exact IDs/version or clear view only |
| Re-import/source retry | Idempotent retry or explicit new evidence event | No duplicate version or fabricated new supplier |

## 11. Security, reliability, and supplier adapter boundary

### 11.1 Minimum protections before any real local evidence

- Bind local server to loopback; validate Host and Origin, including DNS-rebinding tests. Use a server-established local session, CSRF protection and explicit workspace scope. Do not expose bootstrap/session secrets in tool output or logs.
- Validate authorization on every object and artifact operation. Keep source viewing/review actions separate from agent-visible redacted summaries.
- Serve source bytes with `no-store`, `nosniff`, controlled content type and download disposition by default. For side-by-side PDF display, use a restrictive isolated preview boundary and a private-download fallback if the browser cannot render it safely.
- A PDF signature is not a malware scan. Never execute embedded scripts, auto-fetch remote PDF resources, or render uploaded HTML on the application origin. Parser/preview dependencies and scanning policy must be tested before hosted real uploads.
- Audit UI must use text rendering; fix existing unescaped audit-summary HTML before introducing supplier strings. Check filenames, notes, errors, quote titles, citations and report titles.
- Pin upstream API origins and validate every redirect hop; reject off-origin API redirects or strip credentials under an explicitly allowed artifact-download policy. Validate final host/address and HTTPS, and prevent private-network fetches. Do not accept arbitrary caller URLs.
- Keep provider keys server-side and never in source fixtures. Record only sanitized error codes and opaque operation IDs in logs.
- Enforce storage quotas, file/JSON limits, bounded concurrency, per-session upload/sync rates, and disk-full behavior. Proposed local defaults: one active provider job and one export per workspace; tune from measured behavior.

### 11.2 Durable provider jobs and read-only adapter

Provider interface: `capabilities()`, `fetch_authorized_quote(reference)`, `fetch_authorized_artifact(reference)`, and `normalize(source)`. Calls accept server-resolved allowed connection/quote references, not arbitrary URLs. They return original evidence plus a normalized draft, never `reviewed` status.

Job lifecycle: `QUEUED → FETCHING → STORING → NORMALIZING → AWAITING_REVIEW → COMPLETE`, with `FAILED` and explicit cancellation for safe stages. Completion means import processing completed, not supplier approval or confirmed terms. UI/tool status reads use cached job state and never block until the provider finishes.

- Store stage, safe external IDs, attempt count, lease expiry, `nextPollAt`, and last sanitized error.
- Retry only safe reads for transient network errors, 429 and selected 5xx; obey bounded `Retry-After` with exponential backoff and jitter. Authentication/schema/scope errors fail without automatic retries.
- Recover after process restart using the existing job. Concurrent syncs for the same authorized quote share idempotency/lease protection.
- Preserve native quote/revision/line IDs, original dates and declared offer semantics. Missing fields remain unknown, even if the provider UI usually displays them.
- Error or missing access never falls back to fictional prices in real mode. Manual import remains separately available.
- First successful API result must be human-compared with the source system before broadening access. Do not list or ingest a shop's whole customer history.

The candidate's [official Paperless Parts reference](https://docs.paperlessparts.com/) must be checked with the authorized account at Q5. Public documentation does not establish that our account can retrieve quotes, supporting files, or buyer-side RFQs. Do not freeze unverified endpoint paths from document 07 into production code; obtain the current permitted API contract and sanitized account-backed fixtures first.

## 12. Repository implementation map

All paths below are proposed work, not files created by this planning document. Prefer small modules with tests over adding all quote logic to `serve.py` or `app.js`.

```text
contracts/quotes/
  rfq-manifest-1.0.json             Machine-readable request schema
  quote-evidence-1.0.json           Terms, source and citation schema
  comparison-1.0.json              Eligibility, arithmetic and report contract

scripts/
  design_identity.py              Full-source identity and canonicalization
  quote_service.py                Domain operations and action preconditions
  quote_store.py                  SQLite migrations, versions, audit, leases
  quote_artifacts.py              Streaming quarantine/private artifact lifecycle
  quote_normalization.py          Decimal strings, money/term parsing and validation
  quote_comparison.py             Compatibility, totals, validity, completeness
  quote_reports.py                Immutable server JSON/Markdown reports
  quote_cleanup.py                Dry-run and real scoped retention cleanup
  quote_jobs.py                   Resumable export/sync work and bounded polling
  quote_security.py               Shared sessions/scope/CSRF/action challenges
  quote_providers/
    base.py                       Source adapter interface; no comparison arithmetic
    documents.py                  Human-upload source adapter
    paperless.py                  Q5 only, if this provider is actually selected

web/
  quote-client.js                 Typed same-origin contracts and errors
  quote-state.js                  Server-backed IDs, reload and race protection
  quote-ui.js                     RFQ, original/source review, history, comparison
  quote-fixture-provider.js       Explicit wrapper around existing fictional engine

tests/
  test_quote_identity.py          Full scope, revisions, hashing, Decimal boundaries
  test_quote_store.py             Migrations, concurrency, idempotency, recovery
  test_quote_artifacts.py         Integrity, quotas, deletion and cleanup invocation
  test_quote_service.py           Real HTTP contracts against temporary local store
  test_quote_comparison.py        Scope/cost/validity policy cases
  test_quote_security.py          Object access, CSRF, origins, injection, redirects
  test_quote_providers.py         Mock and sanitized permitted provider contracts
  js/quote-evidence.mjs           Execute actual browser state and WebMCP handlers
  fixtures/quotes/                Synthetic or properly sanitized fixtures only
  evals/quote-webmcp-prompts.json  Authority, unknowns and mixed-evidence exercises

docs/
  supplier-quote-setup.md          Local configuration and approved source workflow
  supplier-quote-retention.md     Accepted policy, deletion and backup limitations
  supplier-quote-acceptance.md    Gate evidence and reproducible demonstration
```

Modify `scripts/serve.py` for routes and security integration; `web/app.js`, `web/styles.css` and `web/index.html` for views; `web/state.js` and `web/webmcp.js` for independent quote state/tools; and `web/review-package.js` for evidence-specific reporting. Adjust existing supplier/review tests deliberately without removing the fixture tests.

Extend the partner's `web/insight-assistant.js` and `web/insight-engine.js` only to consume the new quote/FEA readiness contracts and exact source/record versions. Update `web/onshape-discovery.js`, `web/onshape-adapter.js`, `web/onshape-client.js` and `web/onshape-extension.js` for reviewed provenance and context consistency. Use one shared `scripts/design_identity.py` for FEA and quotations, not a second competing identity module.

Preserve the valid allowlisting, identifier validation and read-only intent of `functions/api/onshape/design.js`, while correcting S0 context/test-contract defects and keeping parity with Python. If shared identity changes affect FEA, keep old FEA records as legacy evidence with their old identity version; do not silently rehash or upgrade them to exact-source evidence. Add a migration note and compatibility tests.

Proposed configuration, added only during implementation:

- `QUOTE_MODE=fixture|evidence_local|api_readonly` — explicit capability mode, never selected from a tool input.
- `QUOTE_RUNTIME_DIR` — server-controlled root outside static output.
- `QUOTE_RETENTION_POLICY_VERSION`, `QUOTE_PDF_RETENTION_DAYS` — accepted policy required for real uploads; no silent proposed default.
- `QUOTE_MAX_PDF_BYTES`, `QUOTE_MAX_JSON_BYTES`, `QUOTE_MAX_CAD_BYTES`, `QUOTE_MAX_STORAGE_BYTES`.
- `QUOTE_MAX_CONCURRENT_JOBS`, `QUOTE_PROVIDER_TIMEOUT_SECONDS`, `QUOTE_CLEANUP_INTERVAL_SECONDS`.
- `QUOTE_PROVIDER_CONNECTION_ID` and server-side provider secret references — only after Q5 access is secured.

Development remains uv-managed. No pip/npm installation, OCR service, supplier SDK, or new cloud account is required for Q0–Q4. If a production server, secure PDF parser, or provider library is later necessary, document the reason and add it through `pyproject.toml`/`uv.lock` only after the deployment choice is accepted. Node remains the JavaScript test runtime, not a second application backend.

## 13. Seven verification gates

Each gate has a software checkpoint and, where applicable, a real-evidence checkpoint. Passing mocked code tests does not satisfy an account-backed or human-evidence exit condition. Commit boundaries follow validated gates during implementation; real evidence and secrets never enter those commits. This planning turn creates no application commits or supplier actions.

### Q0 — Contract, source selection, and safe foundations

**Dependencies:** approval to begin implementation and S0 for executable changes; supplier evidence may remain pending. Account/source planning can proceed alongside S0 without sending files or accepting documents.

1. Q0.1 Record the reconciled partner baseline and S0 regression results; preserve existing uncommitted user files and the fixture path. Define real quote state as independent of preview approval and FEA completion from its first endpoint.
2. Q0.2 Freeze the proposed domain enums, null/unknown conventions, Decimal/canonicalization rules, limits, and error envelopes in contract files.
3. Q0.3 Implement scoped local sessions, Origin/Host/CSRF checks, action challenges, and text-safe audit rendering before accepting any real document.
4. Q0.4 Add quote database migrations, private-directory configuration, foreign keys, version checks, and durable audit/idempotency primitives.
5. Q0.5 Identify the first real supplier/evidence source and a human acquisition owner; record selected or pending, expected required package and response status. Prepare a human-readable RFQ/handoff checklist early, but do not contact the supplier or disclose CAD without explicit approval and a frozen package.
6. Q0.6 Present and record the quotation-source retention decision. Synthetic ingestion remains available while the real policy is undecided.

**Verification:** schema unknown-field/type tests; fresh and existing-database migration tests; wrong-workspace access; rejected forged actor/challenge; fixture-only behavior unchanged; no secrets/private artifacts in the static build.

**Exit:** contracts and minimum local security are executable/tested; source and retention dependencies are explicit. No claim of a real quotation yet.

### Q1 — Full CAD identity and frozen RFQ package

**Dependencies:** Q0 software; authorized Onshape access and an existing suitable immutable version for the real exit.

1. Q1.1 Implement full source keys and display-only short labels; reject missing revision/configuration/selected-part information.
2. Q1.2 Correct and freeze the supported Onshape export contract, version-to-microversion validation, configured part selection, units, settings, and redirect handling.
3. Q1.3 Persist export jobs and provider IDs; stage and hash STEP/drawing artifacts; enforce seven-day CAD retention with real cleanup invocation.
4. Q1.4 Implement the manufacturing-requirement draft form and server validators; never inherit fixture material or price assumptions silently in real mode. Use a new real-evidence route/state independent of the legacy preview/FEA prerequisite; adaptive variable mappings only prefill explicitly unreviewed suggestions.
5. Q1.5 Add read-only frozen-manifest review and atomic freeze challenges bound to exact inputs/artifacts. Fork new revisions for changes.
6. Q1.6 Add deliberate package download and separate user-reported handoff/recipient evidence; no automatic supplier sends.
7. Q1.7 Add current/historical request retrieval and test revision changes during export/review, including an expressly chosen historical package.

**Verification:** same-prefix microversions and different elements cannot collide; equivalent decimal formatting is stable; each manufacturing change alters identity; preview approval cannot alter RFQ geometry; delayed old responses cannot replace new selection; invalid export provenance blocks freeze; missing artifacts block handoff.

**Software exit:** synthetic export fixtures prove full request lifecycle and failure handling.

**Real exit:** one actual immutable Onshape export is tied to reviewed requirements and retrievable original files with matching digests. Without account access, leave this exit pending and continue synthetic Q2 work only.

### Q2 — Original evidence, manual transcription, and reviewed versions

**Dependencies:** Q0 security/policy and Q1 request contracts. Real exit additionally needs a real RFQ and permitted supplier source.

1. Q2.1 Branch upload routing before JSON parsing; implement streamed upload quotas, quarantine, media checks, digesting, private storage, and crash reconciliation.
2. Q2.2 Build supplier/source identities and quote drafts, including date ambiguity, line items, charge coverage, raw values, explicit unknowns, and citations.
3. Q2.3 Build source-beside-form review with secure PDF behavior/download fallback. Human sees exactly which field and quote version is being reviewed.
4. Q2.4 Separate transcription review from supplier-confirmed/user-attested/unresolved design matching. Capture evidence per critical scope field.
5. Q2.5 Implement immutable quote versions, review/dispute events, new versions for corrections, and explicit supplier-revision conflicts.
6. Q2.6 Implement history/reopen and duplicate-import rules; separate estimates and fixtures from supplier-issued evidence.
7. Q2.7 Verify that retention/deletion changes source availability and downstream eligibility while preserving historical metadata honestly.

**Verification:** altered bytes, unsafe filename, wrong media, empty/oversized upload, forged API-origin JSON, absent evidence, page-reference limits, repeated source supporting two lines, two simultaneous reviewers, source expiry/re-import, and session/owner isolation.

**Software exit:** a synthetic source supports complete pending → reviewed → superseded/disputed flows and restart recovery.

**Real exit:** one original supplier-issued quote is preserved privately and every material price/term is cited, reviewed, or explicitly unknown. The supplier/reference/issue date and requested part/quantity basis are recorded; a request acknowledgment, generic calculator estimate, sample PDF or fabricated supplier does not pass. The design-match qualification is visible throughout. A reviewed user-attested association can support a qualified real-quote report; it is not supplier confirmation or an automatically eligible comparison.

### Q3 — Compatible comparison and correct cost semantics

**Dependencies:** Q2 evidence/version contracts.

1. Q3.1 Implement the eligibility policy with field-by-field scope checks and explicit supplier-independence handling.
2. Q3.2 Implement authoritative `Decimal` extension, included/separate fees, discounts/minimums where supported, currency checks, and supplier-total reconciliation.
3. Q3.3 Implement known-total versus landed-total rules, explicit unknown/excluded charges, and no unquoted quantity extrapolation.
4. Q3.4 Implement validity projections and lead-time semantics without inventing dates or transit times.
5. Q3.5 Persist comparisons using exact request/quote versions, evaluation time, policy, rankings or null, exclusions and caveats.
6. Q3.6 Build zero/one/many-offer UI and conditional/blocking explanations. Keep real and fixture comparisons separate.
7. Q3.7 Add refresh/re-evaluation on supplier revision, expiry, withdrawal, request change, or evidence loss; preserve old comparisons.

**Verification:** unknown shipping never equals zero; excluded tax prevents landed total; included setup is not double-counted; differing quantities/units/currencies/material/tolerance/finish are not ranked; duplicate supplier versions do not count as competitors; expiry/timezone ambiguity and partial totals remain qualified.

**Exit:** two synthetic offers produce reproducible arithmetic and truthful eligibility, including all adverse cases. Real-comparison acceptance additionally requires two actual independent compatible offers; one real quote plus one fixture cannot pass.

### Q4 — WebMCP, reports, and separation from FEA

**Dependencies:** Q1–Q3 software interfaces; real demonstration depends on Q2/Q3 real exits.

1. Q4.1 Register the five scoped quote tools with strict schemas, correct mutating/read-only annotations, redaction, and shared handlers for manual controls.
2. Q4.2 Add durable selected-record restoration, version-aware browser state, abort/generation guards, and correct tool refresh after state changes.
3. Q4.3 Verify that the real-mode separation introduced at Q0/Q1 holds in the top-level UI, Model Insight, WebMCP and reports: no preview/FEA prerequisites for real quote preparation. Preserve the legacy fictional demo path under its own mode, and gate unsupported embedded actions instead of leaving enabled dead ends.
4. Q4.4 Decouple real quote identity/lifetime from FEA result hashes; keep exact FEA references only in separately labeled aggregate report sections.
5. Q4.5 Generate server JSON/Markdown sourcing reports from stored versions; add one-quote/history exports and source-availability warnings.
6. Q4.6 Extend aggregate review schema explicitly and retain the old schema reader/fixture labels.
7. Q4.7 Add adversarial WebMCP and Model Insight evaluations for fake suppliers, missing prices, old revisions, attempted approval/sharing/purchasing, and instructions embedded in supplier notes. Verify that quote questions cannot route to the fictional engine in real-evidence mode.

**Verification:** actual JavaScript + temporary Python HTTP service, not source-text assertions alone; prepare through agent then inspect identical human values; approval unavailable to tools; reload exact version; real quote beside recorded FEA stays separately labeled; new FEA result leaves commercial quote current; JSON and Markdown totals/caveats match server data.

**Exit:** local manual-evidence workflow is complete end to end. This is the real-quotation delivery slice alongside the primary SimScale work; Q5 is not required to use it. Source access must still be real before claiming the real-evidence milestone. One genuine quote passes the first-quote outcome; only two independent compatible actual offers pass the real-comparison outcome.

### Q5 — One authorized, read-only supplier API adapter

**Dependencies:** Q0–Q4 and explicit provider/account/quote access. This gate may remain pending without blocking manual import.

1. Q5.1 Confirm the selected provider, participating shop, account entitlement, allowed quote IDs, credential handling, retention permission, and current endpoint schemas.
2. Q5.2 Capture a permitted real response/supporting file and sanitize test fixtures. Verify what constitutes a quote versus estimate and what associates it with submitted CAD.
3. Q5.3 Implement fixed-origin client, scoped quote references, bounded body/download limits, redirect protection, and safe error mapping.
4. Q5.4 Implement durable read-only sync jobs, bounded retries/backoff, restart recovery and duplicate-job protection.
5. Q5.5 Map response evidence into the same source/draft/version contract used by document imports; unresolved fields stay unknown and API source never auto-approves review.
6. Q5.6 Compare normalized amounts, charges, scope, dates, native IDs and attachments with the provider's actual displayed quote.
7. Q5.7 Enable only the verified connection/quote scope. Keep other providers disabled; provider failure does not relabel fixture data.

**Verification:** auth denial, forbidden quote ID, upstream schema drift, missing terms, 429/5xx, redirected downloads, timeouts, duplicate sync, revised source under reused revision number, restart, and source/UI parity.

**Exit:** one allowed API quote reaches the same reviewed comparison/report path without a new pricing engine or weakened trust states. If access is unavailable, report Q5 as access-pending, not complete.

### Q6 — Hosted security, retention, and release acceptance

**Dependencies:** Q0–Q4; Q5 only if the release claims API acquisition. User must select/approve deployment, authentication, storage and retention arrangements.

1. Q6.1 Choose a production Python serving layer and authentication boundary with uv-managed dependencies as needed; do not expose the stdlib development server as a public private-data service.
2. Q6.2 Provision only approved persistent storage/backup infrastructure. Keep the database and artifacts together consistently; no ephemeral-disk-only production claims.
3. Q6.3 Verify authenticated sessions, object-level access, CSRF, TLS/headers, file preview/download isolation, upload scanning policy, quotas and per-connection provider scope.
4. Q6.4 Deploy and prove actual quote APIs, not only frontend HTML. If frontend and Python are split, use an approved same-origin gateway and retain private responses/headers.
5. Q6.5 Prove scheduled retention, deletion receipts, restart/crash recovery and database-plus-blob restore. Show what backups/supplier copies retain.
6. Q6.6 Run real browser/manual/WebMCP acceptance on the public origin and another browser/profile; inspect for leaked files/tokens and mixed fixture/real labels.
7. Q6.7 Update setup, retention, acceptance notes, screenshots/demo and feature-freeze documentation with measured results and unresolved gates.
8. Q6.8 Test rollback: disable real/API capabilities, keep history accessible to authorized users, stop new jobs safely, and do not drop data or rewrite source types.

**Exit:** authorized real evidence is usable through the deployed workflow, unrelated users cannot retrieve it, retention/recovery work, and every release claim matches recorded evidence. A public fixture-only demo can ship separately but does not satisfy this real-data exit.

## 14. Verification matrix and evidence required

| Category | Required scenarios | Passing evidence |
| --- | --- | --- |
| Full identity | Different documents/elements, same short-prefix revision, missing microversion, configuration/body change | Distinct full keys; malformed/unknown real identity rejected |
| RFQ scope | Quantity/material/finish/tolerance/inspection/delivery changes; unchanged preview | Appropriate new request hash; preview excluded |
| Canonicalization | Equivalent decimal formats, small decimals, units, nulls, key order | Server hashes stable; browser uses server digest; no numeric mismatch |
| CAD export | Unsupported path, wrong version mapping, multi-body ambiguity, failed/oversized export | No real freeze on uncertain geometry; supported actual export trace |
| Money | Decimal precision, included setup, discounts, packs/lots, price breaks, minimum charges | Frozen expected totals or explicit unsupported basis; no silent approximation |
| Unknown costs | Missing shipping, excluded tax, ambiguous inclusion, mismatched supplier total | Null landed total and explicit discrepancy/gaps; no automatic zero |
| Compatibility | Different specifications, expired/withdrawn, user-attested scope, same supplier twice | Correct eligible/conditional/blocked status and explanation |
| Evidence | File tampering, duplicate upload, JSON claiming API origin, lost original | Correct provenance/integrity and no source promotion |
| Review | Changed draft after challenge, stale reviewer, forged actor, disputed/superseded version | Version conflict and immutable audit; old approval never applies to new content |
| Persistence | Reload, server restart, simultaneous comparison creation/completion, disk full | Exact records restored or safe failure; no two outputs under one immutable version |
| Retention | Past-due blobs during normal operation, orphan staging, re-import, backup restore | Scheduled invocation/deletion receipts and availability propagation |
| FEA separation | No FEA, recorded FEA, new FEA same RFQ, changed real CAD | Commercial availability independent; engineering labels never upgraded |
| WebMCP | Scope-specific tools, injected supplier instructions, attempted review/send/order | Bounded evidence responses; no consequential authority path |
| Security | Wrong owner, forged Host/Origin, CSRF, traversal, hostile filenames/text, redirect key leakage | Access denied/safe rendering; no secrets/raw data in logs/build/tool output |
| Provider | Access denial, schema drift, throttling, timeout, allowed quote scope, source parity | Explicit errors, safe retries/recovery, identical normalized terms |
| Reports | One quote, multiple versions, missing source, mixed evidence, expiration after generation | Immutable historical report plus separate current warnings; equal server totals |
| Deployment | Frontend-only host, missing backend/storage, cross-profile access, restart/restore | Real mode disabled unless full backend/security/storage checks pass |

Extend the uv test/check/build workflow. The old `cb88682` baseline had 114 Python and 8 JavaScript tests; the reviewed partner snapshot has 134 Python tests and the same 8 JavaScript checks, with the failures recorded in section 2.1. S0 must establish a passing normal-command baseline before implementation gates claim regression safety. Do not count the diagnostic Node-flag workaround or a static build as a successful release test. Add actual JavaScript state/contract tests, cross-language HTTP tests, and browser walkthroughs; do not replace behavioral tests with string searches.

Proposed verification commands after each implementation gate:

```text
uv run python -m unittest discover -s tests
uv run python scripts/check.py
uv run python scripts/build.py
uv run python scripts/quote_cleanup.py --dry-run
```

The cleanup command does not exist yet; implement it at Q1/Q2 before using it. New JavaScript test entry points must be added to `scripts/check.py` and CI. Account-backed parity tests should be opt-in, narrowly scoped and read-only; they are not satisfied by mock fixtures.

Store gate records with code revision, executed tests, fixture/provider mode, evidence IDs/hashes, reviewer, date and pending dependencies. Keep raw real evidence in private storage, not the gate record committed to Git.

## 15. Sourcing rollout, dependencies, and stop conditions

```text
Q0 contracts/security
         |
Q1 exact RFQ ──> Q2 source/review ──> Q3 comparisons ──> Q4 tools/reports
                                                          |         |
                                               Q5 API access     Q6 release
                                               (conditional)    (mandatory
                                                                for hosted
                                                                real data)
```

This diagram orders the sourcing lane only. Overall priority is S0 and shared identity/security, then live SimScale execution and numerical verification as the main engineering track, with real RFQ preparation/acquisition and evidence handling advancing independently. Supplier API work begins only when access is secured; it must not delay the first genuine quote. Hosting decisions can be prepared earlier but are not silently approved and do not block a secure local outcome.

The FEA work shares the identity, authorization, artifact-policy, and browser-context foundation, then proceeds independently through F0–F6. Section 22 gives the combined order; quoting does not wait for a completed stress simulation.

Size guidance: Q0 and Q3 are primarily contract/validation work; Q1, Q2 and Q4 are substantial integration work; Q5 varies with provider access and response quality; Q6 varies with deployment choices. Do not convert supplier onboarding or manual quote turnaround into an engineering completion date. Estimate calendar duration only after Q0 resolves source/export/retention choices.

Stop the affected real-operation gate when any of these is true:

- Export provenance cannot be established for the exact requested CAD/configuration/part.
- Original quote retention is not permitted or its policy has not been accepted.
- Supplier/API access is not explicitly granted for the relevant quote/account.
- Provider response meaning or scope association is ambiguous.
- The hosted backend lacks identity, owner-scoped access, durable storage, or working deletion.
- A requested action would send CAD, accept terms, place an order, or broaden account access beyond the reviewed release scope.

Continue safe synthetic development where independent. Do not bypass a stopped gate by guessing facts, using fixture prices as real output, rewriting an old approval, or silently extending retention.

Rollback is feature-gated and non-destructive: turn off real acquisition/API sync, retain authorized read-only history, cancel only safe queued reads, preserve native operation IDs, and use backed-up forward-compatible database migrations. Never downgrade real evidence into a fixture label to hide failures or erase reviewed versions to make a migration pass.

## 16. Proposed approvals and sourcing acceptance checklist

The implementation approach is ready for review. Before real operation, confirm:

1. The first supplier/quote source and authority to retain its original evidence.
2. The actual Onshape version/configuration/part to quote and whether a new immutable version needs a separate human action.
3. The original-quote retention period; 30 days is proposed, while seven-day CAD retention remains in force.
4. The one API provider/account and allowed quote scope, if/when access becomes available.
5. The hosting, identity, private storage and backup policy before any public real-data rollout.
6. For FEA: the private SimScale project/account, engineer/reviewer, permitted CAD transfer, and an explicit verification-run budget. These are separate from supplier-sharing approval; see section 22.

These are execution dependencies, not reasons to invent details in this plan or to begin implementation without a subsequent instruction.

Final acceptance:

- [ ] Actual RFQ identity includes full Onshape source plus exact STEP/drawing digests and manufacturing requirements.
- [ ] Preview changes cannot be mistaken for committed/exported CAD.
- [ ] Original supplier evidence is privately retained with integrity, availability and retention status.
- [ ] Every consequential transcribed field is cited, reviewed or explicitly unknown.
- [ ] Source, review, design match, applicability, validity, completeness and evidence availability stay independent.
- [ ] Compatible comparisons use server Decimal arithmetic and never treat missing costs as zero.
- [ ] One quote remains one quote; fixtures, estimates and duplicate supplier versions cannot manufacture competition.
- [ ] Historical quotes/reports survive design changes without being presented as current evidence.
- [ ] Quote availability is independent of FEA; recorded stress evidence remains indeterminate.
- [ ] Five quotation WebMCP tools assist preparation/inspection/comparison without review, sharing or purchasing authority; the five FEA tools have their own bounded contracts.
- [ ] Reloads, concurrent operations, expiry cleanup and restore are tested behaviorally.
- [ ] The selected API adapter, if claimed, is authorized and parity-verified through the same evidence format.
- [ ] Real hosted operation passes security/storage/API gates; a static-only fixture demo is labeled accordingly.

The following engineering completion track is part of this same integration plan, not a prerequisite that blocks the independent sourcing workflow.

## 17. FEA/SimScale gap register and completion boundaries

### 17.1 What exists versus what still needs work

The repository contains a bounded FEA domain, recorded results, a SQLite study store, browser controls, five FEA WebMCP handlers, an account probe, and isolated Onshape/SimScale transport clients. `FeaService` currently accepts only `recorded` or `disabled`; selecting `simscale` raises `FEA_PROVIDER_NOT_IMPLEMENTED`. It does not yet create, execute, or retrieve a live structural simulation. Recorded numerical values are synthetic workflow fixtures, not values calculated from the user's load.

The following findings from the baseline review become explicit implementation tasks. “Existing” does not mean sufficiently hardened for real data or paid computation.

| Priority | Finding and affected area | Required correction | Verification gate |
| --- | --- | --- | --- |
| P0: before real operation | Shortened Onshape revision identity can collide; a missing microversion can become `unknown` | Share full source identity across CAD, RFQ, study, browser, agent context, and reports; fail closed for unresolved real sources | F1 / Q1 |
| P0 | The isolated STEP translation client constructs an unverified `/m/` translation route | Use a supported immutable-version export contract; prove that its configuration/part resolves to the approved full microversion and actual STEP bytes | F1 |
| P0 | Browser/server JSON hashing differs for valid small numeric values | Server-authoritative versioned canonical manifests, explicit decimal normalization, and cross-language contract tests | F1 |
| P0 | A study becomes stale while its stored result can still say `current`; browser responses can restore old context | Separate immutable evidence from current applicability; scope it to the active project/source and guard asynchronous responses | F1, F4 |
| P0 | Concurrent recorded completion can write different result hashes/artifact records for one run | Atomic finalization, per-run uniqueness, durable operation state, and conflict-safe artifact publication | F1, F3 |
| P0 | Default HTTP redirect handling can forward credentials beyond the intended origin | Separate authenticated API and unsigned artifact clients; validate every destination/redirect, size, timeout, and scheme | F1, F2 |
| P0 | Visible approval does not display the complete frozen setup; backend assertions are not authenticated human authority | Two-stage, authenticated, expiring, hash-bound transfer/solve approvals with full setup review and budget bounds | F3 |
| P0 | Simulation setup, meshing, run creation/start, and numerical-result normalization are absent | Implement an account-verified live provider end to end; no fixture substitution | F2–F5 |
| P1: required for completion | Reload initializes capabilities but does not restore a study; active-snapshot invalidation is global | Owner/project-scoped list/detail/restoration and per-view applicability; one user's navigation cannot invalidate another user's work | F1, F4 |
| P1 | Cleanup exists but is not invoked by normal runtime | Startup catch-up plus scheduled cleanup, expiry enforcement on reads, deletion receipts, and monitoring | F1, F6 |
| P1 | Local/browser audit and status polling do not constitute a durable live job system | Persist approvals, attempts, provider IDs, events, leases, reconciliation, and terminal results | F3 |
| P1 | Result comparison trusts a live/verified label without a full applicability/quality check | One backend assessment policy; missing, stale, incompatible, nonconverged, or unverified evidence is indeterminate | F4, F5 |
| P1 | Public static hosting has no Python FEA backend | Deploy approved authenticated Python/storage infrastructure and prove actual API operation, or retain local-only/fixture-only labeling | F6 |

The P0/P1 labels sequence work; they do not waive any F-gate exit. Preserve regression cases for each finding before the corresponding fix, including small-direction components such as `-0.000001`, same-prefix revision IDs, concurrent result reads, and an expired artifact after eight simulated days.

### 17.2 What “fully functional” must mean

- An actual supported Onshape source is frozen and exported without substituting the preview or a newer mutable workspace.
- A human authorizes CAD disclosure to the named private SimScale project, then checks imported geometry and the exact solver setup before separately authorizing computation.
- The backend imports, maps, validates, meshes, starts, monitors, and retrieves results without a browser tab having to remain open.
- Reload, network failure, provider throttling, service restart, duplicate clicks, cancellation, and late responses do not lose lineage or launch unintended duplicate runs.
- Stress, displacement, reactions, mesh evidence, warnings, units, and run provenance can be inspected in DatumFlow and traced to the native provider record.
- The supported numerical workflow passes section 21, with current-run checks and human engineering review. Passing a benchmark does not certify arbitrary geometry or real-world boundary conditions.
- Changed CAD/setup never silently inherits approval or applicable results. Historical evidence remains available subject to retention, with clear stale/expired labels.
- Local completion and public deployment completion are reported separately. Both remain independent of quote provenance and pricing.

## 18. FEA architecture, contracts, storage, and authority

### 18.1 Shared foundation without coupling quote and FEA lifecycles

Implement one reusable source-identity, hashing, authorization, safe-HTTP, and artifact-policy layer. Q1 and F1 consume it; neither should maintain a competing definition of the same design. Keep commercial requirements and engineering setup in separate manifests and hashes.

```text
Frozen Onshape source + exact STEP digest
             |                              |
      RFQ requirements                 FEA input draft
             |                              |
    Supplier evidence/review         Human transfer approval
             |                              |
    Commercial comparison           Import + topology mapping
                                            |
                                 Solver setup + read-back
                                            |
                                  Human solve approval
                                            |
                                  Durable mesh/run jobs
                                            |
                                 Raw + normalized results
                                            |
                                Numerical checks + review
             |                              |
             +------ Separate report sections ------+
```

Reuse a private exported artifact only when full source identity, export settings, selected body, bytes, authorization, and expiry agree. Reuse does not extend the seven-day expiry or authorize another recipient. If separate quote/FEA stores reference the same artifact, designate one artifact catalog as owner and use scoped references; do not pretend a transaction spans two SQLite databases. Use durable application events/reconciliation for cross-store references. A new export with different bytes gets a new receipt and explicit mapping, even when its source version is unchanged.

Proposed initial operation: one local Python service/worker instance, one active live run per project, and a bounded queue. Use SQLite migrations, foreign-key enforcement, WAL where appropriate, short transactions, optimistic record versions, and a busy timeout. A multi-host worker/database redesign is out of scope; revisit it before horizontal scaling. Do not require Redis, npm, a new cloud provider, or a large scientific dependency stack for the initial adapter.

### 18.2 Versioned records and hashes

Introduce proposed `fea-study-2.0.0` and `fea-result-2.0.0` contracts; retain readers for existing recorded records. Final field names are frozen at F0, before implementation. Required records:

| Record | Required contents and invariant |
| --- | --- |
| Source/export receipt | Owner/project, Onshape document/element/version/full microversion, canonical configuration, selected part IDs, export options/units, translation ID, export time, STEP SHA-256/size/artifact ID; never a shortened display label as identity |
| Input draft | Source receipt reference, explicit material properties/source/version, load magnitude/unit/direction/coordinate frame, support/selection intent, mesh policy, result controls, acceptance requirements, template/schema versions |
| Import/mapping receipt | Provider connection/project, storage/import/CAD/CAD-state IDs, geometry units/dimensions/body count, resolved entity IDs/types for each named region, topology digest and human mapping review |
| Frozen solve manifest | Draft plus verified import/mapping, exact solver/mesh specifications, provider/schema/template versions, check/read-back digests, requirements, and approved resource envelope; no mutable CAD aliases |
| Approval | Authenticated actor, action type, exact reviewed hashes/record version, connection/project/recipient, issued/expiry time, one-use challenge, permitted operations/run count/resource limit; server-owned audit identity |
| Job/run attempt | Study/run-attempt ID, action stage, provider operation IDs, expected hashes, lease/version, retry/reconciliation state, deadline, sanitized error, approved budget reference; no secrets |
| Result | Native project/simulation/run IDs, exact run-spec/mesh/source references, provider timestamps, raw artifact digests, normalized metrics and units, extraction version, warnings/quality evidence, immutable result digest |
| Verification/review | Benchmark/template verification record plus run-specific equilibrium/convergence/selection checks and append-only human disposition; references exact result/requirements hashes |
| Applicability projection | Selected source/setup/requirements IDs, applicable/different/unknown state and reasons, artifact availability, assessment-policy version; outside immutable result content |

Use canonical, finite decimal strings for authored magnitudes and requirements, with fixed unit conversion rules and explicit direction normalization policy. Reject booleans, arrays in scalar fields, NaN/infinity, zero-length direction vectors, unsupported units, and unrecognized material/mesh keys with structured errors. Preserve original input units beside normalized values. The server generates authoritative digests; the browser submits expected digests returned by the server instead of independently inventing canonical JSON hashes.

Separate `sourceHash`, `inputHash`, `mappingHash`, `solveSpecHash`, `requirementsHash`, and `resultHash`. A changed requirement requires a new assessment/review but not necessarily a new physical solve if the source and all solver inputs match; show the reuse explicitly. A changed material/load/mesh/topology/template needs a new frozen solve revision and solve approval. A previously uploaded identical CAD artifact may be reused within its approved project/expiry, without automatically granting permission for the new solve.

Do not put mutable availability/currentness, expiring URLs, or a result's own digest inside the bytes used to calculate that result digest. Migration retains original legacy hashes and labels them as legacy; never promote recorded data or rewrite old evidence to appear live. Back up the database and artifact manifest before migration, test restoration, and use new records for new contracts.

### 18.3 State machine and durable orchestration

Proposed internal stages, independent of verification/applicability:

```text
DRAFT -> VALIDATED -> AWAITING_TRANSFER_APPROVAL -> EXPORTING
 -> IMPORTING -> AWAITING_MAPPING_REVIEW -> PREPARING_SOLVER
 -> AWAITING_SOLVE_APPROVAL -> QUEUED -> MESHING -> RUNNING
 -> POSTPROCESSING -> COMPLETE

Nonterminal stages may enter FAILED / CANCEL_REQUESTED / CANCELED.
Uncertain external writes enter RECONCILIATION_REQUIRED.
COMPLETE means evidence retrieval/finalization completed, not engineering pass.
```

Where the provider combines mesh and solve, retain its raw stage and map only observed information; do not manufacture mesh progress percentages. Where meshing is a separate chargeable operation, obtain solve/batch approval before starting it. Keep `verificationStatus`, `engineeringOutcome`, `applicability`, and `evidenceAvailability` separate from lifecycle state.

1. Write an operation intent and its approved bounds transactionally before each upstream write; release the database transaction before network work.
2. Record returned external IDs immediately and resume polling those IDs after restart. Safe reads use bounded exponential backoff, jitter, `Retry-After`, deadlines, and cancellation checks.
3. Use leases and compare-and-swap state transitions so two workers/clicks cannot own the same logical action. Lease expiry does not itself authorize replaying a provider write.
4. A timeout after import/simulation/run creation or start may mean success upstream. Reconcile against the provider using saved IDs or a supported correlation mechanism. If ambiguous, stop for human reconciliation; never promise exactly-once upstream execution or blindly retry a chargeable request.
5. Check frozen hashes, approval expiry, owner scope, and remaining allowed run count/resource bounds immediately before submission. A provider-side setup edited after review must fail the read-back check.
6. Stage immutable blobs, verify digests, publish under content-addressed/scoped keys, and commit one result per run attempt using a unique constraint. Concurrent finalizers return the winner; remove unreferenced staging blobs through controlled cleanup.
7. Do not let status GETs create runs, finalize different timestamps into multiple results, or overwrite terminal evidence. The worker performs progress/finalization; reads return the latest record version.
8. User cancellation targets only that approved run. Distinguish requested from provider-confirmed cancellation; cancellation is not a refund guarantee. Design switching marks evidence inapplicable but does not silently delete/cancel a paid run. Do not start a queued superseded setup without deliberate reconfirmation.

### 18.4 Two human approvals, no automatic purchase or compute authority

**Transfer approval:** show actual Onshape source/configuration/part, intended export settings, recipient/project privacy, files, retention, and permitted non-compute import/setup actions. Once exported, bind the receipt and digest to this approval before transmission; abort on a source mismatch. Local export can precede approval, but nothing goes to SimScale before approval. Supplier sharing is a different consent and is never inherited.

**Solve approval:** after import and mapping, display the immutable setup—not editable form defaults—including highlighted support/load/monitor regions, body/coordinate frame, material values and evidence, force vector/units, mesh order/settings, requirements, solver/template/schema version, provider project, retained artifacts, warnings, resource estimate/uncertainty, and bounded run count. Verify the native setup/run specification still matches before start. Checkboxes alone and a posted `actor: human` field are not authentication.

Only visible authenticated review controls can issue approval requests; backend enforcement includes sessions, object authorization, Origin/CSRF validation, expiring non-replayable challenges and record-version checks. A challenge is an interaction safeguard, not proof of a biological human. No approval/transfer/run-start endpoint is registered as a WebMCP tool. Stale tabs, another user's challenge, changed manifests, replay, and direct forged requests must fail.

A medium/fine verification pair may have one explicit batch approval only if both exact manifests, maximum run count, project, and resource limits are displayed and bound. No hidden mesh sweep. If a hard monetary ceiling cannot be enforced by provider controls, disclose that limitation; require an approved finite resource/run envelope and refuse promises of an enforceable dollar cap. Exceeded/unknown authorization stops new work.

### 18.5 Storage, cleanup, and recovery

- Keep local FEA metadata in `.runtime/fea/fea.sqlite3`; private STEP, raw result files, mesh/diagnostic exports, and derived artifacts under `.runtime/fea/artifacts/`. Shared-export catalog ownership is resolved at F1/Q1, not by uncontrolled duplicate files.
- Store secrets only in approved local/server configuration, never in artifacts, WebMCP output, browser storage, public build output, or Git. Restrict filesystem permissions and artifact routes to the authenticated owner/project.
- Preserve the agreed seven-day CAD/FEA retention duration. Proposed clock clarification: start at artifact creation/acquisition, matching the current local artifact implementation and bounding abandoned jobs; the older plan instead described terminal-run-based expiry. Confirm this clarification before live transfer rather than silently treating either anchor as newly approved. Reading or reuse must not reset the clock. Under the proposed creation-based rule, do not start a job that cannot safely complete within the remaining window without an explicitly approved policy decision.
- Persist absolute UTC expiry, state, attempt count and deletion receipts. Deny expired downloads immediately. Run catch-up on startup and a recurring backend cleanup job; test actual invocation when no browser is polling.
- Keep minimal audit/hash/availability records and permitted compact historical summaries, with policy disclosed. Expired supporting evidence is visible as unavailable; never imply that a hash alone makes the old result reproducible or freshly verified.
- Treat SimScale-held CAD/results, temporary upload storage, original Onshape data, local exports and backups as separate copies. Confirm provider retention/deletion capability and the user's acceptance before live transfer. Local deletion cannot guarantee provider or backup deletion.
- Any automatic provider cleanup must be explicitly approved and limited to app-created objects recorded in the artifact/job ledger. Never delete an existing user project, template, or unrelated CAD. If deletion cannot be automated/verified, show a pending manual action and do not claim end-to-end seven-day deletion.
- Backups have an approved retention schedule; restore reapplies expiry/deletion tombstones before serving artifacts. Recovery tests cover database plus blobs, missing blobs, disk full, orphan staging, and broken provider credentials.

### 18.6 Backend and WebMCP contracts

Extend the existing `/api/fea` boundary with versioned contracts. Proposed routes below are implementation work, not claims of existing endpoints:

| Proposed operation | Caller and enforcement |
| --- | --- |
| `GET /api/fea/capabilities` | Authenticated context; reports recorded/live-commissioning/live-validated/disabled readiness and precise blocking reasons, without secrets |
| `POST /api/fea/studies` | Human/agent may prepare a local bounded draft; no upstream write or approval |
| `GET /api/fea/studies?sourceId=...` and `GET /api/fea/studies/{id}` | Owner-scoped history/detail, full frozen manifest, revision and applicability |
| `POST /api/fea/studies/{id}/transfer-challenge` and `/approve-transfer` | Human UI only, bound source/recipient/retention, idempotent local job acceptance |
| `PUT /api/fea/studies/{id}/mapping-review` | Human UI reviews validated topology IDs; creates a versioned mapping, not a mutable approved solve |
| `POST /api/fea/studies/{id}/solve-challenge` and `/approve-solve` | Human UI only, bound final setup/read-back/budget; returns durable job ID, not an assumed completed run |
| `GET /api/fea/jobs/{id}`, `/studies/{id}/status`, `/studies/{id}/results` | Read-only bounded status/evidence, raw-provider status and normalized stage, sanitized errors |
| `POST /api/fea/runs/{id}/cancel` | Explicit human action, only owned run; records cancellation request and later provider outcome |
| `POST /api/fea/studies/{id}/assessment` | Server checks exact result/source/requirements and returns pass/fail/indeterminate with reasons; never an engineering sign-off |
| `POST /api/fea/studies/{id}/engineering-review` | Human-only append-only disposition with evidence/requirements hashes and limitations |
| `GET /api/fea/artifacts/{id}` | Owner-authorized, unexpired private artifact; safe disposition/type/size; never arbitrary paths or URLs |

Every write requires expected record/hash versions, body limits, strict schemas, scoped IDs and structured errors. Wrong owner is denied even when an ID/hash is known. Keep old recorded client compatibility during migration; the legacy combined approval route must not start a live run.

Retain exactly five FEA WebMCP tools with corrected semantics:

1. `prepare_static_stress_study`: local draft only; bounded inputs, source-aware availability, no inferred material approval or external action.
2. `get_static_stress_study`: actual manifest and readiness gaps, material/load/support/mesh/requirements/provenance, not just IDs while claiming to expose setup.
3. `get_simulation_status`: persisted state, provider IDs/status where permitted, progress uncertainty, last update and next human action; does not submit.
4. `get_simulation_results`: compact metrics with units, exact lineage, warnings, verification/applicability/availability and authenticated detail links; no raw CAD, tokens, signed URLs or large mesh fields.
5. `compare_simulation_to_requirements`: uses the backend assessment contract and exact requirements; cannot certify, approve, override unknowns, or translate a fixture into a live pass.

Register tools only when capabilities, source support and required state are available. The five quote tools remain independent. Tool availability, JSON contracts, prompts/descriptions, visible UI and exported review packages must all consume the same authoritative status/version rather than maintaining separate cached truth.

## 19. Live provider implementation and result policy

### 19.1 Exact CAD export and geometry verification

The current Onshape client assumes `/m/` on an asynchronous translation route. Official generated documentation distinguishes these translation routes as workspace/version (`w`/`v`). Use an existing immutable `v` source whose full microversion is checked against the approved design; freeze the account-supported route/body before implementation. Do not replace it with an unverified latest-workspace export. [Onshape Part Studio translation documentation](https://github.com/onshape-public/go-client/blob/master/onshape/docs/PartStudioApi.md#createpartstudiotranslation).

Validate document, element, version, full microversion, configuration, selected solid and export options before and after translation. Persist the translation receipt and exact downloaded bytes. If part selection is unsupported by the chosen route, restrict the MVP to a verified one-solid Part Studio; do not accidentally send the entire multi-part design. Creating a new immutable Onshape version requires a separate deliberate human action.

Before upload, validate nonempty STEP content, bounded size and export lineage. After import, check body count, units, bounding box/dimensions and geometry suitability against reviewed source metadata. File magic and a digest establish byte identity, not correct shape, scale or analysis suitability.

### 19.2 Freeze the SimScale contract, then implement the missing operations

The current official v1 OpenAPI documents simulation creation/read-back, setup checking/estimation, run creation/start/status, run specifications, cancellation, event logs and result listing. It versions simulation and meshing schemas separately and currently labels v1 beta. Capture the supported schema versions and a sanitized account-backed template; do not assume a generic example payload is accepted. [SimScale v1 OpenAPI, inspected 2026-09-02](https://api.simscale.com/v1/openapi.json?simulationSpecSchemaVersion=34.0&meshingSpecSchemaVersion=10.0).

Use the following provider sequence, with exact endpoint bodies, required headers, statuses and resource types verified at F0/F2:

1. Check the approved connection/project and permissions without creating projects or starting compute.
2. After transfer approval, allocate temporary storage, upload STEP without forwarding API credentials to the signed-upload endpoint, create CAD import, and persist each operation ID before polling onward.
3. Retrieve the imported CAD state/topology. Resolve `NS_BODY`, `NS_FIXED`, `NS_LOAD`, and `NS_MONITOR` to actual entities. Names in a manifest are not proof those entities exist; create only app-owned saved selections when needed and permitted.
4. Verify volume/face types, nonempty areas, membership in the chosen body, no inappropriate fixed/load overlap, and an explicitly reviewed monitoring region. Bind IDs to this CAD state; never reuse face indices after a changed import or CAD revision. If mapping is ambiguous, stop for human selection in the geometry view/native workbench.
5. Build a new app-owned simulation from the approved versioned template, using only allowlisted substitutions. Never mutate the engineer's master template or an unrelated simulation. Explicitly set material, force distribution/vector/frame, constraints, units, result controls and bounded second-order mesh settings; do not rely on hidden solver defaults.
6. Read back the effective setup, validate its canonical equivalence, run the provider's setup checks, capture warnings and estimate where supported, then present solve approval. Verify that these preflight calls are non-chargeable; if not, include them in the prior explicit resource authorization.
7. Under solve approval, execute the account-supported mesh/run sequence. If meshing is separate, verify mesh completion/quality and bind its mesh ID before solve start. Inspect the actual run specification against the approved setup, not only a mutable simulation record.
8. Persist and poll run state/event logs with deadlines and reconciliation. Surface mesh failure, invalid physics, quota exhaustion, provider outage, cancellation, and ambiguous submission distinctly.
9. List available result resources, retrieve the required numeric evidence through supported mechanisms, verify final run/spec identity, normalize once, and store source digests and native links.

The exact static solver discriminator, mesh-operation payload, saved-selection creation body and result extraction format remain account-verification tasks, not invented contracts in this plan. If required numerical fields are unavailable through the permitted API/export channel, this is a live-completion blocker. Screenshots or a status of `FINISHED` do not substitute for missing stress/reaction/displacement data. A manual evidence import may be a separately labeled fallback, but cannot be called automated live integration.

Harden all provider traffic: fixed allowed API origins, no redirects carrying authorization, signed URL destination/redirect validation, HTTPS only, no local/private-address SSRF, bounded body/download size, content validation, timeout limits, redacted logs, and no signed URLs in normal API/tool responses. Validate every redirect hop; checking only the first URL is insufficient.

### 19.3 Normalize evidence and assess requirements on the server

Store both the retrieved numeric source and its normalized interpretation. Each metric records value or explicit null, original and canonical units, resource/field/region, extraction version, and quality status. Required outputs:

- Raw maximum von Mises stress and its location/region, retained even when not suitable for acceptance.
- Separately reviewed-region von Mises stress with the exact monitoring definition and singularity limitations.
- Maximum displacement magnitude, with units and evaluation location; benchmark tip displacement is a distinct measurement, not automatically the global maximum.
- Vector sum of support reactions and all applied loads, plus the defined equilibrium residual. Review moment balance as appropriate to the setup; force balance alone cannot prove correct constraints.
- Mesh identification, order, element counts/available quality diagnostics and convergence evidence; solver status, errors, warnings and termination/convergence information.
- Derived yield-based factor of safety only where material and stress assumptions are valid. Record the material source and formula; do not treat division by zero, an absent yield value, or a singular stress peak as a meaningful safety factor.
- Exact approved source/setup, native run specification, raw evidence digests, provider timestamps, authenticated deep links, and all deviations.

Proposed assessment outcomes: `meets_reviewed_requirements`, `does_not_meet_reviewed_requirements`, or `indeterminate`. A pass requires applicable geometry/setup, complete finite consistent units/data, supported verified template/extractor, run-specific equilibrium/convergence/quality checks, no unresolved blocking warnings, and the exact reviewed requirements. Report missing checks as reasons, not zeros or implied passes. A meaningful failed requirement may be displayed as a concern while the overall result remains indeterminate if evidence quality is insufficient.

`solver.live` describes origin, not validity. A provider run initially has `live_unverified` status. A separate server-owned verification record can qualify it only after the relevant template validation and run-specific checks; a payload field or engineer checkbox cannot fabricate that chain. Human review remains necessary to assess whether loads, restraints and the model represent the actual intended use.

### 19.4 Context freshness, JSON propagation, UI and reports

1. On source/setup selection, increment a view generation and immediately clear applicable-result claims. Every asynchronous callback checks owner/project, selected source/study ID, expected record version and generation before updating the view.
2. Aborting an old request is helpful but not sufficient; still reject a late successful response. Historical results may remain in history, never overwrite the new active study.
3. Restore current selections from owner-scoped backend history after reload. Browser persistence may hold bounded IDs/preferences, not CAD, raw evidence or provider secrets. An expired/deleted/unauthorized record produces a clear unavailable state.
4. Return immutable result content plus a separately computed applicability/availability envelope on every read. Remove contradictory nested `current` claims; legacy result labels are interpreted through that envelope.
5. Publish one status object to visible controls, WebMCP context, requirement assessment, JSON review packages and engineering report sections. Include contract versions and source/result/requirements hashes so downstream consumers reject mismatched combinations.
6. Show completed-but-stale, recorded, live-unverified, failed-quality-check, verified-for-supported-scope and evidence-expired states distinctly. “Next action” must not invite use of a supposedly verified result merely because it came from a live provider.
7. Render provider messages, filenames, warnings and audit summaries as untrusted text. Replace unsafe interpolated HTML in affected audit/output paths; test script-like content.
8. A new simulation for unchanged CAD does not invalidate commercial quotes. A new CAD basis changes quote applicability and FEA applicability independently. A combined report snapshots both and shows separate engineering/commercial readiness; recorded FEA cannot inherit a real-quote trust label.

## 20. Seven FEA implementation and verification gates

These gates are named **F0–F6**, distinct from quotation gates **Q0–Q6** and the original document's **FEA-0–FEA-6**. They refine the old plan: account feasibility comes first, but automated numerical parity is proved after the live execution path exists. This avoids requiring a fully validated automated solver before allowing the controlled runs needed to validate it.

Each task produces tests and a short evidence record. Each exit is separately marked software-tested, account-verified, numerically-verified, or deployment-verified. No gate is complete merely because its code was merged. The implementation request should authorize each live-transfer/compute checkpoint separately as described above.

### F0 — Freeze scope, account feasibility, and baseline contracts

**Dependencies:** plan review; no supplier/API quote dependency. Read-only preparation is possible without credentials; account-backed items remain explicitly pending.

1. F0.1 Inventory the reconciled partner baseline after S0 and capture regression cases for section 17; record the actual normal-command test results and do not count string-presence tests or compatibility-shim runs as behavior coverage. Account feasibility may be prepared alongside S0.
2. F0.2 Freeze the single-solid linear-static MVP, fixture versus live labels, template/contract versions, material-review rules, metric definitions and requirement-assessment policy.
3. F0.3 Confirm the user's private SimScale project, API entitlement, account role, solver availability and read access to the necessary results. Store only redacted feasibility evidence in repository docs.
4. F0.4 Inspect the current official API/schema and an authorized existing manual setup; record the exact CAD, topology, mesh, run, numeric extraction, cancel and deletion contracts. If no manual baseline exists, schedule its creation as a separately approved verification run.
5. F0.5 Select the actual Onshape immutable source/configuration/body; confirm its export route and permitted local retention/SimScale disclosure. Identify missing geometry/material/selection evidence without guessing it.
6. F0.6 Agree the verification engineer, budget/run envelope and provider-copy retention behavior; distinguish local completion from hosted completion and record deployment as undecided until chosen.
7. F0.7 Freeze proposed schemas, migrations, event names, error codes, module ownership and the F1/Q1 shared-foundation contract. Record blocked account items so independent credential-free work can proceed.

**Exit:** implementable bounded contracts and explicit account feasibility evidence. Offline F1 work may proceed with tracked F0 external blockers, but no real transfer/compute gate passes without them. Numerical validation itself is an F5 exit, not a circular prerequisite for writing the adapter.

### F1 — Repair identity, state integrity, export, and local safety

**Dependencies:** S0 and F0 offline contracts; coordinate Q0/Q1 to avoid two identity implementations. Sharing a completed task does not imply that the entire other gate has passed.

1. F1.1 Implement shared full-source identity and server canonical hashing, reject unknown real IDs, and migrate legacy hashes read-only without altering their evidence.
2. F1.2 Correct the Onshape translation client to the supported immutable source contract; preserve configuration/part and byte lineage, safe downloads, sizes, polling receipts and failure states.
3. F1.3 Separate immutable results from applicability; remove global cross-project invalidation, add owner/project-scoped history/detail/version checks, and guard browser responses by active source/study/generation before any live review uses them.
4. F1.4 Make recorded finalization atomic and content-addressed; prove concurrent status/results requests yield one terminal result/hash and no conflicting artifact records.
5. F1.5 Enforce strict input shapes/finite numbers and add secure shared transport/authentication/CSRF/object-authorization primitives. Implement the minimum visible transfer-review/challenge controls needed by F2 before enabling its import actions; a developer-only unguarded upload route is not an acceptable substitute.
6. F1.6 Implement the scheduled cleanup hook, startup catch-up, expiry-on-read and deletion receipts; define shared artifact ownership and prove no default retention extension.
7. F1.7 Add regression tests for numeric canonicalization, identity collisions, cross-user isolation, contradictory stale results, concurrency, malformed inputs, off-origin credential redirects, and idle expiry. Perform a bounded real export verification only after authorized source access is available.

**Exit:** every reproducible foundation defect has a passing behavioral regression, recorded mode remains labeled, and the real export contract is either evidenced or explicitly still blocking live F2. A mock export is not proof of the actual Onshape route.

### F2 — Connect CAD import, geometry mapping, and solver template

**Dependencies:** F1; F0 account/source permissions for live tests. No paid mesh/solve yet unless separately approved for baseline creation.

1. F2.1 Refactor the transport into resumable storage/upload/import operations with retained receipts, deadlines, safe credential handling and ambiguous-write reconciliation.
2. F2.2 Upload one approved exact export, prove private-project receipt, and verify imported geometry scale/body count/dimensions against the source.
3. F2.3 Resolve real body/fixed/load/monitor entities, persist topology/mapping hashes and add a human geometry-review step; block missing/wrong/overlapping selections.
4. F2.4 Capture and sanitize a supported manual linear-static specification; create a versioned template with explicit allowlisted substitutions and no mutation of the user's master template.
5. F2.5 Map reviewed material properties, force vector/distribution/frame, fixed restraint, mesh order/sizing and all required result controls into the exact provider schema.
6. F2.6 Create/read back a non-running app-owned setup; compare effective values, call validated non-chargeable checks/estimate, and block warnings/mismatch requiring review. Add mesh/read-back/result-resource contracts from real sanitized observations.
7. F2.7 Test invalid geometry, units, body/face mappings, changed CAD state, template drift, provider schema drift and setup defaults; archive the approved import/setup receipt privately.

**Exit:** a real imported part and reviewed provider setup match the frozen source/material/loads/selections/mesh intent, with required result channels demonstrated as available. No claim of solved or verified FEA yet.

### F3 — Implement human approvals and recoverable paid execution

**Dependencies:** F2 and authenticated local runtime; explicit transfer/compute permissions. Fake-provider tests run without those permissions.

1. F3.1 Complete the two-stage review experience: retain the F1 transfer gate and add the full solve review panel/challenge. Disable the old combined route for live operation. Display immutable manifest values, mappings, recipient, warnings and bounded resource/run authorization.
2. F3.2 Add durable jobs, run attempts, approvals, audit events and provider operation references with migrations, leases, uniqueness and compare-and-swap transitions.
3. F3.3 Implement `simscale` provider wiring plus restricted commissioning capability; keep normal verified-live capability unavailable until F5, while approved validation runs can execute as live-unverified.
4. F3.4 Implement the supported mesh/run/create/read-back/start path. Check run-spec equality and remaining authorization immediately before each chargeable action.
5. F3.5 Implement polling/backoff/deadlines, restart reconciliation, idempotent local submission, provider-confirmed cancellation and uncertain-write recovery without blind retries.
6. F3.6 Test duplicate clicks, two workers, replayed/stale approval, tampered provider setup, revoked credentials, quota exhaustion, timeout after successful upstream start, worker crash and partial cancellation with a fault-injecting provider.
7. F3.7 Under a separately approved finite validation budget, execute a real commissioning run and retain complete operation lineage. Prove browser closure/reload and backend restart do not duplicate it.

**Exit:** one explicitly approved real run is durably orchestrated with coherent state and no demonstrated duplicate billing path. Its numbers remain unverified until F4/F5; the gate does not authorize further autonomous runs.

### F4 — Deliver reliable results, browser context, tools and reports

**Dependencies:** F3 live result resources; recorded/mocked implementation can run earlier.

1. F4.1 Retrieve actual stress/displacement/reaction/mesh/warning evidence using the supported resource contracts; preserve source digests, run spec and private artifact availability.
2. F4.2 Implement bounded parsers, explicit unit conversion, metric locations/regions, null handling, extraction versions and immutable one-result-per-run finalization.
3. F4.3 Move requirement assessment to the backend with independent source/verification/applicability/completeness checks; block stale, missing, nonfinite, unreviewed-material and mismatched-unit evidence.
4. F4.4 Implement owner-scoped study history/reload restoration and generation/version guards for every asynchronous browser update; show immutable setup review and provider-native links.
5. F4.5 Correct all five FEA WebMCP contracts, capability registration, Model Insight context and JSON/report propagation; add injection-safe rendering and durable human audit views. Model Insight reads the backend evidence/assessment and preserves uncertainty; distinguish a radius preview from an actual stress simulation and never interpret “simulate” as permission to upload or spend compute.
6. F4.6 Integrate the engineering report section without reintroducing the old real-quote dependency on completed FEA; preserve fixture and legacy report readers with clear source labels.
7. F4.7 Test real browser/state/HTTP/tool behavior across source changes, reset, late responses, expiry, server restart, mixed real quotes/recorded FEA and inaccessible artifacts; prove live data shown by UI/tool/report agree with normalized server evidence.

**Exit:** actual live evidence is inspectable and consistently labeled everywhere; unresolved quality checks remain indeterminate. No verified-live claim solely from successful extraction.

### F5 — Prove numerical correctness for the supported workflow

**Dependencies:** F2–F4, reviewed material/geometry/setup, independent verification engineer, and explicit finite run/batch approvals.

1. F5.1 Implement the benchmark calculator/comparator and fixture unit tests, then freeze the analytical geometry, force, material, evaluation stations and thresholds from section 21 before viewing live outputs.
2. F5.2 Perform/retrieve the approved manual cantilever baseline and run the automated equivalent; retain native setups, meshes, resources and numeric values so this is not a screenshot-only check.
3. F5.3 Check analytical stress/displacement and reaction balance using the same physical locations, coordinate conventions and load definitions. Investigate discrepancies without loosening thresholds after the fact.
4. F5.4 Prove manual-versus-automated parity for an identical mesh/setup where possible, and document only justified display-rounding tolerances; different meshes are not a valid 1% adapter-parity test by default.
5. F5.5 Execute an explicitly approved medium/fine pair, confirm actual refinement and compute displacement/reviewed-stress changes. Apply the same convergence/quality discipline to the target bracket, not only the beam benchmark.
6. F5.6 Review stress singularities, load/support realism, material evidence, units and small-displacement/linear-elastic applicability. Add negative tests for omitted loads/supports, wrong scale/direction, missing outputs and nonconverged meshes; in supported linear cases, check expected response to bounded load changes as a diagnostic.
7. F5.7 Save a signed-in engineer review and immutable verification bundle tied to template, schema, extractor, source, mesh and result hashes. Enable validated capability only for the proved scope; changes that invalidate this chain require re-verification.

**Exit:** all section 21 thresholds and required run-specific checks pass with actual SimScale evidence and reviewer sign-off on the supported workflow. Failed or missing evidence leaves live operation in commissioning/unverified mode, not fixture mode and not a pass.

### F6 — Operational hardening, retention, deployment and handoff

**Dependencies:** F1–F5 for a verified release; coordinate Q6 for shared hosting. Approved host/identity/storage/backup choices are required only for the hosted subgate.

1. F6.1 Finish local acceptance for the complete real source → approvals → run → verified evidence → history flow, including browser closure/restart and all gate regressions.
2. F6.2 Prove seven-day artifact expiry under normal idle operation, crash recovery, provider-copy policy and deletion receipts, orphan cleanup, quotas/disk-full handling and backup restore with tombstones.
3. F6.3 Add secret-safe diagnostics for job stage/age, last provider contact, reconciliation backlog, failed cleanup, approval failures and normalization errors. Persist actionable health status; notification destination remains an explicit deployment choice.
4. F6.4 For public use, deploy Python APIs/workers and durable private storage behind approved authentication/TLS. Test `/api/fea` on the actual origin; a static frontend or an API-key environment variable alone is insufficient.
5. F6.5 Verify cross-user/project access denial, CSRF/Origin rules, unsafe downloads/redirects, rate limits and no evidence/secret leakage into build output, logs, browser caches or agent payloads.
6. F6.6 Exercise degraded mode and rollback: disable new transfers/runs, keep authorized historical access, continue bounded monitoring of already-started jobs or explicitly hand them off, reconcile provider state, and preserve migrations/data.
7. F6.7 Update setup, runbook, retention, feature-freeze, acceptance and demo documentation with exact local/live/numerical/hosted status, tested code revision, unresolved conditions and human ownership. Commit only sanitized evidence summaries when implementation/push is authorized.

**Exit:** local verified operation is evidenced; hosted operation is additionally evidenced if claimed. Report a blocked hosted subgate rather than calling a local-only system publicly complete.

### 20.1 Repository work map

Paths below are proposed additions or refactors, not files already delivered by this plan. Prefer small modules and standard-library facilities; add dependencies through `uv` only when a verified provider/parsing need justifies their storage cost.

| Area | Existing paths to change | Proposed additions / responsibility |
| --- | --- | --- |
| Shared identity/security | `web/onshape-adapter.js`, `web/onshape-client.js`, `web/onshape-extension.js`, `web/workflow-rules.js`, local API router | One `scripts/design_identity.py`, canonical manifest/auth/safe-HTTP helpers shared with Q gates; consistent module imports |
| Exact geometry | `scripts/onshape_export.py`, `scripts/simscale_transport.py` | Version-bound export/import receipts, real topology/mapping validation; no heavyweight local mesher required |
| Domain/validation | `web/fea-domain.json`, `web/fea-domain.js`, `web/fea-validation.js` | `contracts/fea-study.schema.json`, `contracts/fea-result.schema.json`, reviewed template/material policy and canonical test vectors |
| Service/persistence | `scripts/fea_service.py`, existing Python API router | `scripts/fea_store.py`, `scripts/fea_jobs.py`, database migrations; approvals/attempts/events/verification/artifact references |
| Provider execution | Existing SimScale transport/probe | `scripts/providers/simscale_fea.py`, `scripts/simscale_template.py`; existing recorded adapter remains explicit |
| Numerical evidence | `web/fea-recorded-result.json` remains a fixture | `scripts/fea_results.py`, `scripts/fea_assessment.py`, `scripts/fea_verification.py`; bounded parsing and server assessment |
| Browser/agent | `web/fea-client.js`, `web/fea-state.js`, `web/app.js`, `web/state.js`, `web/webmcp.js`, `web/review-package.js`, `web/insight-assistant.js`, `web/insight-engine.js`, HTML/styles | Immutable review panels, topology review/deep links, history/restoration, fresh JSON/conversation context, separate engineering status; top-level first |
| Runtime/retention | Existing server startup/configuration | `scripts/fea_cleanup.py`, worker lifecycle and cleanup hooks; protected artifact access and operational status |
| Tests/CI | `tests/test_fea_service.py`, transport/probe/WebMCP tests, `tests/js/fea-validation.mjs`, `scripts/check.py` | Identity/hash/concurrency/job/security/result/expiry tests, behavioral JS tests, opt-in account/compute acceptance suites |
| Documentation | `docs/simscale-setup.md`, `docs/feature-freeze.md`, original FEA plan, setup/environment docs | Commissioning/run/recovery/deletion runbook and private-evidence gate checklist; no real CAD or credentials in Git |

Preserve the existing `SIMULATION_PROVIDER` distinction. Add separate proposed settings for approved connection/project, template/schema, commissioning enablement, allowed run count/resource bounds, worker concurrency/polling/deadlines and cleanup cadence. Configuration advertises capability; it does not fabricate approvals, account entitlement or numerical verification. Runtime readiness must verify persisted evidence and policy as well.

## 21. Numerical verification and regression acceptance

### 21.1 Controlled numerical checks

The numerical targets below come from the existing `web/fea-domain.json` demonstration contract and original FEA plan. They are project acceptance targets, not claimed industry certification criteria. Review their suitability before production engineering decisions. The current demo material is explicitly not a reviewed production material source.

| Check | Frozen basis and pass criterion | Evidence required |
| --- | --- | --- |
| Cantilever reference | Rectangular beam: L = 100 mm, b = 20 mm, h = 10 mm, F = 100 N, E = 68,900 N/mm². Nominal root bending stress `6FL/(b*h^2)` = 30 MPa; Euler–Bernoulli tip displacement `4FL^3/(E*b*h^3)` ≈ 0.290275762 mm | Independent calculation plus exact benchmark geometry, material, load direction/distribution and evaluation definition |
| Analytical agreement | Relative stress and displacement errors each ≤ 5% against the corresponding analytical quantity | Actual normalized SimScale values and evaluated regions, not recorded fixture constants |
| Evaluation-region consistency | For stress sampled away from the fixed-end singularity at station x, compare with `6F(L-x)/(b*h^2)`; the 30 MPa root nominal value is not the target for every interior section | Preselected section/region or documented nominal extrapolation; distinguish bending normal stress from von Mises stress where they are not equivalent |
| Manual/automated parity | Relative metric differences ≤ 1% for the same setup, mesh, location and result definition, or a pre-documented display-rounding allowance | Manual native run/export and automated run/export with setup/mesh/spec hashes; do not compare different quantities |
| Reaction equilibrium | `100 * norm(sum(reactions) + sum(applied forces)) / referenceLoad` ≤ 1%; define referenceLoad as the nonzero sum of applied-force magnitudes for this force-only scope | Vector components in one frame, all active loads including any permitted body force, and reviewed moment balance where applicable |
| Mesh convergence | Medium → fine displacement change < 2%; reviewed-region stress change < 5%, using the fine value as denominator and explicitly handling zero/near-zero values | Two approved runs, actual element order/count/refinement, same physical region and extraction method; no fabricated convergence flag |
| Model validity | Correct solid/body/scale, stable constraints, intended force distribution, reviewed material, no unresolved quality/convergence errors, supported linear-elastic/small-displacement assumptions | Engineer review plus solver/mesh diagnostics; a converged singular peak is not automatically a valid failure criterion |
| Target-part acceptance | Current target part passes its own applicability, mesh/equilibrium/quality checks and reviewed requirements; benchmark success alone is insufficient | Target-part run pair or other explicitly reviewed convergence evidence, metric sources and human engineering disposition |

For a zero or near-zero denominator, use a predeclared absolute tolerance or return indeterminate; never divide into infinity and report a pass. Freeze all thresholds, units, regions and tolerances before inspecting results. If beam/shear/boundary idealizations explain a mismatch, document and review a new benchmark contract rather than silently moving a threshold. Preserve raw constraint-adjacent peaks; do not choose a convenient monitor region merely to force a favorable safety factor.

Changing API/schema/template, meshing strategy, numerical extraction, material policy or geometry-mapping logic requires a recorded impact review and re-running affected verification cases. Domain expansion needs a new verified scope, not a general `verified` flag inherited from this cantilever.

### 21.2 Behavioral and failure test matrix

| Area | Mandatory test cases | Observable success |
| --- | --- | --- |
| Source lineage | Same display prefix across documents/elements; missing full microversion; changed configuration/body; export bytes mismatch | Distinct source IDs or blocked export; no false reuse/approval |
| Cross-language manifests | Small/exponential decimals, numeric strings, negative zero, ordering, nonfinite values and unsupported shapes | Authoritative digest stability, consistent units, structured rejection |
| Freshness | Old status/result arrives after source switch/reset/new study; stale nested result; two users select different revisions | Active view/tools/JSON cannot be overwritten; history preserved independently |
| Durability | Concurrent completion, repeated approval, two workers, crash between blob publish and database commit | One immutable result/attempt, no conflicting artifacts, safe reconciliation |
| Geometry/physics | Missing/empty/wrong-body faces, load/support overlap, changed CAD state, 1000× scale error, wrong direction/material | Preflight blocks or assessment stays indeterminate with reasons |
| Transport | API redirect to another origin; signed URL redirect to private host; huge/invalid/truncated content | No credential leak/SSRF, bounded safe failure, retained useful operation IDs |
| Authority/cost | Forged human flag, replayed/expired challenge, changed setup/budget, wrong owner, start timeout, exhausted run count | No unauthorized run; ambiguous upstream outcome reconciled, not blindly retried |
| Provider lifecycle | Auth/quota failure, throttle, unknown status, mesh failure, stuck solve, cancellation race, partial results | Accurate normalized states, finite retries, actionable errors, no live-to-fixture substitution |
| Evidence/assessment | Missing reactions, stress units mismatch, invalid numeric field, unconverged mesh, unverified material, modified raw file | Integrity/quality flags and indeterminate outcome; no guessed zero/pass |
| UI/agent/report | Reload/reopen, two allowed Part Studios, mixed module imports, mismatched editable draft/frozen study, Model Insight on changed source, prompt injection, mixed quote/FEA origins | Selected document is exact; identical current evidence in UI/conversation/tools/JSON; no agent approval route or fictional fallback |
| Retention/security | Eight-day clock advance without reads; startup catch-up; unauthorized artifact; backup restore after expiry | Expired access denied, scheduled deletion observed, tombstones respected |
| Hosted runtime | Static-only deployment, missing worker/disk, restarted process, second browser/profile | Live capability disabled when incomplete; real authenticated API/storage/worker verified when enabled |

### 21.3 Test execution and evidence storage

Run the existing uv-managed Python tests, JavaScript behavior checks and build after each implementation gate. Add new JS behavioral suites to `scripts/check.py` and CI; a test that searches for a function name does not establish runtime correctness. Node may remain the existing JS test runtime without npm-managed dependencies; Python environment/dependencies remain managed by uv.

Use three distinct test tiers:

1. **Offline CI:** fixtures, parsers, contracts, canonicalization, state transitions, HTTP routing, fault injection, concurrency, UI state and retention with a fake clock. No network credentials or paid operations.
2. **Authorized integration:** bounded source/account reads, then explicitly approved export/import/setup tests. Opt-in and owner-scoped; never automatically enabled by CI merely because a secret exists.
3. **Approved numerical acceptance:** exact manual/automated/mesh-pair run bundle with a known run/resource budget and engineer review. Record real evidence privately; no benchmark spending during ordinary test discovery.

Proposed commands after the relevant modules exist:

```text
uv run python -m unittest discover -s tests
uv run python scripts/check.py
uv run python scripts/build.py
uv run python scripts/fea_cleanup.py --dry-run
```

The cleanup command is proposed, not currently implemented. Account-backed and paid verification entry points must refuse operation without their explicit local approval records and approved project/run envelope; passing an environment flag is not sufficient.

Store gate ID, code revision, mode, executed tests, thresholds, private evidence IDs/digests, provider/template/schema versions, date, reviewer and unresolved blockers. Do not commit STEP files, raw supplier/SimScale evidence, API keys, signed URLs or confidential project metadata. A sanitized gate summary may reference private evidence IDs without exposing its contents.

## 22. Combined implementation order, decisions, and final handoff

### 22.1 Sequence both workstreams without blocking one unnecessarily

```text
IMPLEMENTATION AUTHORIZED — live actions retain their specific approval gates
   |
S0: reconcile partner baseline + focused stabilization
   |                  F0/Q0: source/account/policy feasibility
   +----------------------------------+
   |
Shared F1/Q1 tasks: exact CAD, approvals, identity, private evidence
   |
   +-- PRIMARY: F2 -> F3 -> F4 -> F5 -> local F6 acceptance
   |            Import / solve / results / numerical verification
   |
   +-- SUPPORTING: complete Q0/Q1 -> human RFQ handoff -> Q2 -> Q3/Q4
                Real source / reviewed terms / sourcing report
   |
Combined local acceptance: verified target FEA + genuine quotation
   |
Later, separately gated: Q5 API; Q6/hosted F6; expanded panel delivery
```

Recommended first implementation slice after approval: **S0, followed by the shared F1/Q1 identity/export, stale-result, atomic-finalization, authentication and cleanup work.** Then keep SimScale on the main engineering path through real numerical acceptance. Advance RFQ preparation/real-source acquisition early and use account/compute/supplier waiting periods for independent quotation work; do not stall one lane because the other waits on an external party. With one developer, alternate bounded tasks rather than assuming simultaneous full-time implementation. No multi-agent execution or staffing assumption is required by this sequence.

The Q1/F1 overlap is reuse, not a shortcut around their dependencies: a shared export/identity task can be implemented once and referenced by both gates, while RFQ requirement review and solver setup remain separate. Required local auth/private storage/retention and transfer approval precede all real files or uploads. Solve approval precedes any chargeable validation or target-part run. Finish relevant local F6 hardening before calling FEA fully functional, even when public deployment is deferred.

| Delivery checkpoint | Required exit | Work that does not block it |
| --- | --- | --- |
| Stable primary workspace | Correct document/element, passing normal tests, no enabled unsafe/misleading action | Full embedded redesign, branding, demo recapture |
| Real CAD foundation | Full source/configuration/part identity plus actual STEP bytes/hash, private storage, reviewed recipient and scoped authority | Supplier quote response or finished stress result |
| Live SimScale commissioning | Real import/mapping/setup/run/resource retrieval with durable IDs and explicit approvals | Numerical verification is still pending; normal trusted capability stays disabled |
| Verified FEA delivery | Section 21 benchmark/manual parity and target-part checks, engineer review, safe restart/cancel/expiry behavior | Supplier API, second supplier, public hosting |
| Genuine quotation delivery | Actual supplier document, supplier/reference/date, exact RFQ association, reviewed scope/prices/unknowns, private original, usable report | Completed FEA, API adapter, second supplier; none may be invented to fill a gap |
| Real comparison delivery | Two independent actual offers pass the defined compatible-scope/review/validity checks, with unknown charges visible | Automatic purchasing or binding supplier selection remains out of scope |
| Combined local handoff | Both primary outcomes demonstrated against explicit design identities and limitations; no stale cross-contamination | Public deployment is a separate acceptance claim |

#### Real quotation acquisition checkpoint

This is an actual supplier-response milestone, not merely building an upload form:

1. Select a real supplier and a human acquisition owner; choose a second candidate only if a real comparison is desired. Confirm the intended channel accepts the part/process/quantity and the supplier may receive the package. No supplier is contacted by this plan.
2. Complete the frozen RFQ with exact exported part, reviewed material/specification, quantity, drawing/tolerances, finish, inspection and delivery basis. Distinguish unanswered scope questions from approved requirements.
3. Present the exact file manifest and named recipient for human external-sharing approval. If FEA is pending, describe it as pending; do not imply structural approval. Existing FEA transfer approval does not authorize supplier disclosure.
4. Have the authorized human send/upload the package through the chosen channel, or separately authorize a specific assisted handoff. Record the requested design/requirements digest, recipient, time and supplier acknowledgment/reference. A submitted RFQ is not a quote.
5. Obtain the original supplier-issued quotation and store it privately through Q2. A declined request, budget estimate, fixture, or pending response remains explicitly that status; no fictional fallback.
6. Review the issued scope and terms beside the source, resolve critical ambiguities through an authorized human follow-up, and label supplier-confirmed versus user-attested design matching. A genuine but incomplete quote remains qualified; missing shipping/tax never becomes zero or a claimed final landed total.
7. Demonstrate the reviewed one-quote report through Q4. If a second actual offer arrives, demonstrate Q3 compatibility/comparison separately; otherwise mark the comparison milestone pending without denying that a genuine first quote exists.

Supplier outreach or follow-ups are not autonomous monitoring commitments and require the specific authority/channel when executed. Record pending responses as external dependencies rather than coding failures or fabricated evidence.

F2/F3 are substantial external integration work; F4 combines data normalization and UI changes; F5 depends on actual compute and engineering review, not just coding; F6 depends on deployment/retention choices. Estimate dates only after F0 resolves those dependencies. No calendar guarantee or cloud architecture is implied.

### 22.2 Decisions needed before the affected live step

| Decision | When required | Safe progress while pending |
| --- | --- | --- |
| Supported Onshape version/configuration/body and export access | Q1/F1 real export | Fixture identity/export tests and schema/migration work |
| Reviewed material, support/load regions and intended requirements | F2 setup; F5 physical-use review | UI/validation templates remain explicitly unreviewed |
| Private SimScale project, account/API entitlement and result access | F0 live feasibility; F2 transfer | Recorded/fake-provider implementation and fault tests |
| CAD disclosure, seven-day expiry clock clarification, and provider/backup retention behavior | Before any SimScale upload | Local-only work; no external transfer |
| Verification engineer and explicit finite run/resource budget | Before any chargeable baseline/mesh/solve | Calculators, normalization and offline benchmark tests |
| Production host, authentication, private storage and backup policy | Hosted Q6/F6 | Local authenticated implementation and labeled public fixture demo |
| Supplier evidence retention/API authorization | Q2 real upload / Q5 | Independent FEA work and fictional quote testing |
| First real supplier, human acquisition owner, permitted handoff channel and recipient | Q1 real RFQ handoff | Frozen package preparation; no automatic send or invented response |

The plan does not purchase subscriptions, provision storage, create provider projects, send CAD or launch simulations. These decisions are checkpoints in future implementation, not assumptions that have already been approved.

### 22.3 FEA completion checklist

- [ ] Known identity/hash/staleness/concurrency/reload/cleanup/redirect defects have behavioral regressions and fixes.
- [ ] The exact selected Onshape version/configuration/body is exported through a proven contract and linked to the actual uploaded STEP digest.
- [ ] Imported geometry, material, loads, restraints, coordinate frame and monitoring regions are explicitly validated and human-reviewed.
- [ ] Transfer and solve approvals are distinct, authenticated, expiring and hash-bound; all chargeable operations fit an approved finite envelope.
- [ ] A real SimScale run is durably created, monitored, reconciled/canceled where needed and recovered across restart without unintended duplicate submission.
- [ ] Actual numeric stress/displacement/reaction/mesh/warning evidence is retrieved, normalized, integrity-checked and traceable to the exact run specification.
- [ ] Analytical agreement, manual parity, reaction balance and mesh convergence meet section 21 with actual provider evidence and engineer review.
- [ ] Target-part quality/applicability checks pass separately from the benchmark; results do not claim certification or unsupported physics.
- [ ] UI, backend, WebMCP context and JSON/report exports agree on the same source/setup/result/requirements and all current limitations.
- [ ] Recorded, live-unverified, verified-for-supported-scope, stale and unavailable evidence remain distinguishable; no silent fixture fallback.
- [ ] Seven-day local cleanup, provider-copy policy, protected downloads, recovery and backup expiry behavior are proven or explicitly blocked.
- [ ] Real quoting remains independent of FEA completion and never inherits a numerical verification label.
- [ ] Local and hosted readiness are separately evidenced; actual Python API/worker/private-storage operation is required for a hosted live claim.

### 22.4 Approved sequence and remaining operational decisions

The user authorized implementing this sequence. Account, recipient, retention and compute choices that require concrete values remain unresolved; general implementation approval does not supply them:

- [x] Prioritize verified live SimScale as the main engineering lane and genuine quotations as the second required outcome; begin supplier preparation early so response time can overlap development.
- [x] Use the top-level workspace for the first complete local release; preserve and safely gate the partner's embedded panel instead of making broad panel polish a prerequisite.
- [x] Use manual supplier-issued documents first. One reviewed actual quote satisfies the first quotation outcome; two compatible independent actual quotes are required for a real comparison. Q5 API work is conditional, not a blocker.
- [x] Retain the bounded single-part linear-static FEA scope and all numerical acceptance thresholds in section 21; do not substitute a merely successful run for verified results.
- [x] Preserve uv/Python/SQLite and private local artifact storage for initial delivery. Choose hosting separately; no Cloudflare storage, Azure service or other new infrastructure is assumed approved.
- [ ] Confirm quote-source retention (30 days proposed) and the seven-day CAD/FEA clock/provider-copy policy before their respective real operations.
- [ ] Supply/confirm the actual Onshape source, private SimScale account/project, engineering reviewer and explicit finite verification-run/resource budget when those live checkpoints are reached. Keep credentials out of the plan and conversation exports.
- [x] Keep human authority over uploads, compute, supplier sharing, review/disposition and any later release. No automatic purchases, CAD edits or broad provider-project deletion.

Implementation has begun at S0. Report each checkpoint with normal test results, real-evidence status and pending dependencies. Missing live-transfer/compute/supplier permissions are not implicitly granted. Do not commit/push or synchronize Notion as part of this checkpoint.

**Current result:** revision 3 retains the approved SimScale-first and genuine-quotation priorities and records the first local implementation checkpoint. Document 07 remains unchanged. Application code has changed as documented above; real CAD export, live verification and genuine quotation outcomes are still pending.
