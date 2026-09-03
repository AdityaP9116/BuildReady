# SimScale read-only preflight

For the prepared local configuration and the five Onshape fields to fill next, use [Local integration setup](local-integration-setup.md). The user requires **$0 spending** and has approved only a public, non-confidential demonstration part. Earlier private-project prerequisites are not permission to purchase a plan or upload confidential CAD to Community projects. Account reads do not authorize compute.

Live SimScale work remains disabled until the account, manual template, CAD import, and numerical verification gates pass. The repository currently provides a safe preflight plus the fully labeled recorded workflow; it does not claim a verified live run.

Current implementation status:

- Recorded provider: complete for the human-gated orchestration demo.
- Read-only account probe: implemented in `scripts/simscale_probe.py`.
- Exact-project read: `uv run python scripts/simscale_probe.py --project` validates `SIMSCALE_PROJECT_ID` against the returned ID and reports the measurement system without printing keys, IDs or project text. It does not establish project visibility, write access or free compute entitlement.
- Version-bound Onshape STEP client: implemented and mock-tested in `scripts/onshape_export.py`, requiring an approved version-to-microversion match, one part and the default configuration. Real-account export provenance is not yet verified.
- SimScale storage, presigned upload, CAD import, topology, and saved-selection client: implemented and mock-verified in `scripts/simscale_transport.py`.
- Live SimScale provider: deliberately disconnected until every verification item below passes.

The two transport clients establish the security and API boundary only; they are not proof that a real stress study is correct.

## 1. Confirm account capability

In SimScale, confirm API access and the account's remaining free allowance. Do not upgrade or run simulations during setup. Create an API key from the account API Keys screen. The v1 API authenticates with the `X-API-KEY` header. Keep any key previously shared in chat revoked.

If `.env` does not exist, copy `.env.example` to `.env`. Otherwise preserve its existing settings. Add the key locally and never commit `.env`:

```dotenv
SIMSCALE_API_KEY=your-key
```

Then run exactly one bounded read:

```bash
uv run python scripts/simscale_probe.py
```

The probe calls `GET /v1/projects?limit=1&page=1`. It prints only reachability and collection counts; it never prints the key, project names, or project IDs. It never creates a project, requests temporary storage, uploads CAD, or starts compute.

## 2. Manual verification still required

Before setting `SIMULATION_PROVIDER=simscale`, complete and record all of the following:

- A baseline static bracket analysis in the intended SimScale project.
- A manually imported STEP export from the exact Onshape demo revision.
- Saved-selection support for body, fixed, load, and reviewed-monitor regions.
- Simulation setup read-back, run status, warnings, reaction force, stress, displacement, and artifact retrieval using the current v1 API.
- The frozen cantilever case within 5% for bending stress and tip displacement.
- Reaction-force balance within 1%.
- Manual-versus-automated parity within 1% (or a documented display-rounding tolerance).
- Medium/fine mesh change below 2% for displacement and 5% for reviewed-region stress.

Do not use the raw fixed-edge peak stress for acceptance when it fails mesh convergence. Preserve it as evidence and use the separately reviewed region for requirement comparison.

## 3. Current provider modes

- `recorded`: available; exercises durable orchestration and UI/WebMCP behavior, but returns an indeterminate, not-verified-live result.
- `disabled`: refuses approval/submission.
- `simscale`: intentionally rejected until the manual verification gate and exact payload capture are complete.

Current official references:

- [SimScale v1 API getting started](https://api.simscale.com/apidoc/v1/getting-started.html)
- [SimScale API and SDK documentation](https://www.simscale.com/docs/platform/api-and-sdk-documentation/)
- [SimScale API-key management](https://www.simscale.com/knowledge-base/manage-account/)
