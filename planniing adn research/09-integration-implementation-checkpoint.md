# Integration implementation checkpoint — 2026-09-02

Scope: local implementation checkpoint of document 08, prepared for the user's requested GitHub push. Not a live SimScale, production-security, numerical-verification or genuine-quotation completion claim.

## 2026-09-03 continuation: canonical simulation evidence (coding gate 1)

The recorded demonstration and operator-assisted SimScale lane now use the `buildready-simulation-evidence-2.0.0` schema family. A captured live record binds the immutable Onshape document, version, microversion, element, part and default configuration to the retained STEP and geometry digests, reviewed setup digest, provider project/simulation/run identifiers, exact result-resource digests and normalized metrics. It receives stable evidence/result hashes and is written immutably to the private preparation database. Repeating the same capture is idempotent; attempting to bind the same run to different evidence stops for reconciliation.

Raw SimScale CSV files remain in private seven-day storage and are never placed in browser state or Git. After preparation expiry, the immutable metadata remains available as an audit record while the retrieval view reports `EXPIRED` and `artifactsAvailable: false`. Column review and engineering verification are deliberately separate: real provider data starts at `engineeringVerification: pending`, so this checkpoint does not claim numerical correctness, convergence, a passed design or live-demo completion. The CLI can retrieve retained evidence without requiring expired CAD bytes, and its status reports the evidence count. No provider call was made for this checkpoint.

## 2026-09-03 continuation: durable manufacturing review (coding gate 2)

Human-entered final-solid measurements now pass through an independently validated, same-origin local API and a private SQLite record. Each record is bound to the full Onshape source snapshot key, content-fingerprinted, immutable for that snapshot and retained for seven days. The browser restores only an exact current-revision match after Onshape loading; a new revision cannot inherit an old review. Invalid, partial, non-finite or unacknowledged measurements fail closed, and a conflicting overwrite requires explicit reconciliation rather than silent replacement. Restored records remain labeled human-entered and `productionApproved: false`; saving or restoring clears dependent inspection, decision, simulation, quotation and package state through the existing source replacement path.

## Latest checkpoint: private quotations and provider foundations

### Operator implementation push — 2026-09-03

Supersedes earlier statements that only import transport exists: added an opt-in, local-operator-authenticated commissioning surface at `/live-demo.html`, controlled SimScale mesh/static specification builders, durable no-replay write slots, explicit zero-dollar/finite-resource approval checks, provider check/estimate/read-back guards, cancellation and actual CSV metric retrieval with private digest-checked retention. The prior provider-job scaffold also received lease, frozen-input, duplicate-reservation and immutable-ID fixes. The new operator workflow uses its own preparation journal; the scaffold is not the execution worker.

Added a revision-bound human measurement-review form in the main design workspace. It preserves manual provenance, leaves unknown groups missing, clears old conclusions, and does not certify manufacturability. Fictional supplier cards remain separate from genuine evidence. Generated mesh/simulation fields, enums and discriminators were checked against the published SimScale 10.0/34.0 schema; this is not account/solver acceptance.

**Still unfinished:** unified live-result agent/state/review-package integration; generic geometry recognition; durable manufacturing reviews; lost-receipt reconciliation; real numerical benchmark/parity/convergence; hosted Onshape/browser acceptance; preferred-supplier directory and remaining genuine-evidence acceptance. No actual SimScale upload, mesh, solve, supplier contact or purchase was performed. See [the full unfinished-work note](../docs/unfinished-work.md) and [partner runbook](../docs/partner-demo-runbook.md). No complete F/Q gate is claimed.

### Demo preparation update — 2026-09-03

This update supersedes earlier statements that no account-backed export exists. The current demo bracket was exported from immutable version `125575622815968ae7a8d480`, microversion `d7d14336bd8b2fb761b66a17`, part `JHD`, default configuration. The retained STEP is 180,745 bytes with SHA-256 `04d16459909ab54c020249e610a544038447708b337302103bd13c84ca45eaba`. Its revision-bound body inventory contains 137 faces and overall dimensions 148.5 × 148.5 × 28 mm. Export/source identity is evidenced; geometric parity after SimScale import is not.

