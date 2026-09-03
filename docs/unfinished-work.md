# Unfinished work — 2026-09-03 push checkpoint

Update: the canonical simulation-evidence contract and private live-result persistence are implemented. Live SimScale results still need application/WebMCP activation, job reconciliation, numerical benchmark/convergence checks and engineering review before they can unlock downstream workflow claims.

**This is an in-progress implementation, not a verified full live demo.** Local regression tests and synthetic-provider tests do not establish account-backed engineering correctness. No live SimScale import, mesh or solve was performed for this checkpoint.

## Code still to finish

1. **Unified live-result workflow:** the new `/live-demo.html` operator workspace is separate from the existing recorded Simulation page. Connect live studies/results to the main application state, agent/WebMCP tools, history, freshness checks and review-package export. Do not substitute recorded results when live data is missing.
2. **Geometry recognition:** manufacturing inputs and SimScale face mappings currently require explicit human entry/review. The illustrative setup builder is limited to the inspected bracket. General-purpose geometry-to-role mapping is not implemented. Human manufacturing measurement reviews are now durably stored for seven days and bound immutably to the exact source snapshot; they remain manual evidence and never grant production approval.
3. **Recovery/reconciliation:** uncertain external writes are safely blocked from replay, but recovery of lost creation receipts is not automated. Add a verified reconciliation path, accessible durable operation details and explicit operator resolution. Do not bypass this by deleting journal rows or creating duplicate operations.
4. **End-to-end numerical acceptance:** connect real benchmark, manual parity, reaction balance, reviewed-region stress and mesh-convergence evidence into the existing verification contract. The new CSV reader returns actual metrics but deliberately leaves `engineeringVerified: false`.
5. **Supplier follow-ups:** the reusable preferred-supplier directory and optional authorized supplier API adapter remain unimplemented. Complete remaining genuine-quotation lifecycle/security/browser acceptance separately. Fictional supplier cards are available and never count as genuine supplier evidence.
6. **Lifecycle/hosting hardening:** provider-copy deletion, backup/orphan lifecycle acceptance and production/hosted authentication remain incomplete. Local cleanup runs only while the updated local server is running. Keep the development server loopback-only.

## Live verification still required

- Verify current included/no-charge entitlement for this account's static analysis and meshing. A key, quota screenshot or API resource estimate does not prove zero cost. No payment, upgrade or trial enrollment is authorized.
- Obtain explicit exact-CAD transfer and bounded compute approval, including the target project's visibility.
- Exercise actual STEP import; confirm imported shape, dimensions, units and orientation; review body/support/load selections.
- Confirm SimScale accepts generated mesh/static specifications, complete actual runs, and validate provider CSV resource names, column meanings and units. Published-schema field checks are not solver acceptance.
- Verify benchmark/parity, force balance, mesh convergence and stress singularities. The assumed aluminum/100 N bracket scenario is illustrative, not a confirmed service-load case.
- Test the new operator interface against a signed-in local workspace in the browser; authentication and lifecycle regression tests use isolated/synthetic services.
- Verify the signed-in, hosted Onshape extension and cross-application source updates. Local standalone operation does not prove iframe acceptance.
- Rehearse the entire real-CAD → reviewed manufacturing → live simulation → qualified results demonstration. Keep fictional quotations visibly separate.

## Partner setup

Follow [the partner runbook](partner-demo-runbook.md). Credentials, `.env`, exported CAD, SQLite databases, result CSVs and local approvals are intentionally excluded from GitHub. Your partner must configure their own machine and export a fresh preparation. The existing local export expires after seven days.

Do not present this push as completion of all FEA or quotation verification gates.
