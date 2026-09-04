import {
  activeDesign,
  applyReviewedManufacturingDesign,
  activeSnapshotKey,
  gate7Handlers,
  recordHumanDecision,
  resetDemoState,
  restoreControlledFixture,
  selectFeature,
  selectFinding,
  setOnshapeAvailability,
  workflowState,
  setActiveRoute,
} from './state.js?v=20260903-3'
import {
  configureOnshapeExtensionContext,
  onshapeSourceAvailable,
} from './onshape-client.js?v=20260903-3'
import {
  connectOnshapeExtension,
  parseOnshapeExtensionContext,
} from './onshape-extension.js?v=20260903-3'
import { mountBracketViewer } from './bracket-viewer.js?v=20260903-3'
import {
  executeGate7Tool,
  synchronizeWebMcpTools,
  webMcpAvailable,
} from './webmcp.js?v=20260903-3'
import { serializeReviewPackageMarkdown } from './review-package.js?v=20260903-3'
import { toolErrorEnvelope } from './error-contract.js?v=20260903-3'
import {
  approveAndSubmitHuman,
  feaState,
  initializeFea,
  prepareStaticStressStudy,
  readSimulationResults,
  readSimulationStatus,
  resetFeaState,
} from './fea-state.js?v=20260903-3'
import { createModelInsightAssistant } from './insight-assistant.js?v=20260903-3'
import { CNC_RULES, PROPOSAL_POLICY } from './domain.js?v=20260903-3'
import { fictionalQuotePreview } from './quote-engine.js?v=20260903-3'
import { mountManufacturingReview, persistManufacturingReview, restoreManufacturingReview } from './manufacturing-review.js?v=20260903-3'
import { mountLiveSimulation } from './live-simulation.js'

const routes = {
  '/': renderDesign,
  '/design': renderDesign,
  '/simulation': renderSimulation,
  '/suppliers': renderSuppliers,
  '/review': renderReview,
  '/about': renderAbout,
  '/onshape-panel': renderOnshapePanel,
}

const app = document.querySelector('#app')
const webMcpStatus = document.querySelector('#webmcp-status')
const headerToolCount = document.querySelector('#header-tool-count')
const workflowProgress = document.querySelector('#workflow-progress')
const globalResetButton = document.querySelector('#global-reset-button')
let bracketViewer = null
let findingsSignature = ''
let viewerSnapshotKey = ''
let manufacturingReviewDesign = null
const restoredManufacturingSnapshots = new Set()

async function saveManufacturingReview(reviewed, input) {
  const record = await persistManufacturingReview(input)
  applyReviewedManufacturingDesign({
    ...reviewed,
    manufacturingReview: { ...reviewed.manufacturingReview, storageHash: record.reviewHash },
  })
}

async function restoreSavedManufacturingReview() {
  const design = activeDesign()
  if (!design.sourceIdentity || design.manufacturingReview || restoredManufacturingSnapshots.has(design.sourceSnapshotKey)) return
  restoredManufacturingSnapshots.add(design.sourceSnapshotKey)
  try {
    const reviewed = await restoreManufacturingReview(design)
    if (reviewed && activeSnapshotKey() === design.sourceSnapshotKey) applyReviewedManufacturingDesign(reviewed)
  } catch (error) {
    workflowState.errorState = toolErrorEnvelope(error)
  }
}
let onshapeBridge = null
let onshapeExtensionContext = null
let onshapeExtensionStatus = { phase: 'idle', message: 'Waiting for Onshape context.' }
const modelInsight = createModelInsightAssistant()

function pageIntro(eyebrow, title, description, aside = '') {
  return `
    <header class="page-intro">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      ${aside}
    </header>
  `
}

function isOnshapeExtensionMode() {
  return document.body.classList.contains('onshape-embedded')
    || normalizePath(window.location.pathname) === '/onshape-panel'
    || new URLSearchParams(window.location.search).get('embedded') === 'onshape'
}

function extensionRouteHref(path) {
  const params = new URLSearchParams(window.location.search)
  params.set('embedded', 'onshape')
  const extensionPath = path === '/design' ? '/onshape-panel' : path
  return `${extensionPath}?${params.toString()}`
}

function renderExtensionNavigation(activePath) {
  if (!isOnshapeExtensionMode()) return ''
  const destinations = [
    ['/onshape-panel', 'Review'],
    ['/simulation', 'Simulation'],
    ['/review', 'Evidence'],
  ]
  return `<nav class="panel-workflow-nav" aria-label="BuildReady extension workflows">
    ${destinations.map(([path, label]) => `<a class="${path === activePath ? 'active' : ''}" href="${extensionRouteHref(path)}" data-route>${label}</a>`).join('')}
  </nav>`
}

function renderEmbeddedSimulation() {
  return `
    <div class="extension-workflow-page extension-simulation">
      ${renderExtensionNavigation('/simulation')}
      <header class="extension-page-heading">
        <div><p class="eyebrow">Simulation</p><h1>Static stress study</h1><p>Review a revision-bound load case before any provider submission.</p></div>
        <span class="stage-status" id="fea-mode-badge">no solve run</span>
      </header>

      <section class="extension-sim-status" aria-labelledby="fea-mode-title">
        <div><span>Active revision</span><code id="fea-snapshot-key"></code></div>
        <div><span>Provider</span><strong id="fea-mode-title">Checking connection</strong></div>
        <p id="fea-mode-detail">Reading simulation capabilities…</p>
      </section>

      <form class="extension-study-card" id="fea-study-form">
        <header><div><p class="eyebrow">Load case</p><h2>Linear static</h2></div><span>Draft</span></header>
        <div class="extension-study-grid">
          <label>Force <span><input id="fea-force" type="number" min="0.001" max="100000" step="0.001" value="441" required /> N</span></label>
          <label>Direction <span class="direction-fields"><input id="fea-direction-x" aria-label="Direction X" type="number" step="0.1" value="0" required /><input id="fea-direction-y" aria-label="Direction Y" type="number" step="0.1" value="-1" required /><input id="fea-direction-z" aria-label="Direction Z" type="number" step="0.1" value="0" required /></span></label>
          <label>Mesh <select id="fea-mesh"><option value="medium">Medium</option><option value="fine">Fine</option></select></label>
          <label>Minimum safety factor <input id="fea-safety-factor" type="number" min="1" max="10" step="0.1" value="2" required /></label>
          <label>Maximum displacement <span><input id="fea-displacement" type="number" min="0.001" max="1000" step="0.001" value="1" required /> mm</span></label>
        </div>
        <div class="extension-study-actions"><p>Preparation freezes these values against the active revision. It does not start compute.</p><button type="submit">Prepare study</button></div>
      </form>

      <section class="extension-study-card" aria-labelledby="fea-review-title">
        <header><div><p class="eyebrow">Study record</p><h2 id="fea-review-title">No study prepared</h2></div><span id="fea-study-state">not started</span></header>
        <dl class="extension-study-metrics">
          <div><dt>Study</dt><dd id="fea-study-id">—</dd></div>
          <div><dt>Currentness</dt><dd id="fea-study-currentness">—</dd></div>
          <div class="wide"><dt>Snapshot</dt><dd id="fea-study-snapshot">—</dd></div>
          <div class="wide"><dt>Manifest hash</dt><dd id="fea-study-hash">—</dd></div>
        </dl>
        <p id="fea-frozen-setup" class="extension-study-note">No frozen setup.</p>
        <div class="fea-consent" id="fea-consent" hidden>
          <label><input type="checkbox" id="fea-cad-consent" /> Approve sharing this exact CAD snapshot.</label>
          <label><input type="checkbox" id="fea-compute-consent" /> Approve the disclosed compute use.</label>
          <button type="button" id="fea-approve-run">Approve and run</button>
        </div>
        <div class="extension-study-buttons"><button type="button" class="secondary-button" id="fea-refresh-status" disabled>Refresh status</button><button type="button" class="secondary-button" id="fea-load-results" disabled>Load results</button></div>
      </section>

      <section class="extension-study-card" aria-labelledby="fea-evidence-title">
        <header><div><p class="eyebrow">Solver evidence</p><h2 id="fea-evidence-title">Result not available</h2></div><span id="fea-verification-badge">not verified</span></header>
        <dl class="extension-study-metrics">
          <div><dt>Provider</dt><dd id="fea-result-provider">—</dd></div>
          <div><dt>Assessment</dt><dd id="fea-result-assessment">—</dd></div>
          <div><dt>Stress</dt><dd id="fea-result-stress">—</dd></div>
          <div><dt>Displacement</dt><dd id="fea-result-displacement">—</dd></div>
        </dl>
        <p id="fea-result-limitations" class="extension-study-note">No solver evidence has been loaded.</p>
        <output class="tool-output" id="fea-tool-output" aria-live="polite">Ready.</output>
      </section>
    </div>
  `
}

function renderEmbeddedEvidence() {
  const design = activeDesign()
  const findings = workflowState.findings
  const simulation = workflowState.simulationEvidence
  const inspectionLabel = workflowState.inspectionStatus === 'complete'
    ? `${findings.length} finding${findings.length === 1 ? '' : 's'}`
    : 'Not checked'
  const simulationLabel = simulation?.lifecycleState === 'COMPLETE'
    ? simulation.currentness.toLowerCase()
    : 'Not available'
  return `
    <div class="extension-workflow-page extension-evidence">
      ${renderExtensionNavigation('/review')}
      <header class="extension-page-heading">
        <div><p class="eyebrow">Evidence</p><h1>Revision record</h1><p>Visible review evidence tied to the active Onshape revision.</p></div>
      </header>
      <section class="extension-evidence-grid" aria-label="Revision evidence summary">
        <article><span>Model</span><strong>${design.designId}-${design.revisionId}</strong><small>${workflowState.sourceFreshness}</small></article>
        <article><span>Manufacturing</span><strong>${inspectionLabel}</strong><small>${workflowState.inspection?.assessmentStatus ?? 'No assessment'}</small></article>
        <article><span>Simulation</span><strong>${simulationLabel}</strong><small>${simulation?.provider ?? 'No provider result'}</small></article>
      </section>
      <section class="extension-evidence-section">
        <header><div><p class="eyebrow">Manufacturing review</p><h2>${findings.length ? 'Recorded findings' : 'No findings recorded'}</h2></div><span>${workflowState.inspectionStatus}</span></header>
        <div class="extension-evidence-list">
          ${findings.length
            ? findings.map((finding) => `<article><div><strong>${finding.title}</strong><p>${finding.calculation}</p></div><span data-severity="${finding.severity}">${finding.severity}</span></article>`).join('')
            : '<p>Run Check model from Review to create revision-bound manufacturing evidence.</p>'}
        </div>
      </section>
      <section class="extension-evidence-section">
        <header><div><p class="eyebrow">Simulation</p><h2>${simulation ? 'Solver evidence' : 'No solver evidence'}</h2></div><span>${simulation?.currentness ?? 'not run'}</span></header>
        <p>${simulation
          ? `Study ${simulation.studyId} is ${simulation.lifecycleState.toLowerCase()} and bound to this revision.`
          : 'Prepare and review a study from Simulation. Provider results remain distinct from engineering approval.'}</p>
      </section>
      <section class="extension-evidence-section">
        <header><div><p class="eyebrow">Activity</p><h2>Audit trail</h2></div><span>${workflowState.auditEvents.length}</span></header>
        <ol class="extension-audit-list">${workflowState.auditEvents.length
          ? workflowState.auditEvents.slice(-6).reverse().map((event) => `<li><strong>${event.toolName}</strong><span>${event.status}</span><small>${event.summary}</small></li>`).join('')
          : '<li><span>No review actions recorded.</span></li>'}</ol>
      </section>
    </div>
  `
}

