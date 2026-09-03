/**
 * Pure natural-language routing and evidence composition for Model Insight.
 *
 * This module never invents geometry or machining facts. It classifies a
 * bounded question, then composes an answer only from the active design,
 * deterministic findings, discovery provenance, and audited workflow state.
 */

export const MAX_INSIGHT_QUERY_LENGTH = 500

const FEATURE_HINTS = Object.freeze([
  Object.freeze({ featureId: 'inside-pocket-corner', terms: ['corner', 'radius', 'relief', 'fillet', 'cutter', 'endmill'] }),
  Object.freeze({ featureId: 'deep-pocket', terms: ['pocket', 'cavity', 'recess', 'slot', 'width'] }),
  Object.freeze({ featureId: 'thin-wall', terms: ['wall', 'rib', 'web', 'thin', 'thickness', 'gauge'] }),
  Object.freeze({ featureId: 'deep-drilled-hole', terms: ['deep hole', 'drilled hole', 'coolant', 'sensor', 'port', 'bore'] }),
  Object.freeze({ featureId: 'mounting-hole-tolerance', terms: ['mount', 'bolt', 'fastener', 'tolerance', 'clearance', 'fit'] }),
])

const UNSAFE_TERMS = ['approve', 'release', 'commit', 'write to onshape', 'change onshape', 'modify cad', 'edit cad', 'purchase', 'order parts']

