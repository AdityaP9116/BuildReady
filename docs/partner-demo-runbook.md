# Partner handoff: BuildReady live commissioning

## What is delivered, and what is not verified

This checkpoint adds a working-code **operator-assisted** path, not a claim that a real solver run has passed. The ordinary Simulation page remains the recorded demonstration. Its separate **Live commissioning workspace** uses the configured SimScale API and is protected by the local private-workspace login.

Delivered: exact Onshape preparation/export; human measurement review; explicit CAD import; reviewed topology selection; bounded mesh creation/start/status; static-study/run creation/start/status; cancellation; provider CSV retrieval and unit normalization; private digest-checked CSV retention; immutable operation slots; and labeled fictional supplier cards.

Not demonstrated against the account: accepted CAD import/mesh/solve, actual result CSV headers, numerical benchmark/parity/convergence, or hosted Onshape embedding. Selection of manufacturing regions and SimScale faces is operator-reviewed, not automatic geometry recognition. Live results remain in the operator workspace; they do not silently advance the legacy recorded review-package/quote flow. These are important acceptance/integration limitations, not completed gates.

## 1. Prepare your machine

```powershell
git pull --ff-only
uv sync
uv run python -m unittest discover -s tests
uv run python scripts/check.py
uv run python scripts/serve.py --port 4173
```

The check script uses an existing Node runtime for JavaScript tests, but there is no npm installation or dependency tree. Application runtime and Python tests use uv and the Python standard library.

Configure your own `.env` using `.env.example`: Onshape credentials/source IDs, SimScale key/project ID, and `WORKSPACE_ACCESS_TOKEN` (at least 32 characters). **Credentials, CAD, databases and approval files are not in GitHub.** Another machine must provide its own credentials and export its own preparation. Do not send credentials in chat or commit them. Keep the server loopback-only; do not tunnel it publicly.

Open `/sourcing.html`, unlock with the local workspace token, and create a private workspace. Accept the seven-day CAD policy; choose quote retention only if using real originals. Fictional cards need no supplier-original upload.

## 2. Freeze CAD and review manufacturing inputs

```powershell
uv run python scripts/live_demo_preparation.py --inspect
uv run python scripts/live_demo_preparation.py --export
```

The Part Studio must have exactly one solid in the default configuration and an existing immutable version matching its current microversion. The script does not create a version or edit CAD. Retain the returned preparation ID; different machines/exports may have different STEP byte fingerprints.

In `/design`, load the Onshape source, expand **Source dimensions and missing checks → Review measured manufacturing inputs**, and enter the actual measurements, reviewer and face/drawing references. Leave unknown groups empty. Each completed group requires all of its fields. Applying inputs clears old conclusions; run the checks again. Values remain explicitly human-entered and session-only. Reloading requires review again. The inside-corner check uses the greater of the configured screening minimum and the selected cutter radius.

No drawing tolerance is guessed. No failure is edited away for the demonstration. Changes in Onshape must be followed by a revision check and activation of the new snapshot before using new conclusions.

## 3. Inspect the illustrative stress setup

Open `/live-demo.html`, unlock, select the workspace/preparation and choose **Inspect frozen setup**. This builder is intentionally restricted to the inspected 148.5 × 148.5 × 28 mm demo bracket. Other geometry needs a reviewed setup implementation rather than guessed selections.

The draft uses controlled demonstration 6061-T6 properties, four fixed hole walls, and 100 N total in global -Z on two central raised faces. Fixed walls idealize rigid mounting; no bolt contact, preload or gravity is modeled. These are illustrative assumptions, not confirmed service requirements or engineering certification.

## 4. Approve only a verified-free transfer/run allowance

In SimScale, confirm this project's visibility and that both static analysis and meshing are included at no charge. A working API key, an old quota screenshot, a CPU estimate, or the general pricing page does not establish current entitlement. Stop if any trial, payment, upgrade or uncertain pricing is involved.

Use this shape in the approval box, replacing the placeholders. False flags intentionally block execution until the operator has reviewed the facts:

```json
{
  "setupHash": "sha256-REPLACE_WITH_INSPECTED_SETUP_HASH",
  "projectId": "REPLACE_WITH_CONFIGURED_NUMERIC_PROJECT_ID",
  "expiresAt": 0,
  "maxSpendUsd": 0,
  "transferAcknowledged": false,
  "includedComputeConfirmed": false,
  "entitlementEvidence": "REPLACE_WITH_DATED_ACCOUNT_ENTITLEMENT_CHECK",
  "maxRuns": 3,
  "maxCoreHoursPerOperation": 1
}
```

`expiresAt` is a Unix timestamp at most one hour ahead. To obtain a five-minute timestamp:

```powershell
uv run python -c "import time; print(int(time.time()) + 300)"
```

The allowance covers at most three fixed mesh/run levels for this preparation/project. Each mesh has four processors and a 600-second maximum runtime; each solve has two processors and a 600-second maximum. Estimates must report a supported CPU-hour upper bound within the allowance and exactly one run. These caps limit resources; **they do not constitute a provider guarantee of zero cost**. The operator's verified free entitlement is mandatory.

Check the explicit human acknowledgment and choose **Upload this frozen STEP**. The upload can publish the nonconfidential demo geometry if the target project is public. It never uploads supplier originals. Then read the imported topology.

## 5. Map and execute

