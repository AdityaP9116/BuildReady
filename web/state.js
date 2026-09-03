import { DESIGN_FIXTURE, RULE_SET_SCOPE, RULE_SET_VERSION } from './domain.js?v=20260903-2'
import { compactInspectionResult, evaluateCncManufacturability } from './cnc-rules.js?v=20260903-2'
import { revisionPrecondition, validateRadiusProposal, WorkflowRuleError } from './workflow-rules.js?v=20260903-2'
import { prepareQuoteComparison } from './quote-engine.js?v=20260903-2'
import { createReviewPackage } from './review-package.js?v=20260903-2'
import { attachToolErrorContract } from './error-contract.js?v=20260903-2'

export { DESIGN_FIXTURE }

const CONTROLLED_SOURCE = Object.freeze({
  sourceId: 'controlled-fixture',
  label: 'Controlled fixture',
  provenance: null,
})

function createDesignSnapshot(design, source) {
  return Object.freeze({
    design,
    source: Object.freeze({ ...source }),
    snapshotKey: revisionPrecondition(design),
  })
}

export const workflowState = {
  activeRoute: '/design',
  activeDesignSnapshot: createDesignSnapshot(DESIGN_FIXTURE, CONTROLLED_SOURCE),
  get designSource() {
    return this.activeDesignSnapshot.source
  },
  onshapeAvailable: false,
  onshapeLastCheckedAt: null,
  sourceFreshness: 'fixture',
  pendingDesignSnapshot: null,
  selectedFeatureId: DESIGN_FIXTURE.features.find((feature) => feature.selected)?.featureId ?? null,
  inspectionStatus: 'not_run',
  inspection: null,
  findings: [],
  selectedFindingId: null,
  proposedChange: null,
  decisionStatus: 'not_requested',
  decisionRecord: null,
  supplierRequests: [],
  supplierQuotes: [],
  simulationEvidence: null,
  reviewPackage: null,
  registeredToolCount: 0,
  registrationStatus: 'unsupported',
  lastToolCall: null,
  auditEvents: [],
  errorState: null,
}

let eventSequence = 0
let onshapeLoadSequence = 0

function emitStateChange(detail = {}) {
  window.dispatchEvent(new CustomEvent('buildready:statechange', { detail }))
}

/** @returns {import('./domain.js').DesignFixture} the design the whole workflow measures. */
export function activeDesign() {
  return workflowState.activeDesignSnapshot.design
}

export function activeDesignSource() {
  return workflowState.activeDesignSnapshot.source
}

export function activeSnapshotKey() {
  return workflowState.activeDesignSnapshot.snapshotKey
}

function requestToolAvailabilityRefresh() {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('buildready:toolavailabilitychange'))
  }, 0)
}

export function setActiveRoute(route) {
  workflowState.activeRoute = route
  emitStateChange()
}

export function setRegistrationState(status, toolCount = 0) {
  workflowState.registrationStatus = status
  workflowState.registeredToolCount = toolCount
  emitStateChange()
}

export function appendAuditEvent(actor, actionName, status, summary, { emit = true } = {}) {
  eventSequence += 1
  const event = {
    eventId: `audit-${String(eventSequence).padStart(3, '0')}`,
    actor,
    toolName: actionName,
    status,
    summary,
    timestamp: new Date().toISOString(),
  }

  workflowState.lastToolCall = event
  workflowState.auditEvents = [...workflowState.auditEvents.slice(-9), event]
  if (emit) emitStateChange()
  return event
}

export function recordToolCall(toolName, status, summary) {
  return appendAuditEvent('agent_or_manual_test', toolName, status, summary)
}

function abortIfRequested(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Tool execution was cancelled.', 'AbortError')
  }
}

function assertEmptyObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) {
    throw new WorkflowRuleError('INVALID_INPUT', 'expected an empty object.')
  }
}

function selectedFeature() {
  return activeDesign().features.find(
    (feature) => feature.featureId === workflowState.selectedFeatureId,
  )
}