function stageCard(number, title, description, status = 'planned') {
  return `
    <article class="stage-card">
      <span class="stage-number">${number}</span>
      <div>
        <div class="stage-heading">
          <h2>${title}</h2>
          <span class="stage-status ${status}">${status}</span>
        </div>
        <p>${description}</p>
      </div>
    </article>
  `
}

function renderAgentConsole() {
  return `
    <section class="agent-console" aria-labelledby="agent-console-title">
      <div class="agent-console-heading">
        <div>
          <p class="eyebrow">Gate 6 diagnostics</p>
          <h2 id="agent-console-title">Agent-ready WebMCP surface</h2>
        </div>
        <span class="registration-badge" id="registration-badge">Checking</span>
      </div>

      <dl class="agent-metrics">
        <div><dt>Active route</dt><dd id="active-route">/design</dd></div>
        <div><dt>Registered tools</dt><dd id="registered-tool-count">0</dd></div>
        <div><dt>Last call</dt><dd id="last-tool-call">None</dd></div>
      </dl>

      <div class="manual-tool-controls" aria-label="Manual WebMCP fallback controls">
        <button type="button" data-tool="get_active_design_context">Read design context</button>
        <button type="button" class="secondary-button" data-tool="inspect_cnc_manufacturability">Run CNC inspection</button>
        <button type="button" class="secondary-button" id="issue-details-button" data-tool="get_issue_details" disabled>Explain selected issue</button>
        <button type="button" class="secondary-button" id="preview-radius-button" data-tool="preview_radius_change" disabled>Preview 3.5 mm radius</button>
        <button type="button" class="secondary-button" id="quote-comparison-button" data-tool="prepare_quote_comparison" disabled>Compare suppliers</button>
        <button type="button" class="quiet-button" id="reset-demo-button">Reset demo</button>
      </div>

      <output class="tool-output" id="tool-output" aria-live="polite">No tool output yet.</output>

      <section class="findings-panel" aria-labelledby="findings-title">
        <div class="findings-heading">
          <h3 id="findings-title">Deterministic findings</h3>
          <span id="finding-count">Not run</span>
        </div>
        <div class="findings-list" id="findings-list">
          <p class="findings-empty">Run the inspection to evaluate all five controlled CNC rules.</p>
        </div>
      </section>

      <div class="audit-panel">
        <h3>Visible call history</h3>
        <ol id="audit-events"><li>No tool calls recorded.</li></ol>
      </div>
    </section>
  `
}

function renderModelInsightAssistant(mode = 'standalone') {
  const embedded = mode === 'embedded'
  return `
    <section class="insight-assistant" data-mode="${mode}" aria-labelledby="insight-title">
      <header class="insight-header">
        <div>
          ${embedded ? '' : '<p class="eyebrow">Design assistant</p>'}
          <h2 id="insight-title">${embedded ? 'Ask BuildReady' : 'Model Insight'}</h2>
          <p>Ask about the active model, a finding, or what to change next.</p>
        </div>
        <span class="insight-grounding"><i aria-hidden="true"></i><span id="insight-grounding-label">Current model</span></span>
      </header>
      <div class="insight-transcript" id="insight-transcript" role="log" aria-live="polite" aria-relevant="additions text"></div>
      <div class="insight-suggestions" id="insight-suggestions" aria-label="Suggested questions"></div>
      <form class="insight-composer" id="insight-form">
        <label for="insight-input">Your question</label>
        <textarea id="insight-input" name="question" rows="2" maxlength="500" placeholder="Why is the first issue important?" autocomplete="off"></textarea>
        <div class="insight-composer-footer">
          <small><kbd>Enter</kbd> send · <kbd>Shift</kbd> + <kbd>Enter</kbd> new line</small>
          <div>
            <button type="button" class="quiet-button compact-button" id="insight-stop" hidden>Stop</button>
            <button type="submit" class="compact-button" id="insight-send">Ask</button>
          </div>
        </div>
      </form>
      <footer class="insight-footer">
        <span>Read-only guidance</span>
        <div>
          <button type="button" class="quiet-button" id="insight-copy">Copy</button>
          <button type="button" class="quiet-button" id="insight-export-md">Export Markdown</button>
          <button type="button" class="quiet-button" id="insight-export-json">Export JSON</button>
          <button type="button" class="quiet-button" id="insight-clear">Clear chat</button>
        </div>
      </footer>
    </section>
  `
}

function renderDesign() {
  return `
    <div class="page">
      ${pageIntro(
        'Design workspace',
        'Prepare a CNC design with your agent.',
        'BuildReady binds the active bracket, revision, selected feature, and review state to a focused WebMCP tool surface.',
        '<div class="part-chip"><span id="part-chip-source">Design snapshot</span><strong id="part-chip-id"></strong></div>',
      )}
      <section class="onboarding-card" aria-labelledby="onboarding-title">
        <div>
          <p class="eyebrow">Guided challenge path</p>
          <h2 id="onboarding-title">From design evidence to a portable review in five stages.</h2>
          <p>Start with the active revision, let the agent prepare evidence, keep approval human, add bounded simulation evidence, then carry the same configuration into quotes and exports.</p>
        </div>
        <ol class="onboarding-steps">
          <li id="onboarding-inspection"><span>1</span><strong>Inspect</strong><small>Five deterministic rules</small></li>
          <li id="onboarding-decision"><span>2</span><strong>Decide</strong><small>Visible human authority</small></li>
          <li id="onboarding-simulation"><span>3</span><strong>Simulate</strong><small>Revision-bound evidence</small></li>
          <li id="onboarding-quotes"><span>4</span><strong>Compare</strong><small>Two fictional suppliers</small></li>
          <li id="onboarding-package"><span>5</span><strong>Package</strong><small>JSON + Markdown</small></li>
        </ol>
        <a class="button-link" href="#agent-console-title">Start with the agent-ready tools</a>
      </section>
      <section class="source-card" id="source-card" aria-labelledby="source-title">
        <div>
          <p class="eyebrow">Design source</p>
          <h2 id="source-title">Controlled fixture</h2>
          <p id="source-detail">BRKT-001 revision B ships with the app so the workflow runs with no account or setup.</p>
          <p id="source-provenance" class="source-provenance" hidden></p>
          <details id="source-discovery" class="source-discovery" hidden><summary>Source dimensions and missing checks</summary><div id="source-discovery-content"></div></details>
        </div>
        <div class="source-actions">
          <button type="button" id="load-onshape-source" hidden>Load live Onshape model</button>
          <button type="button" class="secondary-button" id="check-onshape-source" hidden>Check for Onshape updates</button>
          <button type="button" id="activate-onshape-source" hidden>Activate checked revision</button>
          <button type="button" class="secondary-button" id="restore-fixture-source" hidden>Restore controlled fixture</button>
        </div>
      </section>
      <section class="workspace-grid" aria-label="BuildReady workflow foundation">
        <section class="viewer-stage" aria-labelledby="viewer-title">
          <div class="viewer-heading">
            <div>
              <p class="eyebrow">Parametric evidence scene</p>
              <h2 id="viewer-title"></h2>
            </div>
            <button type="button" class="secondary-button compact-button" id="reset-camera">Reset camera</button>
          </div>
          <canvas id="bracket-canvas" tabindex="0" role="img"></canvas>
          <div class="viewer-legend" aria-label="Model highlight legend">
            <span><i data-legend="selected"></i>Selected</span>
            <span><i data-legend="high"></i>High issue</span>
            <span><i data-legend="medium"></i>Medium issue</span>
          </div>
          <p class="viewer-instructions" id="viewer-instructions">Point to or click model features. With the model focused, use arrow keys to move between features and Home to reset the camera.</p>
          <aside class="measurement-panel" aria-live="polite" aria-labelledby="measurement-title">
            <div>
              <span id="measurement-severity">Selected feature</span>
              <h3 id="measurement-title">Inside pocket corner</h3>
              <code id="measurement-feature-id">inside-pocket-corner</code>
            </div>
            <dl id="measurement-values"></dl>
            <p id="measurement-calculation">Run inspection to attach deterministic rule evidence.</p>
          </aside>
        </section>
        <div class="stage-list">
          ${stageCard('01', 'Read design context', 'The live WebMCP tool exposes the active part, process, quantity, revision, and selected feature.', 'ready')}
          ${stageCard('02', 'Inspect manufacturability', 'Five deterministic rules measure the active corner, pocket, wall, drilled hole, and tolerance features.', 'ready')}
          ${stageCard('03', 'Focus visual evidence', 'Issue selection, hover, camera focus, measurements, and keyboard alternatives stay synchronized with agent calls.', 'ready')}
          ${stageCard('04', 'Preview a correction', 'Prepare bounded before/after geometry while the loaded revision remains unchanged.', 'ready')}
          ${stageCard('05', 'Record human authority', 'Only the visible engineer controls can approve or reject the pending preview.', 'ready')}
        </div>
      </section>
      <aside class="compatibility-note">
        <strong>Controlled evidence</strong>
        <span>The tools register only on this route. After inspection, issue details become available and focus the same stable feature in the model and text evidence.</span>
      </aside>
      <section class="proposal-card" id="proposal-card" aria-labelledby="proposal-title" hidden>
        <div class="proposal-heading">
          <div>
            <p class="eyebrow">Human decision required</p>
            <h2 id="proposal-title">Inside-radius preview</h2>
          </div>
          <span id="proposal-status">Pending</span>
        </div>
        <div class="proposal-comparison">
          <div><span>Before</span><strong id="proposal-before">1.0 mm</strong><small id="proposal-revision"></small></div>
          <div aria-hidden="true">→</div>
          <div><span>After</span><strong id="proposal-after">3.5 mm</strong><small>Non-destructive preview</small></div>
        </div>
        <p id="proposal-effect"></p>
        <div class="proposal-actions">
          <button type="button" id="approve-proposal">Approve preview</button>
          <button type="button" class="secondary-button" id="reject-proposal">Reject</button>
        </div>
        <p class="authority-note">These are human-only controls. No WebMCP tool can approve, reject, or commit geometry.</p>
      </section>
      ${renderModelInsightAssistant('standalone')}
      ${renderAgentConsole()}
    </div>
  `
}

