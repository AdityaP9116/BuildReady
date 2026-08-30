const routes = {
  '/': renderDesign,
  '/design': renderDesign,
  '/suppliers': renderSuppliers,
  '/review': renderReview,
  '/about': renderAbout,
}

const app = document.querySelector('#app')
const webMcpStatus = document.querySelector('#webmcp-status')

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

function renderDesign() {
  return `
    <div class="page">
      ${pageIntro(
        'Design workspace',
        'Prepare a CNC design with your agent.',
        'BuildReady will bind the active bracket, revision, selected feature, and deterministic manufacturing evidence to a focused WebMCP tool surface.',
        '<div class="part-chip"><span>Sample fixture</span><strong>BRKT-001-B</strong></div>',
      )}
      <section class="workspace-grid" aria-label="BuildReady workflow foundation">
        <div class="viewer-placeholder">
          <div class="bracket-mark" aria-hidden="true"></div>
          <p>Parametric bracket viewer arrives in Gate 4.</p>
        </div>
        <div class="stage-list">
          ${stageCard('01', 'Read design context', 'Expose the active part, material, process, quantity, revision, and selected feature.', 'ready')}
          ${stageCard('02', 'Inspect manufacturability', 'Run five reproducible CNC checks and highlight measured evidence.')}
          ${stageCard('03', 'Preview a correction', 'Show a bounded radius change without committing it for the engineer.')}
        </div>
      </section>
      <aside class="compatibility-note">
        <strong>Gate 1 foundation</strong>
        <span>This shell remains usable without WebMCP. Tool registration begins in Gate 2 after the public deployment is verified.</span>
      </aside>
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

function renderRoute() {
  const path = normalizePath(window.location.pathname)
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
  renderRoute()
})

window.addEventListener('popstate', renderRoute)

if ('modelContext' in document) {
  webMcpStatus.classList.add('supported')
  webMcpStatus.querySelector('small').textContent = 'Available'
}

renderRoute()