export function selectFeature(featureId) {
  const feature = activeDesign().features.find((candidate) => candidate.featureId === featureId)
  if (!feature) return false
  workflowState.selectedFeatureId = featureId
  workflowState.selectedFindingId = workflowState.findings.find(
    (finding) => finding.featureId === featureId,
  )?.findingId ?? null
  emitStateChange()
  return true
}

export function selectFinding(findingId) {
  const finding = workflowState.findings.find((candidate) => candidate.findingId === findingId)
  if (!finding) return false
  workflowState.selectedFindingId = finding.findingId
  workflowState.selectedFeatureId = finding.featureId
  emitStateChange()
  return true
}

export function activeDesignContext() {
  const source = activeDesignSource()
  return {
    designId: activeDesign().designId,
    revisionId: activeDesign().revisionId,
    fixtureVersion: activeDesign().fixtureVersion,
    name: activeDesign().name,
    material: activeDesign().material,
    process: activeDesign().process,
    quantity: activeDesign().quantity,
    units: activeDesign().units,
    selectedFeature: selectedFeature(),
    featureCount: activeDesign().features.length,
    nativeDimensions: activeDesign().nativeDimensions ?? [],
    manufacturingReview: activeDesign().manufacturingReview ?? null,
    liveSimulationEvidence: workflowState.liveSimulationEvidence ?? null,
    manufacturingInputGaps: activeDesign().manufacturingInputGaps ?? [],
    unsavedPreview: false,
    inspectionStatus: workflowState.inspectionStatus,
    ruleSetVersion: RULE_SET_VERSION,
    ruleSetScope: RULE_SET_SCOPE,
    snapshotKey: activeSnapshotKey(),
    source: {
      sourceId: source.sourceId,
      label: source.label,
      provenance: source.provenance,
      lastCheckedAt: workflowState.onshapeLastCheckedAt,
      freshness: workflowState.sourceFreshness,
      pendingRevisionId: workflowState.pendingDesignSnapshot?.design.revisionId ?? null,
    },
  }
}

export function setSimulationEvidence(evidence) {
  const boundResultHash = workflowState.supplierRequests[0]?.simulationResultHash
  const downstreamIsStale = Boolean(boundResultHash) && (
    evidence?.result?.resultHash !== boundResultHash
    || evidence?.currentness !== 'CURRENT'
    || evidence?.snapshotKey !== activeSnapshotKey()
  )
  if (downstreamIsStale) {
    workflowState.supplierRequests = []
    workflowState.supplierQuotes = []
    workflowState.reviewPackage = null
  }
  workflowState.simulationEvidence = evidence
  emitStateChange({ reason: 'simulation-evidence-updated', snapshotKey: evidence?.snapshotKey ?? null })
}

async function getActiveDesignContext(input, { signal } = {}) {
  abortIfRequested(signal)
  assertEmptyObject(input)

  return {
    ok: true,
    context: activeDesignContext(),
    nextAction: 'Run inspect_cnc_manufacturability to evaluate the checks supported by this model.',
  }
}

async function inspectCncManufacturability(input, { signal } = {}) {
  abortIfRequested(signal)

  const allowedSeverities = ['all', 'high', 'medium']
  const unknownKeys = Object.keys(input ?? {}).filter((key) => key !== 'severity')
  const severity = input?.severity ?? 'all'

  if (unknownKeys.length > 0 || !allowedSeverities.includes(severity)) {
    throw new WorkflowRuleError('INVALID_INPUT', 'severity must be all, high, or medium.')
  }

  const inspection = evaluateCncManufacturability(activeDesign(), { severity })
  abortIfRequested(signal)

  const generatedAt = new Date().toISOString()
  workflowState.inspectionStatus = 'complete'
  workflowState.inspection = { ...inspection, generatedAt }
  workflowState.findings = [...inspection.findings]
  workflowState.selectedFindingId = inspection.findings[0]?.findingId ?? null
  workflowState.selectedFeatureId = inspection.findings[0]?.featureId ?? workflowState.selectedFeatureId
  workflowState.proposedChange = null
  workflowState.decisionStatus = 'not_requested'
  workflowState.decisionRecord = null
  workflowState.errorState = null
  emitStateChange()
  requestToolAvailabilityRefresh()

  return compactInspectionResult(inspection, generatedAt)
}

