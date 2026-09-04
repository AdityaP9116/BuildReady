const $ = selector => document.querySelector(selector)
let csrf = null, generation = 0, busy = false
const output = value => { $('#output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2) }
async function api(path, method = 'GET', body = undefined) {
  const sequence = generation
  const response = await fetch(`/api/private/${path}`, { method, cache: 'no-store', credentials: 'same-origin',
    headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(csrf ? {'X-CSRF-Token':csrf} : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const result = await response.json()
  if (sequence !== generation) throw new Error('Selection changed; late response was not activated. Check the operation journal before retrying.')
  if (!response.ok || !result.ok) throw new Error(result.error?.message ?? 'Request failed.')
  return result.result ?? result
}
function clearApproval() { generation++; $('#human-ack').checked = false; $('#approval').value = ''; $('#mapping').value = ''; output('Selection changed. Review this preparation again.') }
async function preparations() {
  $('#preparation').replaceChildren()
  if (!$('#workspace').value) return
  const items = await api(`live-demo?workspace=${encodeURIComponent($('#workspace').value)}`)
  for (const item of items) $('#preparation').add(new Option(`${item.source.part_id} · ${item.preparationId.slice(0,12)} · expires ${new Date(item.expiresAt*1000).toLocaleString()}`, item.preparationId))
}
$('#unlock').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    const result = await api('session', 'POST', {accessToken:$('#token').value}); csrf = result.csrfToken; $('#token').value = ''
    const items = await api('workspaces'); $('#workspace').replaceChildren()
    for (const item of items) $('#workspace').add(new Option(item.name, item.id))
    $('#controls').hidden = false; $('#unlock').hidden = true; await preparations()
    output('Unlocked. Inspect the frozen setup before authorizing any external action.')
  } catch (error) { output(error.message) }
})
$('#workspace').addEventListener('change', async () => { clearApproval(); try { await preparations() } catch (error) { output(error.message) } })
$('#preparation').addEventListener('change', clearApproval)
for (const selector of ['#approval','#mapping','#level']) $(selector).addEventListener('input', () => { $('#human-ack').checked = false })
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
  if (busy) return
  const action = button.dataset.action
  try {
    if (!$('#preparation').value) throw new Error('Choose a current frozen preparation.')
    if (['import','advance'].includes(action) && !$('#human-ack').checked) throw new Error('Review and acknowledge this external action first.')
    busy = true; document.querySelectorAll('[data-action]').forEach(item => { item.disabled = true })
    const payload = {action, preparationId:$('#preparation').value, approval:['import','advance'].includes(action) ? JSON.parse($('#approval').value) : null,
      mapping:action === 'advance' ? JSON.parse($('#mapping').value) : action === 'results' ? JSON.parse($('#result-selection').value) : null, level:Number($('#level').value), kind:$('#kind').value,
      identity:$('#identity').value, simulation:$('#simulation').value,
      reconciliation:action === 'reconcile' ? JSON.parse($('#reconciliation').value) : null}
    output(await api(`live-demo?workspace=${encodeURIComponent($('#workspace').value)}`, 'POST', payload))
  } catch (error) { output(error.message) } finally {
    busy = false; $('#human-ack').checked = false; document.querySelectorAll('[data-action]').forEach(item => { item.disabled = false })
  }
}))
$('#logout').addEventListener('click', async () => { try { await api('logout','POST',{}); csrf = null; clearApproval(); $('#controls').hidden = true; $('#unlock').hidden = false } catch (error) { output(error.message) } })
