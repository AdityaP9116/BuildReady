# DatumFlow — SimScale FEA Stress-Simulation Integration Plan

> **Status:** Original approved scope and design history. The authorized [combined implementation plan, sections 17–22](./08-datumflow-supplier-quotes-implementation-plan.md#17-feasimscale-gap-register-and-completion-boundaries) details the corrections and remaining FEA work. Live SimScale is not implemented or numerically verified at the current baseline.
>
> **Product naming:** DatumFlow is the intended product name; the current repository and code still use BuildReady. Renaming the codebase is not required to implement this integration.
>
> **Primary scope:** One-part, linear-static structural stress analysis using an exact Onshape Part Studio revision, SimScale as the solver, DatumFlow as the control and evidence layer, ChatGPT as the WebMCP agent, and a human engineer as the approval authority.

## Implementation status (2026-09-02)

This corrected inventory distinguishes existing scaffolding from proven completion. Use gates **F0–F6 in document 08** for the next execution sequence, including two-stage transfer/solve approval and controlled live commissioning before numerical verification. The historical FEA-0–FEA-6 sections below retain earlier design intent; they do not supersede that corrected sequence or authorize live operations. Document 08 also proposes clarifying the seven-day expiry clock; the duration is unchanged, but the start point must be confirmed before live transfer.

**Priority revision:** document 08 revision 3 records authorized implementation, starting with stabilization against partner baseline `4903386`. Initial local FEA reliability and source-context fixes are described in [checkpoint 09](./09-integration-implementation-checkpoint.md); they do not complete live SimScale or numerical verification. The top-level workspace remains the initial delivery surface, with expanded embedding and hosting separate.

| Gate | Implemented evidence | Remaining exit condition |
| --- | --- | --- |
| FEA-0 | Read-only account probe and setup checklist | Real account/project/solver/result-access feasibility; numerical verification occurs after the controlled live path exists |
| FEA-1 | Isolated Onshape STEP and SimScale storage/upload/import/topology/selection clients with mock tests | Correct the unverified Onshape `/m/` translation assumption, harden redirects, prove immutable-version export and real approved import |
| FEA-2 | Versioned bounded material/load/mesh/selection manifest and deterministic validator | Capture and freeze the account's current, manually verified SimScale static-analysis payload and prove named-selection mapping |
| FEA-3 | Local SQLite study records and visible recorded consent scaffolding | Authenticated full-manifest transfer/solve approval, scoped identity, durable jobs/audit, and concurrency/idempotency fixes; hosted storage remains undecided |
| FEA-4 | Recorded timeline advanced by reads; capability initialization in browser | Implement actual history/reload restoration, safe late-response handling, and real setup/mesh/run/status/recovery |
| FEA-5 | Hashed recorded results, unknown assessment, five FEA handlers and review-package propagation | Atomic finalization, consistent stale projections, full agent context, actual numeric extraction, backend assessment and numerical verification |
| FEA-6 | Explicit recorded labels, existing tests and documentation | Prove behavioral hardening, scheduled expiry, secure provider traffic, live numerical acceptance, and local/hosted readiness separately |

The earlier `cb88682` inventory preceded partner commit `deb87ba`, which added adaptive Onshape review, an embedded panel and Model Insight but not the live SimScale provider. Implementation started by reviewing the subsequent `4903386` compatibility fix and fast-forwarding to that baseline. Document 08 and checkpoint 09 distinguish the new local reliability fixes from outstanding live work.

## 1. Outcome

DatumFlow will let an engineer load a supported Onshape design, define a static structural test, review the complete setup, explicitly approve sending the design to SimScale, monitor the asynchronous run, and inspect a traceable result summary. ChatGPT can use DatumFlow's WebMCP tools to gather context, prepare the study, check progress, explain the results, and recommend next steps. ChatGPT cannot approve the study, certify the design, or modify the authoritative CAD model.

The intended experience is:

1. The engineer opens the DatumFlow design workspace and loads an Onshape Part Studio.
2. DatumFlow locks the analysis to the exact Onshape microversion.
3. ChatGPT or the engineer prepares a supported static-stress study.
4. DatumFlow validates the material, named geometry selections, loads, supports, units, mesh preset, and acceptance requirements.
5. The engineer sees the full setup and explicitly selects **Approve and run in SimScale**.
6. DatumFlow exports the approved Onshape geometry and sends it to SimScale through server-side APIs.
7. SimScale imports, meshes, solves, and post-processes the study asynchronously.
8. DatumFlow retrieves supported results, normalizes them into its evidence schema, and ties them to the original microversion and approved setup.
9. ChatGPT explains the evidence and proposes non-binding next steps.
10. The engineer decides whether to accept the evidence, change the CAD design, or prepare another run.

## 2. Responsibility boundaries

```text
Engineer
  - defines intent and requirements
  - confirms surfaces, loads, material, and units
  - approves external CAD transfer and compute use
  - makes the final engineering decision

ChatGPT
  - discovers DatumFlow tools through WebMCP
  - reads design and study context
  - prepares bounded study proposals
  - monitors and explains results
  - recommends, but never approves or certifies

DatumFlow browser application
  - presents the shared visible workspace
  - registers state-appropriate WebMCP tools
  - displays setup, approval, status, evidence, and audit history
  - never receives Onshape or SimScale secrets

DatumFlow backend
  - authenticates external services
  - exports exact Onshape geometry
  - calls SimScale's REST API
  - tracks asynchronous jobs and idempotency
  - validates and normalizes results
  - stores revision-bound evidence and audit records

Onshape
  - remains the CAD and revision authority
  - supplies metadata, parameters, microversion, and exported geometry

SimScale
  - remains the numerical-simulation authority
  - imports geometry, builds the mesh, solves the study, and produces results
```

WebMCP is the agent-facing control surface. It does not carry the full CAD file and does not perform FEA. The CAD moves server-to-server through the Onshape and SimScale APIs; compact commands and normalized evidence move between ChatGPT and DatumFlow through WebMCP.

## 3. MVP scope and deliberate exclusions

### Included

- One configured Onshape Part Studio at a time.
- One solid body or a tightly controlled bracket-style part.
- One exact Onshape microversion per study.
- STEP export from Onshape for SimScale import.
- Linear-static structural analysis.
- Isotropic, linear-elastic material.
- One material assignment.
- Fixed-support boundary condition.
- One force load for the first demo; pressure and torque remain excluded until force works end to end.
- A controlled mesh preset rather than arbitrary solver controls.
- Maximum von Mises stress and maximum displacement as required result metrics.
- A derived factor-of-safety estimate when a reviewed yield strength is available.
- Solver status, warnings, result provenance, and a deep link to SimScale.
- Human approval in the visible DatumFlow interface.
- WebMCP tools for preparation, inspection, status, and results.
- Exact-revision invalidation when the Onshape design changes.

### Excluded from the first integration

- Nonlinear materials, plasticity, buckling, fatigue, impact, thermal stress, CFD, or transient analysis.
- Large assemblies, complex contacts, bolts, welds, bearings, or pretension.
- Automatic inference of supports or loads from geometry alone.
- Agent approval, automatic CAD write-back, or an assertion that a part is production-safe.
- Generic support for arbitrary CAD systems and arbitrary SimScale analysis types.
- Full-field result rendering inside DatumFlow if the account/API does not expose a stable supported artifact route.
- Background agent autonomy after the engineer leaves the page.
- NIM, NGC, and Azure migration; direct ChatGPT remains the MVP agent.

These exclusions are safety and schedule controls. A simple study that is complete and auditable is more valuable than a broad study builder that silently guesses engineering inputs.

## 4. Recommended integration strategy

### 4.1 Use a prevalidated SimScale study template

The fastest reliable MVP is not to generate every SimScale setting from scratch. Create one baseline static-analysis project in SimScale manually and validate it with the demo bracket. Record the supported analysis version, material schema, mesh preset, result-control configuration, and boundary-condition payloads.

At runtime, DatumFlow imports the current exact geometry and creates a new simulation from the frozen, versioned template. Geometry references are supplied through named saved selections. The template must never be mutated by a user run.

Benefits:

- Reduces dependency on undocumented defaults.
- Makes identical inputs reproducible.
- Keeps the WebMCP schema small and understandable.
- Makes it possible to validate the generated SimScale payload against a known-good fixture.
- Produces a convincing hackathon demonstration without pretending to support arbitrary FEA.

### 4.2 Prefer named geometry selections

The hardest part of automated FEA is not uploading STEP; it is reliably identifying which bodies and faces receive material, supports, and loads. The MVP should define a naming contract:

| Name | SimScale selection type | Meaning |
| --- | --- | --- |
| `NS_BODY` | Volume | Solid body receiving the material |
| `NS_FIXED` | Face | Mounting faces constrained in the study |
| `NS_LOAD` | Face | Face receiving the approved load |
| `NS_MONITOR` | Face or volume | Optional result-control region |

SimScale documents saved selections and `NS_` tags for reusable assignments. If the exported Onshape geometry does not preserve the names reliably in the live account, the fallback is a one-time human mapping in SimScale followed by CAD associativity or API `swapcad`. DatumFlow must inspect the mapping response and refuse to run when any required path is unmapped or partially mapped.

No geometric-nearest-neighbor guessing is allowed in the MVP.

## 5. End-to-end data flow

### Stage A — Load and freeze the design

1. Reuse the existing Onshape proxy to read document metadata, named variables, and the current `microversionId`.
2. Create an immutable `DesignSnapshot` with the document, workspace, element, microversion, measurements, source URL, and retrieval time.
3. Calculate a stable snapshot key from the immutable identifiers.
4. If the active snapshot changes, invalidate draft validation and approval tied to the previous snapshot. Running and completed records are never erased or rewritten: their lifecycle state remains intact and a separate `currentness` field becomes `STALE` for the new active design.

### Stage B — Prepare the study

1. ChatGPT calls `prepare_static_stress_study`, or the engineer uses the equivalent visible form.
2. DatumFlow accepts only bounded inputs: material key, one supported load type, magnitude and unit, selection names, mesh preset, and acceptance requirements.
3. DatumFlow converts all values to SI internally and retains the user-entered value for display.
4. The deterministic validator checks completeness and physical sanity.
5. DatumFlow saves a `DRAFT` study tied to the exact `DesignSnapshot` and template version.
6. The visible page displays the full study. ChatGPT's response links the engineer to the review area rather than claiming that anything has run.

### Stage C — Validate and approve

The validation gate must confirm:

- The source is a real Onshape snapshot, not an unsupported fixture, unless demo mode is explicitly selected.
- The active microversion still matches the study snapshot.
- Exactly one supported body selection exists.
- At least one fixed-support face exists.
- At least one load face exists.
- Fixed and loaded selections do not unintentionally overlap.
- Material properties are present and unit-normalized.
- Load direction and magnitude are valid for the chosen load type.
- Mesh preset and analysis template are recognized versions.
- Acceptance requirements contain valid units and positive limits.
- The setup has no unresolved SimScale mapping warnings.

The approval panel must show:

- Onshape document and exact microversion.
- CAD file type and estimated transfer size.
- SimScale destination project/account.
- Material, supports, load, direction, and units.
- Mesh preset and result requests.
- Acceptance requirements.
- A notice that CAD intellectual property will be sent to SimScale.
- A notice that the run may use SimScale compute credits.

Only the visible **Approve and run in SimScale** control creates a human approval record. This endpoint must not be exposed as a WebMCP tool. Approval and submission can be one visible action for the MVP, but the audit record must distinguish `approvedAt` from the subsequent external operations.

### Stage D — Export geometry from Onshape

1. Recheck the Onshape microversion immediately before export.
2. Request an asynchronous STEP export targeting that immutable microversion rather than the mutable workspace head.
3. Poll the Onshape translation operation until complete or failed.
4. Download the export only on the server.
5. Enforce an MVP size limit, content-type check, timeout, and checksum.
6. Stream the CAD server-to-server and retain the private STEP artifact for seven days so the run remains reproducible during review. Do not send CAD bytes to the browser or include them in logs. Record its checksum, byte size, creation time, and scheduled deletion time.

The current Onshape proxy reads variables only. This stage requires a new export client; the existing sanitized design endpoint should remain unchanged so its trust boundary stays small.

### Stage E — Import geometry into SimScale

Using server-side `X-API-KEY` authentication:

1. Create or select the controlled SimScale project.
2. Call `POST /storage` to obtain temporary upload storage.
3. Upload the STEP bytes to the returned URL with `PUT`.
4. Call `POST /projects/{projectId}/cadimports` with the `storageId`, `format: STEP`, explicit input units, and frozen import options.
5. Store `projectId`, `cadId`, and `cadStateId` on the job record.
6. Poll `GET /projects/{projectId}/cadimports/{cadId}` until `FINISHED` or `FAILED`.
7. On failure, retrieve the CAD import event log and expose a bounded, sanitized diagnostic.
8. Fetch topology and saved selections from the completed CAD state.
9. Confirm that `NS_BODY`, `NS_FIXED`, and `NS_LOAD` exist with compatible entity classes.

SimScale's official getting-started API documents this storage, upload, CAD-import, topology, saved-selection, simulation-creation, and CAD-swap flow.

### Stage F — Create and run the static study

1. Build the SimScale simulation payload from the versioned local template.
2. Replace only the approved variables: CAD/state IDs, material values, load values/direction, named selection IDs, result controls, and run name.
3. Create the simulation with the documented simulations endpoint and persist its `simulationId`.
4. Read the created simulation back and compare its critical fields with the approved study before running.
5. Start the mesh/run through the account's current documented SimScale API endpoints.
6. Persist the returned run identifiers.
7. Return control immediately. Neither a browser request nor a WebMCP call should wait for the solve to finish.

Before implementation, use the SimScale account's current OpenAPI documentation to freeze the exact static-analysis model version and run/result endpoint schemas in contract fixtures. The public getting-started guide establishes the workflow but exact analysis payload versions can change; DatumFlow must not invent or loosely pass through SimScale payloads.

### Stage G — Monitor asynchronously

DatumFlow tracks the run as a state machine:

```text
DRAFT
  -> VALIDATED
  -> AWAITING_HUMAN_APPROVAL
  -> APPROVED
  -> EXPORTING_ONSHAPE
  -> UPLOADING_SIMSCALE
  -> IMPORTING_CAD
  -> CONFIGURING
  -> QUEUED
  -> RUNNING
  -> POSTPROCESSING
  -> COMPLETE

Any active lifecycle state -> FAILED

Currentness is orthogonal to lifecycle state:
CURRENT -> STALE when the active Onshape snapshot changes
```

Polling rules:

- The UI requests DatumFlow status, not SimScale directly.
- DatumFlow rate-limits upstream status checks and caches the latest response.
- A WebMCP status call performs one bounded read and returns immediately.
- Respect `Retry-After` and use exponential backoff for 429 and transient 5xx responses.
- Never retry validation, authentication, malformed-payload, or insufficient-credit failures automatically.
- Use an idempotency key based on study ID, approval ID, and snapshot key so a repeated browser/tool call cannot launch a duplicate paid run.

### Stage H — Retrieve and normalize results

When the run completes, DatumFlow retrieves only supported result resources and writes an immutable `SimulationResult` record. The MVP normalizer should produce:

```json
{
  "schemaVersion": "fea-result-1.0.0",
  "studyId": "study-...",
  "runId": "run-...",
  "status": "complete",
  "currentness": "current",
  "source": {
    "onshapeDocumentId": "...",
    "onshapeElementId": "...",
    "onshapeMicroversionId": "...",
    "snapshotKey": "..."
  },
  "solver": {
    "provider": "SimScale",
    "projectId": "...",
    "simulationId": "...",
    "simulationRunId": "...",
    "analysisType": "linear-static",
    "templateVersion": "static-bracket-1.0.0",
    "converged": true,
    "warnings": []
  },
  "inputs": {
    "material": {},
    "supports": [],
    "loads": [],
    "meshPreset": "standard",
    "requirements": {}
  },
  "metrics": {
    "rawMaximumVonMisesStress": { "value": 141.3, "unit": "MPa", "usableForAcceptance": false },
    "reviewedRegionVonMisesStress": { "value": 136.1, "unit": "MPa", "selection": "NS_MONITOR", "usableForAcceptance": true },
    "maximumDisplacement": { "value": 0.42, "unit": "mm" },
    "estimatedFactorOfSafety": { "value": 2.03, "basis": "yield/reviewed-region-von-mises" },
    "reactionForceBalanceErrorPercent": 0.4
  },
  "verification": {
    "meshConverged": true,
    "reviewedStressChangePercent": 3.2,
    "displacementChangePercent": 0.8,
    "possibleSingularityAtRawMaximum": true
  },
  "assessment": {
    "outcome": "requirements-not-met",
    "failedRequirements": ["minimum-factor-of-safety"],
    "limitations": []
  },
  "artifacts": [],
  "completedAt": "..."
}
```

Rules for interpretation:

- SimScale values are solver evidence; DatumFlow does not recalculate the finite-element solution.
- Factor of safety is explicitly labeled as a DatumFlow-derived estimate and records its material-property basis.
- A run cannot be marked `requirements-met` unless it completed, converged, contains every required metric, and has no blocking warning.
- A high value at a constraint or sharp corner should be flagged as a possible singularity, not automatically treated as a trustworthy peak.
- The raw global maximum is always preserved, but requirement comparison uses only a reviewed region/control result that passed mesh-convergence and singularity checks.
- Applied force and total reaction force must balance within the versioned verification tolerance.
- If stable APIs do not expose the desired numeric extrema, configure supported result-control outputs before the run or limit the MVP to metrics that the API reliably returns. Do not scrape the SimScale webpage.
- Full-field plots are optional for the first milestone. A verified SimScale deep link and numeric evidence are sufficient; add supported images/artifacts once the result API is proven.

### Stage I — Explain and recommend

ChatGPT receives the normalized result, not the raw solver project. DatumFlow should first compute a deterministic comparison with the engineer's declared requirements. ChatGPT then explains:

- What was tested.
- Which exact CAD revision was tested.
- Whether the solver completed and converged.
- Which requirements passed, failed, or could not be evaluated.
- Important limitations and warnings.
- A short ranked list of possible next investigations.

Recommendations must be phrased as proposals, such as increasing a local radius, increasing thickness, reconsidering material, checking the load case, refining the mesh locally, or consulting the full SimScale field plot. They must not claim that a suggested change will work until a revised design is simulated.

## 6. DatumFlow API contracts

All browser endpoints are same-origin. External credentials remain in the backend.

| Method and path | Purpose | Agent accessible? |
| --- | --- | --- |
| `GET /api/onshape/design` | Existing sanitized design snapshot | Through existing WebMCP tool |
| `POST /api/fea/studies` | Create a draft from bounded inputs | Through WebMCP wrapper |
| `GET /api/fea/studies/{studyId}` | Read setup, validation, approval, and current state | Through WebMCP wrapper |
| `POST /api/fea/studies/{studyId}/validate` | Deterministically validate draft | Through WebMCP wrapper |
| `POST /api/fea/studies/{studyId}/approve-and-submit` | Record human approval and begin external work | **Visible UI only** |
| `GET /api/fea/studies/{studyId}/status` | Return cached job progress | Through WebMCP wrapper |
| `GET /api/fea/studies/{studyId}/results` | Return normalized completed evidence | Through WebMCP wrapper |
| `POST /api/fea/studies/{studyId}/retry` | Retry only a safe failed transfer stage | Visible UI only for MVP |

Every mutation requires:

- an authenticated user/session for every live provider deployment; anonymous public deployments are recorded-provider only;
- exact expected state;
- exact snapshot key;
- idempotency key;
- strict schema with unknown fields rejected;
- bounded strings and numeric ranges;
- an audit event.

Standard error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "SIMSCALE_IMPORT_FAILED",
    "message": "SimScale could not import the approved STEP geometry.",
    "retryable": false,
    "studyId": "study-..."
  }
}
```

## 7. WebMCP tool surface

### `prepare_static_stress_study`

- Available on `/design` when a supported design snapshot is active.
- Creates or updates a draft only.
- Inputs: material key, load type/value/unit/direction, selection names, mesh preset, stress/displacement requirements.
- Returns: study ID, validation summary, missing inputs, snapshot key, and a pointer to the visible review panel.
- Does not export CAD, spend compute, or approve anything.

### `get_static_stress_study`

- Returns the approved/draft setup, validation status, provenance, and next permitted action.
- Read-only.

### `get_simulation_status`

- Available after human submission.
- Returns DatumFlow state, bounded progress text, upstream IDs, last update, retryability, and next recommended check time.
- Performs no unbounded wait.

### `get_simulation_results`

- Available only for a completed, non-stale result.
- Returns the compact normalized evidence and points to the full visible results page.
- Read-only.

### `compare_simulation_to_requirements`

- Runs a deterministic comparison on stored results.
- Returns pass/fail/unknown per requirement plus limitations.
- ChatGPT may use this output to draft recommendations.

### Human-only operations

The following must not be registered as WebMCP tools in the MVP:

- Approving external CAD sharing.
- Starting a paid SimScale run without a prior visible approval.
- Cancelling/deleting a SimScale project or run.
- Accepting the design as safe.
- Changing Onshape geometry.

Tool registration should follow the existing route/state-scoped pattern in `web/webmcp.js`, including `AbortController` cleanup and strict input schemas.

## 8. Persistent data and artifact model

The current application keeps workflow state in browser memory. Real asynchronous simulation requires a provider-neutral durable store. No production database or object-storage platform has been selected or provisioned yet. The implementation must depend on `FeaStore` and `ArtifactStore` interfaces so Cloudflare D1/R2, another managed service, or a later approved platform can be selected without changing the FEA domain or WebMCP contracts. Local development uses a gitignored SQLite database and private artifact directory through Python's standard library and `uv`.

Large artifacts are retained for seven days from a terminal run state (or creation time for abandoned jobs): exact STEP export, mesh archive, raw field results, solver logs, and result images. Structured study manifests, approvals, normalized result summaries, hashes, deletion receipts, and audit records remain until the project is deleted. The application offers immediate deletion and records provider-side cleanup failures. Real CAD and solver artifacts never enter Git or GitHub.

### `design_snapshots`

- `snapshot_key` primary key
- Onshape document/workspace/element/microversion IDs
- bounded document name and source URL
- measurement JSON
- retrieval time and checksum

### `fea_studies`

- `study_id` primary key
- `snapshot_key` foreign key
- state and state version
- template version
- normalized input JSON
- validation JSON
- created/updated timestamps

### `fea_approvals`

- `approval_id` primary key
- `study_id` foreign key
- approved snapshot key and input hash
- approving actor/session identifier
- CAD-sharing and compute notices acknowledged
- approval timestamp

### `simscale_jobs`

- `job_id` primary key
- `study_id` foreign key
- idempotency key unique
- project, CAD, CAD-state, simulation, and run IDs
- current stage, upstream status, attempt count
- sanitized failure code/message
- last-polled timestamp

### `fea_results`

- `result_id` primary key
- `study_id` unique foreign key
- immutable normalized result JSON
- result hash
- completion timestamp
- stale/detached reason if the active design later changes

### `audit_events`

- event ID, study ID, actor type, action, before/after states, timestamp, and bounded metadata
- Never store credentials, CAD bytes, presigned storage URLs, or complete upstream responses.

### `artifacts`

- artifact ID, study/run ID, kind, private storage key, checksum, byte size, MIME type
- creation, expiry, deletion, and provider-cleanup timestamps
- never stores artifact bytes in SQL or exposes a public bucket URL

## 9. Repository changes

```text
functions/
  _shared/
    http-errors.js                 # stable public error mapping
    onshape-api.js                 # authenticated Onshape requests
    onshape-export.js              # exact-microversion STEP export
    simscale-api.js                # fixed-origin API client, retries, redaction
    simscale-template.js           # frozen static-analysis payload builder
    fea-validation.js              # deterministic study validator
    fea-results.js                 # result normalization and requirement comparison
    fea-store.js                   # provider-neutral persistence contract and state transitions
  api/
    onshape/
      design.js                    # existing endpoint, behavior preserved
    fea/
      studies.js                   # create draft
      studies/[studyId].js         # read study
      studies/[studyId]/validate.js
      studies/[studyId]/approve-and-submit.js
      studies/[studyId]/status.js
      studies/[studyId]/results.js