async function getIssueDetails(input, { signal } = {}) {
  abortIfRequested(signal)
  const keys = Object.keys(input ?? {})
  if (keys.length !== 1 || keys[0] !== 'findingId' || typeof input.findingId !== 'string') {
    throw new WorkflowRuleError('INVALID_INPUT', 'findingId must identify one current finding.')
  }
  if (workflowState.inspectionStatus !== 'complete' || !workflowState.inspection) {
    throw new WorkflowRuleError('INSPECTION_REQUIRED', 'run inspect_cnc_manufacturability first.')
  }
  if (workflowState.inspection.revisionPrecondition !== revisionPrecondition(activeDesign())) {
    throw new WorkflowRuleError('STALE_INSPECTION', 're-run inspection for the active revision.', true)
  }

  const finding = workflowState.findings.find((candidate) => candidate.findingId === input.findingId)
  if (!finding) {
    throw new WorkflowRuleError('FINDING_NOT_FOUND', 'choose a finding from the current inspection.')
  }
  const feature = activeDesign().features.find((candidate) => candidate.featureId === finding.featureId)
  selectFinding(finding.findingId)
  abortIfRequested(signal)

  return {
    ok: true,
    inspectionId: workflowState.inspection.inspectionId,
    revisionPrecondition: workflowState.inspection.revisionPrecondition,
    finding: {
      findingId: finding.findingId,
      rule: `${finding.ruleId}@${finding.ruleVersion}`,
      title: finding.title,
      severity: finding.severity,
      featureId: finding.featureId,
      observedMeasurements: finding.observedMeasurements,
      threshold: finding.threshold,
      calculation: finding.calculation,
      consequence: finding.consequence,
      recommendation: finding.recommendation,
      confidence: finding.confidence,
      inputReviewStatus: finding.inputReviewStatus,
      measurementProvenance: finding.measurementProvenance,
      evidenceReferences: finding.evidenceReferences,
      highlightTarget: {
        objectReference: feature.objectReference,
        highlightIds: finding.highlightIds,
      },
    },
  }
}

async function previewRadiusChange(input, { signal } = {}) {
  abortIfRequested(signal)
  const keys = Object.keys(input ?? {}).sort()
  if (keys.length !== 2
    || keys[0] !== 'findingId'
    || keys[1] !== 'proposedRadiusMm'
    || typeof input.findingId !== 'string'
    || typeof input.proposedRadiusMm !== 'number') {
    throw new WorkflowRuleError('INVALID_INPUT', 'findingId and numeric proposedRadiusMm are required.')
  }

  const proposal = validateRadiusProposal({
    fixture: activeDesign(),
    inspection: workflowState.inspection,
    findings: workflowState.findings,
    existingProposal: workflowState.proposedChange,
    findingId: input.findingId,
    proposedRadiusMm: input.proposedRadiusMm,
  })
  abortIfRequested(signal)

  const generatedAt = new Date().toISOString()
  workflowState.proposedChange = { ...proposal, generatedAt }
  workflowState.decisionStatus = 'pending'
  workflowState.decisionRecord = null
  selectFinding(proposal.findingId)
  requestToolAvailabilityRefresh()

  return {
    ok: true,
    proposalId: proposal.proposalId,
    revisionPrecondition: proposal.revisionPrecondition,
    featureId: proposal.featureId,
    before: proposal.before,
    after: proposal.after,
    expectedRuleResolution: proposal.expectedRuleResolution,
    expectedCostEffect: proposal.expectedCostEffect,
    approvalRequired: true,
    approvalMode: proposal.approvalMode,
    status: 'pending_human_decision',
  }
}

