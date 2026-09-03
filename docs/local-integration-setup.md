# Local Onshape and SimScale setup

This is account/configuration preparation, not a completed live solver. No paid services, CAD writes, uploads or simulation runs are authorized by these checks. Use uv; there are no additional Python packages, npm packages or SDKs to install.

## Already prepared

- The selected SimScale project was read successfully using the local API key on 2026-09-03. Its returned ID matched the requested ID and its measurement system is SI.
- The local `.env` already contains the configured SimScale key/project and `SIMULATION_PROVIDER=recorded`. Its five Onshape fields are present but empty. Secrets were not printed, copied into documentation or committed.
- The project-specific check performs one GET with a ten-second timeout, a bounded response and redirects disabled. It does not list unrelated projects or expose their names.
- The user approved a public, non-confidential demonstration part only. This does not authorize public sharing of arbitrary CAD or supplier evidence. The project GET response does not expose visibility; verify the Public setting in SimScale before uploading anything.
- The user's screenshot showed ten simulations, 3,000 CPU hours and five AI credits remaining. That is user-provided allowance evidence, not an API-confirmed spending/compute approval. No allowance was consumed by the project GET.

## Your next step: fill five existing local fields

Open `.env` in the repository root. Do not overwrite it with `.env.example`; that would discard the working SimScale settings. Never share the file, API keys or secret key in chat/GitHub. Keep the SimScale settings unchanged.

