import { PROPOSAL_POLICY, RULE_SET_VERSION } from './domain.js?v=20260903-2'

export class WorkflowRuleError extends Error {
  constructor(code, message, retryable = false) {
    super(`${code}: ${message}`)
    this.name = 'WorkflowRuleError'
    this.code = code
    this.retryable = retryable
  }
}

export function revisionPrecondition(fixture) {
  if (fixture.sourceSnapshotKey) return fixture.sourceSnapshotKey
  return `${fixture.designId}/${fixture.revisionId}@${fixture.fixtureVersion}`
}

export function validateRadiusProposal({ fixture, inspection, findings, existingProposal, findingId, proposedRadiusMm }) {
  if (!inspection || inspection.revisionPrecondition !== revisionPrecondition(fixture)) {
    throw new WorkflowRuleError('STALE_REVISION', 're-run inspection for the active design revision.', true)
  }
  if (existingProposal?.status === 'pending') {
    throw new WorkflowRuleError('PROPOSAL_ALREADY_PENDING', 'approve or reject the visible proposal first.')
  }
  const finding = findings.find((candidate) => candidate.findingId === findingId)
  if (!finding || finding.ruleId !== PROPOSAL_POLICY.ruleId) {
    throw new WorkflowRuleError('FINDING_NOT_FOUND', 'choose the current internal-corner-radius finding.')
  }
  if (!Number.isFinite(proposedRadiusMm)
    || proposedRadiusMm < PROPOSAL_POLICY.minimumRadiusMm
    || proposedRadiusMm > PROPOSAL_POLICY.maximumRadiusMm) {
    throw new WorkflowRuleError(
      'VALUE_OUT_OF_RANGE',
      `proposedRadiusMm must be between ${PROPOSAL_POLICY.minimumRadiusMm} and ${PROPOSAL_POLICY.maximumRadiusMm} mm.`,
    )
  }

  const feature = fixture.features.find((candidate) => candidate.featureId === PROPOSAL_POLICY.featureId)
  const normalizedRadius = Number(proposedRadiusMm.toFixed(3))
  return Object.freeze({
    proposalId: `proposal-${fixture.designId}-${fixture.revisionId}-radius-${String(normalizedRadius).replace('.', '_')}`,
    policyVersion: PROPOSAL_POLICY.policyVersion,
    designId: fixture.designId,
    baseRevisionId: fixture.revisionId,
    fixtureVersion: fixture.fixtureVersion,
    ruleSetVersion: RULE_SET_VERSION,
    revisionPrecondition: revisionPrecondition(fixture),
    findingId: finding.findingId,
    featureId: feature.featureId,
    status: 'pending',
    before: Object.freeze({ insideRadiusMm: feature.dimensions.insideRadiusMm }),
    after: Object.freeze({ insideRadiusMm: normalizedRadius }),
    affectedFeatures: Object.freeze([feature.featureId]),
    expectedRuleResolution: normalizedRadius >= PROPOSAL_POLICY.minimumRadiusMm,
    expectedCostEffect: 'May reduce specialized tooling or secondary-operation risk; supplier pricing is evaluated later.',
    approvalRequired: true,
    approvalMode: PROPOSAL_POLICY.approvalMode,
    geometryMode: PROPOSAL_POLICY.geometryMode,
  })
}
