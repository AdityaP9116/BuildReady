export const DESIGN_FIXTURE = Object.freeze({
  designId: 'BRKT-001',
  revisionId: 'B',
  fixtureVersion: '1.0.0',
  name: 'CNC Mounting Bracket',
  material: Object.freeze({ id: 'al-6061-t6', label: '6061-T6 aluminum' }),
  process: Object.freeze({ id: 'cnc-mill-3-axis', label: 'Three-axis CNC milling' }),
  quantity: 1000,
  units: 'millimeters',
  features: Object.freeze([
    Object.freeze({
      featureId: 'inside-pocket-corner',
      featureType: 'internal_corner',
      label: 'Inside pocket corner',
    }),
  ]),
})

export const workflowState = {
  activeRoute: '/design',
  selectedFeatureId: DESIGN_FIXTURE.features[0].featureId,
  inspectionStatus: 'not_run',
  registeredToolCount: 0,
  registrationStatus: 'unsupported',
  lastToolCall: null,
  auditEvents: [],
}

let eventSequence = 0

function emitStateChange() {
  window.dispatchEvent(new CustomEvent('buildready:statechange'))
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
    eventId: `gate2-${String(eventSequence).padStart(3, '0')}`,
    actor: 'agent_or_manual_test',
    toolName,
    status,
    summary,
    timestamp: new Date().toISOString(),
  }

  workflowState.lastToolCall = event
  workflowState.auditEvents = [...workflowState.auditEvents.slice(-4), event]
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
    unsavedPreview: false,
    inspectionStatus: workflowState.inspectionStatus,
    ruleSetVersion: 'cnc-demo-0.1.0',
  }
}

async function getActiveDesignContext(input, { signal } = {}) {
  abortIfRequested(signal)
  assertEmptyObject(input)

  return {
    ok: true,
    context: activeDesignContext(),
    nextAction: 'Run inspect_cnc_manufacturability to begin the controlled inspection.',
  }
}

async function inspectCncStub(input, { signal } = {}) {
  abortIfRequested(signal)

  const allowedSeverities = ['all', 'high', 'medium']
  const unknownKeys = Object.keys(input ?? {}).filter((key) => key !== 'severity')
  const severity = input?.severity ?? 'all'

  if (unknownKeys.length > 0 || !allowedSeverities.includes(severity)) {
    throw new TypeError('INVALID_INPUT: severity must be all, high, or medium.')
  }

  await Promise.resolve()
  abortIfRequested(signal)
  workflowState.inspectionStatus = 'stub_complete'

  return {
    ok: true,
    status: 'stub_complete',
    designId: DESIGN_FIXTURE.designId,
    revisionId: DESIGN_FIXTURE.revisionId,
    fixtureVersion: DESIGN_FIXTURE.fixtureVersion,
    requestedSeverity: severity,
    findingCount: 0,
    message: 'Gate 2 registration proof succeeded. The deterministic five-rule evaluator arrives in Gate 3.',
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
      recordToolCall(toolName, status, error?.message ?? 'Tool execution failed.')
      throw error
    }
  }
}

export const gate2Handlers = Object.freeze({
  get_active_design_context: audited(
    'get_active_design_context',
    'Returned the active BRKT-001 revision B context.',
    getActiveDesignContext,
  ),
  inspect_cnc_manufacturability: audited(
    'inspect_cnc_manufacturability',
    'Completed the temporary Gate 2 inspection stub.',
    inspectCncStub,
  ),
})