function renderSimulation() {
  const embedded = isOnshapeExtensionMode()
  if (embedded) return renderEmbeddedSimulation()
  return `
    <div class="page">
      ${renderExtensionNavigation('/simulation')}
      ${pageIntro(
        'Static stress simulation',
        'Prepare one bounded, revision-locked force study.',
        'The agent may prepare and explain the study. Only the visible engineer controls can approve CAD sharing and start provider work.',
        '<div class="part-chip"><span>Active snapshot</span><strong id="fea-snapshot-key"></strong></div>',
      )}
      <section class="source-card fea-mode-card" aria-labelledby="fea-mode-title">
        <div>
          <p class="eyebrow">Provider boundary</p>
          <h2 id="fea-mode-title">Checking FEA service</h2>
          <p id="fea-mode-detail">Loading provider capabilities…</p>
        </div>
        <span class="stage-status" id="fea-mode-badge">checking</span>
      </section>
      ${embedded
        ? '<aside class="compatibility-note"><strong>Revision-bound simulation</strong><span>Prepare and inspect recorded studies or load exact retained evidence here without leaving Onshape. Live provider execution still requires explicit private operator approval, and no result grants engineering approval.</span></aside>'
        : '<aside class="compatibility-note"><strong>Real SimScale operator workflow</strong><span>The controls below remain the recorded demonstration. Use the separate <a href="/live-demo.html">live commissioning workspace</a> for frozen STEP import, reviewed topology, bounded mesh/solve execution, cancellation and actual CSV metrics. Live numerical acceptance is still required.</span></aside>'}
      <section class="fea-layout">
        <section id="live-simulation-evidence" class="proposal-card"></section>
        <form class="proposal-card fea-study-form" id="fea-study-form">
          <div class="proposal-heading">
            <div><p class="eyebrow">Controlled study</p><h2>Linear-static force setup</h2></div>
            <span>Draft only</span>
          </div>
          <p class="authority-note">The material and named selections here are demonstration defaults, not reviewed properties of live CAD. A radius preview never changes exported CAD. Review the frozen setup below, not an edited draft, before approving a recorded test.</p>
          <div class="fea-fields">
            <label>Force <span><input id="fea-force" type="number" min="0.001" max="100000" step="0.001" value="441" required /> N</span></label>
            <label>Direction X <input id="fea-direction-x" type="number" step="0.1" value="0" required /></label>
            <label>Direction Y <input id="fea-direction-y" type="number" step="0.1" value="-1" required /></label>
            <label>Direction Z <input id="fea-direction-z" type="number" step="0.1" value="0" required /></label>
            <label>Mesh preset <select id="fea-mesh"><option value="medium">Medium</option><option value="fine">Fine</option></select></label>
            <label>Minimum safety factor <input id="fea-safety-factor" type="number" min="1" max="10" step="0.1" value="2" required /></label>
            <label>Maximum displacement <span><input id="fea-displacement" type="number" min="0.001" max="1000" step="0.001" value="1" required /> mm</span></label>
          </div>
          <button type="submit">Prepare validated study</button>
        </form>
        <section class="proposal-card fea-review-card" aria-labelledby="fea-review-title">
          <div class="proposal-heading">
            <div><p class="eyebrow">Frozen manifest</p><h2 id="fea-review-title">No study prepared</h2></div>
            <span id="fea-study-state">not started</span>
          </div>
          <dl class="agent-metrics fea-study-metrics">
            <div><dt>Study</dt><dd id="fea-study-id">—</dd></div>
            <div><dt>Snapshot</dt><dd id="fea-study-snapshot">—</dd></div>
            <div><dt>Hash</dt><dd id="fea-study-hash">—</dd></div>
            <div><dt>Currentness</dt><dd id="fea-study-currentness">—</dd></div>
          </dl>
          <p id="fea-frozen-setup" class="authority-note">No frozen setup.</p>
          <div class="fea-consent" id="fea-consent" hidden>
            <label><input type="checkbox" id="fea-cad-consent" /> I approve sending this exact CAD snapshot to the configured provider.</label>
            <label><input type="checkbox" id="fea-compute-consent" /> I approve the disclosed compute use.</label>
            <button type="button" id="fea-approve-run">Approve and run</button>
            <p class="authority-note">Human-only operation. It is intentionally absent from WebMCP.</p>
          </div>
          <div class="proposal-actions">
            <button type="button" class="secondary-button" id="fea-refresh-status" disabled>Refresh status</button>
            <button type="button" class="secondary-button" id="fea-load-results" disabled>Load results</button>
          </div>
        </section>
      </section>
      <section class="agent-console" aria-labelledby="fea-evidence-title">
        <div class="agent-console-heading">
          <div><p class="eyebrow">Visible solver evidence</p><h2 id="fea-evidence-title">Result not available</h2></div>
          <span class="registration-badge" id="fea-verification-badge">not verified</span>
        </div>
        <dl class="agent-metrics fea-result-metrics">
          <div><dt>Provider</dt><dd id="fea-result-provider">—</dd></div>
          <div><dt>Reviewed stress</dt><dd id="fea-result-stress">—</dd></div>
          <div><dt>Displacement</dt><dd id="fea-result-displacement">—</dd></div>
          <div><dt>Assessment</dt><dd id="fea-result-assessment">—</dd></div>
        </dl>
        <p class="authority-note" id="fea-result-limitations">No solver evidence has been loaded.</p>
        <div class="manual-tool-controls" aria-label="Manual FEA WebMCP fallback controls">
          <button type="button" data-fea-tool="prepare_static_stress_study">Prepare default study</button>
          <button type="button" class="secondary-button" data-fea-tool="get_static_stress_study">Read study</button>
          <button type="button" class="secondary-button" data-fea-tool="get_simulation_status">Check status</button>
          <button type="button" class="secondary-button" data-fea-tool="get_simulation_results">Read results</button>
          <button type="button" class="secondary-button" data-fea-tool="compare_simulation_to_requirements">Compare requirements</button>
        </div>
        <output class="tool-output" id="fea-tool-output" aria-live="polite">No FEA tool output yet.</output>
      </section>
    </div>
  `
}

function renderOnshapePanel() {
  return `
    <div class="onshape-panel" aria-labelledby="onshape-panel-title">
      <header class="onshape-panel-header">
        <div class="onshape-panel-brand"><span class="brand-mark" aria-hidden="true">BR</span><div><strong>BuildReady</strong><small>Manufacturing review</small></div></div>
        <span class="extension-status" id="extension-status" data-status="idle">Starting</span>
      </header>

      ${renderExtensionNavigation('/onshape-panel')}

      <section class="extension-context-card" aria-live="polite">
        <h1 id="onshape-panel-title">Active Part Studio</h1>
        <p id="extension-context-message">Validating the Onshape extension context…</p>
        <dl>
          <div><dt>Document</dt><dd id="extension-document">—</dd></div>
          <div><dt>Dimensions used</dt><dd id="extension-measurements">—</dd></div>
          <div><dt>Checks available</dt><dd id="extension-coverage">—</dd></div>
        </dl>
      </section>

      <section class="panel-check" aria-labelledby="panel-check-title">
        <div>
          <h2 id="panel-check-title">Check this model</h2>
          <p id="extension-check-description">BuildReady will run the checks supported by the dimensions it recognizes.</p>
        </div>
        <button type="button" id="panel-inspect" data-tool="inspect_cnc_manufacturability">Check model</button>
        <output class="tool-output panel-output" id="tool-output" aria-live="polite">Ready when you are.</output>
      </section>

      <section class="findings-panel panel-findings" aria-labelledby="findings-title">
        <div class="findings-heading"><div><h2 id="findings-title">Findings</h2><p>Ordered by severity. Select one to review its measurements.</p></div><span id="finding-count">Not run</span></div>
        <div class="findings-list" id="findings-list"><p class="findings-empty">Run the check to see issues found in this Part Studio.</p></div>
        <div class="finding-actions" aria-label="Selected finding actions">
          <button type="button" class="secondary-button" id="issue-details-button" data-tool="get_issue_details" disabled>Explain in chat</button>
          <button type="button" class="secondary-button" id="preview-radius-button" data-tool="preview_radius_change" disabled>Preview radius change</button>
        </div>
      </section>

      ${renderModelInsightAssistant('embedded')}

      <section class="panel-simulation" aria-labelledby="panel-simulation-title">
        <div class="panel-simulation-heading">
          <div><p class="eyebrow">SimScale handoff</p><h2 id="panel-simulation-title">Revision-bound static study</h2></div>
          <span>Recorded</span>
        </div>
        <p>The current Part Studio is staged for a linear-static validation workflow. No provider upload or solve has been started.</p>
        <dl class="agent-metrics">
          <div><dt>Load</dt><dd>441 N, -Y</dd></div>
          <div><dt>Mesh</dt><dd>Medium</dd></div>
          <div><dt>Acceptance</dt><dd>Live run required</dd></div>
        </dl>
      </section>

      <details class="source-discovery panel-discovery"><summary>Source dimensions and missing checks</summary><div id="source-discovery-content"></div></details>

      <section class="proposal-card panel-proposal" id="proposal-card" aria-labelledby="proposal-title" hidden>
        <div class="proposal-heading"><div><p class="eyebrow">Human decision required</p><h2 id="proposal-title">Inside-radius preview</h2></div><span id="proposal-status">Pending</span></div>
        <div class="proposal-comparison"><div><span>Before</span><strong id="proposal-before">—</strong></div><div aria-hidden="true">→</div><div><span>After</span><strong id="proposal-after">—</strong></div></div>
        <p id="proposal-effect"></p>
        <small id="proposal-revision"></small>
        <div class="proposal-actions"><button type="button" id="approve-proposal">Approve preview</button><button type="button" class="secondary-button" id="reject-proposal">Reject</button></div>
        <p class="authority-note">This records a review decision only. It never edits the Onshape model.</p>
      </section>

      <section class="panel-package" id="panel-package-result" hidden>
        <p class="eyebrow">Portable evidence</p><h2>Review package ready</h2>
        <p id="panel-package-id"></p>
        <div class="proposal-actions"><button type="button" data-download="json">Download JSON</button><button type="button" class="secondary-button" data-download="markdown">Download Markdown</button></div>
      </section>

      <details class="panel-audit"><summary>Technical details</summary>
        <dl class="agent-metrics"><div><dt>Model version</dt><dd id="extension-revision">—</dd></div><div><dt>Tools</dt><dd id="registered-tool-count">0</dd></div><div><dt>Last action</dt><dd id="last-tool-call">None</dd></div></dl>
        <button type="button" class="quiet-button" id="reset-demo-button">Clear results</button>
        <span id="active-route" hidden>/onshape-panel</span>
        <span class="registration-badge" id="registration-badge">Embedded controls</span>
        <ol id="audit-events"><li>No actions recorded.</li></ol>
      </details>
    </div>
  `
}

