import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const events = new EventTarget()
globalThis.window = {
  location: { origin: 'http://review.invalid' },
  dispatchEvent: events.dispatchEvent.bind(events),
  addEventListener: events.addEventListener.bind(events),
  setTimeout,
}
let handleApi
globalThis.fetch = async (input, options) => {
  const url = input instanceof URL ? input : new URL(input, window.location.origin)
  if (url.protocol === 'file:') return new Response(fs.readFileSync(fileURLToPath(url)))
  return handleApi(url, options)
}
const state = await import('../../web/state.js?v=20260903-1')
const fea = await import('../../web/fea-state.js?v=20260903-1')
const { ModelInsightAssistant } = await import('../../web/insight-assistant.js?v=20260903-1')
const input = { forceN: 441, direction: [1e-9, -1, 0], meshPreset: 'medium', minimumSafetyFactor: 2, maximumDisplacementMm: 1 }

test('preparation uses the server fingerprint and exposes the returned frozen manifest', async () => {
  handleApi = (url, options) => {
    if (url.pathname.endsWith('capabilities')) return Response.json({ ok: true, provider: 'recorded', live: false })
    assert.equal(url.pathname, '/api/fea/prepare')
    const unsigned = JSON.parse(options.body)
    assert.equal('studyHash' in unsigned, false)
    return Response.json({ ok: true, study: {
      studyId: 'study-example', snapshotKey: state.activeSnapshotKey(), studyHash: 'server-fingerprint',
      manifest: { ...unsigned, studyHash: 'server-fingerprint' }, lifecycleState: 'VALIDATED', currentness: 'CURRENT', result: null,
    } })
  }
  const result = await fea.prepareStaticStressStudy(input)
  assert.equal(result.studyHash, 'server-fingerprint')
  assert.equal(result.manifest.studyHash, result.studyHash)
  assert.equal(state.workflowState.simulationEvidence.studyHash, result.studyHash)
})

test('a late study response cannot restore state after reset', async () => {
  let resolveResponse
  let started
  const ready = new Promise(resolve => { started = resolve })
  handleApi = () => { started(); return new Promise(resolve => { resolveResponse = resolve }) }
  const pending = fea.prepareStaticStressStudy(input)
  await ready
  fea.resetFeaState()
  resolveResponse(Response.json({ ok: true, study: { studyId: 'late-study' } }))
  await assert.rejects(pending, /FEA_STALE_RESPONSE/)
  assert.equal(fea.feaState.study, null)
  assert.equal(state.workflowState.simulationEvidence, null)
})

test('a recorded or stale result cannot pass engineering comparison', async () => {
  const snapshotKey = state.activeSnapshotKey()
  fea.feaState.study = { studyId: 'study-test', studyHash: 'hash', snapshotKey, currentness: 'STALE', lifecycleState: 'COMPLETE' }
  fea.feaState.result = {
    runId: 'run-test', studyId: 'study-test', inputs: { studyHash: 'hash' }, source: { snapshotKey },
    solver: { live: true }, verification: { status: 'verified-live' }, assessment: { limitations: [] },
    metrics: { estimatedFactorOfSafety: { value: null }, maximumDisplacement: { value: null, unit: 'mm' } },
  }
  fea.feaState.applicability = { usableForEngineeringDisposition: true, snapshotKey }
  let result = await fea.compareSimulationToRequirements({})
  assert.equal(result.usableForEngineeringDisposition, false)
  fea.feaState.study.currentness = 'CURRENT'
  result = await fea.compareSimulationToRequirements({})
  assert.equal(result.usableForEngineeringDisposition, false)
  assert.deepEqual(result.comparison, { minimumSafetyFactor: 'unknown', maximumDisplacement: 'unknown' })
  fea.resetFeaState()
})

test('clearing an assistant request prevents its late answer from returning', async () => {
  const storage = { getItem: () => null, setItem: () => {} }
  const assistant = new ModelInsightAssistant(storage)
  let finish
  assistant.prepareIntent = () => new Promise(resolve => { finish = resolve })
  const pending = assistant.ask('What is this model?')
  assistant.clear()
  const afterClear = assistant.json()
  finish()
  assert.equal(await pending, null)
  assert.deepEqual(JSON.parse(assistant.json()).messages, JSON.parse(afterClear).messages)
  assert.equal(assistant.busy, false)
})