Inspect the imported body, dimensions, units, orientation and selected surfaces in SimScale. Replace the placeholders with actual imported entity names; Onshape face IDs are not interchangeable with SimScale names.

```json
{
  "body": ["IMPORTED_BODY"],
  "supports": ["FACE_1", "FACE_2", "FACE_3", "FACE_4"],
  "loads": ["FACE_5", "FACE_6"],
  "reviewer": "YOUR_NAME",
  "geometryParityChecked": false,
  "setupHash": "sha256-REPLACE_WITH_INSPECTED_SETUP_HASH",
  "cadId": "REPLACE_WITH_IMPORTED_CAD_UUID",
  "stateId": "REPLACE_WITH_IMPORTED_STATE_UUID"
}
```

Only confirm parity after checking it. Choose level 0 and **Advance this approved mesh / simulation**. Repeat that action to advance the same journaled operation after it finishes; renew expired approval as necessary. Levels 1 and 2 use progressively finer automatic mesh settings for convergence work. Provider warnings/errors or changed critical read-back values stop execution.

Cancellation accepts only recorded resources created by this preparation and remains available after CAD expiry. A cancellation request does not prove termination; check the actual provider status.

**Timeout rule:** an uncertain external write is never automatically replayed. Inspect the local journal and the SimScale project, then use **Verify and reconcile** with the exact stage and candidate IDs. Do not delete journal rows or re-export under a new identity to bypass this guard.

### Recover a lost response without repeating the action

Use the operation stage from **Read operation journal**. For example, a lost mesh-creation response uses:

```json
{
  "stage": "mesh-create-0",
  "reviewer": "YOUR_NAME",
  "providerEvidenceReviewed": true,
  "candidate": {"meshOperationId": "ACTUAL_PROVIDER_UUID"}
}
```

The `candidate` fields depend on the stage:

| Stage | Candidate fields |
| --- | --- |
| `import` | `storageId`, `cadId`, `cadStateId`, exact retained `stepSha256`, and `geometryParityChecked: true` |
| `mesh-create-N` | `meshOperationId` |
| `simulation-create-N` | `simulationId` |
| `run-create-N` | `simulationId`, `runId` |
| `mesh-start-N` / `run-start-N` | `targetId` matching the preceding recorded creation |
| `cancel-UUID` | Empty object `{}`; the target comes from the retained cancellation request |

Reconciliation uses provider GET requests, compares frozen specifications where available, and requires a terminal cancellation target or evidence that a start target left `READY`. It records an immutable reviewer/evidence digest and never repeats the original write. Import geometry and storage linkage are explicitly operator-attested, not proof from provider byte hashes. Legacy uncertain operations without retained request data remain blocked. After a recovered run-creation receipt, use the normal approved advance action to establish its specification/topology binding before capturing results.

## 6. Read actual results and verify them

When a run finishes, the operator output lists actual result IDs. Inspect the provider CSV headers and units, then supply this shape in **Result column mapping JSON**:

```json
{
  "reviewer": "YOUR_NAME",
  "columnsAndUnitsReviewed": false,
  "stress": {"resultId": "RESULT_UUID", "columns": ["ACTUAL_MAXIMUM_COLUMN"], "unit": "Pa"},
  "displacement": {"resultId": "RESULT_UUID", "columns": ["ACTUAL_MAGNITUDE_MAXIMUM_COLUMN"], "unit": "m"},
  "reactions": {"resultId": "RESULT_UUID", "columns": ["ACTUAL_X", "ACTUAL_Y", "ACTUAL_Z"], "unit": "N"}
}
```

Use the generated **BuildReady stress**, **BuildReady displacement** and **BuildReady reactions** resources. Confirm magnitude versus component, maximum versus minimum, and that the last reaction row is the converged final step. Supported units are Pa/MPa, m/mm and N. Unknown headers, compression, malformed/nonfinite values, changed run settings or mismatched identities block capture.

Raw CSV files and submitted run specifications stay under ignored `.runtime/live-demo`, expire with the seven-day CAD preparation, and are cleaned while the updated server is running. Minimal operation IDs/hashes remain for audit and cancellation. Provider-side copies are separate and are not automatically deleted.

Before claiming credible engineering results, complete the analytical benchmark, manual/provider parity, reaction balance, mesh convergence and singularity/region review from plan 08. The existing numerical verification contract is not automatically satisfied by reading CSV values. The operator page deliberately reports `engineeringVerified: false`.

## 7. Record the demo honestly

Show live Onshape source and measurement provenance; actual manufacturing findings or missing checks; the real SimScale run and unverified/verified evidence as appropriate; and **fictional** supplier comparison cards with unknown shipping/tax preserved. Do not portray recorded simulation values or sample prices as results for the real bracket.

The embedded Onshape panel still needs signed-in hosted acceptance. Use the existing panel setup instructions; a localhost standalone demo does not prove hosted iframe integration. A reusable preferred-supplier directory, automatic face recognition, and unified live-result WebMCP/review-package consumption remain follow-up implementation items. Lost-receipt recovery is operator-assisted and must not be presented as unattended reconciliation.

## Contract reference

Generated request fields/discriminators/enums were checked against the [official SimScale v1 schema, simulation 34.0 / meshing 10.0](https://api.simscale.com/v1/openapi.json?simulationSpecSchemaVersion=34.0&meshingSpecSchemaVersion=10.0). Local contract tests use a synthetic provider and do not consume account resources. Actual account acceptance remains a separate check.
