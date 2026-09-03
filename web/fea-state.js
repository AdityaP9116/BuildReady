import {
  activeDesignSource,
  activeSnapshotKey,
  assertActiveSourceUsable,
  appendAuditEvent,
  recordToolCall,
  setSimulationEvidence,
  workflowState,
} from './state.js?v=20260903-3'
import { FEA_DOMAIN } from './fea-domain.js?v=20260903-3'
import { validateStaticStressStudy } from './fea-validation.js?v=20260903-3'
import {
  approveFeaStudy,
  getFeaCapabilities,
  getFeaResults,
  getFeaStatus,
  getFeaStudy,
  postActiveFeaSnapshot,
  prepareFeaStudy,
} from './fea-client.js?v=20260903-3'

export const feaState = {
  capabilities: null,
  study: null,
  result: null,
  lastError: null,
  initialized: false,
  trackedSnapshotKey: activeSnapshotKey(),
  trackedFreshness: workflowState.sourceFreshness,
  applicability: null,
}

let capabilitiesPromise = null
let requestGeneration = 0

function beginRequest() {
  const generation = ++requestGeneration
  const snapshotKey = activeSnapshotKey()
  return (signal) => {
    if (signal?.aborted || generation !== requestGeneration || snapshotKey !== activeSnapshotKey()) {
      throw new Error('FEA_STALE_RESPONSE: the source or request changed; this response was not activated.')
    }
  }
}

function effectiveCurrentness(study) {
  if (study.snapshotKey !== activeSnapshotKey()) return 'STALE'
  if (activeDesignSource().sourceId === 'onshape-live' && workflowState.sourceFreshness !== 'checked') return 'UNRESOLVED'
  return study.currentness
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function publishSimulationEvidence() {
  const study = feaState.study
  if (!study) {
    setSimulationEvidence(null)
    return
  }
  const result = feaState.result
  setSimulationEvidence(Object.freeze({
    schemaVersion: 'workflow-fea-evidence-1.0.0',
    studyId: study.studyId,
    studyHash: study.studyHash,
    snapshotKey: study.snapshotKey,
    lifecycleState: study.lifecycleState,
    currentness: effectiveCurrentness(study),
    provider: feaState.capabilities?.provider ?? 'unknown',
    live: feaState.capabilities?.live === true,
    approvedAt: study.approvedAt,
    manifest: clone(study.manifest),
    result: clone(result),
  }))
}

function emitFeaChange(reason) {
  window.dispatchEvent(new CustomEvent('buildready:feachange', { detail: { reason } }))
  window.dispatchEvent(new CustomEvent('buildready:toolavailabilitychange'))
}

function emptyObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0) {
    throw new Error('FEA_INVALID_INPUT: expected an empty object.')
  }
}

function compactStudy(study) {
  return {
    ok: true,
    studyId: study.studyId,
    studyHash: study.studyHash,
    snapshotKey: study.snapshotKey,
    lifecycleState: study.lifecycleState,
    currentness: effectiveCurrentness(study),
    manifest: clone(study.manifest),
    provider: feaState.capabilities?.provider ?? 'unknown',
    approvalRequired: !study.approval,
    nextAction: study.approval
      ? 'Check simulation status.'
      : 'Review the visible setup and use the human-only approval control.',
  }
}

export async function initializeFea(signal) {
  capabilitiesPromise ??= getFeaCapabilities(signal)
    .then((capabilities) => {
      feaState.capabilities = capabilities
      feaState.initialized = true
      feaState.lastError = null
      emitFeaChange('capabilities-loaded')
      return capabilities
    })
    .catch((error) => {
      capabilitiesPromise = null
      feaState.initialized = true
      feaState.lastError = error
      emitFeaChange('capabilities-failed')
      throw error
    })
  return capabilitiesPromise
}