web/
  fea-domain.json                  # material/load/template/preset allowlists
  fea-client.js                    # same-origin browser API client
  fea-state.js                     # visible state derived from server records
  fea-ui.js                        # setup, approval, progress, results panels
  webmcp.js                        # new state-scoped FEA tools
  app.js                           # routes and event binding
  styles.css                       # FEA workspace states

tests/
  fixtures/
    simscale/                      # sanitized official-contract responses
    onshape-export/                # translation/export responses
  js/
    simscale-contract.mjs
  test_fea_validation.py
  test_fea_state_machine.py
  test_simscale_proxy.py
  test_onshape_export.py
  test_fea_results.py
  test_fea_webmcp.py
  evals/
    webmcp-fea-prompts.json

docs/
  simscale-setup.md                # account, template, secrets, and demo setup
  fea-safety-and-limitations.md    # supported claims and engineering limits
```

Cloudflare Pages routing for deeply nested dynamic functions must be proven with a minimal deployed endpoint before the rest of the integration is built. If the routing convention becomes awkward, use flatter endpoint names while preserving the logical contracts.

## 10. Configuration and secrets

Add server-side deployment secrets:

```text
SIMSCALE_API_KEY
SIMSCALE_API_BASE_URL=https://api.simscale.com/v1
SIMSCALE_PROJECT_ID
SIMSCALE_TEMPLATE_VERSION
SIMSCALE_TEMPLATE_SIMULATION_ID
SIMULATION_PROVIDER=disabled|recorded|simscale
FEA_MAX_CAD_BYTES
FEA_STATUS_CACHE_SECONDS
FEA_ARTIFACT_RETENTION_DAYS=7
FEA_MAX_CONCURRENT_RUNS
FEA_DAILY_RUN_LIMIT
```

Continue using the existing Onshape secrets. For the hackathon MVP, a single controlled Onshape document and SimScale project are acceptable. For a multi-user product, replace shared credentials with Onshape OAuth and user-scoped SimScale authorization if SimScale provides an appropriate user-delegated mechanism.

Secrets must never appear in:

- client JavaScript;
- WebMCP definitions or results;
- audit records;
- error messages;
- source-control fixtures;
- logs or screenshots.

No OpenAI API key is required for the direct ChatGPT + WebMCP experience. ChatGPT is supplied by the host application; DatumFlow supplies the webpage tools.

## 11. Safety, privacy, and trust controls

- Show explicit CAD-sharing consent before the first SimScale transfer and on any destination-account change.
- Pin external API origins; never accept a caller-provided URL or path.
- Validate every identifier against a narrow pattern before building an upstream URL.
- Cap Onshape export and SimScale response sizes.
- Use timeouts and abort signals on every external request.
- Stream CAD where practical and discard temporary bytes after upload.
- Do not log CAD, presigned storage URLs, API keys, or full solver payloads.
- Keep external event-log text bounded and treat it as untrusted content.
- Use SI as the canonical internal unit system and display conversions explicitly.
- Record the exact material property source and yield-strength basis.
- Distinguish solver output, DatumFlow-derived metrics, and ChatGPT interpretation in the UI.
- Label the workflow as decision support, not certification.
- Preserve the original SimScale deep link for expert inspection.
- Mark results stale whenever they are viewed against a different active Onshape microversion.
- Require a new approval if any material, load, support, mesh, requirement, template, or design input changes.
- Require authentication and server-side quotas before enabling `SIMULATION_PROVIDER=simscale`; public anonymous deployments remain `recorded` or `disabled`.
- Automatically delete private geometry and raw result artifacts after seven days and retain deletion receipts in the audit record.
- State explicitly that the current radius preview is not part of the exported CAD until Onshape is changed and that new microversion is activated.

## 12. Reliability and failure behavior

| Failure | DatumFlow behavior |
| --- | --- |
| Onshape credentials unavailable | Keep controlled fixture available; real FEA submission disabled |
| Microversion changed before approval | Invalidate draft validation and require refresh |
| Microversion changed after approval but before export | Stop before transfer and require a new approval |
| Onshape translation failed | Mark `FAILED`; show sanitized translation status; do not call SimScale |
| CAD exceeds MVP size | Stop before upload with the configured maximum |
| SimScale storage URL expired | Request a new storage location and retry the upload once |
| SimScale CAD import failed | Record event-log summary; retain IDs for debugging; do not create a simulation |
| Required saved selection missing | Stop in `CONFIGURING`; require mapping correction |
| CAD swap partially mapped | Refuse to run until a human resolves every required path |
| SimScale authorization/credit failure | Fail fast; do not retry; explain that account action is required |
| Rate limit or transient outage | Bounded exponential retry, then retryable failure |
| Solver fails or does not converge | Preserve run evidence; result outcome is `indeterminate`, never pass |
| Result metric missing | Mark that requirement `unknown`; do not infer it |
| Browser closes during run | Server record remains; reopening the study resumes status display |
| Duplicate approval request | Return the existing job using the idempotency key |

## 13. Testing strategy

### Unit tests

- Unit conversion and range validation.
- Study input hashing and idempotency.
- Legal and illegal state transitions.
- Snapshot/revision invalidation.
- SimScale template construction.
- Required saved-selection validation.
- Result normalization and factor-of-safety derivation.
- Pass/fail/unknown requirement comparison.
- Secret and error-message redaction.

### Contract tests

- Onshape exact-microversion export request and translation polling.
- SimScale storage request and binary upload.
- CAD import, status, topology, state, and saved-selection responses.
- Simulation creation and read-back validation.
- Run status and supported result retrieval using sanitized fixtures captured from the account's current API.
- Upstream schema changes fail closed rather than silently dropping fields.

### Integration tests with mocks

- Complete successful asynchronous lifecycle.
- Every upstream failure listed in the failure table.
- Repeated requests do not launch duplicate jobs.
- Poll caching prevents excessive SimScale calls.
- Closing/reopening the browser restores the server-side state.

### Browser and WebMCP tests

- Tools appear only on the appropriate route and workflow state.
- ChatGPT can prepare a study but cannot approve it.
- The approval button visibly shows the final setup and disclosure.
- Status calls return quickly while a run is pending.
- A completed result updates the visible page before ChatGPT explains it.
- A changed Onshape revision makes the result visibly stale.
- Manual controls and WebMCP tools call the same handlers.
- Standard-browser fallback remains usable without WebMCP.

### Engineering validation

- Run a cantilever beam with hand-calculable bending stress and tip displacement. Each must agree within 5% away from the fixed-edge singularity.
- Run the baseline bracket manually in SimScale and through DatumFlow; approved inputs must match exactly and normalized metrics must agree within 1% or documented provider display-rounding tolerance.
- Check that total reaction force balances the applied force within 1%.
- Perform medium and fine mesh runs. Tip/maximum displacement must change by less than 2%, and reviewed-region stress by less than 5%.
- Preserve the raw peak stress, but never use a non-converging constraint/corner singularity to determine requirement acceptance.
- Have a human verify support faces, load faces, directions, units, and material before recording the golden run.
- Document known singularities and limitations.

## 14. Implementation sequence and checkpoints

### Gate FEA-0 — Prove account access

**Implementation note (2026-09-02):** the bounded read-only account probe and setup checklist are implemented in `scripts/simscale_probe.py` and `docs/simscale-setup.md`. The exit check remains open until the user's real account, manual baseline, and numerical verification evidence pass; live mode therefore remains disabled.

- Confirm the SimScale plan/account permits API access and has sufficient compute credits.
- Create the manual baseline static-analysis template.
- Make one authenticated read-only API request.
- Export the demo Part Studio manually and confirm SimScale imports it.
- Create the analytical cantilever verification case and record its equations, dimensions, expected stress, and expected displacement.
- Confirm the API exposes saved selections, created-study read-back, run status, required numeric result controls, reaction forces, warnings, and supported artifacts.

**Exit check:** a known-good Onshape geometry and SimScale static run exist; the automated interface exposes every required input and output; the cantilever meets the numerical acceptance thresholds. Until then, live mode remains disabled and no result is described as verified.

### Gate FEA-1 — Prove CAD transport

**Implementation note (2026-09-02):** the exact-microversion Onshape translation/download client and the SimScale temporary-storage, presigned upload, CAD-import polling, topology, and saved-selection clients are implemented with strict mock contract tests. Runtime wiring and the live exit check remain blocked by FEA-0; no CAD was sent externally.

- Refactor shared Onshape request logic without changing the existing design endpoint.
- Implement exact-microversion STEP export.
- Implement SimScale temporary storage upload and CAD import.
- Poll import status and retrieve topology/selections.
- Use mocks for all error modes.

**Exit check:** one visible DatumFlow action can transfer the approved demo revision to SimScale and show a completed CAD-import ID; no simulation runs yet.

### Gate FEA-2 — Freeze the study contract

- Capture the current static-analysis API payload from the verified template.
- Create `fea-domain.json` allowlists and the template builder.
- Implement deterministic validation and normalized units.
- Prove `NS_BODY`, `NS_FIXED`, and `NS_LOAD` mapping.

**Exit check:** the generated study payload matches the reviewed template, and every topology assignment is visible and validated.

### Gate FEA-3 — Human approval and durable state

- Add durable study/job/result records.
- Build the setup review and disclosure panel.
- Implement human-only approve-and-submit with exact preconditions and idempotency.
- Add audit events and stale-revision behavior.

**Exit check:** ChatGPT cannot trigger approval, changed inputs require reapproval, and duplicate clicks create one job.

### Gate FEA-4 — Run and monitor

- Create the SimScale simulation from the frozen template.
- Read it back and validate critical inputs.
- Start the run using the current documented endpoints.
- Add cached polling, terminal states, retries, and visible progress.

**Exit check:** the browser can be closed during a run and later reload the correct server-side status.

### Gate FEA-5 — Results and WebMCP

- Retrieve the two required result metrics and solver status.
- Normalize and hash the immutable result record.
- Add requirement comparison.
- Register the five FEA WebMCP tools with strict state scoping.
- Add visible evidence and SimScale deep link.

**Exit check:** ChatGPT prepares the study, the human runs it, ChatGPT monitors it, and the final explanation cites the exact revision, inputs, metrics, requirements, and limitations.

### Gate FEA-6 — Demo hardening

- Record a deterministic mock run for demos when external services are unavailable.
- Clearly label mock versus live evidence.
- Execute security, browser, contract, and engineering validation suites.
- Update README, demo script, testing notes, attribution, and feature-freeze documents.

**Exit check:** the live path works, the labeled fallback is reliable, and the demo never claims a live run when it is using recorded evidence.

## 15. MVP definition of done

The integration is complete only when all of the following are true:

- A real Onshape Part Studio is loaded and tied to an exact microversion.
- A STEP file from that immutable revision is uploaded to SimScale server-to-server.
- Required body/support/load selections are verified without geometric guessing.
- The engineer reviews and approves every consequential simulation input in DatumFlow.
- ChatGPT has no WebMCP path to approve or certify the design.
- A real SimScale linear-static study runs successfully.
- DatumFlow persists job state across page reloads.
- DatumFlow returns maximum stress, maximum displacement, convergence/status, warnings, and a traceable SimScale link.
- Requirement comparison is deterministic and distinguishes pass, fail, and unknown.
- Results retain the approved inputs, template version, SimScale IDs, and Onshape microversion.
- Changing the Onshape design marks the result stale.
- ChatGPT can explain the result and recommend next investigations without claiming final authority.
- The complete path has a recorded mock fallback and automated tests.

## 16. Decisions to verify before implementation

These are not reasons to delay the architecture, but Gate FEA-0 must resolve them:

1. Does the available SimScale account include API access, sufficient credits, and the required static-analysis/result endpoints?
2. Which one load type is the first demo: force, pressure, or torque? **Recommendation: force**, because it is simplest to verify.
3. Can named selections survive the Onshape-to-STEP-to-SimScale path in the chosen model? If not, seed the mapping in SimScale and use controlled CAD swapping.
4. Which material and yield-strength source will be frozen for the demo? **Recommendation: one reviewed Aluminum 6061-T6 fixture**, clearly labeled as demonstration data until verified.
5. Which numeric result resources are accessible through the account's current API? Freeze only those in the MVP contract.
6. Which authenticated production database and private object store will hold live jobs and seven-day artifacts? D1/R2 are candidates, not existing or approved infrastructure; the implementation remains provider-neutral until this is decided.

## 17. Sources

- [SimScale API — Getting Started](https://api.simscale.com/apidoc/v1/getting-started.html)
- [SimScale Simulation API](https://www.simscale.com/technology/simulation-api/)
- [SimScale CAD Preparation and Onshape Connector](https://www.simscale.com/docs/cad-preparation/)
- [SimScale CAD Associativity](https://www.simscale.com/knowledge-base/cad-associativity/)
- [SimScale named-selection templates using `NS_` tags](https://www.simscale.com/knowledge-base/simulation-templates-using-ns_-tags/)
- [Onshape REST API introduction](https://onshape-public.github.io/docs/api-intro/)
- [Onshape import and export API](https://onshape-public.github.io/docs/api-adv/translation/)
- [OpenAI site tools / WebMCP documentation](https://learn.chatgpt.com/docs/webmcp)
