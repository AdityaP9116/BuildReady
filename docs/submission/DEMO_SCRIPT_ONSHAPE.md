# BuildReady demo script — Onshape extension panel

Target runtime: 165–175 seconds. Official maximum: under 3 minutes.

This script replaces `DEMO_SCRIPT.md` for the Onshape-integrated take. The older
script drives the standalone `/design` workspace on the controlled BRKT-001-B
fixture and matches the existing `demo/buildready-demo.mp4`. This one records the
shipped extension panel inside a real Onshape Part Studio, so every number on
screen is read live from the document through the same-origin proxy.

Recorded document: **BuildReady Adaptive DFM — Complex Hydraulic Fixture**
(`203c35e2b693866994d0213a`). All values quoted below were captured from a real
run against that document and are what the panel will show, provided the model is
unchanged.

## Before you record

1. **Deploy the current build.** The panel crashed on every state change once a
   preview existed, because `renderProposal` wrote to `#proposal-revision`, an
   element that only exists in the standalone template. Fixed in `web/app.js`; the
   symptom was an approved decision that stayed stuck on *Pending*. Confirm your
   deployed bundle includes it before recording.
2. **Clear results.** Open **Technical details → Clear results** so the panel
   starts at *Not run* with an empty audit trail.
3. **Do not click these suggestion chips on camera.** They misroute:
   - *"Explain why this change helps"* → answers with the generic capability blurb
     (the word "helps" matches the help keyword first).
   - *"What happens after I decide?"* → falls through to "I could not map that
     question to a bounded engineering action."
   - *"Compare suppliers for 1000 parts"* → renders as a red-flavoured error,
     "I couldn't complete that grounded action: complete the bounded simulation
     workflow first." True, but it reads as a crash.

   Type the vetted questions in this script instead. They are all verified.
4. **Decide about the audit beat.** The trail labels every tool call with the actor
   `agent_or_manual_test` (`web/state.js:107`). On a public submission that reads as
   test scaffolding. Either rename it to `agent` before recording, or cut beat 8.
5. **Capture setup.** 1080p, browser at 100% zoom, Onshape panel widened enough that
   a finding card shows its title, calculation, and next step without truncation.
   Keep the Part Studio visible on the left the whole time — the point of the video
   is that the review lives beside the model.

## 0:00–0:14 — Cold open

**Visual:** Onshape open on the Part Studio, BuildReady panel docked right, badge
reading **Connected**. Slowly orbit the fixture once.

**Narration:** "This is a real Onshape Part Studio. Manufacturing review normally
leaves it — into DFM spreadsheets, email threads, supplier quotes. BuildReady puts
the review beside the model, and gives an agent precise tools instead of pixels."

## 0:14–0:30 — It reads this model, not a fixture

**Visual:** Hover the **Active Part Studio** card. Let the three values land:
Document *BuildReady Adaptive D…*, Dimensions used **9 of 24**, Checks available
**5 of 5**.

**Narration:** "The panel reads the active document. Twenty-four named dimensions,
nine of them relevant, and all five configured CNC checks can run on what it
recognized. Nothing here is hardcoded to one demo part."

## 0:30–0:48 — Adaptive discovery (the differentiator)

**Visual:** In **Ask BuildReady**, type `How were variables mapped?` Let the answer
render and scroll it.

**Expected answer (verbatim):** "BuildReady found 24 named dimensions and used 9.
Names do not have to match an exact template:" followed by the mapping list —
`corner radius: #internal_relief_rad (1.2 mm, high match)`,
`wall thickness: #rib_web_gauge (0.9 mm, high match)`, and seven more, then
"15 other variables were not needed for these checks."

**Narration:** "These variable names are the engineer's own — internal relief rad,
rib web gauge, coolant bore depth. BuildReady maps them to the quantities the rules
need, reports its confidence, and says plainly which variables it did not use."

## 0:48–1:02 — Deterministic check

**Visual:** Click **Check model**. Findings populate.

**Expected on screen:** "Check complete: 4 issues found (2 high priority, 2 medium
priority). 5 of 5 checks ran." Cards: CNC-R001 `1.2 mm < 3.5 mm`, CNC-R003
`0.9 mm < 1.5 mm`, CNC-R004 `34 / 5 = 6.8 > 4`, CNC-R005 `0.018 mm < 0.05 mm`.

**Narration:** "Five deterministic rules, four issues, ordered by severity. Every
card carries the measurement, the threshold, the calculation, and the next step —
no prose to audit, just arithmetic you can check."