- Added a private preparation journal and digest verification. Completed exports are reused; interrupted or uncertain exports block replay pending explicit reconciliation. STEP/body inventory and illustrative setup remain in ignored `.runtime/live-demo`, never in the static build. Seven-day expiry removes the registered CAD, geometry inventory and draft while retaining minimal journal metadata; cleanup runs while the updated local server is running. Provider copies and backups are not covered.
- Saved an illustrative linear-static setup: controlled 6061-T6 properties, fixed displacements on four full cylindrical mounting-hole surfaces, total `[0, 0, -100]` N distributed across the two central top faces (combined area 2,296.796460 mm²). This idealizes rigid mounting, omits bolt contact/preload and gravity, and is not a confirmed service load or production approval. Onshape face IDs must still be mapped to SimScale topology and checked by provider read-back.
- Corrected SimScale transport project-ID validation to the official numeric-string contract; CAD/state/run IDs remain UUIDs. No upload or solve was performed.
- Added independently visible fictional supplier cards. They are not priced for the active bracket, leave shipping/tax/final totals unknown and do not advance manufacturing or FEA evidence. No supplier contact, purchase or genuine quote was created. The reusable preferred-supplier directory is still planned.
- Verification: 177 Python tests and 21 JavaScript tests passed. Browser inspection confirmed the fictional labels, unknown costs and separate private-evidence link. Free compute entitlement and hosted Onshape embedding are not verified; browser sessions require sign-in. The live SimScale worker, imported topology mapping, numerical result retrieval, benchmark and mesh convergence remain incomplete. No complete F/Q gate is claimed.