async function prepareSupplierQuotes(input, { signal } = {}) {
  abortIfRequested(signal)
  const keys = Object.keys(input ?? {})
  if (keys.length !== 1 || keys[0] !== 'quantity' || !Number.isInteger(input.quantity)) {
    throw new WorkflowRuleError('INVALID_INPUT', 'integer quantity is required.')
  }
  const simulation = workflowState.simulationEvidence
  if (!simulation || simulation.lifecycleState !== 'COMPLETE' || !simulation.result) {
    throw new WorkflowRuleError('SIMULATION_REQUIRED', 'complete the bounded simulation workflow first.')
  }
  if (simulation.snapshotKey !== activeSnapshotKey() || simulation.currentness !== 'CURRENT') {
    throw new WorkflowRuleError('STALE_SIMULATION', 'the simulation evidence does not match the active design snapshot.', true)
  }

  const comparison = prepareQuoteComparison({
    fixture: activeDesign(),
    proposal: workflowState.proposedChange,
    decisionRecord: workflowState.decisionRecord,
    quantity: input.quantity,
  })
  abortIfRequested(signal)

  const generatedAt = new Date().toISOString()
  workflowState.supplierRequests = [{
    requestId: `request-${comparison.configurationHash}`,
    configurationHash: comparison.configurationHash,
    quantity: comparison.quantity,
    simulationStudyHash: simulation.studyHash,
    simulationResultHash: simulation.result.resultHash,
    generatedAt,
  }]
  workflowState.supplierQuotes = comparison.quotes.map((quote) => ({ ...quote, generatedAt }))
  workflowState.errorState = null
  emitStateChange()
  requestToolAvailabilityRefresh()
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('buildready:navigate', { detail: { route: '/suppliers' } }))
  }, 0)

  return {
    ok: true,
    configurationHash: comparison.configurationHash,
    configurationStatus: comparison.configurationStatus,
    revisionPrecondition: comparison.revisionPrecondition,
    quantity: comparison.quantity,
    fixtureScope: comparison.fixtureScope,
    quotes: comparison.quotes.map((quote) => ({
      quoteId: quote.quoteId,
      supplierName: quote.supplierName,
      unitPrice: quote.unitPrice,
      toolingCost: quote.toolingCost,
      totalPrice: quote.totalPrice,
      currency: quote.currency,
      leadTimeDays: quote.leadTimeDays,
      factors: quote.factors,
      assumptionCount: quote.assumptions.length,
      dfmNoteCount: quote.dfmNotes.length,
    })),
    nextAction: 'Compare the full assumptions and DFM notes now visible on the Suppliers page.',
  }
}

async function generateReviewPackage(input, { signal } = {}) {
  abortIfRequested(signal)
  const keys = Object.keys(input ?? {})
  if (keys.some((key) => key !== 'title')) {
    throw new WorkflowRuleError('INVALID_INPUT', 'only an optional title is supported.')
  }

  const reviewPackage = createReviewPackage({
    fixture: activeDesign(),
    source: activeDesignSource(),
    snapshotKey: activeSnapshotKey(),
    inspection: workflowState.inspection,
    findings: workflowState.findings,
    proposal: workflowState.proposedChange,
    decisionRecord: workflowState.decisionRecord,
    supplierRequests: workflowState.supplierRequests,
    supplierQuotes: workflowState.supplierQuotes,
    simulationEvidence: workflowState.simulationEvidence,
    auditEvents: workflowState.auditEvents,
    title: input?.title,
    generatedAt: new Date().toISOString(),
  })
  abortIfRequested(signal)

  workflowState.reviewPackage = reviewPackage
  workflowState.errorState = null
  emitStateChange()
  requestToolAvailabilityRefresh()
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('buildready:navigate', { detail: { route: '/review' } }))
  }, 0)

  return {
    ok: true,
    packageId: reviewPackage.packageId,
    title: reviewPackage.title,
    revisionPrecondition: reviewPackage.design.revisionPrecondition,
    configurationHash: reviewPackage.supplierComparison.configurationHash,
    findingCount: reviewPackage.inspection.findingCount,
    quoteCount: reviewPackage.supplierComparison.quotes.length,
    simulationStudyId: reviewPackage.simulation.studyId,
    auditEventCount: reviewPackage.auditTrail.length,
    formats: ['json', 'markdown'],
    nextAction: 'Review the visible package and download JSON or Markdown from the Review page.',
  }
}

