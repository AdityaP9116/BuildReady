import {
  activeDesign,
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
} from './state.js'
import { onshapeSourceAvailable } from './onshape-client.js'
import { mountBracketViewer } from './bracket-viewer.js'
import {
  executeGate7Tool,
  synchronizeWebMcpTools,
  webMcpAvailable,
} from './webmcp.js'
import { serializeReviewPackageMarkdown } from './review-package.js'
import { toolErrorEnvelope } from './error-contract.js'

const routes = {
  '/': renderDesign,
  '/design': renderDesign,
  '/suppliers': renderSuppliers,
  '/review': renderReview,
  '/about': renderAbout,
}

const app = document.querySelector('#app')
const webMcpStatus = document.querySelector('#webmcp-status')
const headerToolCount = document.querySelector('#header-tool-count')
const workflowProgress = document.querySelector('#workflow-progress')
const globalResetButton = document.querySelector('#global-reset-button')
let bracketViewer = null
let findingsSignature = ''
let viewerSnapshotKey = ''

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
          <h2 id="onboarding-title">From design evidence to a portable review in four decisions.</h2>
          <p>Start with the active revision, let the agent prepare evidence, keep approval human, then carry the same configuration into quotes and exports.</p>
        </div>
        <ol class="onboarding-steps">
          <li id="onboarding-inspection"><span>1</span><strong>Inspect</strong><small>Five deterministic rules</small></li>
          <li id="onboarding-decision"><span>2</span><strong>Decide</strong><small>Visible human authority</small></li>
          <li id="onboarding-quotes"><span>3</span><strong>Compare</strong><small>Two fictional suppliers</small></li>
          <li id="onboarding-package"><span>4</span><strong>Package</strong><small>JSON + Markdown</small></li>
        </ol>
        <a class="button-link" href="#agent-console-title">Start with the agent-ready tools</a>
      </section>
      <section class="source-card" id="source-card" aria-labelledby="source-title">
        <div>
          <p class="eyebrow">Design source</p>
          <h2 id="source-title">Controlled fixture</h2>
          <p id="source-detail">BRKT-001 revision B ships with the app so the workflow runs with no account or setup.</p>
          <p id="source-provenance" class="source-provenance" hidden></p>
        </div>
        <div class="source-actions">
          <button type="button" id="load-onshape-source" hidden>Load live Onshape model</button>
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
      ${renderAgentConsole()}
    </div>
  `
}

function renderSuppliers() {
  const quotes = workflowState.supplierQuotes
  if (quotes.length === 0) {
    return `
      <div class="page">
        ${pageIntro(
          'Supplier comparison',
          'Compare controlled manufacturing options.',
          'Two fictional suppliers return normalized prices, lead times, assumptions, and DFM feedback for the reviewed configuration.',
        )}
        <section class="empty-state">
          <span>Gate 6</span>
          <h2>No reviewed configuration has been quoted.</h2>
          <p>Complete the inspection, preview a radius change, record a visible human decision, and run the comparison.</p>
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
  const reviewPackage = workflowState.reviewPackage
  if (!reviewPackage) {
    return `
      <div class="page">
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
      ${pageIntro(
        'Evidence package',
        reviewPackage.title,
        'One package ties visible findings, the human decision, normalized quotes, provenance, versions, and the audit timeline to the same configuration.',
        `<div class="part-chip"><span>Package</span><strong>${reviewPackage.packageId}</strong></div>`,
      )}
      <aside class="compatibility-note warning-note"><strong>Demonstration evidence</strong><span>${reviewPackage.disclaimer}</span></aside>
      <section class="review-summary-grid">
        <article><span>Design</span><strong>${reviewPackage.design.designId}-${reviewPackage.design.revisionId}</strong><small>${reviewPackage.design.revisionPrecondition}</small></article>
        <article><span>Findings</span><strong>${reviewPackage.inspection.findingCount}</strong><small>${reviewPackage.inspection.counts.high} high · ${reviewPackage.inspection.counts.medium} medium</small></article>
        <article><span>Decision</span><strong>${reviewPackage.decision.decision}</strong><small>Actor: ${reviewPackage.decision.actor}</small></article>
        <article><span>Quotes</span><strong>${reviewPackage.supplierComparison.quotes.length}</strong><small>${reviewPackage.supplierComparison.configurationHash}</small></article>
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
          <li><span>02</span><div><strong>Conditional registration</strong><p>Inspection unlocks details; a human decision unlocks quotes; complete quotes unlock the package.</p></div></li>
          <li><span>03</span><div><strong>Visible evidence</strong><p>Every tool updates the same model, cards, audit history, or review package the engineer sees.</p></div></li>
          <li><span>04</span><div><strong>Cleanup by default</strong><p>Leaving a route aborts its registrations, preventing stale or duplicate actions.</p></div></li>
        </ol>
      </section>
      <section class="trust-boundary-grid">
        <article><p class="eyebrow">Agent may</p><h2>Read, inspect, preview, compare, package</h2><p>These bounded actions produce evidence and reversible session state.</p></article>
        <article><p class="eyebrow">Human only</p><h2>Approve or reject the preview</h2><p>No WebMCP approval, production-release, purchase, or geometry-commit tool exists.</p></article>
        <article><p class="eyebrow">Untrusted data</p><h2>Supplier assumptions and notes</h2><p>They remain visible evidence and can never change authority or tool availability.</p></article>
      </section>
      <section class="testing-instructions">
        <h2>Testing the complete challenge path</h2>
        <p>Complete the inspected, human-reviewed, and quoted flow, then call <code>generate_review_package</code>. Confirm the Review page matches the visible workflow and both JSON and Markdown downloads contain the package ID, versions, findings, decision, quotes, audit trail, and disclaimer.</p>
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
  if (!feature) return
  const finding = workflowState.findings.find(
    (candidate) => candidate.findingId === workflowState.selectedFindingId,
  )
  const title = document.querySelector('#measurement-title')
  const featureId = document.querySelector('#measurement-feature-id')
  const severity = document.querySelector('#measurement-severity')
  const values = document.querySelector('#measurement-values')
  const calculation = document.querySelector('#measurement-calculation')
  if (!title || !featureId || !severity || !values || !calculation) return

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
  findingCount.textContent = workflowState.inspectionStatus === 'complete'
    ? `${workflowState.findings.length} findings`
    : 'Not run'
  const nextSignature = workflowState.findings.map((finding) => finding.findingId).join('|')
  if (nextSignature !== findingsSignature) {
    findingsSignature = nextSignature
    findingsList.innerHTML = workflowState.findings.length
      ? workflowState.findings.map((finding) => `
        <button type="button" class="finding-card" data-finding-id="${finding.findingId}" data-feature-id="${finding.featureId}" data-severity="${finding.severity}" aria-pressed="false">
          <span class="finding-title-row">
            <span>${finding.severity}</span>
            <code>${finding.ruleId} · ${finding.featureId}</code>
          </span>
          <strong class="finding-card-title">${finding.title}</strong>
          <span class="finding-copy"><b>Calculation:</b> ${finding.calculation}</span>
          <span class="finding-copy"><b>Recommendation:</b> ${finding.recommendation}</span>
          <small>${finding.evidenceReferences[0]}</small>
        </button>
      `).join('')
      : '<p class="findings-empty">Run the inspection to evaluate all five controlled CNC rules.</p>'

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
  document.querySelector('#proposal-revision').textContent = `Revision ${activeDesign().revisionId} snapshot`
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
    workflowState.inspectionStatus === 'complete',
    ['approved', 'rejected'].includes(workflowState.decisionStatus),
    workflowState.supplierQuotes.length === 2,
    Boolean(workflowState.reviewPackage),
  ]
  workflowProgress.textContent = `${completedStages.filter(Boolean).length}/4 complete`
  ;['inspection', 'decision', 'quotes', 'package'].forEach((stage, index) => {
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

  auditEvents.innerHTML = workflowState.auditEvents.length
    ? workflowState.auditEvents
      .slice()
      .reverse()
      .map((event) => `<li><strong>${event.toolName}</strong><span>${event.status}</span><small>${event.summary}</small></li>`)
      .join('')
    : '<li>No tool calls recorded.</li>'

  if (findingCount && findingsList) renderFindings(findingCount, findingsList)
  if (issueDetailsButton) issueDetailsButton.disabled = !workflowState.selectedFindingId
  if (previewRadiusButton) {
    previewRadiusButton.disabled = !workflowState.findings.some((finding) => finding.ruleId === 'CNC-R001')
      || Boolean(workflowState.proposedChange)
  }
  if (quoteComparisonButton) {
    quoteComparisonButton.disabled = !['approved', 'rejected'].includes(workflowState.decisionStatus)
      || workflowState.supplierQuotes.length > 0
  }
  bracketViewer?.setFindings(workflowState.findings)
  bracketViewer?.selectFeature(workflowState.selectedFeatureId)
  renderViewerSelection()
  renderProposal()
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
    ? `${design.designId} measured live from Onshape at microversion ${designSource.provenance.microversionId.slice(0, 8)}.`
    : 'BRKT-001 revision B ships with the app so the workflow runs with no account or setup.'

  const provenance = document.querySelector('#source-provenance')
  provenance.hidden = !isLive
  if (isLive) {
    provenance.textContent = `Document: ${designSource.provenance.documentName} · ${designSource.provenance.measurementCount} live measurements · retrieved ${designSource.provenance.retrievedAt}`
  }

  // Switching source discards derived evidence, so hide the control once the
  // engineer has work that a reload would throw away.
  const loadButton = document.querySelector('#load-onshape-source')
  const restoreButton = document.querySelector('#restore-fixture-source')
  loadButton.hidden = !onshapeAvailable || isLive || inspectionStatus === 'complete'
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
  const nextSnapshotKey = activeSnapshotKey()
  if (bracketViewer && viewerSnapshotKey !== nextSnapshotKey) {
    bracketViewer.setDesign(activeDesign())
    viewerSnapshotKey = nextSnapshotKey
  }
  renderViewerSelection()
}

function bindDesignSourceControls() {
  document.querySelector('#load-onshape-source')?.addEventListener('click', async () => {
    const button = document.querySelector('#load-onshape-source')
    button.disabled = true
    button.textContent = 'Loading from Onshape…'
    try {
      await gate7Handlers.load_onshape_design({}, {})
    } catch (error) {
      const detail = document.querySelector('#source-detail')
      if (detail) detail.textContent = toolErrorEnvelope(error).error.message
    } finally {
      button.disabled = false
      button.textContent = 'Load live Onshape model'
    }
  })

  document.querySelector('#restore-fixture-source')?.addEventListener('click', () => {
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
    bracketViewer?.resetCamera()
    const output = document.querySelector('#tool-output')
    if (output) output.textContent = 'Demo reset to the original BRKT-001-B fixture.'
  })

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!workflowState.reviewPackage) return
      const format = button.dataset.download
      const isJson = format === 'json'
      const contents = isJson
        ? JSON.stringify(workflowState.reviewPackage, null, 2)
        : serializeReviewPackageMarkdown(workflowState.reviewPackage)
      const blob = new Blob([contents], { type: isJson ? 'application/json' : 'text/markdown' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${workflowState.reviewPackage.packageId}.${isJson ? 'json' : 'md'}`
      link.click()
      URL.revokeObjectURL(link.href)
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
              findingId: workflowState.findings.find((finding) => finding.ruleId === 'CNC-R001')?.findingId,
              proposedRadiusMm: 3.5,
            }
          : toolName === 'prepare_quote_comparison'
            ? { quantity: activeDesign().quantity }
          : toolName === 'generate_review_package'
            ? { title: `${activeDesign().designId}-${activeDesign().revisionId} Manufacturing Review` }
          : {}

      button.disabled = true
      if (output) output.textContent = `Calling ${toolName}…`

      try {
        const result = await executeGate7Tool(toolName, input)
        if (output) output.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } catch (error) {
        if (output) output.textContent = JSON.stringify(toolErrorEnvelope(error), null, 2)
      } finally {
        button.disabled = false
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

  const render = routes[path] ?? renderNotFound

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
  window.history.pushState({}, '', link.href)
  void renderRoute()
})

window.addEventListener('popstate', () => void renderRoute())
window.addEventListener('buildready:navigate', (event) => {
  const route = event.detail?.route
  if (!routes[route]) return
  window.history.pushState({}, '', route)
  void renderRoute()
})
window.addEventListener('buildready:statechange', updateDiagnostics)
window.addEventListener('buildready:statechange', synchronizeDesignWorkspace)

globalResetButton.addEventListener('click', () => {
  resetDemoState()
  window.history.pushState({}, '', '/design')
  void renderRoute()
})

void renderRoute()

// Probed once, after first paint. A deployment without Onshape credentials
// simply never offers the control, and the controlled fixture path is unaffected.
void onshapeSourceAvailable().then(setOnshapeAvailability)