function renderSuppliers() {
  const quotes = workflowState.supplierQuotes
  if (quotes.length === 0) {
    const preview = fictionalQuotePreview()
    return `
      <div class="page">
        ${renderExtensionNavigation('/suppliers')}
        ${pageIntro(
          'Supplier comparison',
          'Compare controlled manufacturing options.',
          'Explore fictional price and lead-time examples. These placeholders are not quotations for your active design.',
        )}
        <aside class="compatibility-note warning-note"><strong>Fictional supplier placeholders</strong><span>These examples are not priced for your active bracket. They are not supplier-issued offers, do not imply an FEA pass, and cannot authorize an order.</span></aside>
        <section class="supplier-grid" aria-label="Fictional supplier placeholders">
          ${preview.quotes.map((quote) => `<article class="supplier-card">
            <header><h2>${quote.supplierName}</h2><span>FICTIONAL</span></header>
            <p>${preview.quantity} illustrative parts · ${quote.currency}</p>
            <dl class="quote-breakdown">
              <div><dt>Unit price</dt><dd>$${quote.unitPrice.toFixed(2)}</dd></div>
              <div><dt>Setup</dt><dd>$${quote.setup.toFixed(2)}</dd></div>
              <div><dt>Known subtotal</dt><dd>$${quote.knownSubtotal.toFixed(2)}</dd></div>
              <div><dt>Shipping / tax</dt><dd>Unknown / unknown</dd></div>
              <div><dt>Final total</dt><dd>Unknown</dd></div>
              <div><dt>Example lead time</dt><dd>${quote.leadTimeDays} days</dd></div>
            </dl><p>${quote.label}</p></article>`).join('')}
        </section>
        <section class="empty-state">
          <span>Real evidence stays separate</span>
          <h2>Your preferred suppliers</h2>
          <p>A reusable preferred-supplier directory is planned. The private workspace already accepts supplier identities and original quotations manually; these fictional cards are never imported as real evidence.</p>
          <p>Have an actual supplier document? The private evidence workspace keeps real requests and quotations separate from this demonstration and does not require completed FEA.</p>
          <a class="button-link" href="/sourcing.html">Open private supplier evidence</a>
          <p>No supplier has been contacted. These placeholders do not advance the reviewed manufacturing, simulation or quotation checkpoints.</p>
          <a class="button-link" href="/design" data-route>Return to design</a>
        </section>
      </div>
    `
  }

  const request = workflowState.supplierRequests[0]
  const money = (value, currency) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(value)
  return `
    <div class="page">
      ${renderExtensionNavigation('/suppliers')}
      ${pageIntro(
        'Supplier comparison',
        'Compare controlled manufacturing options.',
        'Two fictional suppliers return normalized prices, lead times, assumptions, and DFM feedback for the reviewed configuration.',
        `<div class="part-chip"><span>Configuration</span><strong>${request.configurationHash}</strong></div>`,
      )}
      <aside class="compatibility-note warning-note">
        <strong>Controlled fictional data</strong>
        <span>AxisWorks and RapidMill are demonstration fixtures, not real suppliers or commercial offers. Their notes are treated as untrusted supplier content.</span>
      </aside>
      <section class="supplier-grid" aria-label="Normalized supplier quotes">
        ${quotes.map((quote) => `
          <article class="supplier-card">
            <header>
              <div><p class="eyebrow">${quote.factors.speed}</p><h2>${quote.supplierName}</h2></div>
              <span>${quote.leadTimeDays} days</span>
            </header>
            <div class="quote-price"><strong>${money(quote.totalPrice, quote.currency)}</strong><span>${money(quote.unitPrice, quote.currency)} each · ${quote.quantity} parts</span></div>
            <dl class="quote-breakdown">
              <div><dt>Parts</dt><dd>${money(quote.partsSubtotal, quote.currency)}</dd></div>
              <div><dt>Tooling</dt><dd>${money(quote.toolingCost, quote.currency)}</dd></div>
              <div><dt>Cost profile</dt><dd>${quote.factors.cost.replace('_', ' ')}</dd></div>
              <div><dt>Modeled risk</dt><dd>${quote.factors.risk}</dd></div>
            </dl>
            <section><h3>Assumptions</h3><ul>${quote.assumptions.map((item) => `<li>${item}</li>`).join('')}</ul></section>
            <section><h3>DFM notes</h3><ul>${quote.dfmNotes.map((item) => `<li>${item}</li>`).join('')}</ul></section>
            <footer><code>${quote.quoteId}</code></footer>
          </article>
        `).join('')}
      </section>
      <section class="comparison-summary">
        <p class="eyebrow">Balanced comparison</p>
        <h2>Cost and schedule point to different options.</h2>
        <p>AxisWorks is the modeled value option. RapidMill is the modeled schedule option. Both carry the same moderate residual design risk, so the evidence stays visible instead of declaring an automatic winner.</p>
        <div class="proposal-actions">
          <button type="button" data-tool="generate_review_package">Generate review package</button>
          <a class="button-link secondary-button" href="/design" data-route>Revisit design</a>
        </div>
        <output class="tool-output" id="tool-output" aria-live="polite">The review package tool is ready.</output>
      </section>
    </div>
  `
}

function renderReview() {
  if (isOnshapeExtensionMode()) return renderEmbeddedEvidence()
  const reviewPackage = workflowState.reviewPackage
  if (!reviewPackage) {
    return `
      <div class="page">
        ${renderExtensionNavigation('/review')}
        ${pageIntro(
          'Evidence package',
          'Finish with a traceable manufacturing review.',
          'Findings, the proposed correction, the human decision, supplier quotes, provenance, and the audit timeline resolve into one package.',
        )}
        <section class="empty-state">
          <span>Gate 7</span>
          <h2>No review package has been generated.</h2>
          <p>Complete the design inspection and supplier comparison before creating the final record.</p>
          <a class="button-link" href="/suppliers" data-route>Open supplier comparison</a>
        </section>
      </div>
    `
  }

  return `
    <div class="page">
      ${renderExtensionNavigation('/review')}
      ${pageIntro(
        'Evidence package',
        reviewPackage.title,
        'One package ties visible findings, the human decision, revision-bound simulation evidence, normalized quotes, provenance, versions, and the audit timeline to the same configuration.',
        `<div class="part-chip"><span>Package</span><strong>${reviewPackage.packageId}</strong></div>`,
      )}
      <aside class="compatibility-note warning-note"><strong>Demonstration evidence</strong><span>${reviewPackage.disclaimer}</span></aside>
      <section class="review-summary-grid">
        <article><span>Design</span><strong>${reviewPackage.design.designId}-${reviewPackage.design.revisionId}</strong><small>${reviewPackage.design.revisionPrecondition}</small></article>
        <article><span>Source</span><strong>${reviewPackage.design.source.label}</strong><small>${reviewPackage.design.snapshotKey}</small></article>
        <article><span>Findings</span><strong>${reviewPackage.inspection.findingCount}</strong><small>${reviewPackage.inspection.counts.high} high · ${reviewPackage.inspection.counts.medium} medium</small></article>
        <article><span>Decision</span><strong>${reviewPackage.decision.decision}</strong><small>Actor: ${reviewPackage.decision.actor}</small></article>
        <article><span>Simulation</span><strong>${reviewPackage.simulation.lifecycleState.toLowerCase()}</strong><small>${reviewPackage.simulation.currentness.toLowerCase()}</small></article>
        <article><span>Quotes</span><strong>${reviewPackage.supplierComparison.quotes.length}</strong><small>${reviewPackage.supplierComparison.configurationHash}</small></article>
      </section>
      <section class="review-section" aria-labelledby="review-simulation-heading">
        <div class="review-section-heading"><div><p class="eyebrow">Revision-bound FEA evidence</p><h2 id="review-simulation-heading">Simulation record</h2></div><code id="review-simulation-result-hash"></code></div>
        <dl class="agent-metrics fea-result-metrics">
          <div><dt>Provider</dt><dd id="review-simulation-provider">—</dd></div>
          <div><dt>Study</dt><dd id="review-simulation-study">—</dd></div>
          <div><dt>Reviewed stress</dt><dd id="review-simulation-stress">—</dd></div>
          <div><dt>Displacement</dt><dd id="review-simulation-displacement">—</dd></div>
          <div><dt>Outcome</dt><dd id="review-simulation-outcome">—</dd></div>
        </dl>
        <p class="authority-note" id="review-simulation-limitations"></p>
      </section>
      <section class="review-section">
        <div class="review-section-heading"><div><p class="eyebrow">Inspection evidence</p><h2>Deterministic findings</h2></div><code>${reviewPackage.versions.cncRuleSet}</code></div>
        <div class="review-finding-list">${reviewPackage.inspection.findings.map((finding) => `
          <article><span data-severity="${finding.severity}">${finding.severity}</span><div><strong>${finding.ruleId} · ${finding.title}</strong><p>${finding.calculation}</p><small>${finding.featureId}</small></div></article>
        `).join('')}</div>
      </section>
      <section class="review-section">
        <div class="review-section-heading"><div><p class="eyebrow">Commercial model</p><h2>Normalized quotes</h2></div><code>${reviewPackage.supplierComparison.configurationHash}</code></div>
        <div class="review-quote-list">${reviewPackage.supplierComparison.quotes.map((quote) => `
          <article><strong>${quote.supplierName}</strong><span>${quote.currency} ${quote.totalPrice.toFixed(2)}</span><small>${quote.leadTimeDays} days · ${quote.quantity} parts</small></article>
        `).join('')}</div>
      </section>
      <section class="review-section audit-download-section">
        <div><p class="eyebrow">Portable evidence</p><h2>Download the exact visible package.</h2><p>JSON preserves structured records; Markdown provides a readable review artifact.</p></div>
        <div class="proposal-actions">
          <button type="button" data-download="json">Download JSON</button>
          <button type="button" class="secondary-button" data-download="markdown">Download Markdown</button>
        </div>
      </section>
    </div>
  `
}

function renderAbout() {
  return `
    <div class="page narrow-page">
      ${pageIntro(
        'Why BuildReady',
        'The browser becomes an engineering workspace the agent can understand.',
        'WebMCP exposes precise, page-controlled actions instead of forcing an agent to guess through clicks. Deterministic rules provide measurements; the engineer retains authority.',
      )}
      <section class="principles-grid">
        <article><span>01</span><h2>Evidence first</h2><p>Every finding carries observed values, thresholds, rule versions, and affected features.</p></article>
        <article><span>02</span><h2>Human authority</h2><p>The agent can prepare a change, but only the visible engineer control can approve it.</p></article>
        <article><span>03</span><h2>Safe demonstration</h2><p>The challenge path uses controlled fixtures and makes no production-readiness claim.</p></article>
      </section>
      <section class="how-webmcp" aria-labelledby="how-webmcp-title">
        <div class="review-section-heading"><div><p class="eyebrow">How WebMCP works here</p><h2 id="how-webmcp-title">The page publishes only the action valid right now.</h2></div><span class="stage-status ready">route + state scoped</span></div>
        <ol>
          <li><span>01</span><div><strong>Page-owned contracts</strong><p>BuildReady defines strict names, descriptions, JSON schemas, safety annotations, and handlers.</p></div></li>
          <li><span>02</span><div><strong>Conditional registration</strong><p>Inspection unlocks details; human-reviewed simulation unlocks quotes; complete quotes unlock the package.</p></div></li>
          <li><span>03</span><div><strong>Visible evidence</strong><p>Every tool updates the same model, cards, audit history, or review package the engineer sees.</p></div></li>
          <li><span>04</span><div><strong>Cleanup by default</strong><p>Leaving a route aborts its registrations, preventing stale or duplicate actions.</p></div></li>
        </ol>
      </section>
      <section class="trust-boundary-grid">
        <article><p class="eyebrow">Agent may</p><h2>Read, inspect, preview, compare, package</h2><p>These bounded actions produce evidence and reversible session state.</p></article>
        <article><p class="eyebrow">Human only</p><h2>Approve design and provider work</h2><p>No WebMCP approval, CAD-sharing, compute-spend, production-release, purchase, or geometry-commit tool exists.</p></article>
        <article><p class="eyebrow">Untrusted data</p><h2>Provider and supplier responses</h2><p>They remain visible evidence and can never change authority or tool availability.</p></article>
      </section>
      <section class="testing-instructions">
        <h2>Testing the complete challenge path</h2>
        <p>Complete the inspected, human-reviewed, simulated, and quoted flow, then call <code>generate_review_package</code>. Confirm the Review page matches the visible workflow and both JSON and Markdown downloads contain the package ID, versions, findings, decision, simulation hashes and limitations, quotes, audit trail, and disclaimer.</p>
      </section>
    </div>
  `
}

function renderNotFound() {
  return `
    <div class="page narrow-page">
      <section class="empty-state route-error">
        <span>404</span>
        <h1>This workspace route does not exist.</h1>
        <p>Return to the controlled bracket workflow.</p>
        <a class="button-link" href="/design" data-route>Open design workspace</a>
      </section>
    </div>
  `
}

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function measurementLabel(key) {
  return key
    .replace(/PlusMinusMm$/, ' tolerance (± mm)')
    .replace(/Mm$/, ' (mm)')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())
}