1. Obtain an Onshape API key pair for read access from the [Onshape developer portal](https://dev-portal.onshape.com/keys). Use an account allowed to read your chosen non-confidential Part Studio. The viewer check needs no CAD-write authority; later export permissions require separate verification.
2. Enter `ONSHAPE_ACCESS_KEY` and `ONSHAPE_SECRET_KEY` in `.env`.
3. Open the intended **Part Studio** in an Onshape workspace, using its default configuration. Its URL has this structure:

   `https://cad.onshape.com/documents/DOCUMENT_ID/w/WORKSPACE_ID/e/ELEMENT_ID`

4. To avoid mixing up the IDs, run this offline command with your actual URL:

   ```powershell
   uv run python scripts/integration_preflight.py --onshape-url "YOUR_WORKSPACE_PART_STUDIO_URL"
   ```

   It prints the three non-secret configuration lines. Copy them into the existing `ONSHAPE_DOCUMENT_ID`, `ONSHAPE_WORKSPACE_ID`, and `ONSHAPE_ELEMENT_ID` fields. This command does not save the URL, change `.env`, or contact Onshape. Version (`/v/`) URLs and query/fragment configuration overrides are deliberately rejected by this workspace helper.

5. Save `.env`, then check it:

   ```powershell
   uv run python scripts/integration_preflight.py
   uv run python scripts/integration_preflight.py --check-onshape
   ```

   The first command is offline and prints only missing/invalid field names and readiness flags. The second contacts the existing read-only Onshape proxy implementation and reports a sanitized success/error code. It may make several bounded metadata reads with the existing retry policy; it does not export or upload geometry. An incomplete configuration is an expected nonzero exit, not a crash.

6. Start or restart the local application:

   ```powershell
   uv run python scripts/serve.py
   ```

   Open `http://127.0.0.1:4173/design` and choose the live Onshape source. The server and the preflight tools load the local `.env` themselves. Restart an already running server to pick up changes; existing process environment variables take precedence over `.env`.

## Recheck SimScale without a run

```powershell
uv run python scripts/simscale_probe.py --project
```

`ok: true`, `projectIdMatches: true`, and `measurementSystem: SI` confirm access to the exact configured project. `liveProviderEnabled: false`, `computeEntitlementVerified: false`, `writeAccessVerified: false`, and `visibility: not_verified` are honest expected limits of this read. Alternatively use `integration_preflight.py --check-simscale` for the same project check with the safe-provider-mode guard.

## If the Onshape check fails

- Missing/invalid fields: correct only those entries; do not paste secret values into diagnostics.
- `ONSHAPE_UNAUTHORIZED`: check the local key pair, access scopes, account permissions and revocation status. Never broaden to CAD-write permissions just to make a read work.
- `ONSHAPE_NOT_FOUND`: check the selected document/workspace/Part Studio and the key owner's access.
- `ONSHAPE_NO_VARIABLES`: no supported named or native dimension expressions were found. Native blind-solid extrusion depths and fillet radius expressions now load without named variables. This does not prove the underlying solid is invalid. Do not alter real geometry just to satisfy demonstration checks.
- No applicable measurement groups in the browser: the parameter-based viewer cannot infer enough evidence. CAD export and FEA geometry verification are separate capabilities.
- SimScale 401/403/404: the selected resource/key is not usable for the requested read. Resolve access, not payment; no auto-upgrade exists.

## Native bracket manufacturing checkpoint (2026-09-03)

The configured demo bracket now loads successfully through the real read-only proxy and browser WebMCP flow. Its 10 supported native expressions (eight blind-extrusion depths and two fillet radii) are inventoried with feature IDs and revision provenance. Suppressed features and stored depths for up-to-next/up-to-surface extrusions are excluded. No sketch constraints or final-solid geometry measurements are derived yet.

The current assessment is **incomplete: 0 of 5 checks evaluated**, not a manufacturing pass. Expand **Source dimensions and missing checks** in the design workspace to see the evidence and per-rule requirements. The fixture schematic is hidden for live CAD; inspect geometry in Onshape. Native parameter labels never automatically become pocket, wall or hole measurements. When a features response omits its microversion, the proxy re-fetches it using the immutable microversion before attaching provenance.

Next required measurements, bound to the exact final solid and reviewed for applicability:

| Check | Evidence still needed |
| --- | --- |
| Inside corner | Smallest relevant concave corner radius and proposed cutter radius |
| Pocket access | Depth and minimum accessible width of the same pocket |
| Thin wall | Minimum remaining wall/rib thickness, not extrusion height |
| Drilled hole | Depth and diameter of the same hole, with hole type identified |
| Mounting tolerance | Hole diameter and drawing-specified tolerance; CAD nominal diameter is not a tolerance |

Still needed in the implementation: geometry-to-role association and a revision-bound human measurement-review workflow. The inventory does not implement those capabilities. Existing named-variable inference remains labeled unreviewed; adding arbitrary variable names is not engineering verification. Live review packaging rejects missing check coverage. Material, process, quantity, finish, inspection and delivery requirements must also be supplied or explicitly left unknown.

Downstream order: identify/review the manufacturing inputs; select and freeze the exact version/part and verify STEP export; review material, supports, loads and acceptance criteria; complete the live SimScale worker and free-only entitlement/approval gates; verify benchmark and mesh convergence; acquire genuine no-fee supplier evidence and review/compare compatible quotes. Supplier evidence acquisition can proceed independently of FEA once the RFQ scope is frozen. No public CAD transfer, compute run, supplier contact, purchase or production approval was performed by this checkpoint.

## Still required before any live simulation

### Current prepared bracket

The exact current bracket has now been exported locally from an existing immutable version. The private preparation journal and CAD/geometry files live under ignored `.runtime/live-demo` with a seven-day lifetime. `scripts/live_demo_preparation.py --inspect` performs source discovery; `--export` reuses an intact completed export and refuses blind retries of uncertain writes. Run either through `uv run python`. These operations do not upload to SimScale or start compute.

The existing preparation can generate/recheck the illustrative setup without another provider request:

```powershell
uv run python scripts/live_demo_preparation.py --draft-setup 5fc5735c466df342420f332231a12feb28d5ffbfeeb6c8824a4e842939819c2d
```

The draft assumes 6061-T6, fully fixed walls of the four corner mounting holes, and **100 N total** toward the base across the two central raised top faces. It records actual source-face geometry and export fingerprints, not mapped SimScale selections. It is deliberately `engineeringVerified: false`, `computeAuthorized: false` and `manufacturingApproved: false`. The setup is private and expires with the CAD. Restart the local server after Python changes to activate its cleanup hook; expiry is enforced on access and cleanup occurs while that server is running.

The supplier demo now shows labeled fictional placeholders without requiring an FEA result. They are not actual offers for this bracket. Genuine supplier evidence stays in the separate private workflow; the preferred-supplier directory remains future work.

For a different or changed part, choose and freeze its immutable version, microversion, default configuration and single part again. For the prepared bracket, still verify imported geometry parity, material/support/load setup, topology mapping and provider read-back. Complete the live worker and numerical verification machinery, and obtain human approval for the specific public demo transfer and a bounded free-run allowance. The working API key, local export and viewer context do not satisfy those gates. Keep `SIMULATION_PROVIDER=recorded` or `disabled` until then.

The current project schema and GET route were checked against the [official SimScale v1 API](https://api.simscale.com/v1/openapi.json?simulationSpecSchemaVersion=34.0&meshingSpecSchemaVersion=10.0). The account/key is kept exclusively in local configuration. Private sourcing artifacts remain local, outside the public SimScale project.
