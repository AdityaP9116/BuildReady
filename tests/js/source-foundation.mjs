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
const client = await import('../../web/onshape-client.js?v=20260903-2')
const state = await import('../../web/state.js?v=20260903-2')
const { mapOnshapeToDesign } = await import('../../web/onshape-adapter.js?v=20260903-2')
const { evaluateCncManufacturability } = await import('../../web/cnc-rules.js?v=20260903-2')
const { revisionPrecondition } = await import('../../web/workflow-rules.js?v=20260903-2')
const { composeInsightResponse, classifyInsightQuery } = await import('../../web/insight-engine.js?v=20260903-2')
const { validateReviewReadiness } = await import('../../web/review-package.js?v=20260903-2')
const { fictionalQuotePreview } = await import('../../web/quote-engine.js?v=20260903-2')
const { reviewManufacturingInputs, persistManufacturingReview, restoreManufacturingReview, REVIEW_GROUPS } = await import('../../web/manufacturing-review.js?v=20260903-3')

test('human measurement review is revision-bound, clears old evidence and never grants production approval', async () => {
  const mapped = mapOnshapeToDesign(source(), config, domain.design)
  state.replaceActiveDesignSnapshot(mapped.design, {sourceId:'onshape-live',label:'Test',provenance:mapped.provenance})
  const input = {snapshotKey:mapped.design.sourceSnapshotKey, reviewer:'Test reviewer', acknowledged:true,
    groups:REVIEW_GROUPS.map(([featureId,,keys]) => ({featureId,reference:'Synthetic face reference',dimensions:Object.fromEntries(keys.map(key => [key,1]))}))}
  const reviewed = await reviewManufacturingInputs(mapped.design,input)
  state.workflowState.supplierQuotes = [{fictional:true}]
  state.applyReviewedManufacturingDesign(reviewed)
  assert.equal(state.workflowState.supplierQuotes.length,0)
  assert.equal(state.activeDesignContext().manufacturingReview.productionApproved,false)
  const inspection = evaluateCncManufacturability(reviewed)
  assert.equal(inspection.coverage.evaluatedRuleCount,5)
  assert.equal(inspection.assessmentStatus,'screened-human-inputs')
  assert.equal(inspection.manufacturingApproved,false)
  await assert.rejects(reviewManufacturingInputs(mapped.design,{...input,snapshotKey:'wrong'}))
  await assert.rejects(reviewManufacturingInputs(mapped.design,{...input,acknowledged:false}))
  const invalid = structuredClone(input); invalid.groups[0].dimensions.insideRadiusMm = null
  await assert.rejects(reviewManufacturingInputs(mapped.design,invalid))
  state.workflowState.sourceFreshness = 'changed'
  assert.throws(() => state.applyReviewedManufacturingDesign(reviewed))
  state.restoreControlledFixture()
})

test('human measurement reviews persist and restore only for their exact snapshot', async () => {
  const mapped = mapOnshapeToDesign(source(), config, domain.design)
  const input = {snapshotKey:mapped.design.sourceSnapshotKey, reviewer:'Test reviewer', acknowledged:true,
    groups:[{featureId:'thin-wall',reference:'Face A',dimensions:{thicknessMm:2.5}}]}
  payload = {ok:true,record:{review:input,reviewHash:'sha256-storage',expiresAt:1800604800}}
  const saved = await persistManufacturingReview(input)
  assert.equal(saved.reviewHash,'sha256-storage')
  assert.equal(calls.at(-1).pathname,'/api/manufacturing-reviews')
  payload = {ok:true,found:true,record:saved}
  const restored = await restoreManufacturingReview(mapped.design)
  assert.equal(restored.sourceSnapshotKey,mapped.design.sourceSnapshotKey)
  assert.equal(restored.manufacturingReview.storageHash,'sha256-storage')
  assert.equal(restored.manufacturingReview.productionApproved,false)
  assert.equal(calls.at(-1).searchParams.get('snapshotKey'),mapped.design.sourceSnapshotKey)
})

