import { activeDesign, activeSnapshotKey, workflowState } from './state.js?v=20260903-2'

export function evidenceCurrentness(record, design, freshness, partId, now = Date.now() / 1000) {
  const source = record?.binding?.source
  const identity = design?.sourceIdentity
  if (!source || !identity || record.schemaVersion !== 'buildready-simulation-evidence-2.0.0'
    || record.evidenceMode !== 'live' || record.sourceKind !== 'authorized_api' || record.live !== true
    || record.provider !== 'simscale' || record.lifecycleState !== 'COMPLETE') return 'UNRESOLVED'
  if (!Number.isFinite(record.retention?.expiresAt) || record.retention.expiresAt <= now
    || record.retention.artifactsAvailable !== true || record.currentness === 'EXPIRED') return 'EXPIRED'
  if (record.currentness !== 'CURRENT') return record.currentness === 'STALE' ? 'STALE' : 'UNRESOLVED'
  if (['documentId', 'elementId', 'microversionId'].some(key => source[key] !== identity[key])
    || source.partId !== partId || source.configuration !== '' || identity.configuration !== 'default'
    || (identity.workspaceOrVersion === 'v' && identity.workspaceOrVersionId !== source.versionId)) return 'STALE'
  return freshness === 'checked' ? 'CURRENT' : 'UNRESOLVED'
}

let active = null
let generation = 0
Object.defineProperty(workflowState, 'liveSimulationEvidence', { configurable: true, get: () => active ? readLiveSimulationEvidence() : null })
export function readLiveSimulationEvidence(input = {}) {
  if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Expected an empty input object.')
  if (!active) throw new Error('Load retained live evidence using the visible Simulation controls first.')
  return { ...structuredClone(active.record), currentness: evidenceCurrentness(active.record, activeDesign(), workflowState.sourceFreshness, active.partId),
    engineeringDisposition: 'not_approved', productionApproved: false }
}

export async function loadLiveSimulationEvidence({ workspace, preparation, evidenceId, partId }) {
  const request = ++generation
  const snapshot = activeSnapshotKey()
  const response = await fetch(`/api/private/live-evidence?workspace=${encodeURIComponent(workspace)}&preparation=${encodeURIComponent(preparation)}`, { credentials: 'same-origin', cache: 'no-store' })
  const payload = await response.json()
  if (!response.ok || !payload.ok || !Array.isArray(payload.result)) throw new Error(payload.error?.message ?? 'Unlock the private workspace before loading live evidence.')
  const record = payload.result.find(item => item.evidenceId === evidenceId)
  if (request !== generation || snapshot !== activeSnapshotKey() || evidenceCurrentness(record, activeDesign(), workflowState.sourceFreshness, partId) !== 'CURRENT') throw new Error('Evidence is missing, expired, or does not match the checked revision and selected part.')
  active = { record: structuredClone(record), partId }
  window.dispatchEvent(new CustomEvent('buildready:toolavailabilitychange'))
  return readLiveSimulationEvidence()
}

export function mountLiveSimulation(container) {
  const form = document.createElement('form')
  const heading = document.createElement('h2'); heading.textContent = 'Retained live SimScale evidence'; form.append(heading)
  const note = document.createElement('p'); note.textContent = 'Unlock the private commissioning workspace first. Load an exact retained result here for the checked Onshape revision. Captured results are not engineering approval.'; form.append(note)
  for (const [name, label] of [['workspace','Private workspace ID'],['preparation','Preparation ID'],['evidenceId','Evidence ID'],['partId','Reviewed Onshape part ID']]) {
    const wrapper = document.createElement('label'); wrapper.textContent = label
    const field = document.createElement('input'); field.name = name; field.required = true; field.maxLength = 100; wrapper.append(field); form.append(wrapper)
  }
  const load = document.createElement('button'); load.textContent = 'Load revision-bound result'; form.append(load)
  const verify = document.createElement('button'); verify.type = 'button'; verify.textContent = 'Inspect numerical readiness'; form.append(verify)
  const download = document.createElement('button'); download.type = 'button'; download.textContent = 'Export live evidence JSON'; download.disabled = true; form.append(download)
  const output = document.createElement('pre'); output.setAttribute('role','status'); form.append(output)
  form.addEventListener('submit', async event => {
    event.preventDefault(); load.disabled = true; download.disabled = true
    try { output.textContent = JSON.stringify(await loadLiveSimulationEvidence(Object.fromEntries(new FormData(form))), null, 2); download.disabled = false }
    catch (error) { output.textContent = error.message } finally { load.disabled = false }
  })
  verify.addEventListener('click', async () => {
    verify.disabled = true
    try {
      const values = Object.fromEntries(new FormData(form))
      const response = await fetch(`/api/private/live-verification?workspace=${encodeURIComponent(values.workspace)}&preparation=${encodeURIComponent(values.preparation)}`, {credentials:'same-origin', cache:'no-store'})
      const payload = await response.json()
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'Unable to read numerical readiness.')
      output.textContent = JSON.stringify({scope:'Retained preparation; not approval of the active design', ...payload.result}, null, 2)
    } catch (error) { output.textContent = error.message } finally { verify.disabled = false }
  })
  download.addEventListener('click', () => {
    const record = readLiveSimulationEvidence()
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type:'application/json'}))
    const link = document.createElement('a'); link.href = url; link.download = 'buildready-live-evidence.json'; link.click(); URL.revokeObjectURL(url)
  })
  container.replaceChildren(form)
}
