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
const domain = JSON.parse(fs.readFileSync(new URL('../../web/cnc-domain.json', import.meta.url)))
const config = JSON.parse(fs.readFileSync(new URL('../../web/onshape-source.json', import.meta.url)))
const context = {
  documentId: '123456789012345678901234', workspaceOrVersion: 'w',
  workspaceOrVersionId: '234567890123456789012345', elementId: '345678901234567890123456',
}
let payload
let calls = []
globalThis.fetch = async (input) => {
  const url = input instanceof URL ? input : new URL(input, window.location.origin)
  if (url.protocol === 'file:') return new Response(fs.readFileSync(fileURLToPath(url)))
  calls.push(url)
  return Response.json(payload)
}
const client = await import('../../web/onshape-client.js?v=20260903-3')
const state = await import('../../web/state.js?v=20260903-3')
const { mapOnshapeToDesign } = await import('../../web/onshape-adapter.js?v=20260903-3')
const { evaluateCncManufacturability } = await import('../../web/cnc-rules.js?v=20260903-3')
const { revisionPrecondition } = await import('../../web/workflow-rules.js?v=20260903-3')

function source(overrides = {}) {
  return {
    ok: true, document: { ...context, workspaceId: context.workspaceOrVersionId, name: 'Unreviewed part' },
    microversionId: '456789012345678901234567', retrievedAt: '2026-09-03T00:00:00Z',
    variables: [{ name: 'wallThickness', expression: '1 mm', sourceFeatureId: 'native-wall-variable' }],
    ...overrides,
  }
}

test('initial load and refresh use exactly the configured panel context', async () => {
  calls = []
  payload = source()
  client.configureOnshapeExtensionContext(context)
  await state.gate7Handlers.load_onshape_design({})
  await state.gate7Handlers.check_onshape_revision({})
  assert.equal(calls.length, 2)
  for (const url of calls) {
    for (const [key, value] of Object.entries(context)) assert.equal(url.searchParams.get(key), value)
  }
  payload = source({ document: { ...source().document, documentId: '999999999999999999999999' } })
  await assert.rejects(client.fetchOnshapeDesign(), { code: 'ONSHAPE_CONTEXT_MISMATCH' })
})

test('full microversion and element identity cannot collide under short labels', () => {
  const first = mapOnshapeToDesign(source(), config, domain.design).design
  const changed = mapOnshapeToDesign(source({ microversionId: '456789012345999999999999' }), config, domain.design).design
  const otherPart = mapOnshapeToDesign(source({ document: { ...source().document, elementId: '999999999999999999999999' } }), config, domain.design).design
  assert.notEqual(revisionPrecondition(first), revisionPrecondition(changed))
  assert.notEqual(revisionPrecondition(first), revisionPrecondition(otherPart))
  assert.throws(() => mapOnshapeToDesign(source({ microversionId: null }), config, domain.design), { code: 'ONSHAPE_NO_MICROVERSION' })
})

test('live source never inherits fixture material; findings retain measured provenance', () => {
  const mapped = mapOnshapeToDesign(source(), config, domain.design)
  assert.equal(mapped.design.material.id, 'unspecified')
  assert.equal(mapped.design.material.reviewStatus, 'unknown')
  assert.equal(mapped.design.process.reviewStatus, 'unknown')
  assert.equal(mapped.design.quantity, null)
  const result = evaluateCncManufacturability(mapped.design)
  assert.equal(result.coverage.evaluatedRuleCount, 1)
  assert.equal(result.coverage.skippedRules.length, 4)
  assert.equal(result.findings[0].inputReviewStatus, 'inferred-unreviewed')
  assert.match(result.findings[0].evidenceReferences[0], /native-wall-variable/)
  assert.equal(result.findings[0].evidenceReferences.some((reference) => reference.startsWith('fixture://')), false)
  assert.doesNotMatch(result.findings[0].consequence, /0\.8 mm/)
})

test('changed revision invalidates current downstream claims before activation', async () => {
  payload = source()
  client.configureOnshapeExtensionContext(context)
  await state.gate7Handlers.load_onshape_design({})
  await state.gate7Handlers.inspect_cnc_manufacturability({ severity: 'all' })
  const oldKey = state.activeSnapshotKey()
  payload = source({ microversionId: '456789012345999999999999' })
  await state.gate7Handlers.check_onshape_revision({})
  assert.equal(state.activeSnapshotKey(), oldKey)
  assert.equal(state.activeDesignContext().source.freshness, 'changed')
  await assert.rejects(state.gate7Handlers.inspect_cnc_manufacturability({ severity: 'all' }), { code: 'ONSHAPE_REFRESH_REQUIRED' })
})

test('failed refresh marks the snapshot unresolved and blocks new conclusions', async () => {
  payload = source()
  await state.gate7Handlers.load_onshape_design({})
  payload = {}
  await assert.rejects(state.gate7Handlers.check_onshape_revision({}))
  assert.equal(state.activeDesignContext().source.freshness, 'unresolved')
  assert.equal(state.workflowState.pendingDesignSnapshot, null)
  await assert.rejects(state.gate7Handlers.inspect_cnc_manufacturability({ severity: 'all' }), { code: 'ONSHAPE_REFRESH_REQUIRED' })
})