function measurementValue(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

function renderViewerSelection() {
  const feature = activeDesign().features.find(
    (candidate) => candidate.featureId === workflowState.selectedFeatureId,
  )
  const finding = workflowState.findings.find(
    (candidate) => candidate.findingId === workflowState.selectedFindingId,
  )
  const title = document.querySelector('#measurement-title')
  const featureId = document.querySelector('#measurement-feature-id')
  const severity = document.querySelector('#measurement-severity')
  const values = document.querySelector('#measurement-values')
  const calculation = document.querySelector('#measurement-calculation')
  if (!title || !featureId || !severity || !values || !calculation) return
  if (!feature) {
    title.textContent = 'Manufacturing inputs needed'
    featureId.textContent = 'No manufacturing region identified'
    severity.textContent = 'Assessment incomplete'
    severity.dataset.severity = 'none'
    values.replaceChildren()
    calculation.textContent = 'Review the source evidence inventory and required measurements. No fixture dimensions are used for this live model.'
    return
  }

  title.textContent = feature.label
  featureId.textContent = feature.featureId
  severity.textContent = finding ? `${finding.severity} severity · ${finding.ruleId}` : 'Selected feature'
  severity.dataset.severity = finding?.severity ?? 'none'
  const measurements = finding?.observedMeasurements ?? feature.dimensions
  values.innerHTML = Object.entries(measurements)
    .map(([key, value]) => `<div><dt>${measurementLabel(key)}</dt><dd>${measurementValue(value)}</dd></div>`)
    .join('')
  calculation.textContent = finding
    ? `${finding.calculation}. ${finding.recommendation}`
    : 'Run inspection to attach deterministic rule evidence.'
}

function renderFindings(findingCount, findingsList) {
  const highCount = workflowState.findings.filter((finding) => finding.severity === 'high').length
  const mediumCount = workflowState.findings.filter((finding) => finding.severity === 'medium').length
  findingCount.textContent = workflowState.inspectionStatus === 'complete'
    ? workflowState.inspection?.assessmentStatus === 'incomplete' ? 'Incomplete assessment' : `${workflowState.findings.length} ${workflowState.findings.length === 1 ? 'issue' : 'issues'}`
    : 'Not run'
  findingCount.title = workflowState.inspectionStatus === 'complete'
    ? `${highCount} high priority, ${mediumCount} medium priority`
    : ''
  const nextSignature = `${activeSnapshotKey()}:${workflowState.inspectionStatus}:${workflowState.inspection?.assessmentStatus}:${workflowState.findings.map((finding) => finding.findingId).join('|')}`
  if (nextSignature !== findingsSignature) {
    findingsSignature = nextSignature
    findingsList.innerHTML = workflowState.findings.length
      ? workflowState.findings.map((finding) => `
        <button type="button" class="finding-card" data-finding-id="${finding.findingId}" data-feature-id="${finding.featureId}" data-severity="${finding.severity}" aria-pressed="false">
          <span class="finding-title-row">
            <span>${finding.severity === 'high' ? 'High priority' : 'Medium priority'}</span>
            <code>${finding.ruleId}</code>
          </span>
          <strong class="finding-card-title">${finding.title}</strong>
          <span class="finding-copy">${finding.calculation}</span>
          <span class="finding-copy"><b>Next step:</b> ${finding.recommendation}</span>
        </button>
      `).join('')
      : workflowState.inspection?.assessmentStatus === 'incomplete'
        ? '<p class="findings-empty">Assessment incomplete. Review the missing measurements in the source evidence panel; zero findings is not a pass.</p>'
        : workflowState.inspectionStatus === 'complete'
          ? '<p class="findings-empty">No findings at the selected severity and configured thresholds. This is not production approval.</p>'
          : '<p class="findings-empty">Run the inspection to evaluate supported CNC rules and report missing inputs.</p>'

    findingsList.querySelectorAll('[data-finding-id]').forEach((card) => {
      card.addEventListener('click', () => {
        if (selectFinding(card.dataset.findingId)) {
          bracketViewer?.selectFeature(card.dataset.featureId, { focus: true })
        }
      })
      card.addEventListener('pointerenter', () => bracketViewer?.setHoveredFeature(card.dataset.featureId))
      card.addEventListener('pointerleave', () => bracketViewer?.setHoveredFeature(null))
      card.addEventListener('focus', () => bracketViewer?.setHoveredFeature(card.dataset.featureId))
      card.addEventListener('blur', () => bracketViewer?.setHoveredFeature(null))
    })
  }

  findingsList.querySelectorAll('[data-finding-id]').forEach((card) => {
    const selected = card.dataset.findingId === workflowState.selectedFindingId
    card.setAttribute('aria-pressed', String(selected))
    card.classList.toggle('selected', selected)
  })
}

function renderProposal() {
  const panel = document.querySelector('#proposal-card')
  if (!panel) return
  const proposal = workflowState.proposedChange
  panel.hidden = !proposal
  bracketViewer?.setProposal(proposal)
  if (!proposal) return

  document.querySelector('#proposal-before').textContent = `${proposal.before.insideRadiusMm} mm`
  document.querySelector('#proposal-after').textContent = `${proposal.after.insideRadiusMm} mm`
  const revisionLabel = document.querySelector('#proposal-revision')
  if (revisionLabel) revisionLabel.textContent = `Revision ${activeDesign().revisionId} snapshot`
  document.querySelector('#proposal-effect').textContent = proposal.expectedCostEffect
  const status = document.querySelector('#proposal-status')
  status.textContent = workflowState.decisionStatus.replace('_', ' ')
  status.dataset.status = workflowState.decisionStatus
  const pending = workflowState.decisionStatus === 'pending'
  document.querySelector('#approve-proposal').disabled = !pending
  document.querySelector('#reject-proposal').disabled = !pending
}

function updateDiagnostics() {
  const available = webMcpAvailable()
  webMcpStatus.classList.toggle('supported', available)
  webMcpStatus.querySelector('small').textContent = available ? 'Available' : 'Compatibility mode'
  headerToolCount.textContent = `${workflowState.registeredToolCount} ${workflowState.registeredToolCount === 1 ? 'tool' : 'tools'}`
  const completedStages = [
    workflowState.inspectionStatus === 'complete' && workflowState.inspection?.assessmentStatus !== 'incomplete',
    ['approved', 'rejected'].includes(workflowState.decisionStatus),
    feaState.study?.lifecycleState === 'COMPLETE' && feaState.study.currentness === 'CURRENT',
    workflowState.supplierQuotes.length === 2,
    Boolean(workflowState.reviewPackage),
  ]
  workflowProgress.textContent = `${completedStages.filter(Boolean).length}/5 complete`
  ;['inspection', 'decision', 'simulation', 'quotes', 'package'].forEach((stage, index) => {
    document.querySelector(`#onboarding-${stage}`)?.classList.toggle('complete', completedStages[index])
  })

  const activeRoute = document.querySelector('#active-route')
  const toolCount = document.querySelector('#registered-tool-count')
  const lastCall = document.querySelector('#last-tool-call')
  const registrationBadge = document.querySelector('#registration-badge')
  const auditEvents = document.querySelector('#audit-events')
  const findingCount = document.querySelector('#finding-count')
  const findingsList = document.querySelector('#findings-list')
  const issueDetailsButton = document.querySelector('#issue-details-button')
  const previewRadiusButton = document.querySelector('#preview-radius-button')
  const quoteComparisonButton = document.querySelector('#quote-comparison-button')

  if (!activeRoute || !toolCount || !lastCall || !registrationBadge || !auditEvents) {
    return
  }

  activeRoute.textContent = workflowState.activeRoute
  toolCount.textContent = String(workflowState.registeredToolCount)
  lastCall.textContent = workflowState.lastToolCall?.toolName ?? 'None'
  registrationBadge.textContent = workflowState.registrationStatus.replace('_', ' ')
  registrationBadge.dataset.status = workflowState.registrationStatus

  auditEvents.replaceChildren()
  for (const event of workflowState.auditEvents.slice().reverse()) {
    const item = document.createElement('li')
    for (const [tag, value] of [['strong', event.toolName], ['span', event.status], ['small', event.summary]]) {
      const field = document.createElement(tag)
      field.textContent = value
      item.append(field)
    }
    auditEvents.append(item)
  }
  if (!workflowState.auditEvents.length) {
    const empty = document.createElement('li')
    empty.textContent = 'No tool calls recorded.'
    auditEvents.append(empty)
  }

  if (findingCount && findingsList) renderFindings(findingCount, findingsList)
  if (issueDetailsButton) issueDetailsButton.disabled = !workflowState.selectedFindingId
  if (previewRadiusButton) {
    previewRadiusButton.disabled = !workflowState.findings.some((finding) => finding.ruleId === PROPOSAL_POLICY.ruleId)
      || Boolean(workflowState.proposedChange)
  }
  if (quoteComparisonButton) {
    quoteComparisonButton.disabled = !['approved', 'rejected'].includes(workflowState.decisionStatus)
      || normalizePath(window.location.pathname) === '/onshape-panel'
      || workflowState.simulationEvidence?.lifecycleState !== 'COMPLETE'
      || workflowState.simulationEvidence?.currentness !== 'CURRENT'
      || workflowState.supplierQuotes.length > 0
  }
  bracketViewer?.setFindings(workflowState.findings)
  bracketViewer?.selectFeature(workflowState.selectedFeatureId)
  renderViewerSelection()
  renderProposal()
  updateOnshapePanel()
}

function updateOnshapePanel() {
  const status = document.querySelector('#extension-status')
  if (!status) return
  status.textContent = onshapeExtensionStatus.phase.replace('_', ' ')
  status.dataset.status = onshapeExtensionStatus.phase
  const contextMessage = document.querySelector('#extension-context-message')
  contextMessage.textContent = onshapeExtensionStatus.message

  const provenance = workflowState.designSource.provenance
  document.querySelector('#extension-document').textContent = provenance?.documentName ?? '—'
  const revision = document.querySelector('#extension-revision')
  if (revision) revision.textContent = provenance?.microversionId?.slice(0, 12) ?? '—'
  document.querySelector('#extension-measurements').textContent = provenance
    ? `${provenance.inferredMeasurementCount} of ${provenance.measurementCount}`
    : '—'
  const coverage = document.querySelector('#extension-coverage')
  const availableRuleCount = provenance?.availableRuleCount
    ?? workflowState.inspection?.coverage?.availableRules
    ?? CNC_RULES.length
  if (coverage) coverage.textContent = provenance ? `${provenance.applicableRuleCount} of ${availableRuleCount}` : '—'
  const checkDescription = document.querySelector('#extension-check-description')
  if (checkDescription && provenance) {
    checkDescription.textContent = provenance.applicableRuleCount === availableRuleCount
      ? `All ${availableRuleCount} configured CNC checks can run on the recognized dimensions.`
      : `${provenance.applicableRuleCount} of ${availableRuleCount} checks can run. Missing or ambiguous dimensions are skipped.`
  }
  renderDiscoverySummary(provenance)

  const connected = onshapeExtensionStatus.phase === 'connected'
  const inspect = document.querySelector('#panel-inspect')
  const packageButton = document.querySelector('#panel-package')
  if (inspect) inspect.disabled = !connected || workflowState.sourceFreshness !== 'checked' || workflowState.inspectionStatus === 'complete'
  if (packageButton) {
    packageButton.disabled = true
  }
  const packageResult = document.querySelector('#panel-package-result')
  if (packageResult) {
    packageResult.hidden = !workflowState.reviewPackage
    const packageId = document.querySelector('#panel-package-id')
    if (packageId) packageId.textContent = workflowState.reviewPackage?.packageId ?? ''
  }
}

/**
 * Keeps the design-source card in step with workflow state.
 *
 * All Onshape-derived text is written with `textContent`; external document
 * names are untrusted content and never reach `innerHTML`.
 */
function renderDesignSource() {
  const card = document.querySelector('#source-card')
  if (!card) return

  const { designSource, onshapeAvailable, inspectionStatus } = workflowState
  const isLive = designSource.sourceId === 'onshape-live'
  const design = activeDesign()

  card.dataset.source = designSource.sourceId
  document.querySelector('#source-title').textContent = designSource.label
  document.querySelector('#source-detail').textContent = isLive
    ? workflowState.pendingDesignSnapshot
      ? `A newer checked revision (${workflowState.pendingDesignSnapshot.design.revisionId}) is ready to activate.`
      : `${design.designId}: ${workflowState.sourceFreshness}. Last checked ${workflowState.onshapeLastCheckedAt ?? 'unknown'}. Check the revision after CAD edits; this is not automatic synchronization.`
    : 'BRKT-001 revision B ships with the app so the workflow runs with no account or setup.'

  const provenance = document.querySelector('#source-provenance')
  provenance.hidden = !isLive
  if (isLive) {
    const availableRuleCount = designSource.provenance.availableRuleCount ?? '—'
    provenance.textContent = `Document: ${designSource.provenance.documentName} · ${designSource.provenance.inferredMeasurementCount}/${designSource.provenance.measurementCount} named dimensions recognized · ${designSource.provenance.nativeDimensions?.length ?? 0} native parameters inventoried · ${designSource.provenance.applicableRuleCount}/${availableRuleCount} checks available · retrieved ${designSource.provenance.retrievedAt}`
  }
  const discovery = document.querySelector('#source-discovery')
  if (discovery) discovery.hidden = !isLive
  renderDiscoverySummary(isLive ? designSource.provenance : null)
  const sourcePanel = document.querySelector('#source-discovery-content')
  if (sourcePanel && isLive) {
    let reviewPanel = sourcePanel.parentElement.querySelector('.manufacturing-review')
    if (!reviewPanel) { reviewPanel = document.createElement('div'); reviewPanel.className = 'manufacturing-review'; sourcePanel.after(reviewPanel); manufacturingReviewDesign = null }
    if (manufacturingReviewDesign !== activeDesign()) {
      manufacturingReviewDesign = activeDesign()
      mountManufacturingReview(reviewPanel, activeDesign(), saveManufacturingReview)
    }
  }

  // Switching source discards derived evidence, so hide the control once the
  // engineer has work that a reload would throw away.
  const loadButton = document.querySelector('#load-onshape-source')
  const checkButton = document.querySelector('#check-onshape-source')
  const activateButton = document.querySelector('#activate-onshape-source')
  const restoreButton = document.querySelector('#restore-fixture-source')
  loadButton.hidden = !onshapeAvailable || isLive || inspectionStatus === 'complete'
  checkButton.hidden = !isLive
  activateButton.hidden = !workflowState.pendingDesignSnapshot
  restoreButton.hidden = !isLive
}

function renderDesignIdentity() {
  const design = activeDesign()
  const source = workflowState.designSource
  const identity = `${design.designId}-${design.revisionId}`
  const sourceLabel = source.sourceId === 'onshape-live' ? 'Onshape snapshot' : 'Sample fixture'
  const chipSource = document.querySelector('#part-chip-source')
  const chipId = document.querySelector('#part-chip-id')
  const viewerTitle = document.querySelector('#viewer-title')
  if (chipSource) chipSource.textContent = sourceLabel
  if (chipId) chipId.textContent = identity
  if (viewerTitle) viewerTitle.textContent = identity
}

function synchronizeDesignWorkspace() {
  renderDesignIdentity()
  renderDesignSource()
  const isLive = workflowState.designSource.sourceId === 'onshape-live'
  const canvas = document.querySelector('#bracket-canvas')
  if (canvas) canvas.hidden = isLive
  const legend = document.querySelector('.viewer-legend')
  if (legend) legend.hidden = isLive
  const resetCamera = document.querySelector('#reset-camera')
  if (resetCamera) resetCamera.hidden = isLive
  const instructions = document.querySelector('#viewer-instructions')
  if (instructions) instructions.textContent = isLive
    ? 'Live geometry is not rendered here. Inspect the exact model in Onshape. Native parameters and required manufacturing inputs are listed in the source evidence panel; the fixture schematic is hidden.'
    : 'Point to or click model features. With the model focused, use arrow keys to move between features and Home to reset the camera.'
  const nextSnapshotKey = activeSnapshotKey()
  if (bracketViewer && viewerSnapshotKey !== nextSnapshotKey) {
    bracketViewer.setDesign(activeDesign())
    viewerSnapshotKey = nextSnapshotKey
  }
  renderViewerSelection()
}

function synchronizeSimulationWorkspace() {
  const snapshot = document.querySelector('#fea-snapshot-key')
  if (!snapshot) return

  const provenance = workflowState.designSource.provenance
  const fullSnapshotKey = activeSnapshotKey()
  snapshot.textContent = provenance?.documentName && provenance?.microversionId
    ? `${provenance.documentName} · ${provenance.microversionId.slice(0, 8)}`
    : `${activeDesign().designId}-${activeDesign().revisionId}`
  snapshot.title = fullSnapshotKey
  const capabilities = feaState.capabilities
  const liveSourceNeedsSetup = workflowState.designSource.sourceId === 'onshape-live'
  for (const button of document.querySelectorAll('#fea-study-form button[type="submit"], [data-fea-tool="prepare_static_stress_study"]')) {
    button.disabled = liveSourceNeedsSetup || !capabilities || capabilities.provider === 'disabled'
  }
  const modeTitle = document.querySelector('#fea-mode-title')
  const modeDetail = document.querySelector('#fea-mode-detail')
  const modeBadge = document.querySelector('#fea-mode-badge')
  if (capabilities) {
    const embedded = isOnshapeExtensionMode()
    modeTitle.textContent = embedded
      ? capabilities.live ? 'SimScale connected' : 'Simulation setup'
      : capabilities.live ? `${capabilities.provider} live provider` : `${capabilities.provider} validation mode`
    modeDetail.textContent = capabilities.note
    if (embedded) {
      modeDetail.textContent = liveSourceNeedsSetup
        ? 'Live CAD connected. Review material, supports, and load region before creating a study.'
        : 'Review the load case and acceptance limits before creating a study.'
    }
    if (liveSourceNeedsSetup && !embedded) modeDetail.textContent += ' This Part Studio still needs an exact CAD export, reviewed material and geometry mapping. Demo study preparation is disabled for live CAD.'
    modeBadge.textContent = embedded ? capabilities.live ? 'connected' : 'no solve run' : capabilities.live ? 'live' : capabilities.provider
    modeBadge.dataset.status = capabilities.live ? 'ready' : 'planned'
  } else if (feaState.lastError) {
    modeTitle.textContent = isOnshapeExtensionMode() ? 'Simulation setup' : 'FEA service unavailable'
    modeDetail.textContent = isOnshapeExtensionMode()
      ? liveSourceNeedsSetup
        ? 'Live CAD connected. Review material, supports, and load region before creating a study.'
        : 'Provider submission is disabled until the connection is restored.'
      : feaState.lastError.message
    modeBadge.textContent = isOnshapeExtensionMode() ? 'no solve run' : 'unavailable'
    modeBadge.dataset.status = 'failed'
  }

  const study = feaState.study
  document.querySelector('#fea-review-title').textContent = study ? 'Validated study manifest' : 'No study prepared'
  document.querySelector('#fea-study-state').textContent = study?.lifecycleState?.toLowerCase() ?? 'not started'
  document.querySelector('#fea-study-id').textContent = study?.studyId ?? '—'
  document.querySelector('#fea-study-snapshot').textContent = study?.snapshotKey ?? '—'
  document.querySelector('#fea-study-hash').textContent = study?.studyHash ?? '—'
  document.querySelector('#fea-study-currentness').textContent = study?.currentness?.toLowerCase() ?? '—'
  const manifest = study?.manifest
  document.querySelector('#fea-frozen-setup').textContent = manifest
    ? `Frozen setup: ${manifest.material.label}; force ${manifest.load.magnitudeN} N; direction [${manifest.load.direction.join(', ')}]; mesh ${manifest.mesh.preset}; body ${manifest.selections.body}; support ${manifest.selections.fixed}; loaded region ${manifest.selections.load}; monitor ${manifest.selections.monitor}; minimum safety factor ${manifest.requirements.minimumSafetyFactor}; maximum displacement ${manifest.requirements.maximumDisplacementMm} mm. These values, not subsequent draft edits, belong to ${study.studyHash}.`
    : 'No frozen setup.'

  const consent = document.querySelector('#fea-consent')
  consent.hidden = !study || Boolean(study.approval) || study.currentness !== 'CURRENT'
  document.querySelector('#fea-approve-run').disabled = !study || Boolean(study.approval) || study.currentness !== 'CURRENT'
  document.querySelector('#fea-refresh-status').disabled = !study?.approval
  document.querySelector('#fea-load-results').disabled = study?.lifecycleState !== 'COMPLETE'

  const result = feaState.result
  document.querySelector('#fea-evidence-title').textContent = result ? 'Normalized simulation result' : 'Result not available'
  const verificationBadge = document.querySelector('#fea-verification-badge')
  verificationBadge.textContent = result?.verification?.status ?? 'not verified'
  verificationBadge.dataset.status = result?.solver?.live === true ? 'ready' : 'planned'
  document.querySelector('#fea-result-provider').textContent = result
    ? `${result.solver.provider}${result.solver.live ? ' (live)' : ' (recorded)'}`
    : '—'
  const stress = result?.metrics?.reviewedRegionVonMisesStress
  document.querySelector('#fea-result-stress').textContent = stress ? `${stress.value} ${stress.unit}` : '—'
  const displacement = result?.metrics?.maximumDisplacement
  document.querySelector('#fea-result-displacement').textContent = displacement ? `${displacement.value} ${displacement.unit}` : '—'
  document.querySelector('#fea-result-assessment').textContent = result?.assessment?.outcome ?? '—'
  document.querySelector('#fea-result-limitations').textContent = result?.assessment?.limitations?.join(' ') ?? 'No solver evidence has been loaded.'
}

function synchronizeReviewSimulation() {
  const packageEvidence = workflowState.reviewPackage?.simulation
  const provider = document.querySelector('#review-simulation-provider')
  if (!packageEvidence || !provider) return
  provider.textContent = `${packageEvidence.provider}${packageEvidence.live ? ' (live)' : ' (recorded)'}`
  document.querySelector('#review-simulation-study').textContent = packageEvidence.studyId
  document.querySelector('#review-simulation-result-hash').textContent = packageEvidence.result.resultHash
  const stress = packageEvidence.result.metrics.reviewedRegionVonMisesStress
  document.querySelector('#review-simulation-stress').textContent = `${stress.value} ${stress.unit}`
  const displacement = packageEvidence.result.metrics.maximumDisplacement
  document.querySelector('#review-simulation-displacement').textContent = `${displacement.value} ${displacement.unit}`
  document.querySelector('#review-simulation-outcome').textContent = packageEvidence.result.assessment.outcome
  document.querySelector('#review-simulation-limitations').textContent = packageEvidence.result.assessment.limitations.join(' ')
}

function defaultFeaToolInput(toolName) {
  return toolName === 'prepare_static_stress_study'
    ? {
      forceN: 441,
      direction: [0, -1, 0],
      meshPreset: 'medium',
      minimumSafetyFactor: 2,
      maximumDisplacementMm: 1,
    }
    : {}
}

function bindSimulationControls() {
  const liveEvidence = document.querySelector('#live-simulation-evidence')
  if (liveEvidence) mountLiveSimulation(liveEvidence)
  document.querySelector('#fea-study-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const output = document.querySelector('#fea-tool-output')
    try {
      const result = await prepareStaticStressStudy({
        forceN: Number(document.querySelector('#fea-force').value),
        direction: [
          Number(document.querySelector('#fea-direction-x').value),
          Number(document.querySelector('#fea-direction-y').value),
          Number(document.querySelector('#fea-direction-z').value),
        ],
        meshPreset: document.querySelector('#fea-mesh').value,
        minimumSafetyFactor: Number(document.querySelector('#fea-safety-factor').value),
        maximumDisplacementMm: Number(document.querySelector('#fea-displacement').value),
      })
      output.textContent = JSON.stringify(result, null, 2)
    } catch (error) {
      output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
    }
    synchronizeSimulationWorkspace()
  })

  document.querySelector('#fea-approve-run')?.addEventListener('click', async () => {
    const output = document.querySelector('#fea-tool-output')
    try {
      const result = await approveAndSubmitHuman({
        cadSharingAcknowledged: document.querySelector('#fea-cad-consent').checked,
        computeAcknowledged: document.querySelector('#fea-compute-consent').checked,
      })
      output.textContent = JSON.stringify(result, null, 2)
    } catch (error) {
      output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
    }
    synchronizeSimulationWorkspace()
  })

  document.querySelector('#fea-refresh-status')?.addEventListener('click', async () => {
    const output = document.querySelector('#fea-tool-output')
    try {
      output.textContent = JSON.stringify(await readSimulationStatus({}), null, 2)
    } catch (error) {
      output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
    }
    synchronizeSimulationWorkspace()
  })

  document.querySelector('#fea-load-results')?.addEventListener('click', async () => {
    const output = document.querySelector('#fea-tool-output')
    try {
      output.textContent = JSON.stringify(await readSimulationResults({}), null, 2)
    } catch (error) {
      output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
    }
    synchronizeSimulationWorkspace()
  })

  document.querySelectorAll('[data-fea-tool]').forEach((button) => {
    button.addEventListener('click', async () => {
      const output = document.querySelector('#fea-tool-output')
      button.disabled = true
      try {
        const result = await executeGate7Tool(button.dataset.feaTool, defaultFeaToolInput(button.dataset.feaTool))
        output.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } catch (error) {
        output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
      } finally {
        button.disabled = false
        synchronizeSimulationWorkspace()
      }
    })
  })
}

