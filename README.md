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

## Local development

Prerequisites:

- Node.js 24 or later
- npm 11 or later

Install and run:

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Deployment

The production target is Cloudflare Pages. The tracked `wrangler.jsonc` file is the deployment source of truth, and `public/_redirects` preserves direct loading for client-side routes such as `/design`, `/suppliers`, and `/review`.

After authenticating Wrangler with the intended Cloudflare account, deploy with:

```bash
npm run deploy
```

The command builds the application and uploads `dist/` to the `buildready` Pages project. Do not add secrets or account identifiers to the repository.

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
