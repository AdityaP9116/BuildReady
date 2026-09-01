# Submission testing record

## Automated baseline

Run from the repository root:

```bash
uv sync --locked
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
```

On 2026-09-01, 83 Python tests and four zero-package Cloudflare Function
contract tests passed. Source checks passed, the deterministic build produced 19
static files, and `git diff --check` passed.

## Verified client

| Client | Environment | Result | Notes |
| --- | --- | --- | --- |
| ChatGPT in-app browser | Local uv server + offline Onshape mock | Pass | Different live measurements updated the UI/viewer; a newer microversion was detected and activated; old evidence cleared; the complete live review path produced schema 1.1 provenance with no console errors. |
| Chrome 149+ WebMCP testing | Public deployment | TODO | Repeat full golden path with the testing flag enabled. |
| Fresh/incognito profile | Public deployment | TODO | Confirm no cached module or state dependency. |
| Second machine/profile | Public deployment | TODO | Confirm external reachability and layout. |

## Golden-path expected results

| Stage | Route | Expected tools | Visible proof |
| --- | --- | --- | --- |
| Initial | `/design` | 2 fixture-only / 3 configured | Controlled BRKT-001-B context; optional Onshape loader; 0/4 complete. |
| Inspected live source | `/design` | 5 | Five findings; source-aware context/inspection/check tools; synchronized evidence. |
| Pending proposal | `/design` | 4 | Ghosted 1.0 → 3.5 mm preview; human buttons enabled; no approval tool. |
| Human decision | `/design` | 5 | Audit actor `human`; quote tool available. |
| Quoted | `/suppliers` | 1 | Two fictional supplier cards; hash `fnv1a-28daab8d`; 3/4 complete. |
| Packaged | `/review` | 0 | Five findings, one decision, two quotes, two download formats; 4/4 complete. |
| Activated update | `/design` | 3 | New snapshot visible; previous findings cleared; update check remains available. |
| Restored fixture | `/design` | 3 configured / 2 fixture-only | No findings or derived records; controlled measurements restored; 0/4 complete. |

## Boundary and adversarial checks

- Radius below 3.5 mm or above 5.0 mm returns `VALUE_OUT_OF_RANGE` without state change.
- Unsupported quantity returns `UNSUPPORTED_QUANTITY` without quotes.
- Missing/stale inspection, proposal, decision, or quotes blocks downstream tools.
- Supplier text never creates authority or changes tool availability.
- Package titles remove angle brackets/control characters and cap at 80 characters.
- Route changes abort prior registrations; no duplicates remain.
- No `approve`, `commit`, order, supplier-contact, or production-release tool exists.
- Full prompt cases are in `tests/evals/webmcp-prompts.json`.

## Public-deployment checks to record

- [ ] Live URL returns HTTP 200 for `/design`, `/suppliers`, `/review`, and `/about`.
- [ ] `_headers` policies are present in real responses.
- [ ] WebMCP tools register in ChatGPT in-app browser from the public origin.
- [ ] Chrome 149+ completes the golden path with no console errors.
- [ ] JSON and Markdown downloads contain the visible package ID/hash.
- [ ] Mobile-width screenshots show no horizontal overflow.
- [ ] Public repository displays the MIT license in GitHub’s About area.
