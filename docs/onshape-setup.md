# Connecting BuildReady to Onshape

BuildReady runs its entire workflow on the controlled BRKT-001-B fixture with no
account and no setup. Connecting Onshape is optional and additive: it replaces
the fixture's measurements with live ones from a Part Studio you own, and every
failure falls back to the fixture.

There are three ways to run it, in increasing order of setup.

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
named variable, and — the part that matters — which of BuildReady's nine
measurements it can currently fill:

```
BuildReady dimension coverage:
  [ok]      #insideRadius          -> inside-pocket-corner.insideRadiusMm
  [missing] #pocketDepth           -> deep-pocket.depthMm
  …
```

Add `--raw` to dump the underlying feature list if you want to see exactly what
Onshape returned.

### Why variables

BuildReady reads **named variables**, not raw geometry. A Part Studio that drives
its geometry from variables is one where the numbers BuildReady measures are the
same numbers the model is built from — so a finding refers to something real, and
a future correction has one unambiguous place to be applied.

Most existing models will show missing variables on the first probe. That is
expected. You are not modelling anything new; you are naming quantities the model
already has.

### Add the variables

In your Part Studio, use **Insert → Variable** (or a Variable Studio) for each
name below, then reference those variables from the features that already control
that geometry — the fillet's radius, the extrude's depth, the hole's diameter.

| Variable | Describes | Example |
| --- | --- | --- |
| `insideRadius` | Internal corner radius of the pocket | `1 mm` |
| `cutterRadius` | Radius of the intended end mill | `3 mm` |
| `pocketDepth` | Depth of the deep pocket | `24 mm` |
| `pocketMinWidth` | Narrowest width of that pocket | `6 mm` |
| `wallThickness` | Thinnest wall | `0.8 mm` |
| `holeDepth` | Depth of the deep drilled hole | `30 mm` |
| `holeDiameter` | Diameter of that hole | `5 mm` |
| `mountingHoleDiameter` | Diameter of the toleranced mounting hole | `8 mm` |
| `mountingTolerance` | Tolerance band on that hole | `0.02 mm` |

Each must evaluate to a **literal length** such as `1 mm` or `0.25 in`.
Expressions that reference other variables or do arithmetic are rejected rather
than guessed at, so that every measurement BuildReady reports is unambiguous.

The example values reproduce the five demonstration findings. Your own values
will produce whatever findings your geometry actually earns — which is the point.

### Run it

Re-run the probe. When all nine report `[ok]`, it prints the three ids to add to
`.env`:

```bash
ONSHAPE_DOCUMENT_ID=…
ONSHAPE_WORKSPACE_ID=…
ONSHAPE_ELEMENT_ID=…
```

Then run `uv run --env-file .env python scripts/serve.py` and load the live
model from `/design`. `uv` does not load `.env` unless `--env-file` is supplied.

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
| Repeated agent calls | Served from a 15-second cache; concurrent callers share one upstream read. |
| Any of the above | The app stays on the controlled fixture with a visible explanation. |

`tests/test_onshape_proxy.py` covers each of these against an in-process mock.

## Trust boundary

Onshape document text is external content. The proxy bounds it, the tool carries
`untrustedContentHint`, and the UI renders it with `textContent` only — it is
never treated as markup or as instructions. The proxy is read-only and holds no
write endpoints; the recorded write-back policy permits a new branch workspace
only, after a visible human approval, and is not implemented.
