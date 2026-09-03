# Connecting BuildReady to Onshape

BuildReady runs its entire workflow on the controlled BRKT-001-B fixture with no
account and no setup. Connecting Onshape is optional and additive: it replaces
the fixture's measurements with live ones from a Part Studio you own, and every
failure falls back to the fixture.

There are three ways to run it, in increasing order of setup.

To run BuildReady *inside* the Onshape user interface as a right-panel
extension, complete the API connection below and then follow
[`docs/onshape-extension.md`](onshape-extension.md). The extension uses the
active Part Studio context supplied by Onshape, subject to an explicit server
document allowlist.

---

## 1. Offline, with no Onshape account

Exercises the complete pipeline — proxy, adapter, tool registration, UI — against
a recorded Onshape response. Use this to see the feature working immediately, and
to test failure handling.

```bash
# Terminal 1
uv run python scripts/mock_onshape.py

# Terminal 2
ONSHAPE_ACCESS_KEY=test ONSHAPE_SECRET_KEY=test \
ONSHAPE_DOCUMENT_ID=000000000000000000000001 \
ONSHAPE_WORKSPACE_ID=000000000000000000000002 \
ONSHAPE_ELEMENT_ID=000000000000000000000003 \
ONSHAPE_BASE_URL=http://127.0.0.1:4188 \
uv run python scripts/serve.py
```

Open `http://127.0.0.1:4173/design`. The design-source card now offers **Load
live Onshape model**. Loading it switches the active design, and the five rules
re-run against the mock's measurements.

To see graceful degradation, restart the mock with a failure mode:

```bash
uv run python scripts/mock_onshape.py --fail unauthorized
uv run python scripts/mock_onshape.py --fail slow       # exceeds the timeout
uv run python scripts/mock_onshape.py --fail garbage    # non-JSON body
uv run python scripts/mock_onshape.py --fail empty      # model with no variables
```

The app must stay on the controlled fixture and explain what happened. It must
never show a broken workflow.

---

## 2. Against your real Onshape documents

### Get API keys

Go to <https://dev-portal.onshape.com/keys> and create a key pair. Read scopes
are sufficient — BuildReady never writes. Copy `.env.example` to `.env` and fill
in `ONSHAPE_ACCESS_KEY` and `ONSHAPE_SECRET_KEY`. `.env` is gitignored.

### See what BuildReady can read

```bash
uv run python scripts/onshape_probe.py documents
```

This lists your most recent documents with their URLs. Then point it at one:

```bash
uv run python scripts/onshape_probe.py inspect "https://cad.onshape.com/documents/…/w/…/e/…"
```

The probe reports the Part Studios in the document, every feature it found, every
named variable, and — the part that matters — which manufacturing roles
BuildReady can infer:

```
BuildReady semantic inference:
  [high  ] #internal_relief_rad -> cornerRadius (1.2 mm)
  [high  ] #cavity_z_depth      -> pocketDepth (26 mm)
```

Add `--raw` to dump the underlying feature list if you want to see exactly what
Onshape returned.

### Why variables

BuildReady reads **named variables**, not raw geometry. A Part Studio that drives
its geometry from variables is one where the numbers BuildReady measures are the
same numbers the model is built from — so a finding refers to something real, and
a future correction has one unambiguous place to be applied.

Exact names are not required. BuildReady recognizes descriptive combinations of
measurement and manufacturing context, resolves candidates without reusing one
variable for two roles, and leaves ambiguous or unrelated values unmapped. Most
existing models will still need a few descriptive variables because Onshape's
feature list does not expose every design-intent quantity in a stable form.

### Name the model intent descriptively

In your Part Studio, use **Insert → Variable** (or a Variable Studio), then
reference those variables from the features they control — the fillet radius,
extrude depth, or hole diameter. These are examples, not required identifiers:

| Variable | Describes | Example |
| --- | --- | --- |
| `internal_relief_rad` | Internal corner radius of the pocket | `1.2 mm` |
| `endmill_tool_rad` | Radius of the intended end mill | `3 mm` |
| `cavity_z_depth` | Depth of the deep pocket | `26 mm` |
| `cavity_min_span` | Narrowest width of that pocket | `14 mm` |
| `rib_web_gauge` | Thinnest wall | `0.9 mm` |
| `coolant_bore_depth` | Depth of the deep drilled hole | `34 mm` |
| `coolant_bore_dia` | Diameter of that hole | `5 mm` |
| `fixture_bolt_bore_dia` | Diameter of the mounting hole | `8 mm` |
| `fixture_bolt_fit_tol` | Tolerance band on that hole | `0.018 mm` |

