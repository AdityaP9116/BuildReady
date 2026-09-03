import { CNC_RULES, RULE_SET_VERSION } from './domain.js?v=20260903-3'

export class RuleInputError extends Error {
  constructor(code, message, ruleId = null) {
    super(`${code}: ${message}`)
    this.name = 'RuleInputError'
    this.code = code
    this.ruleId = ruleId
  }
}

function requireMillimeters(fixture) {
  if (fixture?.units !== 'millimeters') {
    throw new RuleInputError('UNSUPPORTED_UNITS', 'CNC screening requires millimeter-normalized measurements.')
  }
}

function requireMeasurement(feature, key, ruleId) {
  const value = feature?.dimensions?.[key]
  if (!Number.isFinite(value)) {
    throw new RuleInputError('MISSING_MEASUREMENT', `${key} must be a finite number.`, ruleId)
  }
  return value
}

function calculate(rule, feature) {
  const specification = rule.calculation

  if (specification.kind === 'minimum') {
    const observed = requireMeasurement(feature, specification.measurementKey, rule.ruleId)
    return {
      violated: observed < specification.threshold,
      observedMeasurements: { [specification.measurementKey]: observed },
      threshold: { operator: 'minimum', value: specification.threshold, unit: specification.unit },
      explanation: `${observed} ${specification.unit} < ${specification.threshold} ${specification.unit}`,
    }
  }

  if (specification.kind === 'maximum_ratio') {
    const numerator = requireMeasurement(feature, specification.numeratorKey, rule.ruleId)
    const denominator = requireMeasurement(feature, specification.denominatorKey, rule.ruleId)
    if (denominator <= 0) {
      throw new RuleInputError('INVALID_MEASUREMENT', `${specification.denominatorKey} must be greater than zero.`, rule.ruleId)
    }
    const ratio = numerator / denominator
    return {
      violated: ratio > specification.threshold,
      observedMeasurements: {
        [specification.numeratorKey]: numerator,
        [specification.denominatorKey]: denominator,
        calculatedRatio: ratio,
      },
      threshold: { operator: 'maximum', value: specification.threshold, unit: specification.unit },
      explanation: `${numerator} / ${denominator} = ${ratio} > ${specification.threshold}`,
    }
  }

  throw new RuleInputError('UNKNOWN_CALCULATION', `unsupported calculation kind ${specification.kind}.`, rule.ruleId)
}

export function evaluateRule(rule, feature, fixture) {
  requireMillimeters(fixture)
  if (!feature) {
    throw new RuleInputError('MISSING_FEATURE', `feature ${rule.featureId} was not found.`, rule.ruleId)
  }

  const result = calculate(rule, feature)
  if (!result.violated) {
    return null
  }

  const isLiveOnshapeEvidence = feature.evidenceReference?.startsWith('onshape://')
  const policyEvidence = rule.evidenceReferences.filter((reference) => (
    !isLiveOnshapeEvidence || !reference.startsWith('fixture://')
  ))
  const evidenceReferences = [...new Set([
    ...(feature.evidenceReferences ?? [feature.evidenceReference ?? policyEvidence[0]]),
    ...policyEvidence,
  ].filter(Boolean))]

  return Object.freeze({
    findingId: `finding-${fixture.designId}-${fixture.revisionId}-${rule.ruleId}`,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    title: rule.title,
    severity: rule.severity,
    featureId: feature.featureId,
    observedMeasurements: Object.freeze(result.observedMeasurements),
    threshold: Object.freeze(result.threshold),
    calculation: result.explanation,
    consequence: feature.inputReviewStatus === 'inferred-unreviewed'
      ? `Inferred measurements (${result.explanation}) exceed this demonstration rule's limits. Material, geometry and manufacturing applicability require human review; this is not a measured tool-access or production conclusion.`
      : rule.consequence,
    recommendation: feature.inputReviewStatus === 'inferred-unreviewed'
      ? `Demonstration guidance, subject to input and applicability review: ${rule.recommendation}`
      : rule.recommendation,
    confidence: 'deterministic',
    inputReviewStatus: feature.inputReviewStatus ?? 'controlled-fixture',
    measurementProvenance: feature.measurementProvenance ?? null,
    evidenceReferences: Object.freeze(evidenceReferences),
    highlightIds: Object.freeze([...feature.highlightIds]),
  })
}

