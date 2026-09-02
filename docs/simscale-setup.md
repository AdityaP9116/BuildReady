# SimScale read-only preflight

Live SimScale work remains disabled until the account, manual template, CAD import, and numerical verification gates pass. The repository currently provides a safe preflight plus the fully labeled recorded workflow; it does not claim a verified live run.

## 1. Confirm account capability

In SimScale, confirm that the target project allows API access and that the account has enough compute allowance for the planned verification runs. Create an API key from the account API Keys screen. SimScale documents that the v1 API uses the `X-API-KEY` header and that project API access is an explicit setting.

Copy `.env.example` to `.env`, add the key locally, and never commit `.env`:

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
