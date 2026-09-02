const STUDY_INPUT_KEYS = Object.freeze([
  'snapshotKey',
  'materialKey',
  'load',
  'selections',
  'meshPreset',
  'requirements',
])

const LOAD_KEYS = Object.freeze(['type', 'magnitude', 'unit', 'direction'])
const SELECTION_KEYS = Object.freeze(['body', 'fixed', 'load', 'monitor'])
const REQUIREMENT_KEYS = Object.freeze(['minimumSafetyFactor', 'maximumDisplacementMm'])

export class FeaValidationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'FeaValidationError'
    this.code = code
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FeaValidationError('FEA_INVALID_INPUT', `${label} must be an object.`)
  }
}

function assertExactKeys(value, allowed, label) {
  assertPlainObject(value, label)
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new FeaValidationError(
      'FEA_INVALID_INPUT',
      `${label} must contain exactly: ${expected.join(', ')}.`,
    )
  }
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FeaValidationError('FEA_INVALID_NUMBER', `${label} must be a finite number.`)
  }
  return value
}

function boundedNumber(value, bounds, label) {
  const number = finiteNumber(value, label)
  if (number < bounds.minimum || number > bounds.maximum) {
    throw new FeaValidationError(
      'FEA_VALUE_OUT_OF_RANGE',
      `${label} must be between ${bounds.minimum} and ${bounds.maximum}.`,
    )
  }
  return number
}

function normalizeDirection(direction) {
  if (!Array.isArray(direction) || direction.length !== 3) {
    throw new FeaValidationError('FEA_INVALID_DIRECTION', 'load.direction must have three components.')
  }
  const components = direction.map((value, index) => finiteNumber(value, `load.direction[${index}]`))
  const magnitude = Math.hypot(...components)
  if (magnitude < 1e-12) {
    throw new FeaValidationError('FEA_INVALID_DIRECTION', 'load.direction cannot be the zero vector.')
  }
  return components.map((value) => Number((value / magnitude).toFixed(12)))
}

function forceInNewtons(load, policy) {
  assertExactKeys(load, LOAD_KEYS, 'load')
  if (load.type !== policy.supportedType) {
    throw new FeaValidationError('FEA_UNSUPPORTED_LOAD', `only ${policy.supportedType} is supported.`)
  }
  if (!policy.supportedUnits.includes(load.unit)) {
    throw new FeaValidationError('FEA_UNSUPPORTED_UNIT', `load.unit must be ${policy.supportedUnits.join(' or ')}.`)
  }
  const magnitude = finiteNumber(load.magnitude, 'load.magnitude')
  const magnitudeN = load.unit === 'kN' ? magnitude * 1000 : magnitude
  if (magnitudeN < policy.minimumN || magnitudeN > policy.maximumN) {
    throw new FeaValidationError(
      'FEA_VALUE_OUT_OF_RANGE',
      `force must be between ${policy.minimumN} and ${policy.maximumN} N.`,
    )
  }
  return magnitudeN
}

function normalizedSelections(selections, contract) {
  assertExactKeys(selections, SELECTION_KEYS, 'selections')
  for (const key of SELECTION_KEYS) {
    if (selections[key] !== contract[key]) {
      throw new FeaValidationError(
        'FEA_INVALID_SELECTION',
        `selections.${key} must be the controlled selection ${contract[key]}.`,
      )
    }
  }
  if (selections.fixed === selections.load) {
    throw new FeaValidationError('FEA_OVERLAPPING_SELECTIONS', 'fixed and load selections must be distinct.')
  }
  return { ...selections }
}

