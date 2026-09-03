const $ = (selector) => document.querySelector(selector)
let csrf = null
let workspace = ''
let generation = 0
let selectedRequest = null
let approval = null
let lastReport = null
const chargeNames = ['setup', 'finish', 'inspection', 'packaging', 'shipping', 'tax', 'other']
const quoteFields = ['supplier', 'quoteReference', 'issuedAt', 'quantity', 'currency', 'offerType', 'unitPrice', 'statedTotal', 'scopeMatch', 'validUntil', 'leadTime', ...chargeNames.map(name => `charges.${name}`)]
const registered = []

function output(value) { $('#output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
function invalidateApproval() { approval = null; $('#approval').hidden = true; $('#approval-ack').checked = false }
function scopeChanged() { generation += 1; selectedRequest = null; lastReport = null; invalidateApproval(); $('#download-report').disabled = true; $('#supplier-form').reset(); $('#supplier-directory').replaceChildren() }
function field(parent, name, label, type = 'text') {
  const wrapper = document.createElement('label')
  wrapper.textContent = label
  const input = document.createElement('input')
  input.name = name; input.type = type; input.maxLength = 400
  wrapper.append(input); parent.append(wrapper)
  return input
}
function choice(parent, name, label, options) {
  const wrapper = document.createElement('label'); wrapper.textContent = label
  const select = document.createElement('select'); select.name = name
  for (const [value, text] of options) select.add(new Option(text, value))
  wrapper.append(select); parent.append(wrapper)
}
for (const [name, label, type] of [
  ['documentId', 'Full Onshape document ID'], ['elementId', 'Part Studio element ID'], ['microversionId', 'Full microversion ID'], ['versionId', 'Existing immutable version ID'], ['partId', 'Selected part ID'],
  ['grade', 'Material grade/specification'], ['condition', 'Material temper/condition'], ['substitutions', 'Permitted substitutions, or “none”'], ['process', 'Manufacturing process'], ['quantity', 'Requested quantity', 'number'], ['tolerances', 'Drawing and tolerance requirements'], ['finish', 'Finish, or “none required”'], ['inspection', 'Inspection/certification requirements'], ['country', 'Delivery country'], ['region', 'Delivery region'], ['shippingBasis', 'Shipping/delivery basis'], ['targetDate', 'Target date (optional)', 'date'], ['exceptions', 'Exceptions, or “none”'],
]) field($('#rfq-fields'), name, label, type)
for (const [name, label, type] of [
  ['supplierIdentity', 'Stable supplier identity'], ['supplierName', 'Supplier legal/display name'], ['quoteReference', 'Supplier quote and line reference'], ['issuedAt', 'Issue date', 'date'], ['validUntil', 'Valid through (unknown if blank)', 'date'], ['quantity', 'Quoted quantity', 'number'], ['currency', 'Currency code (USD pricing policy initially)'], ['unitPrice', 'Unit price, as a decimal (unknown if blank)'], ['statedTotal', 'Order total exactly as the source states it (unknown if blank)'], ['leadTime', 'Lead time and its starting point (unknown if blank)'],
]) field($('#quote-fields'), name, label, type)
for (const name of chargeNames) {
  const row = document.createElement('div'); row.className = 'sourcing-grid'
  choice(row, `${name}.state`, `${name}: treatment`, [['unknown', 'Unknown'], ['excluded', 'Excluded — eventual cost unknown'], ['quoted_separately', 'Quoted separately'], ['included', 'Included in unit price'], ['explicit_zero', 'Explicit zero in source'], ['not_applicable', 'Not applicable, supported by source']])
  field(row, `${name}.amount`, 'Separate amount (only when quoted)')
  choice(row, `${name}.basis`, 'Charge basis', [['per_order', 'Per order'], ['per_unit', 'Per unit']])
  $('#charges').append(row)
}
for (const name of quoteFields) {
  const row = document.createElement('div'); row.className = 'source-reference sourcing-grid'
  field(row, `${name}.locator`, `${name}: page/section or JSON Pointer`)
  field(row, `${name}.raw`, `${name}: original source wording`)
  $('#citations').append(row)
}

async function api(path, { method = 'GET', body, raw = false, headers = {}, scoped = true } = {}) {
  const sequence = generation
  const suffix = scoped ? `${path.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspace)}` : ''
  if (scoped && !workspace) throw new Error('Choose a private project first.')
  const response = await fetch(`/api/private/${path}${suffix}`, {
    method, cache: 'no-store', credentials: 'same-origin',
    headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...headers },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  })
  const payload = await response.json()
  if (sequence !== generation) throw new Error('The selected project changed; the late response was not activated.')
  if (!response.ok || !payload.ok) throw new Error(`${payload.error?.code ?? 'REQUEST_FAILED'}: ${payload.error?.message ?? 'The request failed.'}`)
  return payload.result ?? payload
}
function bind(selector, event, action) {
  $(selector).addEventListener(event, async (e) => {
    e.preventDefault()
    try { await action(e) } catch (error) { output(error.message) }
  })
}
function formObject(selector) { return Object.fromEntries(new FormData($(selector))) }
function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function refreshProjects() {
  const projects = await api('workspaces', { scoped: false })
  $('#workspaces').replaceChildren(new Option('Choose a project', ''))
  for (const project of projects) $('#workspaces').add(new Option(project.name, project.id))
  $('#workspaces').value = workspace
}
async function refresh() {
  if (!workspace) return
  const [requests, quotes, artifacts] = await Promise.all([api('requests'), api('quotes'), api('artifacts')])
  const suppliers = []
  let after = ''
  for (;;) {
    const page = await api(`suppliers?limit=100&after=${encodeURIComponent(after)}`)
    suppliers.push(...page)
    if (page.length < 100) break
    after = page.at(-1).id
  }
  $('#supplier-directory').replaceChildren()
  for (const record of suppliers) {
    const row = document.createElement('div')
    row.textContent = `${record.content.name} · ${record.state} · v${record.version} `
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit'
    edit.addEventListener('click', () => {
      const form = $('#supplier-form')
      for (const key of ['name', 'contact', 'website']) form.elements[key].value = record.content[key] ?? ''
      form.elements.supplierId.value = record.id; form.elements.expectedVersion.value = record.version
      form.elements.active.checked = record.state === 'active'
    })
    const use = document.createElement('button'); use.type = 'button'; use.textContent = 'Use in transcription'; use.disabled = record.state !== 'active'
    use.addEventListener('click', () => {
      $('#quote-form').elements.supplierIdentity.value = record.id
      $('#quote-form').elements.supplierName.value = record.content.name
      $('#quote-form').elements.independence.checked = false
      output('Supplier copied into the draft. Check identity and source terms independently; nothing was sent.')
    })
    row.append(edit, use); $('#supplier-directory').append(row)
  }
  const selectedId = selectedRequest?.id
  $('#requests').replaceChildren(new Option('Choose a request', ''))
  for (const record of requests) $('#requests').add(new Option(`${record.state} · version ${record.version} · ${record.id}`, record.id))
  if (selectedId) { selectedRequest = requests.find(item => item.id === selectedId) ?? null; $('#requests').value = selectedRequest?.id ?? '' }
  $('#quotes').replaceChildren()
  for (const record of quotes) {
    const row = document.createElement('div'); const label = document.createElement('label')
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.dataset.quoteId = record.id; checkbox.dataset.version = record.version
    label.append(checkbox, document.createTextNode(`${record.content.supplier.name} · ${record.content.quoteReference} · ${record.state} · v${record.version}`))
    const inspect = document.createElement('button'); inspect.type = 'button'; inspect.textContent = 'Read saved terms'
    inspect.addEventListener('click', () => output(record))
    row.append(label, inspect)
    if (record.state === 'draft') {
      const review = document.createElement('button'); review.type = 'button'; review.textContent = 'Review original and transcription'
      review.addEventListener('click', () => showApproval(record, 'review_quote').catch(error => output(error.message)))
      row.append(review)
    }
    $('#quotes').append(row)
  }
  $('#artifacts').replaceChildren(); $('#step-select').replaceChildren(); $('#quote-source-select').replaceChildren()
  for (const item of artifacts) {
    const li = document.createElement('li'); li.textContent = `${item.filename} · ${item.kind} · ${item.availability} · ${item.digest} `
    if (item.availability === 'available') {
      const link = document.createElement('a'); link.textContent = 'Download original'; link.href = `/api/private/artifacts/${item.id}/content?workspace=${encodeURIComponent(workspace)}`
      li.append(link)
      $(item.kind === 'step' ? '#step-select' : '#quote-source-select').add(new Option(`${item.filename} · ${item.id}`, item.id))
    }
    $('#artifacts').append(li)
  }
  registerTools()
}
bind('#supplier-form', 'submit', async () => {
  const v = formObject('#supplier-form')
  const result = await api('suppliers', {method: 'POST', body: {
    supplierId: v.supplierId || null, expectedVersion: v.expectedVersion ? Number(v.expectedVersion) : null,
    name: v.name, contact: v.contact || null, website: v.website || null, active: v.active === 'on',
  }})
  $('#supplier-form').reset(); await refresh(); output(result)
})
bind('#unlock', 'submit', async () => {
  const result = await api('session', { method: 'POST', body: formObject('#unlock'), scoped: false })
  csrf = result.csrfToken; $('#unlock').reset(); $('#private-content').hidden = false; $('#lock').hidden = false
  await refreshProjects(); output('Unlocked. Select a private project; no originals were loaded or shared.'); registerTools()
})
bind('#lock', 'click', async () => {
  await api('logout', { method: 'POST', body: {}, scoped: false })
  csrf = null; workspace = ''; scopeChanged(); $('#private-content').hidden = true; $('#lock').hidden = true; output('Locked.'); registerTools()
})
bind('#new-workspace', 'submit', async () => {
  const values = formObject('#new-workspace')
  const project = await api('workspaces', { method: 'POST', scoped: false, body: { name: values.name, policy: { cadDays: 7, quoteDays: Number(values.quoteDays), metadataUntilDeletion: true, accepted: values.accepted === 'on' } } })
  workspace = project.id; scopeChanged(); await refreshProjects(); await refresh(); output(project)
})
bind('#workspaces', 'change', async () => { workspace = $('#workspaces').value; scopeChanged(); await refresh(); output('Project selected. Refresh restores saved metadata, not discarded evidence.'); registerTools() })
bind('#upload', 'submit', async () => {
  const values = new FormData($('#upload')); const file = values.get('file'); const kind = values.get('kind')
  const media = { step: 'application/step', supplier_pdf: 'application/pdf', supplier_json: 'application/json' }
  const artifact = await api('artifacts', { method: 'POST', raw: true, body: file, headers: { 'Content-Type': media[kind], 'X-Artifact-Kind': kind, 'X-Artifact-Filename': file.name } })
  $('#upload').reset(); await refresh(); output(artifact)
})
bind('#rfq-form', 'submit', async () => {
  const v = formObject('#rfq-form'); const optional = (name) => v[name]?.trim() || null
  const record = await api('requests', { method: 'POST', body: {
    source: { documentId: v.documentId, elementId: v.elementId, microversionId: v.microversionId, versionId: v.versionId, configuration: {}, partIds: [v.partId] },
    stepArtifactId: v.stepArtifactId, requestId: null, expectedVersion: null, idempotencyKey: crypto.randomUUID(),
    requirements: { material: { grade: optional('grade'), condition: optional('condition'), substitutions: optional('substitutions') }, process: optional('process'), quantity: Number(v.quantity), purchaseUnit: 'each', tolerances: optional('tolerances'), finish: optional('finish'), inspection: optional('inspection'), delivery: { country: optional('country'), region: optional('region'), shippingBasis: optional('shippingBasis'), targetDate: optional('targetDate') }, exceptions: optional('exceptions') },
  } })
  selectedRequest = record; invalidateApproval(); await refresh(); output(record)
})
bind('#requests', 'change', async () => { invalidateApproval(); selectedRequest = $('#requests').value ? await api(`records/${$('#requests').value}`) : null; output(selectedRequest ?? 'No request selected.') })
async function showApproval(record, action) {
  invalidateApproval()
  approval = await api(`records/${record.id}/challenge`, { method: 'POST', body: { version: record.version, action } })
  $('#approval-content').textContent = JSON.stringify(approval.review, null, 2)
  $('#approval').hidden = false; $('#approval').scrollIntoView({ behavior: 'smooth' })
}
bind('#review-rfq', 'click', async () => { if (!selectedRequest) throw new Error('Choose a saved request.'); await showApproval(selectedRequest, 'freeze_rfq') })
bind('#cancel', 'click', async () => invalidateApproval())
bind('#confirm', 'click', async () => {
  if (!approval || !$('#approval-ack').checked) throw new Error('Review the exact saved values and check the acknowledgement first.')
  const current = approval; invalidateApproval()
  const record = await api(`records/${current.subject}/${current.action === 'freeze_rfq' ? 'freeze' : 'review'}`, { method: 'POST', body: { version: current.review.version, nonce: current.nonce } })
  if (record.kind === 'rfq') selectedRequest = record
  await refresh(); output(record)
})
bind('#quote-form', 'submit', async () => {
  if (selectedRequest?.state !== 'frozen') throw new Error('Choose a frozen manufacturing request first.')
  const v = formObject('#quote-form'); const charges = {}; const citations = {}
  for (const name of chargeNames) charges[name] = { state: v[`${name}.state`], amount: v[`${name}.state`] === 'quoted_separately' ? v[`${name}.amount`] : null, basis: v[`${name}.basis`], includedIn: v[`${name}.state`] === 'included' ? 'unitPrice' : null }
  for (const name of quoteFields) if (v[`${name}.locator`] && v[`${name}.raw`]) citations[name] = { artifactId: v.artifactId, locator: v[`${name}.locator`], rawValue: v[`${name}.raw`] }
  const record = await api('quotes', { method: 'POST', body: {
    requestId: selectedRequest.id, requestVersion: selectedRequest.version, artifactId: v.artifactId,
    supplier: { identity: v.supplierIdentity, name: v.supplierName, independenceAttested: v.independence === 'on' },
    quoteReference: v.quoteReference, issuedAt: v.issuedAt, validUntil: v.validUntil || null, offerType: v.offerType, scopeMatch: v.scopeMatch,
    deviations: v.deviations.split('\n').map(item => item.trim()).filter(Boolean), quantity: Number(v.quantity), currency: v.currency,
    unitPrice: v.unitPrice || null, statedTotal: v.statedTotal || null, charges, leadTime: v.leadTime || null, citations, quoteId: null, expectedVersion: null,
  } })
  invalidateApproval(); await refresh(); output(record)
})
bind('#refresh', 'click', refresh)
bind('#compare', 'click', async () => {
  if (selectedRequest?.state !== 'frozen') throw new Error('Choose a frozen manufacturing request.')
  const offers = [...document.querySelectorAll('[data-quote-id]:checked')].map(input => ({ id: input.dataset.quoteId, version: Number(input.dataset.version) }))
  lastReport = await api('comparisons', { method: 'POST', body: { requestId: selectedRequest.id, requestVersion: selectedRequest.version, requestHash: selectedRequest.content.requestHash, offers } })
  $('#download-report').disabled = false; output(lastReport)
})
bind('#download-report', 'click', async () => { if (lastReport) download(lastReport, `sourcing-assessment-${lastReport.id}.json`) })

function registerTools() {
  if (!navigator.modelContext?.registerTool) return
  for (const name of registered.splice(0)) navigator.modelContext.unregisterTool(name)
  if (!csrf || !workspace) return
  const register = (name, description, properties, required, execute, readOnlyHint = true) => {
    navigator.modelContext.registerTool({ name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint, untrustedContentHint: true }, execute })
    registered.push(name)
  }
  const id = { type: 'string', format: 'uuid' }; const version = { type: 'integer', minimum: 1 }
  register('get_quote_request_context', 'Read a saved manufacturing request and its unknowns. No source bytes.', { requestId: id }, ['requestId'], input => api(`records/${encodeURIComponent(input.requestId)}`))
  register('prepare_quote_request', 'Prepare only a local request draft with an already preserved STEP. No export, approval, supplier sharing or purchase.', { draft: { type: 'object', description: 'Exact server RFQ draft contract; see the selected request context.' } }, ['draft'], input => api('requests', { method: 'POST', body: input.draft }), false)
  register('list_supplier_quotes', 'Read saved quote summaries for the selected project, including pending and historical evidence.', {}, [], async () => (await api('quotes')).map(record => ({ id: record.id, version: record.version, state: record.state, requestHash: record.content.requestHash, supplier: record.content.supplier.name, sourceKind: record.content.sourceKind })))
  register('get_supplier_quote_details', 'Read an exact saved quote version, reviewed terms and source references; never original bytes.', { quoteId: id, version }, ['quoteId', 'version'], input => api(`records/${encodeURIComponent(input.quoteId)}?version=${input.version}`))
  register('compare_supplier_quotes', 'Save a qualified assessment of exact reviewed offers. Unknown costs prevent ranking; never places orders.', { requestId: id, requestVersion: version, requestHash: { type: 'string' }, offers: { type: 'array', maxItems: 20, items: { type: 'object', properties: { id, version }, required: ['id', 'version'], additionalProperties: false } } }, ['requestId', 'requestVersion', 'requestHash', 'offers'], input => api('comparisons', { method: 'POST', body: input }), false)
}
api('capabilities', { scoped: false }).then(result => { $('#capabilities').textContent = result.configured ? result.note : 'Private mode is disabled until WORKSPACE_ACCESS_TOKEN is configured locally. The demonstration remains separate.' }).catch(error => { $('#capabilities').textContent = error.message })
