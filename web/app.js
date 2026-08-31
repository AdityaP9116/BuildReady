import { workflowState, setActiveRoute } from './state.js'
import {
  executeGate2Tool,
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
          <p class="eyebrow">Gate 2 diagnostics</p>
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
        <button type="button" class="secondary-button" data-tool="inspect_cnc_manufacturability">Run inspection stub</button>
      </div>

      <output class="tool-output" id="tool-output" aria-live="polite">No tool output yet.</output>

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
        <div class="viewer-placeholder">
          <div class="bracket-mark" aria-hidden="true"></div>
          <p>Parametric bracket viewer arrives in Gate 4.</p>
        </div>
        <div class="stage-list">
          ${stageCard('01', 'Read design context', 'The live WebMCP tool exposes the active part, process, quantity, revision, and selected feature.', 'ready')}
          ${stageCard('02', 'Inspect manufacturability', 'A temporary WebMCP stub proves the tool lifecycle before Gate 3 adds five deterministic rules.', 'ready')}
          ${stageCard('03', 'Preview a correction', 'Show a bounded radius change without committing it for the engineer.')}
        </div>
      </section>
      <aside class="compatibility-note">
        <strong>WebMCP proof</strong>
        <span>The tools register only on this route and automatically unregister when the route changes. Manual controls remain available in standard browsers.</span>
      </aside>
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
        <h2>Testing the Gate 2 tools</h2>
        <p>Open <strong>/design</strong> in a WebMCP-capable browser. Inspect the registered tools, execute <code>get_active_design_context</code> with an empty object, then execute <code>inspect_cnc_manufacturability</code> with an optional severity value.</p>
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
}

function bindManualToolControls() {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', async () => {
      const toolName = button.dataset.tool
      const output = document.querySelector('#tool-output')
      const input = toolName === 'inspect_cnc_manufacturability' ? { severity: 'all' } : {}

      button.disabled = true
      output.textContent = `Calling ${toolName}…`

      try {
        const result = await executeGate2Tool(toolName, input)
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
  bindManualToolControls()
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