export function recordHumanDecision(decision) {
  if (activeDesignSource().sourceId === 'onshape-live' && workflowState.sourceFreshness !== 'checked') return false
  if (!['approved', 'rejected'].includes(decision)) return false
  if (!workflowState.proposedChange || workflowState.decisionStatus !== 'pending') return false
  if (workflowState.proposedChange.revisionPrecondition !== revisionPrecondition(activeDesign())) {
    workflowState.proposedChange = { ...workflowState.proposedChange, status: 'stale' }
    workflowState.decisionStatus = 'stale'
    emitStateChange()
    requestToolAvailabilityRefresh()
    return false
  }

  const timestamp = new Date().toISOString()
  const decisionRecord = {
    decisionId: `decision-${workflowState.proposedChange.proposalId}-${decision}`,
    proposalId: workflowState.proposedChange.proposalId,
    decision,
    actor: 'human',
    revisionPrecondition: revisionPrecondition(activeDesign()),
    timestamp,
  }
  workflowState.decisionStatus = decision
  workflowState.decisionRecord = decisionRecord
  workflowState.proposedChange = { ...workflowState.proposedChange, status: decision }
  appendAuditEvent(
    'human',
    `${decision}_radius_preview`,
    'completed',
    `Human ${decision} proposal ${decisionRecord.proposalId}; loaded revision ${activeDesign().revisionId} remains unchanged.`,
  )
  requestToolAvailabilityRefresh()
  return true
}

function clearDerivedState() {
  workflowState.selectedFeatureId = activeDesign().features.find((feature) => feature.selected)?.featureId ?? null
  workflowState.inspectionStatus = 'not_run'
  workflowState.inspection = null
  workflowState.findings = []
  workflowState.selectedFindingId = null
  workflowState.proposedChange = null
  workflowState.decisionStatus = 'not_requested'
  workflowState.decisionRecord = null
  workflowState.supplierRequests = []
  workflowState.supplierQuotes = []
  workflowState.reviewPackage = null
  workflowState.simulationEvidence = null
  workflowState.lastToolCall = null
  workflowState.auditEvents = []
  workflowState.errorState = null
  eventSequence = 0
}

export function resetDemoState() {
  clearDerivedState()
  emitStateChange()
  requestToolAvailabilityRefresh()
}

export function applyReviewedManufacturingDesign(design) {
  if (workflowState.sourceFreshness !== 'checked' || design.sourceSnapshotKey !== activeSnapshotKey()) throw new Error('The source changed during review. Reload and review the current revision.')
  const source = activeDesignSource()
  replaceActiveDesignSnapshot(design, { ...source, provenance: { ...source.provenance,
    applicableRuleCount: design.features.length, manufacturingInputGaps: design.manufacturingInputGaps,
    manufacturingReview: design.manufacturingReview } })
  appendAuditEvent('human', 'review_manufacturing_inputs', 'completed', 'Revision-bound human measurements applied; prior conclusions cleared. Not production approval.')
}

/**
 * Swaps the design the entire workflow measures.
 *
 * Every derived record is discarded first: an inspection, proposal, decision,
 * quote, or package produced against different geometry must never survive a
 * source change. Restoring the controlled fixture uses the same path.
 */
