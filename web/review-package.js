import { RULE_SET_SCOPE, RULE_SET_VERSION } from './domain.js?v=20260903-2'
import { revisionPrecondition, WorkflowRuleError } from './workflow-rules.js?v=20260903-2'

export const REVIEW_PACKAGE_SCHEMA_VERSION = '1.2.0'
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

export function validateReviewReadiness({ fixture, inspection, proposal, decisionRecord, simulationEvidence, supplierRequests, supplierQuotes }) {
  const precondition = revisionPrecondition(fixture)
  if (!inspection) throw new WorkflowRuleError('INSPECTION_REQUIRED', 'run the CNC inspection first.')
  if (inspection.revisionPrecondition !== precondition) {
    throw new WorkflowRuleError('STALE_INSPECTION', 'the inspection does not match the active revision.', true)
  }
  if (fixture.sourceIdentity && (!inspection.coverage || inspection.coverage.skippedRules.length > 0)) {
    throw new WorkflowRuleError('MANUFACTURING_INPUTS_REQUIRED', 'resolve the missing manufacturing inputs before packaging this live design; no findings is not a passed inspection.')
  }
  if (!proposal || !decisionRecord || !['approved', 'rejected'].includes(decisionRecord.decision)) {
    throw new WorkflowRuleError('DECISION_REQUIRED', 'record a visible human decision first.')
  }
  if (proposal.revisionPrecondition !== precondition || decisionRecord.revisionPrecondition !== precondition) {
    throw new WorkflowRuleError('STALE_DECISION', 'the proposal decision does not match the active revision.', true)
  }
  if (!simulationEvidence || simulationEvidence.lifecycleState !== 'COMPLETE' || !simulationEvidence.result) {
    throw new WorkflowRuleError('SIMULATION_REQUIRED', 'complete the bounded simulation workflow first.')
  }
  if (simulationEvidence.snapshotKey !== precondition || simulationEvidence.currentness !== 'CURRENT') {
    throw new WorkflowRuleError('STALE_SIMULATION', 'the simulation evidence does not match the active revision.', true)
  }
  if (!supplierRequests?.length || supplierQuotes?.length !== 2) {
    throw new WorkflowRuleError('QUOTES_REQUIRED', 'prepare both controlled supplier quotes first.')
  }
  const configurationHash = supplierRequests[0].configurationHash
  if (!configurationHash || supplierQuotes.some((quote) => quote.configurationHash !== configurationHash)) {
    throw new WorkflowRuleError('STALE_QUOTES', 'supplier quotes do not share the current configuration hash.', true)
  }
  if (supplierRequests[0].simulationResultHash !== simulationEvidence.result.resultHash) {
    throw new WorkflowRuleError('STALE_QUOTES', 'supplier quotes are not bound to the current simulation result.', true)
  }
  return { precondition, configurationHash }
}

function packageSource(source) {
  if (source.sourceId !== 'onshape-live') {
    return Object.freeze({ sourceId: source.sourceId, label: source.label, provenance: null })
  }
  const provenance = source.provenance
  return Object.freeze({
    sourceId: source.sourceId,
    label: source.label,
    provenance: Object.freeze({
      documentId: provenance.documentId,
      workspaceId: provenance.workspaceId,
      versionId: provenance.versionId ?? null,
      sourceSnapshotKey: provenance.sourceSnapshotKey ?? null,
      elementId: provenance.elementId,
      documentName: provenance.documentName,
      documentHref: provenance.documentHref,
      microversionId: provenance.microversionId,
      retrievedAt: provenance.retrievedAt,
      measurementCount: provenance.measurementCount,
      discovery: provenance.discovery ?? null,
      nativeDimensions: provenance.nativeDimensions ?? [],
      manufacturingInputGaps: provenance.manufacturingInputGaps ?? [],
    }),
  })
}

