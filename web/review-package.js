import { RULE_SET_SCOPE, RULE_SET_VERSION } from './domain.js'
import { revisionPrecondition, WorkflowRuleError } from './workflow-rules.js'

export const REVIEW_PACKAGE_SCHEMA_VERSION = '1.0.0'
export const REVIEW_DISCLAIMER = 'Controlled demonstration evidence only. This package is not production approval, a commercial quote, or manufacturing guidance.'

export function normalizePackageTitle(value, fixture) {
  if (value === undefined) return `${fixture.designId}-${fixture.revisionId} Manufacturing Review`
  if (typeof value !== 'string') {
    throw new WorkflowRuleError('INVALID_TITLE', 'title must be a string when provided.')
  }
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized || normalized.length > 80) {
    throw new WorkflowRuleError('INVALID_TITLE', 'title must contain 1 to 80 safe characters.')
  }
  return normalized
}

export function validateReviewReadiness({ fixture, inspection, proposal, decisionRecord, supplierRequests, supplierQuotes }) {
  const precondition = revisionPrecondition(fixture)
  if (!inspection) throw new WorkflowRuleError('INSPECTION_REQUIRED', 'run the CNC inspection first.')
  if (inspection.revisionPrecondition !== precondition) {
    throw new WorkflowRuleError('STALE_INSPECTION', 'the inspection does not match the active revision.', true)
  }
  if (!proposal || !decisionRecord || !['approved', 'rejected'].includes(decisionRecord.decision)) {
    throw new WorkflowRuleError('DECISION_REQUIRED', 'record a visible human decision first.')
  }
  if (proposal.revisionPrecondition !== precondition || decisionRecord.revisionPrecondition !== precondition) {
    throw new WorkflowRuleError('STALE_DECISION', 'the proposal decision does not match the active revision.', true)
  }
  if (!supplierRequests?.length || supplierQuotes?.length !== 2) {
    throw new WorkflowRuleError('QUOTES_REQUIRED', 'prepare both controlled supplier quotes first.')
  }
  const configurationHash = supplierRequests[0].configurationHash
  if (!configurationHash || supplierQuotes.some((quote) => quote.configurationHash !== configurationHash)) {
    throw new WorkflowRuleError('STALE_QUOTES', 'supplier quotes do not share the current configuration hash.', true)
  }
  return { precondition, configurationHash }
}

export function createReviewPackage({ fixture, inspection, findings, proposal, decisionRecord, supplierRequests, supplierQuotes, auditEvents, title, generatedAt }) {
  const { precondition, configurationHash } = validateReviewReadiness({
    fixture, inspection, proposal, decisionRecord, supplierRequests, supplierQuotes,
  })
  const normalizedTitle = normalizePackageTitle(title, fixture)
  const evidenceReferences = [...new Set(findings.flatMap((finding) => finding.evidenceReferences))]

  return Object.freeze({
    schemaVersion: REVIEW_PACKAGE_SCHEMA_VERSION,
    packageId: `review-${fixture.designId}-${fixture.revisionId}-${configurationHash}`,
    title: normalizedTitle,
    generatedAt,
    disclaimer: REVIEW_DISCLAIMER,
    versions: Object.freeze({
      designFixture: fixture.fixtureVersion,
      cncRuleSet: RULE_SET_VERSION,
      supplierFixture: '1.0.0',
      reviewPackage: REVIEW_PACKAGE_SCHEMA_VERSION,
    }),
    design: Object.freeze({
      designId: fixture.designId,
      revisionId: fixture.revisionId,
      revisionPrecondition: precondition,
      name: fixture.name,
      material: fixture.material,
      process: fixture.process,
      quantity: supplierRequests[0].quantity,
      units: fixture.units,
    }),
    inspection: Object.freeze({
      inspectionId: inspection.inspectionId,
      generatedAt: inspection.generatedAt,
      ruleSetVersion: RULE_SET_VERSION,
      ruleSetScope: RULE_SET_SCOPE,
      findingCount: findings.length,
      counts: inspection.counts,
      findings: findings.map((finding) => ({ ...finding })),
      evidenceReferences,
    }),
    proposal: Object.freeze({ ...proposal }),
    decision: Object.freeze({ ...decisionRecord }),
    supplierComparison: Object.freeze({
      configurationHash,
      request: Object.freeze({ ...supplierRequests[0] }),
      quotes: supplierQuotes.map((quote) => ({ ...quote })),
    }),
    auditTrail: auditEvents.map((event) => ({ ...event })),
  })
}

function money(value, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export function serializeReviewPackageMarkdown(reviewPackage) {
  const findingRows = reviewPackage.inspection.findings
    .map((finding) => `| ${finding.ruleId} | ${finding.severity} | ${finding.featureId} | ${finding.calculation} |`)
    .join('\n')
  const quoteSections = reviewPackage.supplierComparison.quotes.map((quote) => `
### ${quote.supplierName}

- Total: ${money(quote.totalPrice, quote.currency)} (${money(quote.unitPrice, quote.currency)} each)
- Lead time: ${quote.leadTimeDays} days
- Assumptions: ${quote.assumptions.join('; ')}
- DFM notes: ${quote.dfmNotes.join('; ')}
`).join('\n')
  const auditRows = reviewPackage.auditTrail
    .map((event) => `- ${event.timestamp} — ${event.actor}: ${event.toolName} (${event.status})`)
    .join('\n')

  return `# ${reviewPackage.title}

> ${reviewPackage.disclaimer}

## Design

- Design: ${reviewPackage.design.designId} revision ${reviewPackage.design.revisionId}
- Configuration: ${reviewPackage.supplierComparison.configurationHash}
- Material: ${reviewPackage.design.material.label}
- Process: ${reviewPackage.design.process.label}
- Quantity: ${reviewPackage.design.quantity}

## Inspection findings

| Rule | Severity | Feature | Evidence |
| --- | --- | --- | --- |
${findingRows}

## Human decision

- Proposal: ${reviewPackage.proposal.before.insideRadiusMm} mm → ${reviewPackage.proposal.after.insideRadiusMm} mm
- Decision: ${reviewPackage.decision.decision}
- Actor: ${reviewPackage.decision.actor}
- Timestamp: ${reviewPackage.decision.timestamp}

## Supplier comparison
${quoteSections}
## Audit trail

${auditRows}

## Versions

${Object.entries(reviewPackage.versions).map(([name, version]) => `- ${name}: ${version}`).join('\n')}
`
}
