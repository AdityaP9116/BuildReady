# DatumFlow — Real, Traceable Supplier Quotes

Status: Proposed implementation plan, not implemented by this document.

Prepared: 2026-09-02. Scope: custom CNC manufacturing quotes for the supported Onshape design. The repository still uses the BuildReady name. No supplier has been contacted, no account has been provisioned, and no CAD has been submitted as part of this planning work.

## 1. Recommendation and success target

Build a supplier-independent quote evidence workflow first. Start with original supplier quote documents uploaded by the engineer, then add one authorized supplier API adapter. Do not make the MVP depend on receiving a new commercial API agreement.

Recommended order:

1. Freeze the actual design and manufacturing requirements into a request-for-quotation (RFQ) package.
2. Have the engineer obtain a real quote through a supplier's normal website or a known machine shop.
3. Import the supplier-issued document and record the quoted terms alongside their source evidence.
4. Require visible human review of the extracted fields and their connection to the requested design.
5. Compare only compatible quotes, showing missing costs and assumptions explicitly.
6. Add an API adapter that feeds the same evidence schema; do not rebuild the comparison interface per supplier.

The first complete milestone is one real quote tied to one exact design and specification. The comparison milestone requires two independent supplier quotes for the same basis. If only one arrives, show one quote; never fabricate the second or mix in a fictional supplier to make the screen look complete.

## 2. What the product must mean by “traceable”

A traceable quote answers:

- Who issued the quote, and how did DatumFlow obtain it?
- What original document or API response supports each important field?
- Which exact CAD artifact and drawing were requested?
- What material, process, finish, tolerances, quantity, inspection, and delivery terms were specified?
- Which of those terms did the supplier actually confirm?
- What is the unit of purchase: each part, pack, lot, or complete assembly?
- What is included, excluded, or unknown in the price?
- When was the quote issued, retrieved, reviewed, and due to expire?
- Is it still applicable to the active design?
- Who reviewed the transcription and design association?

Traceability is not authenticity certification. A SHA-256 digest detects subsequent byte changes; it does not prove who authored a document. A manually uploaded PDF remains a user-provided supplier document, not an API-verified supplier response. An API-origin record is stronger evidence of retrieval from that account, but does not prove the supplier priced the correct CAD unless the response or submission receipt establishes that association.

## 3. Available implementation routes

| Route | What we receive | Setup dependency | Automation | Fit for this MVP |
| --- | --- | --- | --- | --- |
| Supplier document import | PDF, structured export, or saved quote evidence provided by the engineer | A real quote obtained through an existing supplier workflow | Manual acquisition; automated storage, arithmetic, and comparison | Recommended first route |
| Authorized machine-shop API | Quote records and supporting files from a participating shop | Shop permission, account access, API credentials and data-sharing scope | Read-only synchronization first; RFQ submission later if supported | Recommended second route |
| Quoting-platform integration | Geometry-based estimates/quotes using configured shop pricing | Platform subscription, API entitlement, actual shop configuration | Potentially end-to-end within the partner's capabilities | Good if a partner already exists |
| Marketplace commercial integration | Buyer-side quote/submission capability negotiated with a marketplace | Explicit access to the relevant buyer API | Potentially high, but not established for our account | Do not put on the critical path |
| Catalog product API | Existing part specifications and current catalog prices | Supplier-specific API onboarding | Good for catalog purchasing | Separate feature; not custom CAD quoting |

Browser-assisted quotation is a fallback, not an API substitute. The engineer may use a supplier website and bring the evidence back. Any future agent assistance on that site is ordinary authorized browser work unless the site actually supplies WebMCP tools. Do not call undocumented private endpoints or bypass supplier access restrictions.

### Supplier and platform shortlist

