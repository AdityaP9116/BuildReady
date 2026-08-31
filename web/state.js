import { DESIGN_FIXTURE, RULE_SET_SCOPE, RULE_SET_VERSION } from './domain.js'
import { compactInspectionResult, evaluateCncManufacturability } from './cnc-rules.js'
import { revisionPrecondition, validateRadiusProposal } from './workflow-rules.js'
import { prepareQuoteComparison } from './quote-engine.js'
import { createReviewPackage } from './review-package.js'

export { DESIGN_FIXTURE }

export const workflowState = {
  activeRoute: '/design',
  designContext: DESIGN_FIXTURE,
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
  reviewPackage: null,
  registeredToolCount: 0,
  registrationStatus: 'unsupported',
  lastToolCall: null,
  auditEvents: [],
  errorState: null,
}

let eventSequence = 0

function emitStateChange() {
  window.dispatchEvent(new CustomEvent('buildready:statechange'))
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

export function appendAuditEvent(actor, actionName, status, summary) {
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
  emitStateChange()
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
    throw new TypeError('INVALID_INPUT: expected an empty object.')
  }
}

function selectedFeature() {
  return DESIGN_FIXTURE.features.find(
    (feature) => feature.featureId === workflowState.selectedFeatureId,
  )
}

export function selectFeature(featureId) {
  const feature = DESIGN_FIXTURE.features.find((candidate) => candidate.featureId === featureId)
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
  return {
    designId: DESIGN_FIXTURE.designId,
    revisionId: DESIGN_FIXTURE.revisionId,
    fixtureVersion: DESIGN_FIXTURE.fixtureVersion,
    name: DESIGN_FIXTURE.name,
    material: DESIGN_FIXTURE.material,
    process: DESIGN_FIXTURE.process,
    quantity: DESIGN_FIXTURE.quantity,
    units: DESIGN_FIXTURE.units,
    selectedFeature: selectedFeature(),
    featureCount: DESIGN_FIXTURE.features.length,
    unsavedPreview: false,
    inspectionStatus: workflowState.inspectionStatus,
    ruleSetVersion: RULE_SET_VERSION,
    ruleSetScope: RULE_SET_SCOPE,
  }
}

async function getActiveDesignContext(input, { signal } = {}) {
  abortIfRequested(signal)
  assertEmptyObject(input)

  return {
    ok: true,
    context: activeDesignContext(),
    nextAction: 'Run inspect_cnc_manufacturability to evaluate the five controlled CNC rules.',
  }
}

async function inspectCncManufacturability(input, { signal } = {}) {
  abortIfRequested(signal)

  const allowedSeverities = ['all', 'high', 'medium']
  const unknownKeys = Object.keys(input ?? {}).filter((key) => key !== 'severity')
  const severity = input?.severity ?? 'all'

  if (unknownKeys.length > 0 || !allowedSeverities.includes(severity)) {
    throw new TypeError('INVALID_INPUT: severity must be all, high, or medium.')
  }

  const inspection = evaluateCncManufacturability(DESIGN_FIXTURE, { severity })
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
    throw new TypeError('INVALID_INPUT: findingId must identify one current finding.')
  }
  if (workflowState.inspectionStatus !== 'complete' || !workflowState.inspection) {
    throw new Error('INSPECTION_REQUIRED: run inspect_cnc_manufacturability first.')
  }
  if (workflowState.inspection.revisionPrecondition !== revisionPrecondition(DESIGN_FIXTURE)) {
    throw new Error('STALE_INSPECTION: re-run inspection for the active revision.')
  }

  const finding = workflowState.findings.find((candidate) => candidate.findingId === input.findingId)
  if (!finding) {
    throw new Error('FINDING_NOT_FOUND: choose a finding from the current inspection.')
  }
  const feature = DESIGN_FIXTURE.features.find((candidate) => candidate.featureId === finding.featureId)
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
    throw new TypeError('INVALID_INPUT: findingId and numeric proposedRadiusMm are required.')
  }

  const proposal = validateRadiusProposal({
    fixture: DESIGN_FIXTURE,
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
    throw new TypeError('INVALID_INPUT: integer quantity is required.')
  }

  const comparison = prepareQuoteComparison({
    fixture: DESIGN_FIXTURE,
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
    throw new TypeError('INVALID_INPUT: only an optional title is supported.')
  }

  const reviewPackage = createReviewPackage({
    fixture: DESIGN_FIXTURE,
    inspection: workflowState.inspection,
    findings: workflowState.findings,
    proposal: workflowState.proposedChange,
    decisionRecord: workflowState.decisionRecord,
    supplierRequests: workflowState.supplierRequests,
    supplierQuotes: workflowState.supplierQuotes,
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
    auditEventCount: reviewPackage.auditTrail.length,
    formats: ['json', 'markdown'],
    nextAction: 'Review the visible package and download JSON or Markdown from the Review page.',
  }
}

export function recordHumanDecision(decision) {
  if (!['approved', 'rejected'].includes(decision)) return false
  if (!workflowState.proposedChange || workflowState.decisionStatus !== 'pending') return false
  if (workflowState.proposedChange.revisionPrecondition !== revisionPrecondition(DESIGN_FIXTURE)) {
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
    revisionPrecondition: revisionPrecondition(DESIGN_FIXTURE),
    timestamp,
  }
  workflowState.decisionStatus = decision
  workflowState.decisionRecord = decisionRecord
  workflowState.proposedChange = { ...workflowState.proposedChange, status: decision }
  appendAuditEvent(
    'human',
    `${decision}_radius_preview`,
    'completed',
    `Human ${decision} proposal ${decisionRecord.proposalId}; revision B remains unchanged.`,
  )
  requestToolAvailabilityRefresh()
  return true
}

export function resetDemoState() {
  workflowState.selectedFeatureId = DESIGN_FIXTURE.features.find((feature) => feature.selected)?.featureId ?? null
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
  workflowState.lastToolCall = null
  workflowState.auditEvents = []
  workflowState.errorState = null
  eventSequence = 0
  emitStateChange()
  requestToolAvailabilityRefresh()
}

function audited(toolName, summary, handler) {
  return async (input, options = {}) => {
    try {
      const result = await handler(input, options)
      recordToolCall(toolName, 'completed', summary)
      return result
    } catch (error) {
      const status = error?.name === 'AbortError' ? 'cancelled' : 'failed'
      workflowState.errorState = status === 'failed' ? error?.message ?? 'Tool execution failed.' : null
      recordToolCall(toolName, status, error?.message ?? 'Tool execution failed.')
      throw error
    }
  }
}

export const gate7Handlers = Object.freeze({
  get_active_design_context: audited(
    'get_active_design_context',
    'Returned BRKT-001 revision B with five stable feature records.',
    getActiveDesignContext,
  ),
  inspect_cnc_manufacturability: audited(
    'inspect_cnc_manufacturability',
    'Evaluated five deterministic CNC rules and attached evidence references.',
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
  generate_review_package: audited(
    'generate_review_package',
    'Generated one traceable review package from the complete visible workflow state.',
    generateReviewPackage,
  ),
})
