/**
 * Maps a sanitized Onshape variable payload onto BuildReady's existing design
 * contract.
 *
 * The deterministic CNC rule engine is intentionally untouched by this module.
 * Onshape supplies measurements and provenance; `cnc-rules.js` still decides
 * what those measurements mean. That keeps live-CAD findings reproducible and
 * identical in form to controlled-fixture findings.
 */

import { discoverManufacturingVariables } from './onshape-discovery.js?v=20260903-2'

/** Length units accepted in an Onshape quantity expression, expressed in millimetres. */
const UNIT_TO_MM = Object.freeze({
  mm: 1,
  millimeter: 1,
  millimetre: 1,
  cm: 10,
  centimeter: 10,
  centimetre: 10,
  m: 1000,
  meter: 1000,
  metre: 1000,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
  foot: 304.8,
})

/** Literal decimal or simple fractional lengths, such as `3.5 mm` or `1/8 in`. */
const QUANTITY_PATTERN = /^\s*(-?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+))\s*\*?\s*([A-Za-z]+)\s*$/

export class OnshapeAdapterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'OnshapeAdapterError'
    this.code = code
  }
}

/**
 * Converts an Onshape quantity expression to millimetres.
 * Expressions that reference other variables or use arithmetic are rejected
 * rather than guessed at, so a mapped dimension is always a literal measurement.
 */
export function parseQuantityMm(expression) {
  if (typeof expression !== 'string') {
    throw new OnshapeAdapterError('ONSHAPE_BAD_QUANTITY', 'variable value must be a string expression.')
  }

  const match = QUANTITY_PATTERN.exec(expression)
  if (!match) {
    throw new OnshapeAdapterError(
      'ONSHAPE_BAD_QUANTITY',
      `unsupported expression "${expression.slice(0, 32)}"; expected a literal length such as "1 mm".`,
    )
  }

  const magnitudeText = match[1]
  const magnitude = magnitudeText.includes('/')
    ? magnitudeText.split('/').map(Number).reduce((numerator, denominator) => numerator / denominator)
    : Number(magnitudeText)
  const factor = UNIT_TO_MM[match[2].toLowerCase()]
  if (!Number.isFinite(magnitude) || factor === undefined) {
    throw new OnshapeAdapterError('ONSHAPE_BAD_QUANTITY', `unsupported unit in "${expression.slice(0, 32)}".`)
  }

  // Onshape stores full float precision; round to a stable micron so identical
  // model state always produces an identical configuration hash.
  return Math.round(magnitude * factor * 1000) / 1000
}

/**
 * Builds a design fixture of the same shape the rule engine already consumes,
 * with every mapped dimension replaced by its live Onshape measurement.
 *
 * The sample fixture is used only for optional visual highlight metadata. Live
 * material and production quantity are deliberately left unspecified because
 * the Part Studio variable endpoint does not provide them.
 */