**Xometry — initial manufacturing handoff candidate.** Its website supports instant and sales-managed quoting; its Onshape add-in offers pricing and lead-time feedback. Use the ordinary buyer flow and import whatever original quote artifact is actually available. The public developer API describes accepted supplier jobs, job statuses, and offers; it does not establish a general buyer-side CAD quotation endpoint for DatumFlow. Any direct quoting API needs separate confirmation. Sources: [buyer RFQ workflow](https://www.xometry.com/how-xometry-works/request-a-quote/), [CAD add-ins](https://www.xometry.com/cad-add-ins/), [developer API scope](https://developer.xometry.com/docs/getting-started).

**Paperless Parts — first API pilot candidate when we have a participating shop.** The platform documents account-token access to quote data and supporting files. Start with retrieving one specifically authorized quote, not pulling the shop's entire customer history. A buyer account at a shop does not automatically grant access to the shop's Paperless Parts API. Source: [API overview](https://www.paperlessparts.com/api/) and [API reference](https://docs.paperlessparts.com/).

**DigiFabster — automated quotation candidate with a configured shop.** Its API offering includes custom integrations around quoting, file upload, and CAD analysis. This is software behind a manufacturing business, not automatic access to a marketplace of independent suppliers. Confirm the exact endpoints, plan entitlement, test environment, shop pricing ownership, and whether returned numbers are estimates or supplier-issued offers before selecting it. Source: [on-demand manufacturing integration](https://digifabster.com/industry/on-demand-manufacturers/).

**McMaster-Carr — later mechanical catalog track.** Its documented API includes specifications, product prices, CAD, and datasheets for subscribed products. Approved customers use client certificates plus authentication, with subscription and retrieval limits. This is useful for standard hardware and stock items, but does not quote machining our custom bracket. Source: [Product Information API](https://www.mcmaster.com/help/api/).

No native WebMCP integration has been verified for these supplier services. The architecture does not require one: DatumFlow exposes its own quote tools and connects to authorized external sources behind them.

## 4. Scope for the first release

### Included

- One actual Onshape Part Studio configuration and a single-part RFQ.
- Full document, element, microversion, configuration, and selected part/body identity.
- STEP geometry plus a drawing when the manufacturing requirements need one.
- One manufacturing process, material specification, finish, tolerance specification, quantity, and delivery basis per request.
- One selected currency initially, recommended USD; preserve foreign-currency quotes without ranking them automatically.
- Original PDF evidence upload and manual structured transcription as the guaranteed baseline.
- Optional validated JSON import using a DatumFlow schema, clearly labeled as a user import rather than an API retrieval.
- Field-level source references, human review, quote versions, expiry and scope checks.
- Deterministic cost comparison and JSON/Markdown evidence export.
- A clearly separate recorded/fictional mode for regression tests and demonstrations.

### Deferred

- Automatic purchase orders, checkout, payments, accepting commercial terms, or placing orders.
- Unattended multi-supplier RFQ blasting.
- Generic supplier discovery or a worldwide supplier database.
- Guaranteed instant pricing from every provider.
- Arbitrary CAD modification or quoting an uncommitted visual preview.
- Automatic OCR of arbitrary PDFs as a prerequisite for importing a quote.
- Automatic foreign-exchange conversion, tariff prediction, or supplier quality scoring.
- Safety certification or a promise that a manufacturable design is structurally safe.

## 5. Architecture and existing-code migration

```text
Actual Onshape revision + manufacturing requirements
                  |
         Frozen RFQ package
                  |
       Engineer-approved supplier handoff
                  |
   Supplier document       Authorized supplier API
            \                  /
             Evidence ingestion
                     |
          Normalize -> review -> version
                     |
          Compatibility and cost comparison
                     |
       DatumFlow UI + WebMCP + review export
```

The existing `web/quote-engine.js` manufactures two prices from `supplier-fixtures.json`. Preserve that engine as an explicitly named fixture provider; do not just replace supplier names and label its output live.

Required changes to the current workflow:

| Existing behavior | Proposed behavior |
| --- | --- |
| Exactly two fictional quotes required | Zero, one, or several quote records; compare only when at least two are eligible |
| Four supported fixture quantities | Positive bounded integer quantities, with supplier price-break rules respected |
| FNV-1a configuration hash | Server-generated SHA-256 of a canonical RFQ manifest and file digests |
| Hash includes a radius preview | Quote only authoritative exported geometry; preview remains separate |
| Quote generation requires a proposal decision | Quote preparation does not require inventing a design change; add its own package review |
| Quote readiness requires completed simulation | Separate commercial quote availability from engineering readiness |
| Quotes live only in browser state | Persist requests, evidence, reviewed versions, and comparisons |
| Reset clears workflow evidence | UI reset clears the active view; historical real quotes remain until explicitly deleted |
| Global demonstration disclaimer | Evidence-specific labels: real quote, user import, recorded FEA, or fictional fixture |

A real quotation can exist before FEA is complete or even when engineering checks fail. Permit cost investigation, but display the engineering state and block any implication of manufacturing release. Updating an FEA report alone does not invalidate a commercial quote unless the supplied geometry or manufacturing requirements changed. Preserve the result hash used in a review package without making it part of the supplier's pricing identity by default.

## 6. Design identity and the frozen RFQ package

Fix the known shortened-microversion snapshot issue before binding real quotes. Internal identity must use full identifiers; short labels are for display only. Reject missing microversions instead of accepting `unknown`.

An RFQ manifest contains:

- Schema version and request ID.
- Full Onshape document/element/microversion, configuration, and selected part identity.
- Original workspace as provenance, not the immutable export target.
- STEP artifact ID, SHA-256, size, format, export settings, and export timestamp.
- Drawing artifact digest and revision, or an explicit drawing-not-supplied declaration.
- Material grade/specification and temper; never silently inherit fixture material for a real quote.
- Manufacturing process, finish, dimensional/GD&T requirements, inspection and certification requests.
- Quantity and purchase unit.
- Delivery country/region, target date, and required shipping basis; minimize address disclosure.
- Reviewed exceptions and requested alternatives.

Compute `requestHash` on the server using stable JSON key ordering, normalized units, explicit nulls, decimal strings, and file digests. Exclude volatile timestamps from pricing identity. Retain an independently versioned canonicalization policy.

A file hash alone is insufficient because STEP exports can differ in serialization without a geometry change. Keep both source identity and file identity. For the conservative MVP, any changed file or specification requires renewed scope confirmation; never infer equivalence from similar filenames.

Before external handoff, show the engineer the exact files, requirements, and recipient. If the design has changed since preparation, retain the package as historical and ask whether they want that old revision quoted or a fresh package. The app must never silently switch files after approval.

## 7. Quote acquisition and source review

### Route A: original document import

1. Engineer obtains the quotation through the chosen supplier's website or normal contact process.
2. Engineer uploads the original quote PDF or supported export into DatumFlow and selects the RFQ it is meant to answer.
3. Backend stores the original bytes privately with a digest and retrieval timestamp.
4. Engineer fills a structured form while viewing the source document. No PDF/OCR service is required for this first implementation.
5. ChatGPT may propose field values from evidence accessible in the current session, but cannot convert its own suggestions into confirmed supplier facts.
6. Every important field records its source page/section or JSON path. Unreadable or absent values remain unknown.
7. Human reviews the transcription, supplier identity, quote reference, and connection to the RFQ.
8. A reviewed quote version is frozen; later corrections create a new version rather than modifying history.

An attachment generated by DatumFlow is not a supplier quote. Raw manually typed numbers without issuer evidence can be retained as `manual_estimate`, but cannot satisfy the real-quote milestone.

When no source explicitly identifies the exact CAD revision, record `user_attested` request association and explain the limitation. Do not label it `supplier_confirmed` solely because a user chose a request in a dropdown.

### Route B: Paperless Parts read-only pilot

After obtaining shop authorization:

1. Store the account API token on the server; record the allowed shop and quote IDs.
2. Prove access to one quote with `GET /quotes/public/{quoteNumber}` and optional quote revision.
3. Fetch supporting evidence using `GET /quotes/public/{quoteNumber}/files` where authorized.
4. Preserve a private, minimized source snapshot; omit unrelated customer contacts and private shop notes from agent results.
5. Map supplier-native fields into the common schema; validate the actual response against captured contract fixtures.
6. Review the first imported quotation alongside the shop's original displayed quote.
7. Add narrowly scoped synchronization only after parity is established. Avoid whole-account listing as the default.

These routes are documented by [Paperless Parts](https://docs.paperlessparts.com/). Quote creation, recalculation, or RFQ submission is a separate later capability, not assumed from read access.

### Route C: an automated quoting partner

Before implementing a DigiFabster or other partner adapter, obtain current API documentation and verify with the provider: supported CAD formats/processes; authentication; account scope; pricing configuration; upload consent; asynchronous processing; result semantics; quote validity; and retry/idempotency behavior. Capture one real request and response before promising an end-to-end automated quote.

### Outbound requests

The first release prepares packages for human handoff; it does not send them automatically. A later API submission requires a separate approval tied to recipient, complete package hash, scope, and expiry. SimScale approval never authorizes sharing CAD with a supplier. A supplier handoff receipt is stored separately from the quote response.

## 8. Shared quote data contract

Use separate immutable quote versions and append-only review events. The following is an illustrative schema, not a real quotation:

```json
{
  "schemaVersion": "quote-evidence-1.0.0",
  "quoteId": "quote-example",
  "version": 1,
  "requestId": "rfq-example",
  "requestHash": "sha256-...",
  "supplier": { "id": "supplier-example", "name": "Example supplier" },
  "supplierQuoteNumber": "EXAMPLE-ONLY",
  "supplierQuoteRevision": null,
  "source": {
    "kind": "supplier_document_upload",
    "artifactId": "artifact-example",
    "sha256": "sha256-...",
    "retrievedAt": "2026-09-02T12:00:00Z"
  },
  "association": {
    "status": "user_attested",
    "confirmedScopeFields": ["quantity", "material"],
    "unconfirmedScopeFields": ["exactCadRevision"]
  },
  "offerType": "unknown",
  "quantity": 10,
  "purchaseUnit": "each",
  "currency": "USD",
  "pricing": {
    "unitPrice": "42.50",
    "partsSubtotal": "425.00",
    "setup": { "amount": "80.00", "status": "quoted_separately" },
    "shipping": { "amount": null, "status": "unknown" },
    "tax": { "amount": null, "status": "excluded" },
    "supplierStatedTotal": "505.00",
    "knownCostTotal": "505.00",
    "landedCostTotal": null
  },
  "delivery": {
    "leadTimeMinimum": 10,
    "leadTimeMaximum": 15,
    "dayBasis": "business_days",
    "startsFrom": "supplier_order_acceptance",
    "shippingIncludedInLeadTime": null
  },
  "issuedAt": null,
  "validUntil": null,
  "reviewStatus": "pending",
  "fieldEvidence": {
    "pricing.unitPrice": { "artifactId": "artifact-example", "page": 1 },
    "pricing.setup": { "artifactId": "artifact-example", "page": 1 }
  },
  "assumptions": [],
  "deviations": [],
  "supersedesQuoteVersion": null
}
```

Additional contract rules:

- Use Python `Decimal` for authoritative arithmetic and decimal strings across JSON. Do not rely on JavaScript floating-point arithmetic for money.
- Preserve the original quoted total and separately calculate the known-cost total. Flag mismatches instead of overwriting the supplier's number.
- Charge statuses distinguish included, separately quoted, excluded, not applicable, and unknown. Do not double-count a finish or setup fee already included in unit pricing.
- Preserve discounts, minimum lot charges, pack sizes, tooling reuse conditions, and price breaks where present.
- No extrapolation from a quote for 10 units to 1,000 units unless a provider explicitly supplies that price break.
- Keep issuance, import, retrieval, review, and validity timestamps distinct. Missing expiry is `unknown`, not “never expires.” Preserve source date/time-zone ambiguity.
- Separate `supplierId` from platform/provider identity; two shop accounts on one platform are not the same supplier.
- A marketplace quote may identify only the marketplace; do not invent the underlying machine shop.

## 9. Independent status dimensions

Do not compress all state into one `verified` or `live` flag:

| Dimension | Example values | Purpose |
| --- | --- | --- |
| Acquisition | document upload, authorized API, manual estimate, fixture | How evidence entered DatumFlow |
| Review | pending, reviewed, disputed | Whether fields were checked |
| Scope association | supplier confirmed, user attested, unconfirmed | Strength of the RFQ/design association |
| Applicability | current basis, different basis, unresolved | Whether it matches the active request |
| Validity | within stated validity, expired, unknown, withdrawn | Whether terms are current |
| Offer type | supplier-stated quote, indicative estimate, unknown | What the issuer calls the price |
| Completeness | complete for stated comparison, missing costs, missing terms | Whether ranking would mislead |

Historical evidence remains readable. A change to the design marks applicability differently; it does not delete the original quote or rewrite its content. A supplier revision appends a new version and marks the old version superseded.

## 10. Comparison policy

First compare the basis, then the numbers:

1. Check exact request association and active design applicability.
2. Compare material/specification, quantity/unit, process, finish, tolerances, inspection, and delivery basis.
3. Show deviations next to the quoted price. Unknown or missing scope is not a match.
4. Verify evidence exists and the fields have been reviewed.
5. Flag expired, withdrawn, indicative, and unknown-validity quotes.
6. Calculate known costs and, only when complete, landed cost.
7. Compare lead time using its original business/calendar-day basis and trigger; do not equate “ships in 10 business days” with “delivered in 10 days.”
8. Explain tradeoffs, not a universal winner. Ranking by known cost must be labeled as such if shipping or tax is missing.

Two quotes with unresolved differences can be displayed side by side but must not receive an apples-to-apples winner. For first-release automatic ranking, require matching scope, reviewed evidence, the same currency, a non-expired stated validity, and the same cost basis. Otherwise return a comparison with exclusions and questions for the engineer.

FEA status appears in a separate engineering-readiness panel. Recorded FEA remains indeterminate even next to a real supplier quote. Manufacturing interest, low price, and supplier DFM feedback are not structural validation.

## 11. WebMCP tools and backend endpoints

Tools belong to DatumFlow's top-level page. The agent reads evidence and prepares work; the backend enforces access and state. These are proposed tools, not claims that they are already registered:

| Tool | Effect | Approval boundary |
| --- | --- | --- |
| `get_quote_request_context` | Read current design/request and missing requirements | Read-only |
| `prepare_quote_request` | Create a local draft from bounded inputs | No supplier contact or CAD transfer |
| `list_supplier_quotes` | List authorized quote summaries | Read-only, current workspace only |
| `get_supplier_quote_details` | Retrieve normalized evidence and provenance | Read-only; redact private unrelated fields |
| `compare_supplier_quotes` | Deterministic compatibility and cost comparison | No selection, order, or send |

The UI owns selecting local evidence files, confirming transcription, approving external sharing, and recording the preferred quote. Explicitly mark draft-creating tools as mutating local state; do not inherit the fixture tool's `readOnlyHint` merely because it does not contact a supplier.

Proposed same-origin endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/quotes/capabilities` | Available modes and provider connection status without secrets |
| `POST /api/quote-requests` | Create a bounded draft; server resolves source identity |
| `POST /api/quote-requests/{id}/freeze` | Human-reviewed frozen manifest and artifact binding |
| `POST /api/quote-artifacts` | Private evidence upload with size/type validation |
| `POST /api/quotes/imports` | Draft quote transcription referencing an existing artifact |
| `POST /api/quotes/{id}/review` | Human review record bound to quote version and content hash |
| `GET /api/quotes/{id}` | Authorized evidence detail |
| `POST /api/quote-comparisons` | Create a versioned deterministic comparison |
| `GET /api/quote-comparisons/{id}` | Retrieve comparison and exclusions |
| `POST /api/quote-provider-syncs` | Later: narrowly scoped retrieval from an authorized provider |

No order, payment, or automatic outbound RFQ endpoint in the first release. Supplier sync is an asynchronous job if it requires multiple requests; return a job ID and bounded status reads rather than hold a WebMCP call open.

## 12. Persistence, deployment, and security

### Fit the current runtime

Use the existing Python server and SQLite pattern for a local-only MVP. Add a separate quote-service database under `.runtime/quotes/` and private artifact storage outside `web/` and `dist/`. Avoid adding a second backend stack just for quoting.

Suggested tables: `quote_requests`, `request_artifacts`, `supplier_handoffs`, `quote_versions`, `quote_artifacts`, `review_events`, `comparisons`, `provider_jobs`, and `audit_events`. Each record has a workspace/owner scope even if the first deployment has one user.

The existing Cloudflare static deployment does not execute these Python endpoints. A public deployment is a separate gate: either host the Python application with persistent private storage behind authentication, or port the service to Cloudflare Functions plus suitable database/object storage. Do not claim a deployed integration because the frontend alone loads.

### Controls

- Local development binds to loopback, validates Host/Origin on sensitive routes, and adds CSRF protection. Public access requires real authentication and object-level authorization.
- No artifact, supplier token, CAD file, or private quote is committed to Git or built into static assets.
- Restrict evidence uploads by file signature, size, and content type; proposed limits are 10 MB per PDF, 1 MB per JSON, and 25 MB per STEP. Do not accept archives or executable formats in the MVP.
- Give stored artifacts random server IDs; never use an uploaded filename as a storage path. Serve private PDFs as downloads or in an isolated safe viewer, not executable same-origin HTML.
- Disable automatic remote-resource fetching during document processing. Render supplier text as text, and sanitize Markdown/CSV exports.
- Pin provider origins and validate download hosts/redirects before fetching; never forward API credentials to a different host.
- Limit adapter access to approved suppliers and quote IDs. A broad shop API token does not justify exposing every customer record.
- Preserve narrowly necessary source evidence in private storage; redact irrelevant personal information from agent-visible results and exports.
- Apply a disclosed retention policy, proposed 30 days for local-demo raw evidence. After expiry, mark evidence unavailable and require re-import for a verifiable export. Never retain a “source available” badge after deletion.
- Use transactional version writes and idempotency for imports/syncs. Duplicate documents may legitimately contain multiple line items; deduplicate on supplier quote identity/version/line item plus artifact digest, not filename alone.
- Retry bounded read failures and respect rate limits. Do not blindly retry an outbound RFQ after a timeout with unknown submission outcome; reconcile the receipt first.

Approval cannot be secured merely by accepting `actor: human` or a checkbox value from an API client. Use authenticated session identity where available, a server-stored action digest, a short-lived one-time review nonce, exact version preconditions, and CSRF checks. The absence of an approval WebMCP tool enforces the intended agent workflow, but is not proof that a biological human clicked a button.

## 13. Concrete repository work

New proposed modules:

```text
scripts/quote_service.py              Drafts, state, validation, API request handling
scripts/quote_store.py                SQLite versions, transactions, audit, artifact metadata
scripts/quote_normalization.py        Decimal arithmetic and common evidence schema
scripts/quote_comparison.py           Scope compatibility and deterministic tradeoffs
scripts/quote_providers/documents.py  User-provided evidence adapter
scripts/quote_providers/paperless.py  Later: one authorized read-only supplier adapter
web/quote-client.js                   Same-origin quote API calls
web/quote-state.js                    Visible server-backed quote state
web/quote-ui.js                       RFQ, import review, quote cards and comparison
docs/supplier-quote-setup.md           Actual setup and access requirements once built
tests/js/quote-evidence.mjs           Execute actual browser-side logic
tests/test_quote_service.py          Backend contracts, arithmetic and persistence
tests/test_quote_providers.py        Sanitized provider responses and failure cases
tests/fixtures/quotes/               Synthetic/redacted fixtures only
```

Modify existing `state.js`, `webmcp.js`, `app.js`, `review-package.js`, and supplier tests. Preserve fixture mode behind a clear capability flag. Do not change real pricing in the browser. Update JSON/Markdown exports to include per-quote provenance, missing terms, currentness, evidence references, and the exact compared quote versions. A sourcing report may contain one quote; a comparison report must accurately show whether two eligible independent offers exist.

## 14. Verification gates and implementation order

### Q0 — Choose the first evidence source

Choose one real supplier buyer flow or existing machine-shop relationship. Obtain a quote only when the engineer authorizes the CAD submission. Confirm that the original quote evidence can be retained and used in DatumFlow. Account/API onboarding can proceed separately with permission.

Exit: a real supplier artifact is available, or explicitly pending. Synthetic evidence may be used to build but not to claim completion.

### Q1 — Fix source identity and package the request

Use full immutable Onshape identity; reject unknown revisions. Prove exact-revision export, selected part/configuration, and file hashes. Add the manufacturing requirement form and freeze operation. Preserve the unresolved distinction between a preview and committed CAD.

Exit: changing geometry, configuration, material, tolerance, finish, or quantity changes the request identity and requires new review. Same-prefix microversion collisions are tested.

### Q2 — Import and review one real quote

Implement private artifact upload, manual transcription, evidence links, money validation, immutable versions, and human review. Display import origin separately from scope confirmation.

Exit: a reviewer can trace each displayed price and term to the source. An unsupported or missing field remains unknown; no inference can silently become a supplier claim.

### Q3 — Compare two compatible quotes

Implement cost components, matching rules, expiry, missing-term exclusions, lead-time semantics, and one-versus-many UI. Test with two synthetic providers first, then real quotes when available.

Exit: the engineer can explain the cost/lead-time difference and see every caveat. Two mismatched or incomplete offers cannot be declared an unqualified winner.

### Q4 — Connect WebMCP and report export

Register the five scoped tools. Export a sourcing/comparison report from stored quote versions without recalculating prices differently. Keep recorded simulation separate from real quotation evidence.

Exit: the agent prepares and explains; the user reviews; reload and export preserve the same evidence. Standard-browser controls continue to work.

### Q5 — Add one supplier API adapter, if access is available

Paperless Parts is the first candidate when a participating shop exists. Capture a sanitized real response, verify quote/file access, and implement read-only scoped retrieval. If another provider grants access first, use the same adapter contract rather than redesigning the app.

Exit: API values and the supplier's displayed quote match; source IDs, quote version, dates, raw evidence, and unknown fields survive normalization. Retrieval errors never fall back to fictional prices labeled live.

### Q6 — Production and demo readiness

Prove backend hosting, durable storage, authentication, artifact access controls, and retention. Run the browser/agent matrix. Keep a labeled fixture route for demonstrations without provider access.

Exit: a real-mode demonstration includes real evidence, and a fixture demonstration is visibly labeled throughout. No private quote or CAD becomes public merely because the demo is public.

Q1–Q4 are the first build scope. Q5 is access-dependent. Q6 is mandatory before exposing private commercial data beyond the local development environment. Do not estimate supplier approval turnaround as engineering time.

## 15. Test matrix

- Unit tests: canonicalization, full-revision identity, Decimal arithmetic, packs/lots, setup inclusion, discounts, price breaks, unknown shipping, expiry/time-zone handling, and scope comparison.
- Provenance tests: altered artifact bytes, absent originals, manual versus API origin, partial field evidence, user attestation versus supplier-confirmed scope, and superseded quote versions.
- Lifecycle tests: page reload, duplicate import, two concurrent edits, historical request viewing, CAD change, changed finish/quantity, and new FEA results on unchanged geometry.
- Provider tests: denied credentials, unapproved quote ID, 429/5xx, pagination, missing response fields, expired artifact links, redirect credential leakage, and schema drift.
- Security tests: unauthorized quote/artifact access, CSRF, unsafe filenames, oversized files, HTML disguised as PDF, hostile supplier instructions, unsafe links, and export injection.
- Browser tests: run actual JavaScript, not only Python reimplementations or text searches. Verify uploads, source review, routing, conditional tools, and no agent approval/submission tool.
- End-to-end: freeze an actual CAD revision, import real evidence, review, compare when a second compatible quote exists, export, reopen, then change the design and demonstrate historical-but-not-current status.

## 16. Definition of done and remaining choices

The real-quote milestone is met when a supplier-issued source is privately preserved, its terms are reviewed, its relation to the actual request is explicitly evidenced or attested, and every displayed value can be traced back. The comparison milestone additionally requires two genuinely independent compatible offers with caveats shown. An API is not a prerequisite for either milestone; access to real supplier evidence is.

Recommended defaults for implementation, pending user confirmation:

- First route: document import; Xometry or an existing machine-shop contact for the first real quote.
- First manufacturing scope: one CNC-machined bracket, one material, one quantity per RFQ.
- Guaranteed extraction method: manual structured entry with original evidence, not mandatory OCR.
- First API: read-only quote retrieval from an authorized participating shop, with Paperless Parts as a candidate.
- Runtime: existing local Python/SQLite stack; public hosting addressed separately.
- Catalog sourcing: defer McMaster-Carr until custom manufacturing quotation works.
- Commercial boundary: no purchases, no automatic RFQ submission, and no pretending that a supplier quotation constitutes design approval.

Revisit with growth: multi-user tenancy, encrypted hosted storage and retention contracts, multiple CAD configurations/assemblies, negotiated provider integrations, supplier-side callbacks, controlled RFQ sending, and catalog BOM sourcing. Add these after the common evidence contract works for one real supplier.
