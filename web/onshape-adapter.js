/**
 * Maps a sanitized Onshape variable payload onto BuildReady's existing design
 * contract.
 *
 * The deterministic CNC rule engine is intentionally untouched by this module.
 * Onshape supplies measurements and provenance; `cnc-rules.js` still decides
 * what those measurements mean. That keeps live-CAD findings reproducible and
 * identical in form to controlled-fixture findings.
 */

import { discoverManufacturingVariables } from './onshape-discovery.js?v=20260903-1'

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

/** `1 mm`, `0.02mm`, `3.5 * mm`, `1/8 in` is rejected — only a plain magnitude and unit. */
const QUANTITY_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*\*?\s*([A-Za-z]+)\s*$/

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

  const magnitude = Number(match[1])
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
 * `baseFixture` supplies the non-geometric context (material, process, quantity,
 * feature labels, highlight ids) that Onshape variables do not describe.
 */
export function mapOnshapeToDesign(payload, source, baseFixture) {
  if (!payload?.ok || !Array.isArray(payload.variables)) {
    throw new OnshapeAdapterError('ONSHAPE_BAD_PAYLOAD', 'the Onshape response did not contain variables.')
  }
  const discovery = discoverManufacturingVariables(payload.variables, parseQuantityMm)
  const byRole = new Map(discovery.mappings.map((mapping) => [mapping.roleId, mapping]))
  const featureDefinitions = [
    ['inside-pocket-corner', { insideRadiusMm: 'cornerRadius', selectedCutterRadiusMm: 'cutterRadius' }],
    ['deep-pocket', { depthMm: 'pocketDepth', minWidthMm: 'pocketWidth' }],
    ['thin-wall', { thicknessMm: 'wallThickness' }],
    ['deep-drilled-hole', { depthMm: 'deepHoleDepth', diameterMm: 'deepHoleDiameter' }],
    ['mounting-hole-tolerance', { diameterMm: 'mountHoleDiameter', tolerancePlusMinusMm: 'mountTolerance' }],
  ]

  const features = []
  for (const [featureId, dimensions] of featureDefinitions) {
    const entries = Object.entries(dimensions)
    if (!entries.every(([, roleId]) => byRole.has(roleId))) continue
    const base = baseFixture.features.find((feature) => feature.featureId === featureId)
    features.push({
      ...base,
      dimensions: Object.fromEntries(entries.map(([key, roleId]) => [key, byRole.get(roleId).valueMm])),
      selected: features.length === 0,
    })
  }
  if (features.length === 0) {
    throw new OnshapeAdapterError(
      'ONSHAPE_NO_APPLICABLE_MEASUREMENTS',
      'no complete manufacturing measurement groups could be inferred from the Part Studio variables.',
    )
  }

  // The Onshape microversion changes on every model edit, so it is the natural
  // revision precondition: an inspection taken before an edit is detectably stale.
  const microversion = payload.microversionId ?? 'unknown'
  const revisionId = `onshape-${microversion.slice(0, 12)}`
  const provenance = `${payload.document.documentId}/${microversion}`
  const designId = `ONSHAPE-${payload.document.documentId.slice(0, 8).toUpperCase()}`

  return {
    design: {
      ...baseFixture,
      designId,
      name: payload.document.name,
      revisionId,
      fixtureVersion: `onshape-${payload.serializationVersion ?? '1.0.0'}`,
      features: features.map((feature) => ({
        ...feature,
        objectReference: `onshape://${payload.document.documentId}/${payload.document.elementId}/${feature.featureId}`,
        revisionProvenance: provenance,
        evidenceReference: `onshape://documents/${payload.document.documentId}/microversions/${microversion}/elements/${payload.document.elementId}/features/${feature.featureId}`,
      })),
    },
    provenance: {
      sourceId: source.sourceId,
      documentId: payload.document.documentId,
      workspaceId: payload.document.workspaceId,
      elementId: payload.document.elementId,
      documentName: payload.document.name,
      documentHref: payload.document.href,
      microversionId: microversion,
      retrievedAt: payload.retrievedAt,
      measurementCount: discovery.inventory.length,
      inferredMeasurementCount: discovery.mappings.length,
      applicableRuleCount: features.length,
      featureSummary: payload.featureSummary ?? [],
      discovery,
    },
    measurements: Object.fromEntries(discovery.mappings.map((mapping) => [mapping.roleId, mapping.valueMm])),
  }
}