function renderDiscoverySummary(provenance) {
  const container = document.querySelector('#source-discovery-content')
  if (!container) return
  container.replaceChildren()
  const discovery = provenance?.discovery
  if (!discovery) {
    const empty = document.createElement('p')
    empty.textContent = 'No live variable inventory is available.'
    container.append(empty)
    return
  }

  const list = document.createElement('dl')
  for (const mapping of discovery.mappings) {
    const row = document.createElement('div')
    const term = document.createElement('dt')
    const detail = document.createElement('dd')
    term.textContent = measurementLabel(mapping.roleId)
    detail.textContent = `#${mapping.variableName} = ${mapping.expression} · ${mapping.confidence} match`
    row.append(term, detail)
    list.append(row)
  }
  container.append(list)
  if (provenance.nativeDimensions?.length) {
    const heading = document.createElement('h3')
    heading.textContent = 'Native feature parameters — not final geometry measurements'
    const nativeList = document.createElement('ul')
    for (const item of provenance.nativeDimensions) {
      const row = document.createElement('li')
      row.textContent = `${item.featureName} / ${item.parameterId}: ${item.valueMm === null ? 'unresolved expression' : `${item.valueMm} mm`} · ${item.featureId} · manufacturing role unassigned`
      nativeList.append(row)
    }
    container.append(heading, nativeList)
  }
  if (provenance.manufacturingInputGaps?.length) {
    const heading = document.createElement('h3')
    heading.textContent = 'Measurements needed before manufacturing screening'
    const gaps = document.createElement('ul')
    for (const gap of provenance.manufacturingInputGaps) {
      const row = document.createElement('li')
      row.textContent = `${gap.ruleId} — ${gap.label}: ${gap.requiredReview} Missing: ${gap.missingRoles.map(measurementLabel).join(', ')}.`
      gaps.append(row)
    }
    const note = document.createElement('p')
    note.textContent = 'Also confirm material, process, quantity, finish, inspection and delivery requirements. Parameter inventory is not CAD export, production approval or simulation evidence.'
    container.append(heading, gaps, note)
  }

  if (discovery.unmapped.length > 0 || discovery.rejected.length > 0) {
    const note = document.createElement('p')
    const unmapped = discovery.unmapped.map((variable) => `#${variable.name}`)
    const rejected = discovery.rejected.map((variable) => `#${variable.name}`)
    note.textContent = `Not needed for the current checks: ${[...unmapped, ...rejected].join(', ')}`
    container.append(note)
  }
}

