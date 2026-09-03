# BuildReady as an Onshape extension

BuildReady can run as an **Element right panel** extension inside an Onshape
Part Studio. The engineer keeps the real Onshape model and feature tree visible;
BuildReady appears beside it with the complete read-only DFM review workflow.

The extension is an additional delivery surface. `/design` remains the top-level
WebMCP experience, while `/onshape-panel` is deliberately optimized for a narrow,
cross-origin iframe and visible human controls.

## Architecture and boundaries

```text
Onshape Part Studio
  ├─ native graphics + feature tree
  └─ Element right panel iframe
       └─ /onshape-panel
            ├─ validates Action URL context
            ├─ applicationInit + keepAlive client messages
            ├─ same-origin /api/onshape/design request
            └─ check → review findings → ask questions
                         │
                         ▼
              allowlisted server proxy
                         │ API key (server only)
                         ▼
                Onshape read APIs
```

There are two independent checks:

1. `web/onshape-extension.js` validates identifier shapes, `w`/`v` context,
   HTTPS, the Onshape server hostname, parent-window identity, and exact message
   origin. It posts to an exact target origin, never `*`.
2. The server proxy validates the identifiers again and authorizes the document
   against `ONSHAPE_DOCUMENT_ID` plus `ONSHAPE_ALLOWED_DOCUMENT_IDS`. Browser
   validation is never treated as authorization.

The proxy remains GET-only. The extension cannot edit geometry, approve a
production revision, release a part, or write to Onshape. “Approve preview” is a
human review record attached to the current microversion, not a CAD operation.

### Document compatibility

The private API-key build does **not** analyze every Onshape document. It works
with explicitly allowlisted Part Studios that contain enough descriptively named,
literal-length variables for at least one configured check. Assemblies, drawings,
Part Studios without named dimensions, and arbitrary B-rep geometry without those
variables are not yet analyzed. Partial models are valid: the panel states how many
of the five checks have the dimensions they need and runs only those checks.

Supporting every document owned by each installing user requires per-user Onshape
OAuth plus a geometry or FeatureScript measurement layer. The shared service API
key must not be opened to arbitrary document IDs because that would expose every
document readable by that service identity through an unauthenticated endpoint.

## 1. Prepare the Part Studio

BuildReady discovers named literal-length variables and infers these semantic
roles; the identifiers shown are examples, not fixed requirements:

| Variable | Meaning |
| --- | --- |
| `insideRadius` | Inside pocket radius |
| `cutterRadius` | Selected cutter radius |
| `pocketDepth` | Pocket depth |
| `pocketMinWidth` | Minimum pocket width |
| `wallThickness` | Thin-wall thickness |
| `holeDepth` | Drilled-hole depth |
| `holeDiameter` | Drilled-hole diameter |
| `mountingHoleDiameter` | Mounting-hole diameter |
| `mountingTolerance` | Mounting-hole ± tolerance |

Use descriptive names combining context and measurement, such as
`internal_relief_rad`, `cavity_min_span`, or `fixture_bolt_fit_tol`. Only literal
lengths such as `3.5 mm`, `0.125 in`, or `1/8 in` are accepted. Expressions, arithmetic,
and variable references are rejected rather than interpreted. Ambiguous values
remain unmapped, and rules run only when their complete measurement group exists.

The five screening definitions are intentional configuration, not UI constants.
Their dimension groups are declared in `web/onshape-source.json`, and thresholds
live in `web/cnc-domain.json`. The panel derives its counts and radius-preview
value from those files. Live designs never inherit the sample fixture's material
or production quantity; both remain unspecified until a future properties layer
can read them from the active document.

Check coverage before registering the extension:

```bash
uv run python scripts/onshape_probe.py inspect "https://cad.onshape.com/documents/…/w/…/e/…"
```

## 2. Configure and deploy BuildReady

Create read-only Onshape API keys and configure these Cloudflare Pages secrets:

```text
ONSHAPE_ACCESS_KEY
ONSHAPE_SECRET_KEY
ONSHAPE_DOCUMENT_ID
ONSHAPE_WORKSPACE_ID
ONSHAPE_ELEMENT_ID
ONSHAPE_ALLOWED_DOCUMENT_IDS
```

The fixed document is always allowed. Add other extension documents to
`ONSHAPE_ALLOWED_DOCUMENT_IDS` as comma-separated IDs, with no URLs:

```text
aaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbb
```

Deploy the repository as already documented: static output directory `web`, no
build command, and the repository-level `functions/` directory enabled as
Cloudflare Pages Functions. Verify these URLs over HTTPS:

```text
https://YOUR_HOST/design
https://YOUR_HOST/onshape-panel
https://YOUR_HOST/api/onshape/design
```