function ruleById(ruleId) {
  const rule = CNC_RULES.find((candidate) => candidate.ruleId === ruleId)
  if (!rule) {
    throw new RuleInputError('MISSING_RULE', `rule ${ruleId} was not found.`, ruleId)
  }
  return rule
}

export function evaluateInternalCornerRadius(feature, fixture) {
  return evaluateRule(ruleById('CNC-R001'), feature, fixture)
}

export function evaluatePocketAspectRatio(feature, fixture) {
  return evaluateRule(ruleById('CNC-R002'), feature, fixture)
}

export function evaluateThinWall(feature, fixture) {
  return evaluateRule(ruleById('CNC-R003'), feature, fixture)
}

export function evaluateHoleDepthRatio(feature, fixture) {
  return evaluateRule(ruleById('CNC-R004'), feature, fixture)
}

export function evaluateExcessiveTolerance(feature, fixture) {
  return evaluateRule(ruleById('CNC-R005'), feature, fixture)
}

const RULE_EVALUATORS = Object.freeze(CNC_RULES.map((rule) => Object.freeze({
  ruleId: rule.ruleId,
  evaluate: (feature, fixture) => evaluateRule(rule, feature, fixture),
})))

export function evaluateCncManufacturability(fixture, { severity = 'all' } = {}) {
  if (!['all', 'high', 'medium'].includes(severity)) {
    throw new RuleInputError('INVALID_INPUT', 'severity must be all, high, or medium.')
  }
  requireMillimeters(fixture)

  const evaluatedRuleIds = []
  const skippedRules = []
  const findings = RULE_EVALUATORS
    .map(({ ruleId, evaluate }) => {
      const rule = ruleById(ruleId)
      const feature = fixture.features.find((candidate) => candidate.featureId === rule.featureId)
      if (!feature) {
        skippedRules.push(Object.freeze({
          ruleId,
          featureId: rule.featureId,
          reason: 'required measurements were not confidently inferred',
        }))
        return null
      }
      evaluatedRuleIds.push(ruleId)
      return evaluate(feature, fixture)
    })
    .filter(Boolean)
    .filter((finding) => severity === 'all' || finding.severity === severity)

  return Object.freeze({
    inspectionId: `inspection-${fixture.designId}-${fixture.revisionId}-${RULE_SET_VERSION}`,
    revisionPrecondition: fixture.sourceSnapshotKey ?? `${fixture.designId}/${fixture.revisionId}@${fixture.fixtureVersion}`,
    ruleSetVersion: RULE_SET_VERSION,
    requestedSeverity: severity,
    coverage: Object.freeze({
      availableRules: RULE_EVALUATORS.length,
      evaluatedRuleIds: Object.freeze(evaluatedRuleIds),
      evaluatedRuleCount: evaluatedRuleIds.length,
      skippedRules: Object.freeze(skippedRules),
    }),
    counts: Object.freeze({
      total: findings.length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
    }),
    findings: Object.freeze(findings),
  })
}

export function compactInspectionResult(inspection, generatedAt) {
  return {
    ok: true,
    inspectionId: inspection.inspectionId,
    revisionPrecondition: inspection.revisionPrecondition,
    ruleSetVersion: inspection.ruleSetVersion,
    generatedAt,
    counts: inspection.counts,
    coverage: inspection.coverage,
    findings: inspection.findings.map((finding) => ({
      findingId: finding.findingId,
      severity: finding.severity,
      featureId: finding.featureId,
      observed: finding.observedMeasurements,
      threshold: {
        operator: finding.threshold.operator,
        value: finding.threshold.value,
      },
      evidenceRef: finding.evidenceReferences[0],
      evidenceReferences: finding.evidenceReferences,
      inputReviewStatus: finding.inputReviewStatus,
      measurementProvenance: finding.measurementProvenance,
    })),
  }
}