function downloadText(filename, contents, type) {
  const blob = new Blob([contents], { type })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function formatInsightTime(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.valueOf())
    ? ''
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function appendInsightMessage(container, entry) {
  const article = document.createElement('article')
  article.className = 'insight-message'
  article.dataset.role = entry.role

  const meta = document.createElement('div')
  meta.className = 'insight-message-meta'
  const author = document.createElement('strong')
  author.textContent = entry.role === 'user' ? 'You' : 'BuildReady'
  const time = document.createElement('time')
  time.dateTime = entry.timestamp
  time.textContent = formatInsightTime(entry.timestamp)
  meta.append(author, time)

  const body = document.createElement('p')
  body.textContent = entry.text
  article.append(meta, body)

  if (entry.citations?.length) {
    const evidence = document.createElement('details')
    evidence.className = 'insight-evidence'
    const summary = document.createElement('summary')
    summary.textContent = `${entry.citations.length} evidence ${entry.citations.length === 1 ? 'reference' : 'references'}`
    const list = document.createElement('ul')
    for (const citation of entry.citations) {
      const item = document.createElement('li')
      const label = document.createElement('strong')
      const reference = document.createElement('code')
      label.textContent = citation.label
      reference.textContent = citation.reference
      item.append(label, reference)
      list.append(item)
    }
    evidence.append(summary, list)
    article.append(evidence)
  }
  container.append(article)
}

function renderModelInsightConversation() {
  const container = document.querySelector('#insight-transcript')
  const suggestions = document.querySelector('#insight-suggestions')
  if (!container || !suggestions) return

  modelInsight.syncContext()
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
  container.replaceChildren()
  for (const entry of modelInsight.messages) appendInsightMessage(container, entry)

  if (modelInsight.busy) {
    const thinking = document.createElement('article')
    thinking.className = 'insight-message insight-thinking'
    thinking.dataset.role = 'assistant'
    const label = document.createElement('span')
    label.textContent = 'Checking the current model…'
    thinking.append(label)
    container.append(thinking)
  }

  suggestions.replaceChildren()
  for (const question of modelInsight.suggestions()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'insight-suggestion'
    button.textContent = question
    button.disabled = modelInsight.busy
    button.addEventListener('click', () => void submitInsightQuestion(question))
    suggestions.append(button)
  }

  const send = document.querySelector('#insight-send')
  const stop = document.querySelector('#insight-stop')
  const input = document.querySelector('#insight-input')
  if (send) {
    send.disabled = modelInsight.busy
    send.textContent = modelInsight.busy ? 'Checking…' : 'Ask'
  }
  if (stop) stop.hidden = !modelInsight.busy
  if (input) input.disabled = modelInsight.busy

  const provenance = workflowState.designSource.provenance
  const grounding = document.querySelector('#insight-grounding-label')
  if (grounding) {
    grounding.textContent = workflowState.designSource.sourceId === 'onshape-live'
      ? 'Current model'
      : 'Sample model'
  }
  if (nearBottom || modelInsight.busy) container.scrollTop = container.scrollHeight
}

async function submitInsightQuestion(question) {
  const input = document.querySelector('#insight-input')
  const normalizedQuestion = String(question ?? input?.value ?? '').trim()
  if (!normalizedQuestion || modelInsight.busy) return null
  if (input) input.value = ''
  const pending = modelInsight.ask(normalizedQuestion)
  renderModelInsightConversation()
  const reply = await pending
  renderModelInsightConversation()
  return reply
}

function bindModelInsightAssistant() {
  if (!document.querySelector('#insight-form')) return
  modelInsight.syncContext()
  renderModelInsightConversation()

  document.querySelector('#insight-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitInsightQuestion()
  })
  document.querySelector('#insight-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  })
  document.querySelector('#insight-stop')?.addEventListener('click', () => modelInsight.stop())
  document.querySelector('#insight-clear')?.addEventListener('click', () => {
    modelInsight.clear()
    renderModelInsightConversation()
    document.querySelector('#insight-input')?.focus()
  })
  document.querySelector('#insight-export-md')?.addEventListener('click', () => {
    downloadText(
      `${activeDesign().designId}-${activeDesign().revisionId}-model-insight.md`,
      modelInsight.markdown(),
      'text/markdown',
    )
  })
  document.querySelector('#insight-export-json')?.addEventListener('click', () => {
    downloadText(
      `${activeDesign().designId}-${activeDesign().revisionId}-model-insight.json`,
      modelInsight.json(),
      'application/json',
    )
  })
  document.querySelector('#insight-copy')?.addEventListener('click', async (event) => {
    const button = event.currentTarget
    try {
      await navigator.clipboard.writeText(modelInsight.markdown())
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Copy unavailable'
    }
    window.setTimeout(() => { button.textContent = 'Copy' }, 1600)
  })
}

function bindDesignSourceControls() {
  document.querySelector('#load-onshape-source')?.addEventListener('click', async () => {
    const button = document.querySelector('#load-onshape-source')
    button.disabled = true
    button.textContent = 'Loading from Onshape…'
    try {
      await gate7Handlers.load_onshape_design({}, {})
      await restoreSavedManufacturingReview()
    } catch (error) {
      const detail = document.querySelector('#source-detail')
      if (detail) detail.textContent = toolErrorEnvelope(error).error.message
    } finally {
      button.disabled = false
      button.textContent = 'Load live Onshape model'
    }
  })

  document.querySelector('#check-onshape-source')?.addEventListener('click', async () => {
    const button = document.querySelector('#check-onshape-source')
    button.disabled = true
    button.textContent = 'Checking Onshape…'
    try {
      await gate7Handlers.check_onshape_revision({}, {})
    } catch (error) {
      const detail = document.querySelector('#source-detail')
      if (detail) detail.textContent = toolErrorEnvelope(error).error.message
    } finally {
      button.disabled = false
      button.textContent = 'Check for Onshape updates'
    }
  })

  document.querySelector('#activate-onshape-source')?.addEventListener('click', async () => {
    const candidate = workflowState.pendingDesignSnapshot
    if (!candidate) return
    const derivedEvidenceExists = workflowState.inspectionStatus === 'complete'
      || Boolean(workflowState.proposedChange)
      || workflowState.supplierQuotes.length > 0
      || Boolean(workflowState.reviewPackage)
      || Boolean(feaState.study)
    if (derivedEvidenceExists
      && !window.confirm('Activate the checked Onshape revision and discard evidence from the current revision?')) {
      return
    }
    try {
      await gate7Handlers.activate_onshape_revision({
        expectedCurrentRevisionId: activeDesign().revisionId,
        candidateRevisionId: candidate.design.revisionId,
        discardDerivedEvidence: derivedEvidenceExists,
      }, {})
    } catch (error) {
      const detail = document.querySelector('#source-detail')
      if (detail) detail.textContent = toolErrorEnvelope(error).error.message
    }
  })

  document.querySelector('#restore-fixture-source')?.addEventListener('click', () => {
    const derivedEvidenceExists = workflowState.inspectionStatus === 'complete'
      || Boolean(workflowState.proposedChange)
      || workflowState.supplierQuotes.length > 0
      || Boolean(workflowState.reviewPackage)
      || Boolean(feaState.study)
    if (derivedEvidenceExists
      && !window.confirm('Restore the fixture and discard evidence from the active Onshape revision?')) {
      return
    }
    restoreControlledFixture()
    bracketViewer?.resetCamera()
  })
}

function bindBracketViewer() {
  const canvas = document.querySelector('#bracket-canvas')
  if (!canvas) return
  bracketViewer = mountBracketViewer(canvas, activeDesign(), {
    onFeatureSelect: (featureId) => selectFeature(featureId),
  })
  viewerSnapshotKey = activeSnapshotKey()
  document.querySelector('#reset-camera')?.addEventListener('click', () => bracketViewer?.resetCamera())
  bracketViewer.setFindings(workflowState.findings)
  bracketViewer.selectFeature(workflowState.selectedFeatureId)
  bracketViewer.setProposal(workflowState.proposedChange)
  renderViewerSelection()
}

function bindWorkflowControls() {
  document.querySelector('#approve-proposal')?.addEventListener('click', () => {
    recordHumanDecision('approved')
  })
  document.querySelector('#reject-proposal')?.addEventListener('click', () => {
    recordHumanDecision('rejected')
  })
  document.querySelector('#reset-demo-button')?.addEventListener('click', () => {
    resetDemoState()
    resetFeaState()
    bracketViewer?.resetCamera()
    const output = document.querySelector('#tool-output')
    if (output) output.textContent = document.body.classList.contains('onshape-embedded')
      ? 'Results cleared. The active Part Studio is still connected.'
      : 'Demo reset to the original BRKT-001-B fixture.'
  })

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!workflowState.reviewPackage) return
      const format = button.dataset.download
      const isJson = format === 'json'
      const contents = isJson
        ? JSON.stringify(workflowState.reviewPackage, null, 2)
        : serializeReviewPackageMarkdown(workflowState.reviewPackage)
      downloadText(
        `${workflowState.reviewPackage.packageId}.${isJson ? 'json' : 'md'}`,
        contents,
        isJson ? 'application/json' : 'text/markdown',
      )
    })
  })
}