function source(overrides = {}) {
  return {
    ok: true, document: { ...context, workspaceId: context.workspaceOrVersionId, name: 'Unreviewed part' },
    microversionId: '456789012345678901234567', retrievedAt: '2026-09-03T00:00:00Z',
    variables: [{ name: 'wallThickness', expression: '1 mm', sourceFeatureId: 'native-wall-variable' }],
    ...overrides,
  }
}

test('fictional supplier previews preserve unknown costs and never advance workflow evidence', () => {
  const before = JSON.stringify(state.workflowState.supplierQuotes)
  const preview = fictionalQuotePreview(250)
  assert.equal(preview.sourceKind, 'fictional_fixture')
  assert.equal(preview.designMatch, 'unresolved')
  assert.equal(preview.quotes.length, 2)
  for (const quote of preview.quotes) {
    assert.equal(quote.fictional, true)
    assert.equal(quote.shipping, null)
    assert.equal(quote.tax, null)
    assert.equal(quote.total, null)
    assert.ok(quote.knownSubtotal > 0)
  }
  assert.equal(JSON.stringify(state.workflowState.supplierQuotes), before)
  assert.throws(() => fictionalQuotePreview(1), { code: 'UNSUPPORTED_QUANTITY' })
})

test('native parameters never become inferred manufacturing roles or a passed inspection', async () => {
  assert.equal(classifyInsightQuery('Run the manufacturing check').kind, 'inspect')
  assert.equal(classifyInsightQuery('How were dimensions recognized?').kind, 'variables')
  assert.equal(classifyInsightQuery('Load this Part Studio').kind, 'live_source')
  const nativeDimensions = ['2*millimeter', '#radius', '0 mm', '-2 mm'].map((expression, index) => ({
    featureId: `fillet-${index}`, featureName: 'wallThickness', featureType: 'fillet', parameterId: 'radius', expression,
  }))
  payload = source({ variables: [], nativeDimensions })
  const mapped = mapOnshapeToDesign(payload, config, domain.design)
  assert.deepEqual(mapped.design.features, [])
  assert.deepEqual(mapped.provenance.discovery.mappings, [])
  assert.deepEqual(mapped.design.nativeDimensions.map((item) => item.valueMm), [2, null, null, null])
  assert.equal(mapped.design.manufacturingInputGaps.length, 5)
  const inspection = evaluateCncManufacturability(mapped.design)
  assert.equal(inspection.assessmentStatus, 'incomplete')
  assert.equal(inspection.manufacturingApproved, false)
  assert.equal(inspection.coverage.evaluatedRuleCount, 0)
  assert.equal(inspection.coverage.skippedRules[0].inputGap.ruleId, 'CNC-R001')
  assert.throws(() => validateReviewReadiness({ fixture: mapped.design, inspection }), { code: 'MANUFACTURING_INPUTS_REQUIRED' })
  const snapshot = { design: mapped.design, provenance: mapped.provenance,
    workflow: { findings: [], inspection, designSource: { sourceId: 'onshape-live' } } }
  assert.match(composeInsightResponse({ kind: 'inspect' }, snapshot).text, /zero findings is not a pass/i)
  assert.match(composeInsightResponse({ kind: 'measurements' }, snapshot).text, /No verified/)
  assert.match(composeInsightResponse({ kind: 'explain' }, snapshot).text, /No manufacturing region/)
  client.configureOnshapeExtensionContext(context)
  await state.gate7Handlers.load_onshape_design({})
  const result = await state.gate7Handlers.inspect_cnc_manufacturability({ severity: 'all' })
  assert.equal(result.assessmentStatus, 'incomplete')
  assert.equal(state.activeDesignContext().manufacturingInputGaps.length, 5)
  assert.equal(state.activeDesignContext().nativeDimensions.length, 4)
})

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
