/**
 * Maps a sanitized Onshape variable payload onto BuildReady's existing design
 * contract.
 *
 * The deterministic CNC rule engine is intentionally untouched by this module.
 * Onshape supplies measurements and provenance; `cnc-rules.js` still decides
 * what those measurements mean. That keeps live-CAD findings reproducible and
 * identical in form to controlled-fixture findings.
 */

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

/** Reduces the payload's variable list to `{ name: millimetres }`, validating ranges. */
export function resolveVariables(payload, variableMap) {
  if (!payload?.ok || !Array.isArray(payload.variables)) {
    throw new OnshapeAdapterError('ONSHAPE_BAD_PAYLOAD', 'the Onshape response did not contain variables.')
  }

  const byName = new Map()
  for (const variable of payload.variables) {
    if (variable && typeof variable.name === 'string' && !byName.has(variable.name)) {
      byName.set(variable.name, variable.expression)
    }
  }

  const resolved = {}
  const missing = []

  for (const entry of variableMap) {
    if (!byName.has(entry.variableName)) {
      missing.push(entry.variableName)
      continue
    }

    const millimetres = parseQuantityMm(byName.get(entry.variableName))
    if (millimetres < entry.minimumMm || millimetres > entry.maximumMm) {
      throw new OnshapeAdapterError(
        'ONSHAPE_VALUE_OUT_OF_RANGE',
        `${entry.variableName} = ${millimetres} mm is outside the supported ${entry.minimumMm}–${entry.maximumMm} mm range.`,
      )
    }
    resolved[entry.variableName] = millimetres
  }

  if (missing.length > 0) {
    throw new OnshapeAdapterError(
      'ONSHAPE_MISSING_VARIABLES',
      `the Part Studio is missing required variables: ${missing.join(', ')}.`,
    )
  }

  return resolved
}

/**
 * Builds a design fixture of the same shape the rule engine already consumes,
 * with every mapped dimension replaced by its live Onshape measurement.
 *
 * `baseFixture` supplies the non-geometric context (material, process, quantity,
 * feature labels, highlight ids) that Onshape variables do not describe.
 */
export function mapOnshapeToDesign(payload, source, baseFixture) {
  const resolved = resolveVariables(payload, source.variableMap)

  const dimensionsByFeature = new Map()
  for (const entry of source.variableMap) {
    const dimensions = dimensionsByFeature.get(entry.featureId) ?? {}
    dimensions[entry.dimensionKey] = resolved[entry.variableName]
    dimensionsByFeature.set(entry.featureId, dimensions)
  }

  const unmapped = baseFixture.features
    .filter((feature) => !dimensionsByFeature.has(feature.featureId))
    .map((feature) => feature.featureId)
  if (unmapped.length > 0) {
    throw new OnshapeAdapterError(
      'ONSHAPE_INCOMPLETE_MAPPING',
      `no Onshape variables map to: ${unmapped.join(', ')}.`,
    )
  }

  // The Onshape microversion changes on every model edit, so it is the natural
  // revision precondition: an inspection taken before an edit is detectably stale.
  const microversion = payload.microversionId ?? 'unknown'
  const revisionId = `onshape-${microversion.slice(0, 12)}`
  const provenance = `${payload.document.documentId}/${microversion}`

  return {
    design: {
      ...baseFixture,
      designId: baseFixture.designId,
      revisionId,
      fixtureVersion: `onshape-${payload.serializationVersion ?? '1.0.0'}`,
      features: baseFixture.features.map((feature) => ({
        ...feature,
        dimensions: dimensionsByFeature.get(feature.featureId),
        revisionProvenance: provenance,
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
      measurementCount: Object.keys(resolved).length,
    },
    measurements: resolved,
  }
}