function bindManualToolControls() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', async () => {
      const toolName = button.dataset.tool
      const output = document.querySelector('#tool-output')
      const input = toolName === 'inspect_cnc_manufacturability'
        ? { severity: 'all' }
        : toolName === 'get_issue_details'
          ? { findingId: workflowState.selectedFindingId }
          : toolName === 'preview_radius_change'
            ? {
              findingId: workflowState.findings.find((finding) => finding.ruleId === PROPOSAL_POLICY.ruleId)?.findingId,
              proposedRadiusMm: PROPOSAL_POLICY.recommendedRadiusMm,
            }
          : toolName === 'prepare_quote_comparison'
            ? { quantity: activeDesign().quantity }
          : toolName === 'generate_review_package'
            ? { title: `${activeDesign().designId}-${activeDesign().revisionId} Manufacturing Review` }
          : {}

      button.disabled = true
      if (output) output.textContent = document.body.classList.contains('onshape-embedded')
        ? 'Checking the active model…'
        : `Calling ${toolName}…`

      try {
        if (document.body.classList.contains('onshape-embedded') && toolName === 'get_issue_details') {
          const reply = await submitInsightQuestion('Explain the selected finding')
          if (output) output.textContent = reply
            ? 'Explanation added to Ask BuildReady.'
            : 'BuildReady is already answering another question. Try again when it finishes.'
          if (reply) document.querySelector('#insight-transcript')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        const result = await executeGate7Tool(toolName, input)
        if (output && document.body.classList.contains('onshape-embedded')) {
          if (toolName === 'inspect_cnc_manufacturability') {
            const high = workflowState.findings.filter((finding) => finding.severity === 'high').length
            const medium = workflowState.findings.filter((finding) => finding.severity === 'medium').length
            output.textContent = `${workflowState.inspection.assessmentStatus === 'incomplete' ? 'Assessment incomplete' : 'Screening complete'}: ${workflowState.findings.length} issues found (${high} high priority, ${medium} medium priority). ${workflowState.inspection.coverage.evaluatedRuleCount} of ${workflowState.inspection.coverage.availableRules} checks ran. Missing checks are not passes.`
          } else if (toolName === 'get_issue_details') {
            output.textContent = 'The selected finding is ready below. You can also ask BuildReady a follow-up question.'
          } else if (toolName === 'preview_radius_change') {
            output.textContent = 'Preview prepared. This is a review suggestion only; the Onshape model was not changed.'
          } else if (toolName === 'prepare_quote_comparison') {
            output.textContent = 'Sample supplier comparison prepared.'
          } else if (toolName === 'generate_review_package') {
            output.textContent = 'Review package created.'
          }
        } else if (output) {
          output.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      } catch (error) {
        if (output) output.textContent = document.body.classList.contains('onshape-embedded')
          ? toolErrorEnvelope(error).error.message
          : JSON.stringify(toolErrorEnvelope(error), null, 2)
      } finally {
        updateDiagnostics()
      }
    })
  })
}

async function renderRoute() {
  let path = normalizePath(window.location.pathname)

  if (path === '/') {
    window.history.replaceState({}, '', '/design')
    path = '/design'
  }

  if (isOnshapeExtensionMode() && path === '/suppliers') {
    window.history.replaceState({}, '', extensionRouteHref('/review'))
    path = '/review'
  }

  const render = routes[path] ?? renderNotFound

  if (path === '/simulation') {
    await initializeFea().catch(() => {})
  }

  try {
    bracketViewer?.destroy()
    bracketViewer = null
    viewerSnapshotKey = ''
    findingsSignature = ''
    app.innerHTML = render()
  } catch (error) {
    console.error('BuildReady route rendering failed', error)
    app.innerHTML = `
      <section class="fatal-error">
        <p class="eyebrow">Application error</p>
        <h1>BuildReady could not render this workspace.</h1>
        <p>Reload the page to try again.</p>
        <button type="button" id="reload-app">Reload</button>
      </section>
    `
    document.querySelector('#reload-app')?.addEventListener('click', () => window.location.reload())
  }

  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', normalizePath(link.pathname) === path)
  })

  setActiveRoute(path)
  if (path === '/design') {
    bindBracketViewer()
    bindDesignSourceControls()
    synchronizeDesignWorkspace()
  }
  if (path === '/simulation') {
    bindSimulationControls()
    synchronizeSimulationWorkspace()
  }
  if (path === '/review') synchronizeReviewSimulation()
  bindModelInsightAssistant()
  bindManualToolControls()
  bindWorkflowControls()
  updateDiagnostics()
  await synchronizeWebMcpTools(path)
  app.focus({ preventScroll: true })
}

document.addEventListener('click', (event) => {
  const target = event.target
  const link = target instanceof Element ? target.closest('a[data-route]') : null
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }

  event.preventDefault()
  const route = normalizePath(link.pathname)
  const destination = isOnshapeExtensionMode() && routes[route]
    ? extensionRouteHref(route)
    : link.href
  window.history.pushState({}, '', destination)
  void renderRoute()
})

window.addEventListener('popstate', () => void renderRoute())
window.addEventListener('buildready:navigate', (event) => {
  const route = event.detail?.route
  if (!routes[route]) return
  if (isOnshapeExtensionMode()) {
    window.history.pushState({}, '', extensionRouteHref(route))
    void renderRoute()
    return
  }
  window.history.pushState({}, '', route)
  void renderRoute()
})
window.addEventListener('buildready:statechange', updateDiagnostics)
window.addEventListener('buildready:statechange', synchronizeDesignWorkspace)
window.addEventListener('buildready:statechange', renderModelInsightConversation)
window.addEventListener('buildready:feachange', () => {
  updateDiagnostics()
  synchronizeSimulationWorkspace()
})

globalResetButton.addEventListener('click', () => {
  resetDemoState()
  resetFeaState()
  if (isOnshapeExtensionMode()) {
    window.history.pushState({}, '', extensionRouteHref('/onshape-panel'))
  } else {
    window.history.pushState({}, '', '/design')
  }
  void renderRoute()
})

async function startApplication() {
  const panelMode = normalizePath(window.location.pathname) === '/onshape-panel'
    || new URLSearchParams(window.location.search).get('embedded') === 'onshape'
  document.documentElement.classList.toggle('onshape-embedded-root', panelMode)
  document.body.classList.toggle('onshape-embedded', panelMode)
  await renderRoute()

  if (!panelMode) {
    if (new URL(window.location.href).searchParams.has('documentId')) {
      try {
        onshapeExtensionContext = parseOnshapeExtensionContext()
        configureOnshapeExtensionContext(onshapeExtensionContext)
        setOnshapeAvailability(true)
        await gate7Handlers.load_onshape_design({}, {})
        await restoreSavedManufacturingReview()
      } catch (error) {
        workflowState.errorState = toolErrorEnvelope(error)
        setOnshapeAvailability(false)
      }
      updateDiagnostics()
      renderDesignSource()
      return
    }
    // Probed once, after first paint. A deployment without Onshape credentials
    // simply never offers the control, and the fixture path is unaffected.
    void onshapeSourceAvailable().then(setOnshapeAvailability)
    return
  }

  try {
    onshapeExtensionContext = parseOnshapeExtensionContext()
    configureOnshapeExtensionContext(onshapeExtensionContext)
    onshapeBridge = connectOnshapeExtension(onshapeExtensionContext, {
      onMessage(message) {
        if (message.messageName === 'show' || message.messageName === 'takeFocus') {
          document.querySelector('#panel-inspect')?.focus({ preventScroll: true })
        }
      },
    })
    onshapeExtensionStatus = { phase: 'connecting', message: 'Reading dimensions from this Part Studio…' }
    updateOnshapePanel()
    setOnshapeAvailability(true)
    await gate7Handlers.load_onshape_design({}, {})
    await restoreSavedManufacturingReview()
    onshapeExtensionStatus = {
      phase: 'connected',
      message: 'Read-only snapshot loaded. This panel does not automatically follow CAD edits. Return to Review to recheck and activate a changed revision before continuing.',
    }
  } catch (error) {
    const envelope = toolErrorEnvelope(error)
    onshapeExtensionStatus = { phase: 'failed', message: envelope.error.message }
  }
  updateDiagnostics()
}

window.addEventListener('beforeunload', () => onshapeBridge?.dispose(), { once: true })
void startApplication()