export function replaceActiveDesignSnapshot(design, sourceDescriptor) {
  const previousSnapshot = workflowState.activeDesignSnapshot
  const nextSnapshot = createDesignSnapshot(design, sourceDescriptor)
  workflowState.activeDesignSnapshot = nextSnapshot
  workflowState.pendingDesignSnapshot = null
  workflowState.onshapeLastCheckedAt = sourceDescriptor.provenance?.retrievedAt ?? null
  workflowState.sourceFreshness = sourceDescriptor.sourceId === 'onshape-live' ? 'checked' : 'fixture'
  clearDerivedState()
  appendAuditEvent(
    sourceDescriptor.actor ?? 'human',
    'set_design_source',
    'completed',
    `Active design source is now ${sourceDescriptor.label} (${design.designId}/${design.revisionId}).`,
    { emit: false },
  )
  emitStateChange({
    reason: 'design-source-replaced',
    previousSnapshotKey: previousSnapshot.snapshotKey,
    snapshotKey: nextSnapshot.snapshotKey,
  })
  requestToolAvailabilityRefresh()
  return true
}

export const setActiveDesign = replaceActiveDesignSnapshot

/** Records whether this deployment has a reachable Onshape proxy. */
export function setOnshapeAvailability(available) {
  if (workflowState.onshapeAvailable === available) return
  workflowState.onshapeAvailable = available
  emitStateChange()
  requestToolAvailabilityRefresh()
}

export function restoreControlledFixture() {
  onshapeLoadSequence += 1
  return replaceActiveDesignSnapshot(DESIGN_FIXTURE, CONTROLLED_SOURCE)
}

async function loadOnshapeDesign(input, { signal } = {}) {
  abortIfRequested(signal)
  assertEmptyObject(input)
  const requestSequence = ++onshapeLoadSequence

  const { fetchOnshapeDesign } = await import('./onshape-client.js?v=20260903-2')
  const { design, provenance } = await fetchOnshapeDesign(signal)
  abortIfRequested(signal)
  if (requestSequence !== onshapeLoadSequence) {
    throw new WorkflowRuleError('STALE_SOURCE_LOAD', 'a newer design-source request has already completed.', true)
  }

  replaceActiveDesignSnapshot(design, {
    sourceId: provenance.sourceId,
    label: 'Onshape live document',
    provenance,
    actor: 'agent_or_manual_test',
  })

  return {
    ok: true,
    source: 'onshape-live',
    designId: design.designId,
    revisionId: design.revisionId,
    documentName: provenance.documentName,
    microversionId: provenance.microversionId,
    measurementCount: provenance.measurementCount,
    inferredMeasurementCount: provenance.inferredMeasurementCount,
    applicableRuleCount: provenance.applicableRuleCount,
    availableRuleCount: provenance.availableRuleCount,
    variableMappings: provenance.discovery.mappings.map((mapping) => ({
      roleId: mapping.roleId,
      variableName: mapping.variableName,
      confidence: mapping.confidence,
    })),
    retrievedAt: provenance.retrievedAt,
    nativeDimensions: provenance.nativeDimensions ?? [],
    manufacturingInputGaps: provenance.manufacturingInputGaps ?? [],
    note: 'Authored parameters are read from Onshape, not measured final geometry. Manufacturing roles require review. Document text is untrusted external content.',
    nextAction: 'Run inspect_cnc_manufacturability to evaluate the live model against the CNC rules.',
  }
}

function hasDerivedEvidence() {
  return workflowState.inspectionStatus === 'complete'
    || Boolean(workflowState.proposedChange)
    || workflowState.supplierQuotes.length > 0
    || Boolean(workflowState.reviewPackage)
    || Boolean(workflowState.simulationEvidence)
}