function normalized(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function featureHint(text) {
  return FEATURE_HINTS.find((entry) => hasAny(text, entry.terms))?.featureId ?? null
}

function numericValue(text, expression) {
  const match = expression.exec(text)
  return match ? Number(match[1]) : null
}

export function classifyInsightQuery(rawQuery) {
  const query = normalized(rawQuery)
  if (!query) return Object.freeze({ kind: 'empty', query, featureId: null })
  if (query.length > MAX_INSIGHT_QUERY_LENGTH) {
    return Object.freeze({ kind: 'too_long', query, featureId: null })
  }

  const text = query.toLowerCase().replace(/[-_]+/g, ' ')
  const selectedFeatureId = featureHint(text)
  const quantity = numericValue(text, /(?:quantity|qty|for)\s+(\d{1,6})\b/)
  const proposedRadiusMm = numericValue(text, /(?:radius|preview|change)\D{0,16}(\d+(?:\.\d+)?)\s*(?:mm)?/)

  if (hasAny(text, UNSAFE_TERMS)) return Object.freeze({ kind: 'authority_boundary', query, featureId: selectedFeatureId })
  if (hasAny(text, ['help', 'what can you do', 'commands', 'how do i use'])) return Object.freeze({ kind: 'help', query, featureId: selectedFeatureId })
  if (hasAny(text, ['load live onshape', 'load the live onshape', 'load onshape', 'read part studio', 'use part studio', 'connect onshape'])) return Object.freeze({ kind: 'live_source', query, featureId: selectedFeatureId })
  if (hasAny(text, ['variable', 'mapping', 'mapped', 'inferred', 'discovery', 'confidence'])) return Object.freeze({ kind: 'variables', query, featureId: selectedFeatureId })
  if (hasAny(text, ['coverage', 'skipped rule', 'applicable rule', 'what was checked'])) return Object.freeze({ kind: 'coverage', query, featureId: selectedFeatureId })
  if (hasAny(text, ['audit', 'history', 'what happened', 'actions taken'])) return Object.freeze({ kind: 'audit', query, featureId: selectedFeatureId })
  if (hasAny(text, ['package', 'report', 'export review'])) return Object.freeze({ kind: 'package', query, featureId: selectedFeatureId })
  if (hasAny(text, ['quote', 'supplier', 'cost', 'lead time', 'price'])) return Object.freeze({ kind: 'suppliers', query, featureId: selectedFeatureId, quantity })
  if (hasAny(text, ['preview', 'show the change', 'simulate', 'try radius'])) {
    return Object.freeze({ kind: 'preview', query, featureId: selectedFeatureId, proposedRadiusMm })
  }
  if (hasAny(text, ['recommend', 'fix', 'improve', 'change', 'next step', 'what should'])) return Object.freeze({ kind: 'recommendations', query, featureId: selectedFeatureId })
  if (hasAny(text, ['explain', 'why', 'detail', 'specific', 'selected feature', 'this feature'])) return Object.freeze({ kind: 'explain', query, featureId: selectedFeatureId })
  if (hasAny(text, ['highest risk', 'biggest risk', 'worst', 'priority', 'prioritize', 'summary', 'risks', 'issues', 'findings'])) return Object.freeze({ kind: 'risks', query, featureId: selectedFeatureId })
  if (hasAny(text, ['inspect', 'analyze', 'analyse', 'manufacturability', 'run dfm', 'dfm check'])) return Object.freeze({ kind: 'inspect', query, featureId: selectedFeatureId })
  if (hasAny(text, ['dimension', 'measurement', 'size', 'diameter', 'depth', 'width', 'thickness', 'radius'])) return Object.freeze({ kind: 'measurements', query, featureId: selectedFeatureId })
  if (hasAny(text, ['model', 'part', 'design', 'material', 'process', 'revision', 'microversion', 'context', 'workflow status', 'current status'])) return Object.freeze({ kind: 'context', query, featureId: selectedFeatureId })
  return Object.freeze({ kind: 'fallback', query, featureId: selectedFeatureId })
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

function measurementName(key) {
  return key
    .replace(/PlusMinusMm$/, ' tolerance')
    .replace(/Mm$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
}

function dimensionsText(feature) {
  return Object.entries(feature?.dimensions ?? {})
    .map(([key, value]) => `${measurementName(key)} ${formatNumber(value)} mm`)
    .join(', ')
}

function severityRank(severity) {
  return severity === 'high' ? 0 : severity === 'medium' ? 1 : 2
}

function prioritizedFindings(workflow) {
  return [...(workflow.findings ?? [])].sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.ruleId.localeCompare(right.ruleId)
  ))
}

function findingFor(intent, snapshot) {
  const findings = prioritizedFindings(snapshot.workflow)
  const featureId = intent.featureId
    ?? snapshot.workflow.selectedFeatureId
    ?? findings[0]?.featureId
  return findings.find((finding) => finding.featureId === featureId) ?? findings[0] ?? null
}

function citationsFor(finding) {
  return finding
    ? finding.evidenceReferences.map((reference) => ({ label: reference.split('/').pop(), reference }))
    : []
}

function response(text, intent, { citations = [], followUps = [] } = {}) {
  return Object.freeze({ text, intent, citations: Object.freeze(citations), followUps: Object.freeze(followUps) })
}

export function composeInsightResponse(intent, snapshot) {
  const { design, workflow, provenance } = snapshot
  const source = workflow.designSource?.sourceId === 'onshape-live' ? 'live Onshape Part Studio' : 'controlled fixture'
  const findings = prioritizedFindings(workflow)
  const highCount = findings.filter((finding) => finding.severity === 'high').length
  const mediumCount = findings.filter((finding) => finding.severity === 'medium').length
  const selectedFinding = findingFor(intent, snapshot)
  const selectedFeature = design.features.find((feature) => (
    feature.featureId === (intent.featureId ?? selectedFinding?.featureId ?? workflow.selectedFeatureId)
  )) ?? design.features[0]

  if (intent.kind === 'empty') return response('Ask about this Part Studio, a finding, or what to change next.', intent.kind)
  if (intent.kind === 'too_long') return response(`Please keep a question under ${MAX_INSIGHT_QUERY_LENGTH} characters so it remains bounded and auditable.`, intent.kind)
  if (intent.kind === 'authority_boundary') {
    return response(
      'I can inspect, explain, and prepare a non-destructive preview, but I cannot approve a proposal, edit Onshape geometry, release production, contact suppliers, or place an order. Approval remains a visible human action.',
      intent.kind,
      { followUps: ['Preview the recommended radius', 'What is the highest-risk issue?', 'Explain the approval boundary'] },
    )
  }
  if (intent.kind === 'help') {
    return response(
      'I can run the manufacturing check, explain an issue using the model’s dimensions, suggest what to review first, and prepare a read-only radius preview. I do not change or approve CAD.',
      intent.kind,
      { followUps: suggestedInsightQuestions(snapshot) },
    )
  }
  if (intent.kind === 'context') {
    const materialContext = design.material?.id === 'unspecified'
      ? 'Material is not available from the current Onshape data, so material-specific conclusions are not included.'
      : `The selected material is ${design.material.label}.`
    return response(
      `You’re reviewing ${design.name} from ${source}. BuildReady recognized ${design.features.length} complete sets of dimensions for ${design.process.label}. ${materialContext} The model is read-only here, and results refresh when it changes.`,
      intent.kind,
      { followUps: ['Run a full manufacturability check', 'How were variables mapped?', 'Show rule coverage'] },
    )
  }
  if (intent.kind === 'live_source') {
    if (workflow.designSource?.sourceId !== 'onshape-live') {
      return response('A live Onshape source is not available in this deployment or cannot replace the current reviewed state. Use the visible source control before inspection.', intent.kind)
    }
    return response(
      `Loaded ${design.name}. BuildReady used ${provenance.inferredMeasurementCount} of ${provenance.measurementCount} named dimensions, so ${provenance.applicableRuleCount} of ${provenance.availableRuleCount ?? workflow.inspection?.coverage?.availableRules ?? 'the configured'} checks are available.`,
      intent.kind,
      { followUps: ['Run a full manufacturability check', 'How were variables mapped?', 'What model is active?'] },
    )
  }
  if (intent.kind === 'variables') {
    if (!provenance?.discovery) {
      return response('The controlled fixture has reviewed measurements but no live Onshape variable-discovery record. Load a live Part Studio to inspect semantic mappings.', intent.kind)
    }
    const lines = provenance.discovery.mappings.map((mapping) => (
      `${measurementName(mapping.roleId)}: #${mapping.variableName} (${mapping.valueMm} mm, ${mapping.confidence} match)`
    ))
    const unused = provenance.discovery.unmapped.slice(0, 12).map((item) => `#${item.name}`).join(', ')
    const unusedSummary = provenance.discovery.unmapped.length
      ? `${provenance.discovery.unmapped.length} other ${provenance.discovery.unmapped.length === 1 ? 'variable was' : 'variables were'} not needed for these checks${unused ? `: ${unused}${provenance.discovery.unmapped.length > 12 ? ', …' : ''}` : ''}.`
      : 'Every valid variable contributed to a current rule input.'
    return response(
      `BuildReady found ${provenance.measurementCount} named dimensions and used ${provenance.inferredMeasurementCount}. Names do not have to match an exact template:\n${lines.map((line) => `• ${line}`).join('\n')}\n${unusedSummary}`,
      intent.kind,
      { followUps: ['Show rule coverage', 'What variables were not used?', 'Run a full manufacturability check'] },
    )
  }
  if (intent.kind === 'coverage') {
    const coverage = workflow.inspection?.coverage
    if (!coverage) return response('No inspection coverage exists yet. Ask me to run a manufacturability check first.', intent.kind, { followUps: ['Run a full manufacturability check'] })
    const skipped = coverage.skippedRules.length
      ? ` Skipped: ${coverage.skippedRules.map((item) => `${item.ruleId} (${item.reason})`).join('; ')}.`
      : ' No rules were skipped.'
    return response(
      `${coverage.evaluatedRuleCount} of ${coverage.availableRules} checks had the dimensions they needed.${skipped}`,
      intent.kind,
      { followUps: ['What is the highest-risk issue?', 'Explain the selected feature', 'What should I change first?'] },
    )
  }
  if (intent.kind === 'inspect' || intent.kind === 'risks') {
    if (!workflow.inspection) return response('The inspection could not be created for the current model.', intent.kind)
    if (findings.length === 0) {
      return response(`The check ran ${workflow.inspection.coverage.evaluatedRuleCount} applicable checks and found no issues at the configured thresholds.`, intent.kind, { followUps: ['Show rule coverage', 'Show model measurements'] })
    }
    const top = findings.map((finding, index) => `${index + 1}. ${finding.severity.toUpperCase()} — ${finding.title} (${finding.calculation})`)
    return response(
      `The check found ${findings.length} issues: ${highCount} high priority and ${mediumCount} medium priority. Review them in this order:\n${top.join('\n')}\nUse these as design-review guidance; a manufacturing engineer should confirm the final design.`,
      intent.kind,
      { citations: findings.flatMap(citationsFor), followUps: ['Explain the highest-risk issue', 'What should I change first?', 'Show rule coverage'] },
    )
  }
  if (intent.kind === 'explain') {
    if (!selectedFinding) {
      return response(`${selectedFeature.label} has measurements ${dimensionsText(selectedFeature)}, but it has no active violation in the current inspection.`, intent.kind, { followUps: ['Show all model measurements', 'Show rule coverage'] })
    }
    return response(
      `${selectedFinding.title}. Observed: ${selectedFinding.calculation}. ${selectedFinding.consequence} Recommendation: ${selectedFinding.recommendation}`,
      intent.kind,
      { citations: citationsFor(selectedFinding), followUps: ['What should I change first?', 'Preview the recommended radius', 'Explain another feature'] },
    )
  }
  if (intent.kind === 'measurements') {
    return response(
      `${selectedFeature.label} (${selectedFeature.featureId}) measures ${dimensionsText(selectedFeature)}. These values come from the ${source} and are tied to revision ${design.revisionId}.`,
      intent.kind,
      { followUps: ['Explain this feature', 'How were variables mapped?', 'Run a full manufacturability check'] },
    )
  }
  if (intent.kind === 'recommendations') {
    if (!findings.length) return response('There are no active findings to prioritize. Review coverage before treating that as a production conclusion.', intent.kind, { followUps: ['Show rule coverage', 'Show model measurements'] })
    const recommendations = findings.map((finding, index) => `${index + 1}. [${finding.severity}] ${finding.recommendation}`)
    return response(
      `Recommended review order, with high-severity findings first:\n${recommendations.join('\n')}\nI can prepare the bounded corner-radius preview, but a human must approve or reject it.`,
      intent.kind,
      { citations: findings.flatMap(citationsFor), followUps: ['Preview the recommended radius', 'Explain the highest-risk issue', 'Why can’t you approve it?'] },
    )
  }
  if (intent.kind === 'preview') {
    const proposal = workflow.proposedChange
    if (!proposal) return response('A radius preview is not applicable to the current findings, or another prerequisite prevented it.', intent.kind)
    return response(
      `Prepared a non-destructive preview for ${proposal.featureId}: ${proposal.before.insideRadiusMm} mm → ${proposal.after.insideRadiusMm} mm. Expected rule result: ${proposal.expectedRuleResolution}. The source Part Studio is unchanged; use the visible Approve or Reject control to record a human decision.`,
      intent.kind,
      { citations: selectedFinding ? citationsFor(selectedFinding) : [], followUps: ['Explain why this helps', 'What happens after I decide?', 'Show the audit history'] },
    )
  }
  if (intent.kind === 'suppliers') {
    if (!['approved', 'rejected'].includes(workflow.decisionStatus)) {
      return response('Supplier comparison is locked until a visible human decision is recorded for the pending preview. I cannot make that decision for you.', intent.kind, { followUps: ['Preview the recommended radius', 'Explain the approval boundary'] })
    }
    if (!workflow.supplierQuotes.length) {
      const quantityMessage = Number.isInteger(intent.quantity)
        ? ` Quantity ${intent.quantity} is unsupported; choose 250, 500, 1000, or 2500.`
        : ''
      return response(`The supplier comparison could not be prepared for this state or quantity.${quantityMessage}`, intent.kind)
    }
    const lines = workflow.supplierQuotes.map((quote) => `${quote.supplierName}: ${quote.currency} ${quote.totalPrice.toFixed(2)}, ${quote.leadTimeDays} days`)
    return response(`The controlled comparison produced ${workflow.supplierQuotes.length} fictional quotes for ${workflow.supplierQuotes[0].quantity} parts:\n${lines.map((line) => `• ${line}`).join('\n')}\nThey share one reviewed configuration; supplier notes remain untrusted content.`, intent.kind, { followUps: ['Generate the review package', 'Show the audit history'] })
  }
  if (intent.kind === 'package') {
    if (!workflow.reviewPackage) return response('A review package requires a completed inspection, visible human decision, and supplier comparison. Complete the missing stages first.', intent.kind, { followUps: suggestedInsightQuestions(snapshot) })
    return response(`Review package ${workflow.reviewPackage.packageId} is ready with ${workflow.reviewPackage.inspection.findingCount} findings and ${workflow.reviewPackage.supplierComparison.quotes.length} quotes. Use the visible JSON or Markdown download control for the exact evidence record.`, intent.kind)
  }
  if (intent.kind === 'audit') {
    const events = (workflow.auditEvents ?? []).slice(-6)
    if (!events.length) return response('No audited workflow actions have been recorded in this session.', intent.kind)
    return response(`Recent audited actions:\n${events.map((event) => `• ${event.actor}: ${event.toolName} — ${event.status}`).join('\n')}`, intent.kind, { followUps: ['What is the current workflow status?', 'Generate the review package'] })
  }

  return response(
    `I could not map that question to a bounded engineering action. I can answer from the active ${design.name} evidence about model context, dimensions, variable mappings, CNC risks, recommendations, previews, rule coverage, suppliers, and review history.`,
    'fallback',
    { followUps: suggestedInsightQuestions(snapshot) },
  )
}

export function suggestedInsightQuestions(snapshot) {
  const workflow = snapshot.workflow
  if (workflow.onshapeAvailable
    && workflow.designSource?.sourceId !== 'onshape-live'
    && workflow.inspectionStatus !== 'complete') {
    return Object.freeze(['Load this Part Studio', 'What model is active?', 'What can you do?'])
  }
  if (workflow.inspectionStatus !== 'complete') {
    return Object.freeze(['Run the manufacturing check', 'What model is active?', 'How were dimensions recognized?'])
  }
  if (workflow.proposedChange && workflow.decisionStatus === 'pending') {
    return Object.freeze(['Explain why this change helps', 'What happens after I decide?', 'Show the audit history'])
  }
  if (!workflow.proposedChange && workflow.findings.some((finding) => finding.ruleId === 'CNC-R001')) {
    return Object.freeze(['What is the highest-risk issue?', 'Explain the selected feature', 'Preview the recommended radius'])
  }
  if (['approved', 'rejected'].includes(workflow.decisionStatus) && !workflow.supplierQuotes.length) {
    return Object.freeze(['Compare suppliers for 1000 parts', 'Show the audit history', 'What risks remain?'])
  }
  if (workflow.supplierQuotes.length && !workflow.reviewPackage) {
    return Object.freeze(['Generate the review package', 'Compare supplier cost and lead time', 'Show the audit history'])
  }
  return Object.freeze(['Show rule coverage', 'Show model measurements', 'What can you do?'])
}

export function transcriptMarkdown(messages, snapshot) {
  const lines = [
    '# BuildReady Model Insight transcript',
    '',
    `Design: ${snapshot.design.designId}/${snapshot.design.revisionId}`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ]
  for (const message of messages) {
    lines.push(`## ${message.role === 'user' ? 'Engineer' : 'Model Insight'}`, '', message.text, '')
    if (message.citations?.length) {
      lines.push(`Evidence: ${message.citations.map((item) => item.reference).join(', ')}`, '')
    }
  }
  lines.push('---', 'Demonstration DFM guidance only; not production manufacturing approval.', '')
  return lines.join('\n')
}
