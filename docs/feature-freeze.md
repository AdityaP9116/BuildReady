# Gate 9 feature freeze

Feature scope is frozen after Gate 9. Gate 10 may correct defects, improve documentation, capture demo media, configure deployment, and prepare submission materials, but it must not add a new workflow stage, supplier, machining rule, approval path, external service, or package format.

## Frozen product path

1. Read BRKT-001 revision B and inspect five controlled CNC rules.
2. Focus visible measurements and preview a bounded 3.5–5.0 mm internal-radius correction.
3. Require the engineer to approve or reject from a visible human-only control.
4. Calculate two reproducible fictional supplier quotes for one supported quantity.
5. Generate one traceable review package and download it as JSON or Markdown.

## Frozen authority and safety boundaries

- No WebMCP tool can approve or reject a proposal, commit geometry, release production, contact a supplier, place an order, or submit the challenge entry.
- Supplier assumptions and DFM notes remain untrusted content.
- CNC thresholds, supplier offers, and review outputs remain controlled demonstration fixtures.
- Reset clears the complete derived workflow and returns to `/design`.

## Final visual states to capture

- Initial `/design`: onboarding path, two registered tools, uninspected parametric bracket.
- Inspected `/design`: five finding cards, synchronized model highlights, measurement evidence.
- Pending proposal: ghosted before/after geometry and visible human controls.
- `/suppliers`: AxisWorks and RapidMill, shared hash, differentiated price and schedule.
- `/review`: package identity, five findings, human decision, two quotes, download controls.
- `/about`: WebMCP lifecycle, trust boundary, and testing instructions.
- Narrow viewport: usable header/navigation, stacked onboarding, readable cards, no horizontal overflow.

## Gate 10 allowed work

- README and architecture clarification.
- Devpost draft, demo script, testing record, attribution, and challenge-work summary.
- Screenshot and video capture guidance.
- Deployment configuration and external verification when credentials or account access are available.
- Bug fixes found by final validation.
