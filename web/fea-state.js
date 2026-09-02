import {
  activeDesignSource,
  activeSnapshotKey,
  appendAuditEvent,
  recordToolCall,
  setSimulationEvidence,
} from './state.js'
import { FEA_DOMAIN } from './fea-domain.js'
import { createStudyManifest } from './fea-validation.js'
import {
  approveFeaStudy,
  getFeaCapabilities,
  getFeaResults,
  getFeaStatus,
  getFeaStudy,
  postActiveFeaSnapshot,
  postFeaStudy,
} from './fea-client.js'

export const feaState = {
  capabilities: null,
  study: null,
  result: null,
  lastError: null,
  initialized: false,
  trackedSnapshotKey: activeSnapshotKey(),
}

let capabilitiesPromise = null

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
    currentness: study.currentness,
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
    currentness: study.currentness,
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
  await initializeFea(signal)
  const allowed = ['forceN', 'direction', 'meshPreset', 'minimumSafetyFactor', 'maximumDisplacementMm']
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.includes(key))
    || allowed.some((key) => !(key in input))) {
    throw new Error(`FEA_INVALID_INPUT: expected exactly ${allowed.join(', ')}.`)
  }
  if (feaState.capabilities.provider === 'disabled') {
    throw new Error('FEA_PROVIDER_DISABLED: the FEA provider is disabled.')
  }
  const manifest = await createStudyManifest({
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
  const response = await postFeaStudy(manifest, signal)
  feaState.study = response.study
  feaState.result = response.study.result
  feaState.lastError = null
  publishSimulationEvidence()
  recordToolCall('prepare_static_stress_study', 'completed', `Prepared ${response.study.studyId} for ${response.study.snapshotKey}.`)
  emitFeaChange('study-prepared')
  return compactStudy(response.study)
}

export async function readStaticStressStudy(input, { signal } = {}) {
  emptyObject(input)
  if (!feaState.study) throw new Error('FEA_STUDY_REQUIRED: prepare a static stress study first.')
  const response = await getFeaStudy(feaState.study.studyId, signal)
  feaState.study = response.study
  feaState.result = response.study.result
  publishSimulationEvidence()
  recordToolCall('get_static_stress_study', 'completed', `Read ${response.study.studyId}.`)
  emitFeaChange('study-read')
  return compactStudy(response.study)
}

export async function approveAndSubmitHuman({ cadSharingAcknowledged, computeAcknowledged }, { signal } = {}) {
  if (!feaState.study) throw new Error('FEA_STUDY_REQUIRED: prepare a static stress study first.')
  const response = await approveFeaStudy(feaState.study.studyId, {
    expectedSnapshotKey: feaState.study.snapshotKey,
    studyHash: feaState.study.studyHash,
    cadSharingAcknowledged,
    computeAcknowledged,
  }, signal)
  feaState.study = response.study
  publishSimulationEvidence()
  appendAuditEvent('human', 'approve_and_submit_static_stress_study', 'completed', `Human approved ${response.study.studyId}; provider ${feaState.capabilities.provider}.`)
  emitFeaChange('study-approved')
  return compactStudy(response.study)
}

export async function readSimulationStatus(input, { signal } = {}) {
  emptyObject(input)
  if (!feaState.study?.approval) throw new Error('FEA_APPROVAL_REQUIRED: the visible human approval is required first.')
  const response = await getFeaStatus(feaState.study.studyId, signal)
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
  const response = await getFeaResults(feaState.study.studyId, signal)
  feaState.result = response.result
  publishSimulationEvidence()
  recordToolCall('get_simulation_results', 'completed', `Read result ${response.result.runId}.`)
  emitFeaChange('results-loaded')
  return {
    ok: true,
    runId: response.result.runId,
    provider: response.result.solver.provider,
    live: response.result.solver.live,
    verificationStatus: response.result.verification.status,
    assessment: response.result.assessment,
    metrics: response.result.metrics,
    nextAction: response.result.solver.live
      ? 'Compare the verified result with the approved requirements.'
      : 'Recorded mode is workflow evidence only; do not make an engineering disposition.',
  }
}

export async function compareSimulationToRequirements(input) {
  emptyObject(input)
  if (!feaState.result) throw new Error('FEA_RESULT_REQUIRED: load a completed result first.')
  const result = feaState.result
  const usable = result.solver.live === true && result.verification.status === 'verified-live'
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
  feaState.study = null
  feaState.result = null
  feaState.lastError = null
  feaState.trackedSnapshotKey = activeSnapshotKey()
  publishSimulationEvidence()
  emitFeaChange('reset')
}

window.addEventListener('buildready:statechange', () => {
  const snapshotKey = activeSnapshotKey()
  if (snapshotKey === feaState.trackedSnapshotKey) return
  feaState.trackedSnapshotKey = snapshotKey
  if (feaState.study && feaState.study.snapshotKey !== snapshotKey && feaState.study.currentness !== 'STALE') {
    feaState.study = { ...feaState.study, currentness: 'STALE' }
    if (feaState.result) feaState.result = { ...feaState.result, currentness: 'stale' }
    publishSimulationEvidence()
    emitFeaChange('active-snapshot-changed')
  }
  void postActiveFeaSnapshot(snapshotKey).catch((error) => {
    feaState.lastError = error
    emitFeaChange('snapshot-invalidation-failed')
  })
})

export function currentFeaSourceMode() {
  return activeDesignSource().sourceId === 'onshape-live' ? 'onshape-live' : 'controlled-fixture'
}