export function validateStaticStressStudy(input, domain, expectedSnapshotKey) {
  assertExactKeys(input, STUDY_INPUT_KEYS, 'study')
  if (typeof input.snapshotKey !== 'string' || input.snapshotKey !== expectedSnapshotKey) {
    throw new FeaValidationError('FEA_STALE_SNAPSHOT', 'study.snapshotKey must match the active design snapshot.')
  }
  const material = domain.materials[input.materialKey]
  if (!material) {
    throw new FeaValidationError('FEA_UNSUPPORTED_MATERIAL', 'materialKey is not in the controlled material set.')
  }
  const mesh = domain.meshPresets[input.meshPreset]
  if (!mesh) {
    throw new FeaValidationError('FEA_UNSUPPORTED_MESH', 'meshPreset must be medium or fine.')
  }
  assertExactKeys(input.requirements, REQUIREMENT_KEYS, 'requirements')

  const magnitudeN = forceInNewtons(input.load, domain.loadPolicy)
  const direction = normalizeDirection(input.load.direction)
  const selections = normalizedSelections(input.selections, domain.selectionContract)
  const requirements = {
    minimumSafetyFactor: boundedNumber(
      input.requirements.minimumSafetyFactor,
      domain.requirementLimits.minimumSafetyFactor,
      'requirements.minimumSafetyFactor',
    ),
    maximumDisplacementMm: boundedNumber(
      input.requirements.maximumDisplacementMm,
      domain.requirementLimits.maximumDisplacementMm,
      'requirements.maximumDisplacementMm',
    ),
  }

  return Object.freeze({
    schemaVersion: 'fea-study-1.0.0',
    snapshotKey: input.snapshotKey,
    analysisType: domain.analysisType,
    templateVersion: domain.template.templateVersion,
    material: Object.freeze({ materialKey: input.materialKey, ...material }),
    load: Object.freeze({
      type: domain.loadPolicy.supportedType,
      enteredMagnitude: input.load.magnitude,
      enteredUnit: input.load.unit,
      magnitudeN,
      direction: Object.freeze(direction),
    }),
    selections: Object.freeze(selections),
    mesh: Object.freeze({ preset: input.meshPreset, ...mesh }),
    requirements: Object.freeze(requirements),
  })
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new FeaValidationError('FEA_INVALID_NUMBER', 'canonical study data cannot contain non-finite numbers.')
  }
  return JSON.stringify(value)
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createStudyManifest(input, domain, expectedSnapshotKey) {
  const normalized = validateStaticStressStudy(input, domain, expectedSnapshotKey)
  return Object.freeze({ ...normalized, studyHash: `sha256-${await sha256Hex(normalized)}` })
}

export function cantileverExpected({ lengthMm, widthMm, heightMm, forceN, elasticModulusNPerMm2 }) {
  for (const [key, value] of Object.entries({ lengthMm, widthMm, heightMm, forceN, elasticModulusNPerMm2 })) {
    if (finiteNumber(value, key) <= 0) {
      throw new FeaValidationError('FEA_VALUE_OUT_OF_RANGE', `${key} must be positive.`)
    }
  }
  return Object.freeze({
    maximumBendingStressMpa: (6 * forceN * lengthMm) / (widthMm * heightMm ** 2),
    tipDisplacementMm: (4 * forceN * lengthMm ** 3) / (elasticModulusNPerMm2 * widthMm * heightMm ** 3),
  })
}

export function percentDifference(actual, reference) {
  finiteNumber(actual, 'actual')
  if (finiteNumber(reference, 'reference') === 0) {
    throw new FeaValidationError('FEA_INVALID_REFERENCE', 'reference cannot be zero.')
  }
  return Math.abs((actual - reference) / reference) * 100
}

export function evaluateVerificationEvidence(evidence, thresholds) {
  assertPlainObject(evidence, 'verification evidence')
  const checks = Object.freeze({
    analyticalStress: evidence.analyticalStressErrorPercent <= thresholds.analyticalStressErrorPercent,
    analyticalDisplacement: evidence.analyticalDisplacementErrorPercent <= thresholds.analyticalDisplacementErrorPercent,
    manualParity: evidence.manualParityErrorPercent <= thresholds.manualParityErrorPercent,
    reactionBalance: evidence.reactionBalanceErrorPercent <= thresholds.reactionBalanceErrorPercent,
    meshDisplacement: evidence.meshDisplacementChangePercent <= thresholds.meshDisplacementChangePercent,
    meshReviewedStress: evidence.meshReviewedStressChangePercent <= thresholds.meshReviewedStressChangePercent,
    requiredSelections: evidence.requiredSelectionsResolved === true,
    criticalReadBack: evidence.criticalReadBackMatches === true,
  })
  return Object.freeze({ verified: Object.values(checks).every(Boolean), checks })
}