**2026-09-03 native bracket follow-up (supersedes the empty-Onshape-fields note below):** the configured keys and model now authenticate and load in the local browser. Added matching Python/Cloudflare native-parameter inventory, suppression/inactive-extent filtering and immutable microversion re-fetch when the provider omits revision identity. The real bracket yielded 10 candidate expressions, zero named variables and zero complete manufacturing input groups. WebMCP screening returned `assessmentStatus: incomplete`, `manufacturingApproved: false`, and 0/5 evaluated checks, with explicit missing inputs. The UI, agent context and explanations carry those gaps; live review packaging rejects incomplete coverage. Native expressions are not final-solid measurements, automatic manufacturing-role mapping or reviewed inputs. The live fixture schematic is hidden. See the [manufacturing checkpoint and next steps](../docs/local-integration-setup.md#native-bracket-manufacturing-checkpoint-2026-09-03). Local regression validation: 168 Python tests and 20 JavaScript tests passed. Exact SimScale project read access was reconfirmed; write access, visibility, free compute entitlement and numerical correctness remain unverified. No upload, solve, supplier contact or purchase occurred. No complete F/Q gate is closed by this follow-up.

**2026-09-03 setup follow-up:** repaired the CI cleanup timing assumption using an explicit first-sweep sentinel, controlled-clock boundary tests and an independent idle-server check. Local validation now passes 163 Python tests, 17 JavaScript tests and a 33-file build. A real, bounded, read-only request confirmed access to the user's exact configured SimScale project and SI units; it does not prove visibility, write/compute permissions or numerical correctness. The user has approved a public non-confidential demo only. No geometry or simulation job was sent. Added secret-safe offline/explicit-read preflight commands and the [Onshape handoff guide](../docs/local-integration-setup.md). The five Onshape fields are present but empty locally; existing SimScale configuration is preserved. No FEA completion gate is closed by this account check.

This section supersedes the initial-slice status below. The user has set a **$0 spending constraint**: no paid simulations, hosting, subscriptions, quotation fees, purchases or orders. Live provider actions require confirmed no-charge access as well as their separate approval and verification gates. No paid run or supplier handoff was initiated during this work.

### Available code

- `/sourcing.html` is an independent local quotation workspace; it does not require an FEA pass. The original `/suppliers` demonstration remains fictional.
- `/api/private/` adds server sessions, CSRF checks, same-origin writes, owner-scoped workspaces and records, login throttling, private original-file downloads and human freeze/review challenges. The development configuration currently supports one local operator, not a deployed multi-user identity service.
- Original STEP/PDF/JSON files live in `.runtime/evidence/blobs` by default; metadata, sessions, audit and immutable record versions live in `.runtime/evidence/evidence.sqlite3`. Both are ignored by Git. The directory may be overridden with `EVIDENCE_RUNTIME_DIR`; it must remain outside published directories. Files are not encrypted by this application.
- Workspaces require explicit seven-day CAD retention and a chosen quote-original retention period. Thirty days is only the interface's proposal, not blanket user acceptance. Metadata remains until deletion; backup, orphan and provider-copy lifecycle acceptance remains unfinished.
- RFQs bind full entered Onshape version/microversion/part identity, actual uploaded STEP bytes/digest and manufacturing requirements. Uploaded CAD association is explicitly `user_attested`, not `export_verified`.
- Supplier originals have digests and field citations. Reviewed records retain their historical versions. Source, review, design match, validity and completeness are separate. Uploaded JSON is not relabeled as an authorized API response.
- Decimal-based comparisons preserve unknown costs. The test case with $505 in known costs remains a partial total when shipping or tax is unknown. Ranking requires complete eligible USD offers from independently attested suppliers; no automatic selection or purchasing exists.
- The Onshape export client checks an immutable version's microversion, uses the supported version translation route, requires a single part and currently restricts configuration to default. Credential-bearing provider requests now reject redirects by default. Actual account-backed export correctness is still unverified.
- `provider_jobs.py` adds a preliminary SQLite lease/idempotency/uncertain-write/run-reservation ledger. It is not connected to a live worker or public execution route and does not establish a no-charge entitlement. It has not yet received dedicated fault/concurrency acceptance tests.

### How to inspect the new local workspace

Use the existing uv launch command. Configure `WORKSPACE_ACCESS_TOKEN` in the server process with a locally generated secret of at least 32 characters; keep it out of Git and chat. Open `http://127.0.0.1:4173/sourcing.html` and unlock with that token. Without configuration, private evidence endpoints remain disabled. Do not expose this development server through a tunnel or public host. Use synthetic evidence until the remaining HTTP/browser/security checks are completed.

### Check results before partner merge

152 Python tests and 17 JavaScript tests passed; syntax/document checks and a 33-file static build passed. The added sourcing script passed syntax validation. The ten private-workspace backend tests cover owner isolation, session/CSRF checks, approval replay, concurrent freeze, immutable history, retention expiry, idempotency, strict money input and conditional/eligible comparisons. These are service-level tests, not proof that the entire new HTTP/UI workflow works. No new live SimScale or genuine supplier evidence was obtained.

### Known unfinished items to address next

1. Validate private HTTP/session/upload/download behavior and the actual sourcing browser workflow; tighten WebMCP nested schemas, selected-request filtering and delayed-response invalidation.
2. Implement withdrawal/dispute/supersession semantics. In particular, selecting an older reviewed quote after a correction must not allow current ranking. Add full supplier-total reconciliation and the remaining historical/report acceptance cases.
3. Bind compute reservations to each job's stored setup, test leases/recovery/uncertain-write reconciliation, and integrate the actual worker only behind confirmed no-charge entitlement and human approvals. The unconnected ledger must not be exposed as a production execution API.
4. Complete immutable CAD export provenance, topology/material/setup read-back, actual provider results, numerical benchmarks and engineering acceptance. Offline tests cannot close those gates.
5. Finish retention/recovery/backups, private file-system permissions, hosted-security review if ever needed, and real no-fee supplier evidence acquisition. Do not publish original CAD, supplier documents or credentials in Git.

No complete F or Q gate is claimed. This push preserves an in-progress checkpoint, not a production-ready release.

### Partner merge and push verification

The requested push found newer partner commit `5ca91d9` on `origin/main`. Local work was first preserved in `1c112d5`, then the partner changes were merged without replacing remote history. Resolution preserves the partner's generic Onshape context, unspecified live material/quantity and removal of fixture citations from live evidence, together with full source identities, measurement provenance, freshness guards, server-authoritative FEA preparation and the panel's identity-only workspace link. Browser and regression-test imports use the same updated module version to avoid duplicate state/client instances.

Post-merge checks: **152 Python tests and 17 JavaScript tests passed**, plus source/document/syntax checks and the **33-file static build**. No account-backed simulation, sourcing browser acceptance or genuine quote acquisition was added by this merge. Credential-pattern and staged-path checks found no private keys, recognized access tokens, environment secrets, runtime databases, original CAD or supplier PDFs in the staged changes. Ignored runtime data remains local. GitHub CI results are separate from these local checks and are not claimed here.

## Historical initial slice

## Baseline and preserved work

Reviewed and fast-forwarded partner commits `deb87ba` and `4903386`. The latter fixes direct Onshape function calls without a request URL. Existing planning files were preserved; document 07 is unchanged. No new dependencies, npm/pip use, commit, push, deployment or Notion write.

## Implemented

### Source and agent consistency

- Initial load and revision refresh use the same configured Onshape client module. A response for a different document, workspace/version or Part Studio is rejected.
- Full source scope, element and microversion identify parameter snapshots. Missing microversions fail closed. These are explicitly parameter snapshots, **not exported CAD evidence**; configuration/body/export work is still required.
- Checking, changed and unresolved status prevents new conclusions/approvals; Model Insight and tool availability follow that status. Delayed assistant and simulation responses cannot repopulate reset/replaced state.
- Live material and manufacturing process no longer inherit the fixture's reviewed-looking values. Variable/native feature provenance, input review status and inspection coverage survive tool and report serialization. Rule arithmetic remains deterministic demonstration guidance, not physical geometry verification.
- Panel preview handles the revision label safely. Incomplete panel quote/package actions are disabled, with a validated identity-only handoff to the full workspace. The handoff reloads the source; it does not transfer in-memory evidence or secrets.
- Audit entries use text nodes. The panel framing override removes the inherited conflicting policy; actual hosted iframe acceptance is still required. Local HTTP header behavior has a regression test.
- Node tests use supported flags and CI specifies Node 24.11.0. Both proxies allow the same bounded variable count; the missing-microversion path releases its in-flight request slot.

### Recorded FEA reliability

- Browser preparation posts an unsigned, validated manifest to `POST /api/fea/prepare`. Python validates and generates the authoritative fingerprint; UI/tool review uses the returned frozen values. Existing signed-study endpoints remain compatible with existing stored manifests; they are not the browser preparation path.
- SQLite `BEGIN IMMEDIATE` transactions serialize study creation, approval and recorded finalization across connections/store instances. Concurrent status polls return one immutable result rather than rewriting it.
- Result artifacts use digest-addressed directories and exclusive creation. Historical normalized results and their fingerprints are not rewritten when current applicability changes.
- Results return an applicability envelope plus current study state. Changing one source only invalidates the explicitly replaced snapshot, not every model in the database. This is local scoping, not multi-user authorization.
- Stale, missing, nonfinite, negative, wrong-unit or unverified numerical evidence cannot become a pass through coercion. Mesh convergence uses strict less-than limits as specified in the plan.
- Live Part Studio study creation remains blocked until exact CAD/material/topology inputs exist; demonstration defaults cannot silently become a live setup. Stress-simulation questions are no longer routed to radius previews.
- The development server is loopback-only and rejects unexpected Host, cross-origin/cross-site API requests and non-JSON writes. This reduces local exposure but **does not implement authenticated owner-scoped services or production CSRF/approval tokens**.
- While the local server is running, expiry is checked every minute, even without browser traffic. Cleanup refuses paths outside the artifact root and retains metadata. This does not solve provider-copy deletion, backup expiry, orphan cleanup or crash-recovery acceptance.

## Verification

Run normal commands from the repository root:

```powershell
uv run python -m unittest discover -s tests
uv run python scripts/check.py
uv run python scripts/build.py
```

Latest checkpoint: 142 Python tests and 17 JavaScript tests, with no skips, plus syntax/document checks and a 30-file static build. Re-run after subsequent changes; no claim is made about a new GitHub CI run.

Behavioral coverage includes wrong-source rejection, full-identity collision cases, changed/failed refresh, inferred-input provenance, late async response rejection, assistant clear races, server-generated hashes, malformed verification values, exact snapshot invalidation, cross-connection concurrent finalization, immutable historical results, unsafe cleanup paths, local HTTP origin checks and framing headers, and scheduled cleanup invocation. Hosted header composition and authenticated cross-owner tests remain future acceptance work.

Actual local browser checks used the controlled fixture: native page WebMCP inspection returned five issues; bounded radius preview rendered its revision; study preparation with direction `[1e-9, -1, 0]` successfully crossed browser/HTTP/Python and displayed the returned fingerprint, with recorded labels and no browser console errors. No approval button was used, no CAD uploaded, and no provider solve launched. One unapproved local recorded test draft was created; it is not a real run or supplier evidence. Complete recorded progression is covered by isolated backend tests.

## What remains, in order

1. Finish shared F1/Q1 source and security: authenticated project ownership, actual immutable-version/configuration/body export with STEP receipt/digest, private artifact service, reviewed retention clock, protected downloads and separate hash-bound transfer/solve approvals. Harden existing provider/export redirects and prove supported contracts.
2. Implement F2/F3 live SimScale setup, read-back, topology mapping, durable jobs/leases, resource-budget enforcement, reconciliation and cancellation using current account-verified schemas. Restricted commissioning stays live-unverified.
3. Implement F4 real resource parsing and backend assessments, owner-scoped history/reload, requirement completeness, truthful engineering reports and all asynchronous context propagation.
4. Complete F5 analytical/manual/automated parity, reactions, mesh convergence and target-part applicability with actual SimScale evidence and engineering review. Offline tests cannot replace these checks.
5. Build the independent Q0–Q4 genuine quote workflow: frozen manufacturing request; private supplier evidence; structured reviewed terms; Decimal calculations and unknown costs; compatible-offer comparison; human sharing authority; WebMCP/report integration. The existing supplier screens are still fictional and still use the legacy FEA-dependent fixture flow.
6. Finish local recovery/retention/security acceptance. Supplier API and hosted release remain conditional later gates.

Needed before live work: exact approved Onshape version/configuration/body; private SimScale project and API/result entitlement; reviewed material/support/load scope; named engineering reviewer and finite run/resource budget; supplier/recipient/acquisition owner; and explicit quote-source retention. Keep credentials local, not in this document or chat.

No F or Q gate is closed by this checkpoint. S0 code and local regression work are substantially addressed, with hosted embedding and complete embedded workflows deliberately not certified.