export async function prepareStaticStressStudy(input, { signal } = {}) {
  assertActiveSourceUsable()
  if (activeDesignSource().sourceId === 'onshape-live') {
    throw new Error('FEA_LIVE_SETUP_REQUIRED: a frozen CAD export, reviewed material and resolved geometry selections are required. Demo study defaults cannot be applied to a live Part Studio.')
  }
  const accept = beginRequest()
  await initializeFea(signal)
  accept(signal)
  const allowed = ['forceN', 'direction', 'meshPreset', 'minimumSafetyFactor', 'maximumDisplacementMm']
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.includes(key))
    || allowed.some((key) => !(key in input))) {
    throw new Error(`FEA_INVALID_INPUT: expected exactly ${allowed.join(', ')}.`)
  }
  if (feaState.capabilities.provider === 'disabled') {
    throw new Error('FEA_PROVIDER_DISABLED: the FEA provider is disabled.')
  }
  const manifest = validateStaticStressStudy({
    snapshotKey: activeSnapshotKey(),
    materialKey: 'al-6061-t6-demo',
    load: { type: 'force', magnitude: input.forceN, unit: 'N', direction: input.direction },
    selections: { ...FEA_DOMAIN.selectionContract },
    meshPreset: input.meshPreset,
    requirements: {
      minimumSafetyFactor: input.minimumSafetyFactor,
      maximumDisplacementMm: input.maximumDisplacementMm,
    },
  }, FEA_DOMAIN, activeSnapshotKey())
  const response = await prepareFeaStudy(manifest, signal)
  accept(signal)
  feaState.study = response.study
  feaState.result = response.study.result
  feaState.applicability = null
  feaState.lastError = null
  publishSimulationEvidence()
  recordToolCall('prepare_static_stress_study', 'completed', `Prepared ${response.study.studyId} for ${response.study.snapshotKey}.`)
  emitFeaChange('study-prepared')
  return compactStudy(response.study)
}

export async function readStaticStressStudy(input, { signal } = {}) {
  emptyObject(input)
  if (!feaState.study) throw new Error('FEA_STUDY_REQUIRED: prepare a static stress study first.')
  const accept = beginRequest()
  const response = await getFeaStudy(feaState.study.studyId, signal)
  accept(signal)
  feaState.study = response.study
  feaState.result = response.study.result
  publishSimulationEvidence()
  recordToolCall('get_static_stress_study', 'completed', `Read ${response.study.studyId}.`)
  emitFeaChange('study-read')
  return compactStudy(response.study)
}

export async function approveAndSubmitHuman({ cadSharingAcknowledged, computeAcknowledged }, { signal } = {}) {
  assertActiveSourceUsable()
  if (!feaState.study) throw new Error('FEA_STUDY_REQUIRED: prepare a static stress study first.')
  if (effectiveCurrentness(feaState.study) !== 'CURRENT') throw new Error('FEA_STALE_APPROVAL: prepare a current study before approval.')
  const accept = beginRequest()
  const response = await approveFeaStudy(feaState.study.studyId, {
    expectedSnapshotKey: feaState.study.snapshotKey,
    studyHash: feaState.study.studyHash,
    cadSharingAcknowledged,
    computeAcknowledged,
  }, signal)
  accept(signal)
  feaState.study = response.study
  publishSimulationEvidence()
  appendAuditEvent('human', 'approve_and_submit_static_stress_study', 'completed', `Human approved ${response.study.studyId}; provider ${feaState.capabilities.provider}.`)
  emitFeaChange('study-approved')
  return compactStudy(response.study)
}

export async function readSimulationStatus(input, { signal } = {}) {
  emptyObject(input)
  if (!feaState.study?.approval) throw new Error('FEA_APPROVAL_REQUIRED: the visible human approval is required first.')
  const accept = beginRequest()
  const response = await getFeaStatus(feaState.study.studyId, signal)
  accept(signal)
  feaState.study = response.study
  feaState.result = response.study.result
  publishSimulationEvidence()
  recordToolCall('get_simulation_status', 'completed', `${response.study.studyId} is ${response.study.lifecycleState}.`)
  emitFeaChange('status-refreshed')
  return compactStudy(response.study)
}

export async function readSimulationResults(input, { signal } = {}) {
  emptyObject(input)
  if (!feaState.study) throw new Error('FEA_STUDY_REQUIRED: prepare a static stress study first.')
  const accept = beginRequest()
  const response = await getFeaResults(feaState.study.studyId, signal)
  accept(signal)
  feaState.study = response.study
  feaState.result = response.result
  feaState.applicability = response.applicability
  publishSimulationEvidence()
  recordToolCall('get_simulation_results', 'completed', `Read result ${response.result.runId}.`)
  emitFeaChange('results-loaded')
  return {
    ok: true,
    runId: response.result.runId,
    provider: response.result.solver.provider,
    live: response.result.solver.live,
    verificationStatus: response.result.verification.status,
    currentness: effectiveCurrentness(response.study),
    assessment: response.result.assessment,
    metrics: response.result.metrics,
    nextAction: response.result.solver.live
      ? 'Review currentness, numerical verification and applicability before comparing requirements.'
      : 'Recorded mode is workflow evidence only; do not make an engineering disposition.',
  }
}

