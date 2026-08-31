import { DESIGN_FIXTURE, RULE_SET_SCOPE, RULE_SET_VERSION } from './domain.js'
import { compactInspectionResult, evaluateCncManufacturability } from './cnc-rules.js'

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

export function recordToolCall(toolName, status, summary) {
  eventSequence += 1
  const event = {
    eventId: `audit-${String(eventSequence).padStart(3, '0')}`,
    actor: 'agent_or_manual_test',
    toolName,
    status,
    summary,
    timestamp: new Date().toISOString(),
  }

  workflowState.lastToolCall = event
  workflowState.auditEvents = [...workflowState.auditEvents.slice(-9), event]
  emitStateChange()
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
  workflowState.errorState = null
  emitStateChange()
  requestToolAvailabilityRefresh()

  return compactInspectionResult(inspection, generatedAt)
}

function currentRevisionPrecondition() {
  return `${DESIGN_FIXTURE.designId}/${DESIGN_FIXTURE.revisionId}@${DESIGN_FIXTURE.fixtureVersion}`
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
  if (workflowState.inspection.revisionPrecondition !== currentRevisionPrecondition()) {
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

export const gate4Handlers = Object.freeze({
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
})
