# Remaining-gates handoff — 2026-09-03

This is a coding checkpoint, not a claim that the full live demo or engineering acceptance is complete. No provider transfer, solve, supplier contact, purchase or paid service was performed. The $0 constraint remains in force.

## Added in this continuation

- **Live-result read path:** the main Simulation page can load retained SimScale evidence by private workspace, preparation, evidence and reviewed part ID. Full immutable source matching, expiry and freshness checks prevent it becoming a current claim for another design. Active context, a read-only WebMCP tool and JSON download expose the same record. The recorded demonstration lane stays separate.
- **Numerical readiness:** an authenticated report checks consistent CAD/setup/topology binding, three distinct mesh levels/runs, reaction balance (at most 1%) and successive displacement changes (less than 2%). Analytical benchmark, manual parity, reviewed-region stress and engineering review remain unknown. It never grants engineering approval.
- **Preferred suppliers:** the private sourcing page supports versioned creation, editing and archiving. Selecting an active entry fills supplier identity/name in a quote draft and clears the independence acknowledgement. Historical quote snapshots are not rewritten. This directory neither authenticates suppliers nor authorizes sharing.
- **Retention maintenance:** a local dry-run reports expired originals and preparations. Explicit application deletes only expired local originals through existing cleanup routines; audit metadata remains. Provider copies and backups are outside this operation.

## Current gate boundaries

These continuation labels refer to the recent coding sequence, not the original project's separate F0–F6 acceptance numbering.

| Area | Status and remaining work |
| --- | --- |
| 1–2: evidence and manufacturing reviews | Foundations implemented; reviews are human-entered and revision-bound, not automatic geometry analysis. |
| 3: geometry/topology | Reviewed topology-to-run binding implemented. Arbitrary-part recognition and automatic mapping remain coding work. |
| 4–5: lifecycle and reconciliation | Durable lifecycle and operator-assisted recovery implemented/tested locally. Actual provider recovery acceptance remains. |
| 6: live result integration | Read/UI/context/tool/export path added. A unified commercial/engineering review package and full live workflow transition remain coding work. |
| 7: numerical correctness | Computable readiness checks added. Real benchmark/manual parity, convergence studies, reviewed stress region and engineering signoff remain. |
| 8: quotation lifecycle | Manual original-backed quotation workflow and preferred directory available. Genuine supplier evidence must still be obtained and reviewed. A directory entry is not a quotation. |
| 9: supplier API | Deferred until an actual supplier, authorized API contract/access and no-charge terms are selected. No fictional API is presented as integrated. |
| 10: retention/security | Local expiry/reporting available. Orphan recovery, provider-copy deletion, backup policy and operational acceptance remain. |
| 11: hosted/Onshape acceptance | Local integration exists; hosted identity/security and signed-in partner acceptance remain. Do not expose the development server publicly. |
| 12: end-to-end acceptance | Automated local regression coverage exists. Full browser rehearsal, real solver evidence and genuine quote acceptance remain. |

## Local verification and partner steps

Run from the repository directory:

```powershell
uv run python -m unittest discover -s tests
uv run python scripts/check.py
uv run python scripts/build.py
```

Start the app using the existing [local setup guide](local-integration-setup.md). Unlock `/sourcing.html` with the locally configured workspace token. Create/select a private project, save a preferred supplier, edit/archive it, and check that quote drafts remain pending until their original and terms are reviewed. Use clearly labeled fixtures for a fictional demo; never label them genuine offers.

For an already captured live result, open the main Simulation page and enter the exact private workspace, preparation, evidence and part IDs. Load/export the record and inspect numerical readiness. A successful capture or report is not an engineering pass. Changes to the source must make the old record stale or unresolved.

Retention inspection (does not delete originals; may initialize empty local databases):

```powershell
uv run python scripts/retention_maintenance.py
```

Only after inspecting the report, explicitly apply expiry if desired:

```powershell
uv run python scripts/retention_maintenance.py --apply
```

Deletion is irreversible without a separate backup. Quote-original cleanup processes up to 100 records per invocation; rerun inspection to see remaining expired entries. It does not remove historical metadata, provider copies or backups. No cleanup of the user's real originals was run for this checkpoint.

## Decisions needed before live acceptance

Confirm free account entitlements and visibility before any CAD transfer or solve. The partner must complete sign-in and review the exact supported part, material, loads, constraints and topology. An illustrative setup can demonstrate mechanics but cannot validate a real engineering use case. For real quotations, select a supplier and provide an original quote or authorized API access; no automatic supplier contact or purchase is enabled.

Continue coding the remaining package, geometry and operational-hardening items separately from these account-dependent acceptance steps. Do not mark all gates closed on the strength of unit tests.