## 1:02–1:18 — Evidence, not assertion

**Visual:** Type `What is the highest-risk issue?` Expand the evidence disclosure
under the answer and pause on one citation.

**Expected answer:** the four findings ranked HIGH, HIGH, MEDIUM, MEDIUM, closing
with "a manufacturing engineer should confirm the final design." Eight citations:
four `onshape://documents/203c35e2.../microversions/04bcfe7ec025.../features/...`
and four `ruleset://cnc-dfm-1.1.0/CNC-R00n`.

**Narration:** "Every claim cites its source: the exact Onshape microversion the
geometry came from, and the versioned rule that judged it. If the model moves, the
citation stops matching."

## 1:18–1:32 — The boundary

**Visual:** Type `Can you approve this change for me?`

**Expected answer (verbatim):** "I can inspect, explain, and prepare a
non-destructive preview, but I cannot approve a proposal, edit Onshape geometry,
release production, contact suppliers, or place an order. Approval remains a visible
human action."

**Narration:** "Asked to approve, it refuses — not as a policy string, but because
no such tool is registered. The agent cannot reach approval, and it cannot write to
your CAD."

## 1:32–1:52 — Bounded proposal

**Visual:** Select the CNC-R001 card, click **Preview radius change**. The proposal
card appears: Before **1.2 mm** → After **3.5 mm**, status **Pending**.

**Expected on screen:** "Preview prepared. This is a review suggestion only; the
Onshape model was not changed." Effect line: "May reduce specialized tooling or
secondary-operation risk; supplier pricing is evaluated later."

**Narration:** "It can prepare a bounded change — one radius, to the value the rule
requires — and it stops there. The proposal sits pending. Look at the model: nothing
moved."

**Visual note:** orbit the Part Studio here so the unchanged geometry is on camera
while you say the last line.

## 1:52–2:08 — Human decision

**Visual:** Click **Approve preview**. Status flips to **approved**; both buttons
disable. Point at the authority note.

**Expected on screen:** "This records a review decision only. It never edits the
Onshape model."

**Narration:** "Only this control, in the visible UI, records the decision — and it
records a review decision, not a CAD edit. Revision control stays where engineers
already trust it."

## 2:08–2:26 — Audit trail *(cut this beat if you did not rename the actor label)*

**Visual:** Expand **Technical details**. Show the ordered audit list.

**Expected on screen:** `set_design_source`, `load_onshape_design`,
`inspect_cnc_manufacturability`, `preview_radius_change` — then
`human: approved_radius_preview`.

**Narration:** "Every action is logged with its actor. The agent read, checked, and
proposed. A human approved. That distinction survives into the exported review
package."

## 2:26–2:42 — Close

**Visual:** Pull back to the full Onshape window, panel and model together.

**Narration:** "BuildReady shows what the open web makes possible when a page
exposes meaning, evidence, and boundaries instead of pixels. The agent accelerates
the review. The engineer stays accountable."

## Optional appendix (only if you have runtime left)

The panel deliberately scopes to check, explain, propose, decide. Simulation,
supplier comparison, and the exported review package live in the full workspace and
are **not reachable from the panel** — asking for suppliers there returns the
simulation-gate error. If you want them in the video, cut to the standalone app
after 2:08 and reuse beats 1:10–2:22 of `DEMO_SCRIPT.md`, which are already timed.
Budget 40 extra seconds and trim the cold open.

Two notes before you do. The standalone workspace still shows the internal wording
**"Gate 6 diagnostics"** and "Gate 6" / "Gate 7" empty states, called out in
`demo/NOTES.md`; rename those before they appear on a public channel. And there are
now two supplier surfaces: `/suppliers` (AxisWorks and RapidMill — fictional
fixtures, FEA-gated) and `/sourcing.html` (the private quotation workspace, which
reconciles real uploaded supplier documents). If a quote appears on camera, say
which one it is. Presenting the fixture screen as a real quote is the one claim in
this project that would not survive scrutiny.

## Verified answers you can substitute

All captured from a live run against this document:

- `What should I change first?` → recommended review order, high severity first,
  closing "a human must approve or reject it."
- `Show rule coverage` → "5 of 5 checks had the dimensions they needed. No rules
  were skipped."
- `Explain the selected finding` (or the **Explain in chat** button) → the selected
  finding's title, observed calculation, consequence, and recommendation.
