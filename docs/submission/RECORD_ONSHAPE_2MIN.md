# BuildReady — 2-minute real-Onshape recording guide

You record this inside your logged-in Onshape, screen-capturing the browser.
Target runtime **~2:05** (official max is 3:00). No voice is required — the
captions column carries the narration — but the narration below is timed if you
want to speak it.

Every quoted value was captured from a real run against **BuildReady Adaptive
DFM — Complex Hydraulic Fixture** on 2026-09-03. If your model is unchanged they
will match on camera.

---

## Before you hit record (do these in order)

1. **Deploy the fix.** Merge the `panel-fixes-and-quote-accuracy` branch into
   `main` (PR link is in the chat). Wait for the Cloudflare Pages build to finish.
   Until this is live, the panel inside Onshape still runs the old build where
   "Explain in chat" does nothing.
2. **Reload the panel in Onshape.** Close and reopen the BuildReady tab in the
   right rail (or hard-refresh the Onshape document) so it pulls the new build.
   Confirm the badge reads **Connected** and the context card shows
   **Dimensions used 9 of 24 · Checks available 5 of 5**.
3. **Clear old results.** Expand **Technical details → Clear results** so it
   starts at *Not run* with an empty audit trail.
4. **Widen the panel** enough that a finding card shows its title, calculation,
   and next step without truncation.
5. **Screen recorder:** QuickTime → File → New Screen Recording, capture the
   browser region at 1080p. Quit Slack/Mail so no notifications appear. Set the
   Onshape zoom to 100%.

### Do NOT click these on camera — they misroute
- The suggestion chip **"Explain why this change helps"** (answers with a generic
  blurb — "helps" matches the help keyword first).
- The chip **"What happens after I decide?"** (falls through to "I could not map
  that question…").
- The chip **"Compare suppliers for 1000 parts"** (renders as a red error —
  suppliers are gated behind simulation, which the panel doesn't run).

Type the questions in the beats below instead. All are verified.

### Optional cleanup before recording (my offer)
The audit trail under **Technical details** labels every tool call
`agent_or_manual_test`, which reads as test scaffolding. I can rename it to
`agent` in ~2 minutes if you want to show that panel — otherwise just don't
expand the audit list. The beats below don't require it.

---

## The beats (~2:05)

### 0:00–0:12 — Cold open
**Do:** Onshape open on the Part Studio, BuildReady panel docked right, badge
**Connected**. Slowly orbit the fixture once.
**Say:** "This is a live Onshape Part Studio. Manufacturing review normally leaves
it — into spreadsheets, email, supplier PDFs. BuildReady keeps the review beside
the model and hands an agent precise tools instead of pixels."

### 0:12–0:24 — It reads this model
**Do:** Point at the **Active Part Studio** card: Document name, **9 of 24**
dimensions used, **5 of 5** checks available.
**Say:** "It reads the active document — twenty-four named dimensions, nine of them
relevant, all five CNC checks runnable. Nothing here is hardcoded to a demo part."

### 0:24–0:42 — Adaptive discovery (the differentiator)
**Do:** In **Ask BuildReady**, type: `How were variables mapped?` — let it render,
scroll it.
**Expect:** "BuildReady found 24 named dimensions and used 9. Names do not have to
match an exact template:" then the list — `corner radius: #internal_relief_rad
(1.2 mm, high match)`, `wall thickness: #rib_web_gauge (0.9 mm, high match)`, seven
more, then "15 other variables were not needed for these checks."
**Say:** "These are the engineer's own variable names — internal relief rad, rib
web gauge, coolant bore depth. BuildReady maps them to what the rules need, shows
its confidence, and says which ones it didn't use."

### 0:42–0:56 — Deterministic check
**Do:** Click **Check model**.
**Expect:** "Check complete: 4 issues found (2 high priority, 2 medium priority).
5 of 5 checks ran." Cards: CNC-R001 `1.2 mm < 3.5 mm`, CNC-R003 `0.9 mm < 1.5 mm`,
CNC-R004 `34 / 5 = 6.8 > 4`, CNC-R005 `0.018 mm < 0.05 mm`.
**Say:** "Five deterministic rules, four issues, ordered by severity. Each card
carries the measurement, threshold, calculation, and next step — arithmetic you can
check, not prose to trust."

### 0:56–1:10 — Evidence, not assertion
**Do:** Type `What is the highest-risk issue?` Expand the evidence disclosure under
the answer; pause on one citation.
**Expect:** the four findings ranked HIGH, HIGH, MEDIUM, MEDIUM, closing "a
manufacturing engineer should confirm the final design." Citations show
`onshape://documents/203c35e2.../microversions/04bcfe7ec025.../features/...` and
`ruleset://cnc-dfm-1.1.0/CNC-R00n`.
**Say:** "Every claim cites its source — the exact Onshape microversion the geometry
came from, and the versioned rule that judged it. Move the model, and the citation
stops matching."

### 1:10–1:24 — The boundary
**Do:** Type `Can you approve this change for me?`
**Expect (verbatim):** "I can inspect, explain, and prepare a non-destructive
preview, but I cannot approve a proposal, edit Onshape geometry, release
production, contact suppliers, or place an order. Approval remains a visible human
action."
**Say:** "Asked to approve, it refuses — not as a policy string, but because no such
tool exists for it to call. It cannot write to your CAD."

### 1:24–1:42 — Bounded proposal
**Do:** Select the **CNC-R001** card, click **Preview radius change**. The proposal
card appears: Before **1.2 mm** → After **3.5 mm**, status **Pending**. Orbit the
model while you talk.
**Expect:** "Preview prepared. This is a review suggestion only; the Onshape model
was not changed." Effect: "May reduce specialized tooling or secondary-operation
risk; supplier pricing is evaluated later."
**Say:** "It can prepare one bounded change — a single radius, to the value the rule
requires — and it stops there. The proposal sits pending. Look at the model:
nothing moved."

### 1:42–1:54 — Human decision
**Do:** Click **Approve preview**. Status flips to **approved**; both buttons
disable. Point at the authority note.
**Expect:** "This records a review decision only. It never edits the Onshape model."
**Say:** "Only this control, in the visible UI, records the decision — and it records
a review decision, not a CAD edit. Revision control stays where engineers already
trust it."

### 1:54–2:05 — Close
**Do:** Pull back to the full Onshape window, panel and model together.
**Say:** "BuildReady shows what the open web makes possible when a page exposes
meaning, evidence, and boundaries — not just pixels. The agent accelerates the
review; the engineer stays accountable."

---

## Verified spare answers (if you want to swap a beat)
- `What should I change first?` → recommended order, high severity first, closing
  "a human must approve or reject it."
- `Show rule coverage` → "5 of 5 checks had the dimensions they needed. No rules
  were skipped."
- Selecting a card + the **Explain in chat** button → that finding's title, observed
  calculation, consequence, and recommendation, posted into the chat.

## Note on suppliers / simulation
Those live in the full workspace, not the panel — the panel deliberately scopes to
check → explain → propose → decide. Don't try to reach suppliers from the panel on
camera; it returns the simulation-gate error. If you want them, that's a separate
cut of the standalone app.