export async function compareSimulationToRequirements(input) {
  emptyObject(input)
  if (!feaState.result) throw new Error('FEA_RESULT_REQUIRED: load a completed result first.')
  const result = feaState.result
  const usable = feaState.applicability?.usableForEngineeringDisposition === true
    && feaState.applicability.snapshotKey === activeSnapshotKey()
    && effectiveCurrentness(feaState.study) === 'CURRENT'
    && feaState.study.lifecycleState === 'COMPLETE'
    && result.studyId === feaState.study.studyId
    && result.inputs?.studyHash === feaState.study.studyHash
    && result.source?.snapshotKey === activeSnapshotKey()
    && result.solver.live === true && result.verification.status === 'verified-live'
    && Number.isFinite(result.metrics.estimatedFactorOfSafety.value)
    && result.metrics.estimatedFactorOfSafety.value >= 0
    && result.metrics.maximumDisplacement.unit === 'mm'
    && Number.isFinite(result.metrics.maximumDisplacement.value)
    && result.metrics.maximumDisplacement.value >= 0
  const comparison = usable
    ? {
      minimumSafetyFactor: result.metrics.estimatedFactorOfSafety.value >= feaState.study.manifest.requirements.minimumSafetyFactor ? 'pass' : 'fail',
      maximumDisplacement: result.metrics.maximumDisplacement.value <= feaState.study.manifest.requirements.maximumDisplacementMm ? 'pass' : 'fail',
    }
    : { minimumSafetyFactor: 'unknown', maximumDisplacement: 'unknown' }
  recordToolCall('compare_simulation_to_requirements', 'completed', `Compared ${result.runId}; usable=${usable}.`)
  return {
    ok: true,
    runId: result.runId,
    usableForEngineeringDisposition: usable,
    comparison,
    limitations: result.assessment.limitations,
  }
}

export const feaHandlers = Object.freeze({
  prepare_static_stress_study: prepareStaticStressStudy,
  get_static_stress_study: readStaticStressStudy,
  get_simulation_status: readSimulationStatus,
  get_simulation_results: readSimulationResults,
  compare_simulation_to_requirements: compareSimulationToRequirements,
})

export function resetFeaState() {
  requestGeneration += 1
  feaState.study = null
  feaState.result = null
  feaState.applicability = null
  feaState.lastError = null
  feaState.trackedSnapshotKey = activeSnapshotKey()
  feaState.trackedFreshness = workflowState.sourceFreshness
  publishSimulationEvidence()
  emitFeaChange('reset')
}

window.addEventListener('buildready:statechange', () => {
  const snapshotKey = activeSnapshotKey()
  const freshness = workflowState.sourceFreshness
  if (snapshotKey === feaState.trackedSnapshotKey && freshness === feaState.trackedFreshness) return
  const previousSnapshotKey = feaState.trackedSnapshotKey
  requestGeneration += 1
  feaState.trackedSnapshotKey = snapshotKey
  feaState.trackedFreshness = freshness
  feaState.applicability = null
  if (feaState.study && (feaState.study.snapshotKey !== snapshotKey || freshness === 'changed')) {
    feaState.study = { ...feaState.study, currentness: 'STALE' }
  }
  publishSimulationEvidence()
  emitFeaChange('source-applicability-changed')
  const candidateKey = workflowState.pendingDesignSnapshot?.snapshotKey ?? snapshotKey
  if (candidateKey === previousSnapshotKey) return
  void postActiveFeaSnapshot(candidateKey, previousSnapshotKey).catch((error) => {
    feaState.lastError = error
    emitFeaChange('snapshot-invalidation-failed')
  })
})

export function currentFeaSourceMode() {
  return activeDesignSource().sourceId === 'onshape-live' ? 'onshape-live' : 'controlled-fixture'
}