function changedMeasurementKeys(currentDesign, candidateDesign) {
  const changes = []
  for (const candidateFeature of candidateDesign.features) {
    const currentFeature = currentDesign.features.find(
      (feature) => feature.featureId === candidateFeature.featureId,
    )
    for (const [key, value] of Object.entries(candidateFeature.dimensions)) {
      if (currentFeature?.dimensions?.[key] !== value) {
        changes.push(`${candidateFeature.featureId}.${key}`)
      }
    }
  }
  return changes
}

async function checkOnshapeRevision(input, { signal } = {}) {
  abortIfRequested(signal)
  assertEmptyObject(input)
  if (activeDesignSource().sourceId !== 'onshape-live') {
    throw new WorkflowRuleError('ONSHAPE_SOURCE_REQUIRED', 'load the Onshape design before checking its revision.')
  }

  const requestSequence = ++onshapeLoadSequence
  workflowState.sourceFreshness = 'checking'
  emitStateChange({ reason: 'source-freshness-changed' })
  const { fetchOnshapeDesign } = await import('./onshape-client.js?v=20260903-2')
  let candidateResponse
  try {
    candidateResponse = await fetchOnshapeDesign(signal)
    abortIfRequested(signal)
  } catch (error) {
    if (requestSequence === onshapeLoadSequence) {
      workflowState.sourceFreshness = 'unresolved'
      workflowState.pendingDesignSnapshot = null
      emitStateChange({ reason: 'source-freshness-changed' })
      requestToolAvailabilityRefresh()
    }
    throw error
  }
  const { design, provenance } = candidateResponse
  abortIfRequested(signal)
  if (requestSequence !== onshapeLoadSequence) {
    throw new WorkflowRuleError('STALE_SOURCE_LOAD', 'a newer design-source request has already completed.', true)
  }

  workflowState.onshapeLastCheckedAt = provenance.retrievedAt
  const changed = revisionPrecondition(design) !== activeSnapshotKey()
  workflowState.sourceFreshness = changed ? 'changed' : 'checked'
  if (changed && workflowState.proposedChange) {
    workflowState.proposedChange = { ...workflowState.proposedChange, status: 'stale' }
    workflowState.decisionStatus = 'stale'
  }
  const measurementChanges = changed ? changedMeasurementKeys(activeDesign(), design) : []
  workflowState.pendingDesignSnapshot = changed
    ? createDesignSnapshot(design, {
      sourceId: provenance.sourceId,
      label: 'Onshape live document',
      provenance,
      actor: 'agent_or_manual_test',
    })
    : null
  emitStateChange({
    reason: 'onshape-revision-checked',
    snapshotKey: activeSnapshotKey(),
    candidateSnapshotKey: workflowState.pendingDesignSnapshot?.snapshotKey ?? null,
  })
  requestToolAvailabilityRefresh()

  return {
    ok: true,
    changed,
    currentRevisionId: activeDesign().revisionId,
    currentMicroversionId: activeDesignSource().provenance?.microversionId,
    candidateRevisionId: changed ? design.revisionId : null,
    candidateMicroversionId: changed ? provenance.microversionId : null,
    changedMeasurements: measurementChanges,
    checkedAt: provenance.retrievedAt,
    derivedEvidenceExists: hasDerivedEvidence(),
    nextAction: changed
      ? 'Activate the candidate revision to invalidate old evidence and continue with current geometry.'
      : 'The active snapshot matched at this check. Engineering applicability still requires separate review.',
  }
}

