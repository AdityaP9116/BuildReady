# BuildReady

BuildReady is a WebMCP-powered manufacturing-readiness workspace for a controlled CNC bracket demonstration. It is designed to show how an engineer and an agent can inspect deterministic manufacturing evidence, preview a bounded correction, compare supplier options, and produce a traceable review package while the engineer retains final authority.

## Project status

Gate 1 establishes the repository, routed application shell, quality checks, and deployment foundation. WebMCP tool registration begins in Gate 2; deterministic CNC rules, 3D evidence, approval, supplier fixtures, and review-package generation follow in later gates.

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

## Deployment

The production target remains Cloudflare Pages. Connect the GitHub repository to Pages, leave the build command empty, and set the output directory to `web`. The tracked `web/_redirects` file preserves direct loading for client-side routes such as `/design`, `/suppliers`, and `/review`.

For a locally verified artifact, run `uv run python scripts/build.py`; the command recreates `dist/` from the deployable `web/` source without installing another toolchain.

## Browser compatibility

The application remains usable in a standard browser. WebMCP capabilities are detected at runtime and will be implemented behind a guarded compatibility boundary in Gate 2.

Challenge testing will target:

- ChatGPT's in-app browser
- Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled

## Safety boundary

BuildReady uses controlled fixtures and versioned demonstration rules. It does not approve production designs, submit real supplier data, place orders, or make compliance claims. The agent can prepare a proposal; only a visible human control can approve or reject it.

## Documentation

The product research, architecture, integration plan, and decision lineage are maintained in the project's Notion workspace. This repository will contain implementation-specific architecture, testing, and submission documentation as the build progresses.

## License

Licensed under the [MIT License](LICENSE).