export function mapOnshapeToDesign(payload, source, baseFixture) {
  if (!payload?.ok || !Array.isArray(payload.variables)) {
    throw new OnshapeAdapterError('ONSHAPE_BAD_PAYLOAD', 'the Onshape response did not contain variables.')
  }
  const discovery = discoverManufacturingVariables(payload.variables, parseQuantityMm)
  const byRole = new Map(discovery.mappings.map((mapping) => [mapping.roleId, mapping]))
  const featureDefinitions = source?.measurementGroups
  if (!Array.isArray(featureDefinitions) || featureDefinitions.length === 0) {
    throw new OnshapeAdapterError('ONSHAPE_BAD_CONFIG', 'no manufacturing checks are configured for this source.')
  }

  const features = []
  for (const definition of featureDefinitions) {
    const { featureId, dimensions, label, ruleId } = definition
    if (!featureId || !ruleId || !dimensions || typeof dimensions !== 'object') {
      throw new OnshapeAdapterError('ONSHAPE_BAD_CONFIG', 'a configured manufacturing check is incomplete.')
    }
    const entries = Object.entries(dimensions)
    if (!entries.every(([, roleId]) => byRole.has(roleId))) continue
    const base = baseFixture.features.find((feature) => feature.featureId === featureId)
    features.push({
      ...base,
      featureId,
      label: base?.label ?? label ?? featureId,
      featureType: base?.featureType ?? 'measured-region',
      applicableRuleIds: [ruleId],
      highlightIds: base?.highlightIds ?? [],
      dimensions: Object.fromEntries(entries.map(([key, roleId]) => [key, byRole.get(roleId).valueMm])),
      inputReviewStatus: 'inferred-unreviewed',
      measurementProvenance: Object.fromEntries(entries.map(([key, roleId]) => [key, { ...byRole.get(roleId) }])),
      selected: features.length === 0,
    })
  }
  if (features.length === 0) {
    throw new OnshapeAdapterError(
      'ONSHAPE_NO_APPLICABLE_MEASUREMENTS',
      'BuildReady could not find a complete set of named dimensions for any configured check. Add descriptive Part Studio variables, then try again.',
    )
  }

  // The Onshape microversion changes on every model edit, so it is the natural
  // revision precondition: an inspection taken before an edit is detectably stale.
  const microversion = payload.microversionId
  if (typeof microversion !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(microversion)) {
    throw new OnshapeAdapterError('ONSHAPE_NO_MICROVERSION', 'a full Onshape microversion is required.')
  }
  const scope = payload.document?.workspaceOrVersion ?? (payload.document?.versionId ? 'v' : 'w')
  const scopeId = payload.document?.workspaceOrVersionId ?? payload.document?.versionId ?? payload.document?.workspaceId
  if (!['w', 'v'].includes(scope) || ![payload.document?.documentId, payload.document?.elementId, scopeId].every(
    (id) => typeof id === 'string' && /^[A-Za-z0-9]{8,40}$/.test(id),
  )) throw new OnshapeAdapterError('ONSHAPE_BAD_CONTEXT', 'the full document, element and workspace/version are required.')
  const sourceSnapshotKey = `onshape-source-1:${payload.document.documentId}/${scope}/${scopeId}/${payload.document.elementId}/${microversion}`
  const revisionId = `onshape-${microversion}`
  const provenance = `${payload.document.documentId}/${microversion}`
  const designId = `ONSHAPE-${payload.document.documentId}-${payload.document.elementId}`

  return {
    design: {
      ...baseFixture,
      designId,
      name: payload.document.name,
      sourceSnapshotKey,
      sourceIdentity: { documentId: payload.document.documentId, elementId: payload.document.elementId,
        workspaceOrVersion: scope, workspaceOrVersionId: scopeId, microversionId: microversion,
        configuration: 'default', selectedPartIds: [], evidenceLevel: 'parameter-snapshot-not-exported-cad' },
      revisionId,
      fixtureVersion: `onshape-${payload.serializationVersion ?? '1.0.0'}`,
      material: { id: 'unspecified', label: 'Material not provided by Onshape', reviewStatus: 'unknown' },
      process: {
        id: source.reviewContext?.processId ?? 'cnc-screening',
        label: source.reviewContext?.processLabel ?? 'CNC milling screening',
        reviewStatus: 'unknown',
      },
      quantity: null,
      features: features.map((feature) => ({
        ...feature,
        objectReference: `onshape://${payload.document.documentId}/${payload.document.elementId}/${feature.featureId}`,
        revisionProvenance: provenance,
        evidenceReference: `onshape://documents/${payload.document.documentId}/microversions/${microversion}/elements/${payload.document.elementId}`,
        evidenceReferences: Object.values(feature.measurementProvenance).map((measurement) => (
          `onshape://documents/${payload.document.documentId}/microversions/${microversion}/elements/${payload.document.elementId}/${measurement.sourceFeatureId ? `features/${encodeURIComponent(measurement.sourceFeatureId)}` : `variables/${encodeURIComponent(measurement.variableName)}`}`
        )),
      })),
    },
    provenance: {
      sourceId: source.sourceId,
      documentId: payload.document.documentId,
      workspaceId: payload.document.workspaceId,
      versionId: payload.document.versionId ?? null,
      workspaceOrVersion: scope,
      workspaceOrVersionId: scopeId,
      sourceSnapshotKey,
      elementId: payload.document.elementId,
      documentName: payload.document.name,
      documentHref: payload.document.href,
      microversionId: microversion,
      retrievedAt: payload.retrievedAt,
      measurementCount: discovery.inventory.length,
      inferredMeasurementCount: discovery.mappings.length,
      applicableRuleCount: features.length,
      availableRuleCount: featureDefinitions.length,
      contextAssumptions: {
        material: source.reviewContext?.material ?? 'not-provided',
        process: 'configured-screening-policy',
        quantity: source.reviewContext?.quantity ?? 'not-provided',
      },
      featureSummary: payload.featureSummary ?? [],
      discovery,
    },
    measurements: Object.fromEntries(discovery.mappings.map((mapping) => [mapping.roleId, mapping.valueMm])),
  }
}