async function activateOnshapeRevision(input, { signal } = {}) {
  abortIfRequested(signal)
  const keys = Object.keys(input ?? {}).sort()
  if (keys.join('|') !== 'candidateRevisionId|discardDerivedEvidence|expectedCurrentRevisionId'
    || typeof input.expectedCurrentRevisionId !== 'string'
    || typeof input.candidateRevisionId !== 'string'
    || typeof input.discardDerivedEvidence !== 'boolean') {
    throw new WorkflowRuleError(
      'INVALID_INPUT',
      'expectedCurrentRevisionId, candidateRevisionId, and discardDerivedEvidence are required.',
    )
  }
  if (input.expectedCurrentRevisionId !== activeDesign().revisionId) {
    throw new WorkflowRuleError('STALE_REVISION', 'the active Onshape revision changed; check again.', true)
  }
  const candidate = workflowState.pendingDesignSnapshot
  if (!candidate || candidate.design.revisionId !== input.candidateRevisionId) {
    throw new WorkflowRuleError('ONSHAPE_UPDATE_REQUIRED', 'check Onshape and select the current candidate revision.', true)
  }
  const discardedDerivedEvidence = hasDerivedEvidence()
  if (discardedDerivedEvidence && !input.discardDerivedEvidence) {
    throw new WorkflowRuleError(
      'DERIVED_EVIDENCE_EXISTS',
      'activating this revision requires explicit permission to discard derived evidence.',
    )
  }

  const previousRevisionId = activeDesign().revisionId
  replaceActiveDesignSnapshot(candidate.design, candidate.source)
  abortIfRequested(signal)
  return {
    ok: true,
    previousRevisionId,
    revisionId: activeDesign().revisionId,
    snapshotKey: activeSnapshotKey(),
    discardedDerivedEvidence,
    nextAction: 'Run inspect_cnc_manufacturability against the activated Onshape revision.',
  }
}

export function assertActiveSourceUsable() {
  if (activeDesignSource().sourceId === 'onshape-live' && workflowState.sourceFreshness !== 'checked') {
    throw new WorkflowRuleError('ONSHAPE_REFRESH_REQUIRED', 'Check and activate the current Onshape revision before creating new evidence.')
  }
}

function audited(toolName, summary, handler) {
  return async (input, options = {}) => {
    try {
      if (['inspect_cnc_manufacturability', 'get_issue_details', 'preview_radius_change', 'prepare_quote_comparison', 'generate_review_package'].includes(toolName)) {
        assertActiveSourceUsable()
      }
      const result = await handler(input, options)
      recordToolCall(toolName, 'completed', summary)
      return result
    } catch (error) {
      const status = error?.name === 'AbortError' ? 'cancelled' : 'failed'
      const envelope = attachToolErrorContract(error)
      workflowState.errorState = status === 'failed' ? envelope : null
      recordToolCall(toolName, status, envelope.error.message)
      throw error
    }
  }
}

export const gate7Handlers = Object.freeze({
  get_active_design_context: audited(
    'get_active_design_context',
    'Returned the selected design snapshot with its source and freshness.',
    getActiveDesignContext,
  ),
  inspect_cnc_manufacturability: audited(
    'inspect_cnc_manufacturability',
    'Evaluated applicable demonstration CNC rules with coverage and source evidence.',
    inspectCncManufacturability,
  ),
  get_issue_details: audited(
    'get_issue_details',
    'Focused one deterministic finding and displayed its measurements.',
    getIssueDetails,
  ),
  preview_radius_change: audited(
    'preview_radius_change',
    'Prepared a bounded non-destructive radius preview requiring a visible human decision.',
    previewRadiusChange,
  ),
  prepare_quote_comparison: audited(
    'prepare_quote_comparison',
    'Prepared two normalized fictional supplier quotes for the human-reviewed configuration.',
    prepareSupplierQuotes,
  ),
  load_onshape_design: audited(
    'load_onshape_design',
    'Read revision-bound named and native parameter evidence from the connected Onshape Part Studio.',
    loadOnshapeDesign,
  ),
  check_onshape_revision: audited(
    'check_onshape_revision',
    'Checked whether the connected Onshape Part Studio has a newer microversion.',
    checkOnshapeRevision,
  ),
  activate_onshape_revision: audited(
    'activate_onshape_revision',
    'Activated a checked Onshape revision and invalidated evidence from the previous snapshot.',
    activateOnshapeRevision,
  ),
  generate_review_package: audited(
    'generate_review_package',
    'Generated one traceable review package from the complete visible workflow state.',
    generateReviewPackage,
  ),
})
