# Submission testing record

## Automated baseline

Run from the repository root:

```bash
uv sync --locked
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
```

On 2026-09-02, 103 Python tests and eight zero-package Node contract tests passed. Source and JavaScript syntax checks passed, the deterministic build produced 25 static files, and `git diff --check` passed.

## Verified client

| Client | Environment | Result | Notes |
| --- | --- | --- | --- |
| ChatGPT in-app browser | Local uv server + offline Onshape mock | Pass | Different live measurements updated the UI/viewer; a newer microversion was detected and activated; old evidence cleared; source-aware provenance remained consistent with no console errors. |
| ChatGPT in-app browser | Local uv server + recorded FEA provider | Pass | Five-stage path reached 5/5; human-only run approval was absent from WebMCP; completed simulation unlocked quotes; review schema 1.2 showed study/result hashes and indeterminate limitations with no final-origin console errors. |
| Chrome 149+ WebMCP testing | Public deployment | TODO | Repeat full golden path with the testing flag enabled. |
| Fresh/incognito profile | Public deployment | TODO | Confirm no cached module or state dependency. |
| Second machine/profile | Public deployment | TODO | Confirm external reachability and layout. |

## Golden-path expected results

| Stage | Route | Expected tools | Visible proof |
| --- | --- | --- | --- |
| Initial | `/design` | 2 fixture-only / 3 configured | Controlled BRKT-001-B context; optional Onshape loader; 0/5 complete. |
| Inspected live source | `/design` | 5 | Five findings; source-aware context/inspection/check tools; synchronized evidence. |
| Pending proposal | `/design` | 4 | Ghosted 1.0 → 3.5 mm preview; human buttons enabled; no approval tool. |
| Human decision | `/design` | 4 | Audit actor `human`; quote tool remains unavailable until simulation completes. |
| Prepared simulation | `/simulation` | 2 | Frozen study hash and visible human-only CAD-sharing/compute controls. |
| Completed simulation | `/simulation` | 5 | Recorded result is `indeterminate`; requirement comparison returns `unknown`; 3/5 complete after inspection/decision. |
| Quoted | `/suppliers` | 1 | Two fictional supplier cards bound to the simulation result hash; 4/5 complete. |
| Packaged | `/review` | 0 | Findings, decision, simulation hashes/limitations, two quotes, two download formats; 5/5 complete. |
| Activated update | `/design` | 3 | New snapshot visible; previous findings cleared; update check remains available. |
| Restored fixture | `/design` | 3 configured / 2 fixture-only | No findings or derived records; controlled measurements restored; 0/5 complete. |

## Boundary and adversarial checks

- Radius below 3.5 mm or above 5.0 mm returns `VALUE_OUT_OF_RANGE` without state change.
- Unsupported quantity returns `UNSUPPORTED_QUANTITY` without quotes.
- Missing/stale inspection, proposal, decision, simulation evidence, or quotes blocks downstream tools.
- Changed active snapshots persist `STALE` in the FEA store without changing a completed lifecycle state.
- Recorded FEA results cannot return an engineering pass or fail.
- Supplier text never creates authority or changes tool availability.
- Package titles remove angle brackets/control characters and cap at 80 characters.
- Route changes abort prior registrations; no duplicates remain.
- No agent-callable run approval, `commit`, order, supplier-contact, or production-release tool exists.
- Full prompt cases are in `tests/evals/webmcp-prompts.json`.

## Public-deployment checks to record

- [ ] Live URL returns HTTP 200 for `/design`, `/simulation`, `/suppliers`, `/review`, and `/about`.
- [ ] `_headers` policies are present in real responses.
- [ ] WebMCP tools register in ChatGPT in-app browser from the public origin.
- [ ] Chrome 149+ completes the golden path with no console errors.
- [ ] JSON and Markdown downloads contain the visible package ID/hash.
- [ ] Mobile-width screenshots show no horizontal overflow.
- [ ] Public repository displays the MIT license in GitHub’s About area.
