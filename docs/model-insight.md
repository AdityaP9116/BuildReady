# Model Insight assistant

Model Insight is BuildReady's conversational layer for the active design. It is
available in the standalone `/design` workspace and directly inside the Onshape
right panel. It uses the same state and audited handlers as the visible buttons;
there is no second rule engine and no remote model API.

## Grounding pipeline

```text
Engineer question
       ↓
bounded deterministic intent classifier
       ↓
current design + microversion + semantic variable provenance
       ↓
audited BuildReady handler when an action is required
       ↓
deterministic finding / measurement / workflow evidence
       ↓
text-only answer + evidence references + contextual follow-ups
```

Questions may cause safe preparatory work. For example, asking for the largest
risk runs the inspection if it has not run; asking about a particular wall or
hole focuses the matching current finding; asking to preview the corner radius
prepares the bounded non-destructive proposal. Every such operation appears in
the same visible audit trail as a button or WebMCP call.

The assistant cannot approve or reject a proposal, edit Onshape, release a
revision, contact a supplier, place an order, or turn supplier text into an
instruction. Those requests are classified as authority-boundary requests and
receive a refusal before any workflow action is routed.

## Supported questions

- Active model, source, material, process, revision, and microversion
- Full CNC inspection and prioritized risk summary
- Feature-specific measurements and deterministic explanations
- Recommended review order and bounded correction preview
- Semantic variable mappings, confidence, unused inventory, and rule coverage
- Current audit history and workflow prerequisites
- Controlled supplier comparison after a visible human decision
- Review-package generation after the complete workflow

Feature references recognize manufacturing language such as corner/fillet,
pocket/cavity, wall/rib/web, coolant/deep bore, and mounting/fit/tolerance.
Unknown questions produce a bounded capability response rather than a fabricated
answer.

## Completed stretch goals

- Context-aware prompt suggestions that change with workflow state
- Automatic safe tool chaining for inspection, issue details, preview, quotes,
  and package creation
- Feature focus synchronized with the finding and standalone visual evidence
- Expandable rule/fixture evidence references on assistant answers
- Per-design and per-revision session history with automatic context isolation
- Safe in-memory fallback when third-party iframe storage is blocked
- Copy, Markdown export, and structured JSON transcript export
- Stop/cancellation control and normalized error recovery
- Keyboard-first composer with Enter/Shift+Enter behavior
- Accessible log semantics, labels, focus states, reduced-motion compatibility,
  and narrow Onshape-panel layout
- Text-only rendering for every question, document value, and evidence reference
- No extra credentials, network requests, packages, or non-deterministic answer
  source

## Test prompts

Try these in either surface:

1. `Run a full manufacturability check.`
2. `What is the highest-risk issue?`
3. `Explain the coolant bore specifically.`
4. `How were variables inferred, and which were unused?`
5. `Show rule coverage.`
6. `What should I change first?`
7. `Preview the recommended radius.`
8. `Approve the preview for me.` — must refuse and preserve human authority.
9. After using the visible decision control: `Compare suppliers for quantity 1000.`
10. `Generate the review package.`

Answers are demonstration DFM guidance tied to the visible rule set. They are
not production manufacturing approval.
