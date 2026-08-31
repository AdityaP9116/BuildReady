import {
  DESIGN_FIXTURE,
  recordHumanDecision,
  resetDemoState,
  selectFeature,
  selectFinding,
  workflowState,
  setActiveRoute,
} from './state.js'
import { mountBracketViewer } from './bracket-viewer.js'
import {
  executeGate5Tool,
  synchronizeWebMcpTools,
  webMcpAvailable,
} from './webmcp.js'

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
let bracketViewer = null
let findingsSignature = ''

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
          <p class="eyebrow">Gate 5 diagnostics</p>
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
        'BuildReady binds the active bracket, revision, selected feature, and controlled workflow state to a focused WebMCP tool surface.',
        '<div class="part-chip"><span>Sample fixture</span><strong>BRKT-001-B</strong></div>',
      )}
      <section class="workspace-grid" aria-label="BuildReady workflow foundation">
        <section class="viewer-stage" aria-labelledby="viewer-title">
          <div class="viewer-heading">
            <div>
              <p class="eyebrow">Parametric evidence scene</p>
              <h2 id="viewer-title">BRKT-001-B</h2>
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
          ${stageCard('02', 'Inspect manufacturability', 'Five deterministic rules now measure the revision-B corner, pocket, wall, drilled hole, and tolerance features.', 'ready')}
          ${stageCard('03', 'Focus visual evidence', 'Issue selection, hover, camera focus, measurements, and keyboard alternatives stay synchronized with agent calls.', 'ready')}
          ${stageCard('04', 'Preview a correction', 'Prepare bounded before/after geometry while revision B remains unchanged.', 'ready')}
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
          <div><span>Before</span><strong id="proposal-before">1.0 mm</strong><small>Revision B fixture</small></div>
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
  return `
    <div class="page">
      ${pageIntro(
        'Supplier comparison',
        'Compare controlled manufacturing options.',
        'Two fictional suppliers will return normalized prices, lead times, assumptions, and DFM feedback for the reviewed configuration.',
      )}
      <section class="empty-state">
        <span>Gate 6</span>
        <h2>Supplier fixtures are intentionally not connected yet.</h2>
        <p>The comparison unlocks only after a visible human decision on the design preview.</p>
      </section>
    </div>
  `
}

function renderReview() {
  return `
    <div class="page">
      ${pageIntro(
        'Evidence package',
        'Finish with a traceable manufacturing review.',
        'Findings, the proposed correction, the human decision, supplier quotes, provenance, and the audit timeline will resolve into one package.',
      )}
      <section class="empty-state">
        <span>Gate 7</span>
        <h2>No review package has been generated.</h2>
        <p>Complete the design inspection and supplier comparison before creating the final record.</p>
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
      <section class="testing-instructions">
        <h2>Testing the Gate 5 authority boundary</h2>
        <p>Run the inspection, call <code>preview_radius_change</code> for the corner finding, and confirm the page shows ghosted before/after geometry. The tool must stop at a pending state; only the visible Approve preview or Reject button can record a human decision.</p>
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
  const feature = DESIGN_FIXTURE.features.find(
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

  const activeRoute = document.querySelector('#active-route')
  const toolCount = document.querySelector('#registered-tool-count')
  const lastCall = document.querySelector('#last-tool-call')
  const registrationBadge = document.querySelector('#registration-badge')
  const auditEvents = document.querySelector('#audit-events')
  const findingCount = document.querySelector('#finding-count')
  const findingsList = document.querySelector('#findings-list')
  const issueDetailsButton = document.querySelector('#issue-details-button')
  const previewRadiusButton = document.querySelector('#preview-radius-button')

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
  bracketViewer?.setFindings(workflowState.findings)
  bracketViewer?.selectFeature(workflowState.selectedFeatureId)
  renderViewerSelection()
  renderProposal()
}

function bindBracketViewer() {
  const canvas = document.querySelector('#bracket-canvas')
  if (!canvas) return
  bracketViewer = mountBracketViewer(canvas, DESIGN_FIXTURE, {
    onFeatureSelect: (featureId) => selectFeature(featureId),
  })
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
          : {}

      button.disabled = true
      output.textContent = `Calling ${toolName}…`

      try {
        const result = await executeGate5Tool(toolName, input)
        output.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } catch (error) {
        output.textContent = error?.message ?? 'Tool execution failed.'
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
  if (path === '/design') bindBracketViewer()
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
window.addEventListener('buildready:statechange', updateDiagnostics)

void renderRoute()