Each must evaluate to a **literal length** such as `1 mm` or `0.25 in`.
Expressions that reference other variables or do arithmetic are rejected rather
than guessed at, so that every measurement BuildReady reports is unambiguous.

The example values exercise all five rules. Your own descriptive names and values
produce the coverage and findings your model actually supports.

To create the repository's complex native test part automatically, use a key
with document/Part Studio write scope for this one command:

```bash
uv run python scripts/create_onshape_demo.py --apply
```

The generated fixture includes 24 variables, seven sketches, seven extrudes,
walls, bosses, ribs, through-holes, counterbores, and deep ports. Fifteen
variables are deliberate distractors. Normal BuildReady runtime remains GET-only
and should use read-only credentials.

### Run it

Re-run the probe. When at least one complete rule group is confidently inferred,
it prints the three ids to add to `.env`:

```bash
ONSHAPE_DOCUMENT_ID=…
ONSHAPE_WORKSPACE_ID=…
ONSHAPE_ELEMENT_ID=…
```

Then run `uv run python scripts/serve.py` and load the live model from `/design`.
The server explicitly reads `.env`; an already running server needs a restart.
For secret-safe readiness checks and URL-to-ID extraction, see
[Local integration setup](local-integration-setup.md).

When the local server is exposed through an HTTPS tunnel for an embedded-panel
test, explicitly allow that exact origin before starting it:

```bash
BUILDREADY_ALLOWED_ORIGINS=https://your-tunnel.example \
uv run --env-file .env python scripts/serve.py
```

This is an exact, HTTPS-only allowlist. Do not use a wildcard or add an origin
you do not control.

### Check for and activate a newer revision

Once a live model is active, use **Check Onshape for updates** or call
`check_onshape_revision`. The check is read-only: it keeps the current snapshot,
findings, proposal, quotes, and review evidence in place while reporting the
candidate microversion and changed measurement keys.

If a newer microversion is available, activate it with the visible control or
`activate_onshape_revision`. Activation requires the expected current revision,
the exact checked candidate revision, and an explicit acknowledgement when old
revision-bound evidence exists. The measurement panel, schematic viewer, design
context, and tool descriptions switch together. Old findings and downstream
records are cleared, so run inspection again against the new snapshot.

The live values remain runtime state and never modify checked-in fixture JSON.
Generated review JSON and Markdown retain the Onshape document, workspace,
element, microversion, retrieval time, feature dimensions, and evidence links.

---

## 3. On the public deployment

In the Cloudflare Pages project, add the same five `ONSHAPE_*` values as
**secrets** (not plaintext environment variables) and redeploy. The Function at
`functions/api/onshape/design.js` reads them; they never reach the browser.

Without them the endpoint returns `ONSHAPE_NOT_CONFIGURED`, the control is never
offered, and the deployment behaves exactly as the fixture-only build.

---

## What the pipeline does under stress

| Condition | Behaviour |
| --- | --- |
| Bad or revoked credentials | Fails immediately, no retry — a rejected key never succeeds and retrying only burns quota. |
| Document or element deleted | Fails immediately with `ONSHAPE_NOT_FOUND`. |
| Onshape rate limit (429) | Retried up to 3 times, honouring `Retry-After`. |
| Transient 5xx or network drop | Retried with exponential backoff; recovers silently. |
| Onshape slow or unreachable | 8-second per-attempt timeout, then `ONSHAPE_TIMEOUT`. |
| Non-JSON body (captive portal, outage page) | Retried, then reported; never parsed as a model. |
| Response larger than 8 MB | Rejected rather than buffered. |
| Part Studio with no variables | `ONSHAPE_NO_VARIABLES`, distinct from an outage. |
| No complete inferred measurement group | `ONSHAPE_NO_APPLICABLE_MEASUREMENTS`; no inspection is created. |
| Partial semantic coverage | Supported rules run; skipped rules are reported in coverage. |
| Repeated agent calls | Served from a 15-second cache; concurrent callers share one upstream read. |
| Any of the above | The app stays on the controlled fixture with a visible explanation. |

`tests/test_onshape_proxy.py` covers each of these against an in-process mock.

## Trust boundary

Onshape document text is external content. The proxy bounds it, the tool carries
`untrustedContentHint`, and the UI renders it with `textContent` only — it is
never treated as markup or as instructions. The proxy is read-only and holds no
write endpoints; the recorded write-back policy permits a new branch workspace
only, after a visible human approval, and is not implemented.
