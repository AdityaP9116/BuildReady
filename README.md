# BuildReady

BuildReady is a WebMCP-powered manufacturing-readiness workspace for a controlled CNC bracket demonstration. It is designed to show how an engineer and an agent can inspect deterministic manufacturing evidence, preview a bounded correction, compare supplier options, and produce a traceable review package while the engineer retains final authority.

## Project status

Gate 2 establishes the first real WebMCP vertical slice. The `/design` route registers two browser-native tools against one authoritative fixture/state model, records calls visibly, and retains manual fallback controls. Deterministic CNC rules, 3D evidence, approval, supplier fixtures, and review-package generation follow in later gates.

## Planned challenge workflow

1. Read the active bracket, revision, material, process, quantity, and selected feature.
2. Run five deterministic CNC manufacturability checks.
3. Highlight measured findings on the visible design.
4. Preview a bounded internal-radius correction.
5. Require an explicit human decision in the interface.
6. Compare two controlled supplier fixtures.
7. Generate an auditable manufacturing-readiness package.

## Toolchain

BuildReady intentionally uses a small, npm-free toolchain. The browser application is plain HTML, CSS, and JavaScript, while Python's standard library handles local serving, validation, tests, and deterministic build output. [`uv`](https://docs.astral.sh/uv/) is the only project runner and environment manager; the project has no PyPI or npm dependencies.

## Local development

Prerequisites:

- `uv` 0.12 or later
- Python 3.11 or later (the project pins 3.11 to reuse the existing local runtime)

Synchronize and run:

```bash
uv sync --locked
uv run python scripts/serve.py
```

Open `http://127.0.0.1:4173`. The development server provides SPA fallbacks, so `/design`, `/suppliers`, `/review`, and `/about` can all be loaded directly.

Quality checks:

```bash
uv run python scripts/check.py
uv run python -m unittest discover -s tests -v
uv run python scripts/build.py
```

## Gate 2 WebMCP tools

| Tool | Availability | Behavior |
| --- | --- | --- |
| `get_active_design_context` | `/design` | Returns the controlled BRKT-001 revision B context, material, process, quantity, selected feature, preview state, inspection state, and rule-set version. |
| `inspect_cnc_manufacturability` | `/design` | Temporary read-only registration stub proving the tool lifecycle and visible UI effects. Gate 3 replaces it with the five deterministic CNC rules. |

Both tools use the imperative `document.modelContext.registerTool` API. Registration is guarded for unsupported browsers, scoped to `/design`, and connected to an `AbortController` so route changes unregister the tools. Both handlers receive and respect the execution `AbortSignal`.

To test manually in a WebMCP-capable browser:

1. Open `/design` and confirm the diagnostic panel reports two registered tools.
2. Inspect the page tools in Chrome DevTools or the Model Context Tool Inspector.
3. Execute `get_active_design_context` with `{}`.
4. Execute `inspect_cnc_manufacturability` with `{ "severity": "all" }`.
5. Confirm the result and visible call-history entry before navigating away.

Standard browsers can execute the same handlers through the two manual controls in the diagnostic panel.

## Deployment

The production target remains Cloudflare Pages. Connect the GitHub repository to Pages, leave the build command empty, and set the output directory to `web`. The tracked `web/_redirects` file preserves direct loading for client-side routes such as `/design`, `/suppliers`, and `/review`.

For a locally verified artifact, run `uv run python scripts/build.py`; the command recreates `dist/` from the deployable `web/` source without installing another toolchain.

## Browser compatibility

The application remains usable in a standard browser. WebMCP capabilities are detected at runtime behind a guarded compatibility boundary, and manual controls call the same audited handlers when `document.modelContext` is unavailable.

Challenge testing will target:

- ChatGPT's in-app browser
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled

## Safety boundary

BuildReady uses controlled fixtures and versioned demonstration rules. It does not approve production designs, submit real supplier data, place orders, or make compliance claims. The agent can prepare a proposal; only a visible human control can approve or reject it.

## Documentation

The product research, architecture, integration plan, and decision lineage are maintained in the project's Notion workspace. This repository will contain implementation-specific architecture, testing, and submission documentation as the build progresses.

## License

Licensed under the [MIT License](LICENSE).