export function createReviewPackage({ fixture, source, snapshotKey, inspection, findings, proposal, decisionRecord, simulationEvidence, supplierRequests, supplierQuotes, auditEvents, title, generatedAt }) {
  const { precondition, configurationHash } = validateReviewReadiness({
    fixture, inspection, proposal, decisionRecord, simulationEvidence, supplierRequests, supplierQuotes,
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
      designSnapshot: fixture.fixtureVersion,
      cncRuleSet: RULE_SET_VERSION,
      supplierFixture: '1.0.0',
      feaEvidence: simulationEvidence.schemaVersion,
      reviewPackage: REVIEW_PACKAGE_SCHEMA_VERSION,
    }),
    design: Object.freeze({
      designId: fixture.designId,
      revisionId: fixture.revisionId,
      revisionPrecondition: precondition,
      snapshotKey,
      source: packageSource(source),
      name: fixture.name,
      material: fixture.material,
      process: fixture.process,
      quantity: supplierRequests[0].quantity,
      units: fixture.units,
      features: fixture.features.map((feature) => Object.freeze({
        featureId: feature.featureId,
        dimensions: Object.freeze({ ...feature.dimensions }),
        revisionProvenance: feature.revisionProvenance,
        evidenceReference: feature.evidenceReference ?? null,
      })),
    }),
    inspection: Object.freeze({
      inspectionId: inspection.inspectionId,
      generatedAt: inspection.generatedAt,
      ruleSetVersion: RULE_SET_VERSION,
      ruleSetScope: RULE_SET_SCOPE,
      findingCount: findings.length,
      counts: inspection.counts,
      coverage: inspection.coverage ?? null,
      assessmentStatus: inspection.assessmentStatus ?? 'unknown',
      manufacturingApproved: false,
      findings: findings.map((finding) => ({ ...finding })),
      evidenceReferences,
    }),
    proposal: Object.freeze({ ...proposal }),
    decision: Object.freeze({ ...decisionRecord }),
    simulation: Object.freeze({
      evidenceSchemaVersion: simulationEvidence.schemaVersion,
      studyId: simulationEvidence.studyId,
      studyHash: simulationEvidence.studyHash,
      snapshotKey: simulationEvidence.snapshotKey,
      lifecycleState: simulationEvidence.lifecycleState,
      currentness: simulationEvidence.currentness,
      provider: simulationEvidence.provider,
      live: simulationEvidence.live,
      approvedAt: simulationEvidence.approvedAt,
      inputs: Object.freeze({
        templateVersion: simulationEvidence.manifest.templateVersion,
        material: Object.freeze({ ...simulationEvidence.manifest.material }),
        load: Object.freeze({ ...simulationEvidence.manifest.load }),
        selections: Object.freeze({ ...simulationEvidence.manifest.selections }),
        mesh: Object.freeze({ ...simulationEvidence.manifest.mesh }),
        requirements: Object.freeze({ ...simulationEvidence.manifest.requirements }),
      }),
      result: Object.freeze({
        runId: simulationEvidence.result.runId,
        resultHash: simulationEvidence.result.resultHash,
        completedAt: simulationEvidence.result.completedAt,
        solver: Object.freeze({ ...simulationEvidence.result.solver }),
        metrics: Object.freeze({ ...simulationEvidence.result.metrics }),
        verification: Object.freeze({ ...simulationEvidence.result.verification }),
        assessment: Object.freeze({ ...simulationEvidence.result.assessment }),
        artifacts: simulationEvidence.result.artifacts.map((artifact) => Object.freeze({ ...artifact })),
      }),
    }),
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

function markdownText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/([\\`*_[\]{}<>|])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim()
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
  const source = reviewPackage.design.source
  const sourceLines = source.sourceId === 'onshape-live'
    ? `- Source: ${markdownText(source.label)}
- Onshape document: ${markdownText(source.provenance.documentName)}
- Microversion: ${markdownText(source.provenance.microversionId)}
- Retrieved: ${markdownText(source.provenance.retrievedAt)}`
    : `- Source: ${markdownText(source.label)}`
  const simulation = reviewPackage.simulation
  const reviewedStress = simulation.result.metrics.reviewedRegionVonMisesStress
  const displacement = simulation.result.metrics.maximumDisplacement
  const limitations = simulation.result.assessment.limitations.map(markdownText).join('; ')

  return `# ${reviewPackage.title}

> ${reviewPackage.disclaimer}

## Design

- Design: ${reviewPackage.design.designId} revision ${reviewPackage.design.revisionId}
- Snapshot: ${reviewPackage.design.snapshotKey}
${sourceLines}
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

## Simulation evidence

- Study: ${markdownText(simulation.studyId)}
- Study hash: ${markdownText(simulation.studyHash)}
- Result hash: ${markdownText(simulation.result.resultHash)}
- Provider: ${markdownText(simulation.provider)} (${simulation.live ? 'live' : 'recorded'})
- Lifecycle/currentness: ${markdownText(simulation.lifecycleState)} / ${markdownText(simulation.currentness)}
- Reviewed stress: ${reviewedStress.value} ${markdownText(reviewedStress.unit)}
- Maximum displacement: ${displacement.value} ${markdownText(displacement.unit)}
- Outcome: ${markdownText(simulation.result.assessment.outcome)}
- Verification: ${markdownText(simulation.result.verification.status)}
- Limitations: ${limitations}

## Supplier comparison
${quoteSections}
## Audit trail

${auditRows}

## Versions

${Object.entries(reviewPackage.versions).map(([name, version]) => `- ${name}: ${version}`).join('\n')}
`
}