The panel URL should report that it must be opened from Onshape when loaded as a
top-level page. That is expected and confirms the frame check is active.

## 3. Register the private Onshape application

In **My account → Developer** (or the Company/Classroom/Enterprise Developer
settings):

1. Create an OAuth application.
2. Use a unique primary format such as `com.yourcompany.buildready`.
3. For this internal API-key deployment, enable document read access only. Do
   not grant write access.
4. Add an extension:
   - Name: `BuildReady DFM`
   - Location: `Element right panel`
   - Context: `Part Studio`
   - Icon: upload `web/buildready-onshape-icon.svg`
   - Action URL:

```text
https://YOUR_HOST/onshape-panel?documentId={$documentId}&workspaceOrVersion={$workspaceOrVersion}&workspaceOrVersionId={$workspaceOrVersionId}&elementId={$elementId}&build=20260903-2
```

Onshape automatically adds default query parameters including `server`. The
panel requires that value to authenticate client messages. Do not manually
replace it with a hard-coded origin.

The `build` value is a cache-busting release identifier. Change it whenever the
embedded UI is deployed so an already-open Onshape tab creates a fresh iframe.

5. Create a private store entry and subscribe to it, or assign it directly to
   internal users if the account supports administrator assignment.
6. Open an allowed Part Studio, reload Onshape, and select the BuildReady icon in
   the right panel.

Onshape's current extension workflow and supported Action URL parameters are
documented at <https://onshape-public.github.io/docs/app-dev/extensions/>.

## 4. Acceptance test

Run this against a non-production document:

1. Open an allowlisted Part Studio with descriptive variables covering the desired rules.
2. Open BuildReady in the right panel.
3. Confirm the status changes to **connected**, the document name is correct,
   and the panel reports dimensions used and checks available.
4. In Ask BuildReady, ask `How were dimensions recognized?` and confirm mappings,
   confidence, and deliberately unused variables reflect the active Part Studio.
5. Ask `What is the highest-risk issue?`; confirm the inspection runs and the
   answer contains current measurements and expandable evidence references.
6. Ask about a specific corner, pocket, wall, or bore and confirm the matching
   finding becomes selected.
7. Ask to preview the recommended radius. Confirm no Onshape feature or variable changes.
8. Ask the assistant to approve it. Confirm it refuses, then approve or reject
   using only the visible panel control.
9. Export the Model Insight Markdown/JSON transcript if an external record is needed.
10. Reload the same revision and confirm its conversation persists. Clear the
    transcript and confirm workflow evidence is not deleted.
11. Edit the variable recognized as `cornerRadius` in Onshape, regenerate, then
    reopen the panel. Confirm the results refresh and the prior model conversation
    is absent. The exact microversion remains available under Technical details.
12. Open a document not in the allowlist. Confirm the panel reports a forbidden
    context without sending a request to that document.
13. Open `/design` directly and confirm Model Insight and the standalone WebMCP
    surface use the same findings and workflow state.

## Failure behavior

| Condition | Result |
| --- | --- |
| Missing or malformed Action URL IDs | Panel stops before contacting the proxy. |
| Non-Onshape `server` origin | Client messaging is rejected. |
| Top-level `/onshape-panel` load | Panel reports that an Onshape frame is required. |
| Unallowlisted document | Proxy returns `ONSHAPE_CONTEXT_FORBIDDEN` before an upstream read. |
| No applicable inferred group | Panel reports `ONSHAPE_NO_APPLICABLE_MEASUREMENTS`; no inspection is created. |
| Partial variable coverage | Available rules run and skipped rules are visible in coverage. |
| Stale or edited model | New microversion produces a new revision precondition. |
| Onshape 401/403/404 | Fails fast without quota-burning retries. |
| Rate limit or transient 5xx | Bounded retry/backoff, then a retryable error. |
| Repeated reads | Fifteen-second cache isolated by document/workspace/version/element. |
| Forged `postMessage` | Ignored unless source and exact Onshape origin both match. |

## Production authentication roadmap

The current implementation is robust for a private/internal deployment where a
single service identity reads a deliberately limited document allowlist. It is
not a multi-tenant App Store authorization system.

Before public distribution:

1. Replace the shared API key with Onshape OAuth2 authorization per user.
2. Store access and refresh tokens encrypted server-side, scoped to the user and
   Onshape server/enterprise.
3. Bind extension sessions to authenticated server sessions and authorize every
   document read using the user's token.
4. Add OAuth state, PKCE where supported, token rotation/revocation, CSRF
   protection, audit retention, and tenant-separated caches.
5. Complete Onshape's launch checklist and security review.

Onshape requires OAuth2 for App Store distribution:
<https://onshape-public.github.io/docs/auth/oauth/>.
