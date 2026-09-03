/**
 * Deterministic semantic discovery for arbitrary Onshape variable names.
 *
 * This intentionally does not contain a list of required exact variable names.
 * It tokenizes the names and nearby feature labels Onshape exposes, scores
 * manufacturing concepts, resolves conflicts globally, and reports confidence
 * and alternatives. Unknown or ambiguous values remain visible instead of
 * being silently forced into a rule input.
 */

const ROLE_DEFINITIONS = Object.freeze([
  role('cornerRadius', ['radius', 'rad', 'fillet'], ['corner', 'inside', 'internal', 'relief', 'pocket', 'cavity'], ['tool', 'cutter', 'mill']),
  role('cutterRadius', ['radius', 'rad'], ['tool', 'cutter', 'endmill', 'mill'], ['corner', 'fillet']),
  role('pocketDepth', ['depth', 'deep', 'z'], ['pocket', 'cavity', 'recess', 'slot'], ['hole', 'bore', 'drill']),
  role('pocketWidth', ['width', 'span', 'opening', 'gap'], ['pocket', 'cavity', 'recess', 'slot', 'minimum', 'min'], ['wall', 'hole', 'bore']),
  role('wallThickness', ['thickness', 'thick', 'gauge'], ['wall', 'web', 'rib'], ['plate', 'base', 'stock']),
  role('deepHoleDepth', ['depth', 'deep'], ['hole', 'bore', 'drill', 'coolant', 'oil'], ['pocket', 'cavity', 'mount', 'bolt']),
  role('deepHoleDiameter', ['diameter', 'diam', 'dia', 'size'], ['hole', 'bore', 'drill', 'coolant', 'oil'], ['mount', 'bolt', 'fastener', 'counterbore']),
  role('mountHoleDiameter', ['diameter', 'diam', 'dia', 'size'], ['mount', 'bolt', 'fastener', 'fixture'], ['coolant', 'oil', 'deep']),
  role('mountTolerance', ['tolerance', 'tol', 'allowance', 'clearance', 'fit'], ['mount', 'bolt', 'fastener', 'bore', 'hole'], ['depth']),
])

function role(roleId, measurementTokens, contextTokens, excludedTokens) {
  return Object.freeze({ roleId, measurementTokens, contextTokens, excludedTokens })
}

export function tokenizeVariable(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function tokenMatches(token, candidate) {
  return token === candidate || (candidate.length >= 4 && token.startsWith(candidate))
}

function includesAny(tokens, candidates) {
  return candidates.some((candidate) => tokens.some((token) => tokenMatches(token, candidate)))
}

function scoreVariable(variable, definition) {
  const nameTokens = tokenizeVariable(variable.name)
  const contextTokens = tokenizeVariable(`${variable.sourceFeatureName ?? ''} ${variable.description ?? ''}`)
  const allTokens = [...nameTokens, ...contextTokens]
  const measurementHits = definition.measurementTokens.filter((token) => includesAny(nameTokens, [token])).length
  const contextHits = definition.contextTokens.filter((token) => includesAny(allTokens, [token])).length
  const excludedHits = definition.excludedTokens.filter((token) => includesAny(allTokens, [token])).length
  if (measurementHits === 0 || contextHits === 0) return 0
  return measurementHits * 5 + contextHits * 3 - excludedHits * 6
}

function confidenceFor(score, margin) {
  if (score >= 11 && margin >= 3) return 'high'
  if (score >= 8 && margin >= 2) return 'medium'
  return 'low'
}

/**
 * @param {{name:string, expression:string, sourceFeatureId?:string, sourceFeatureName?:string}[]} variables
 * @param {(expression:string)=>number} parseLength conversion supplied by the adapter
 */
export function discoverManufacturingVariables(variables, parseLength) {
  const candidates = []
  const rejected = []

  for (const variable of variables) {
    try {
      const valueMm = parseLength(variable.expression)
      candidates.push(Object.freeze({ ...variable, valueMm, tokens: tokenizeVariable(variable.name) }))
    } catch (error) {
      rejected.push(Object.freeze({
        name: String(variable?.name ?? 'unnamed').slice(0, 64),
        expression: String(variable?.expression ?? '').slice(0, 64),
        reason: error?.code ?? 'UNSUPPORTED_QUANTITY',
      }))
    }
  }

  const rankedByRole = new Map(ROLE_DEFINITIONS.map((definition) => [
    definition.roleId,
    candidates
      .map((variable) => ({ variable, score: scoreVariable(variable, definition) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.variable.name.localeCompare(right.variable.name)),
  ]))

  // Highest-certainty assignments claim variables first, preventing one generic
  // name such as "holeDiameter" from filling multiple unrelated roles.
  const roleOrder = ROLE_DEFINITIONS
    .map((definition) => {
      const ranked = rankedByRole.get(definition.roleId)
      return {
        definition,
        score: ranked[0]?.score ?? 0,
        margin: (ranked[0]?.score ?? 0) - (ranked[1]?.score ?? 0),
      }
    })
    .sort((left, right) => right.score - left.score || right.margin - left.margin)

  const claimed = new Set()
  const mappings = []
  for (const { definition } of roleOrder) {
    const ranked = rankedByRole.get(definition.roleId)
    const available = ranked.filter((candidate) => !claimed.has(candidate.variable.name))
    const best = available[0]
    if (!best) continue
    const nextScore = available[1]?.score ?? 0
    const confidence = confidenceFor(best.score, best.score - nextScore)
    if (confidence === 'low') continue
    claimed.add(best.variable.name)
    mappings.push(Object.freeze({
      roleId: definition.roleId,
      variableName: best.variable.name,
      expression: best.variable.expression,
      valueMm: best.variable.valueMm,
      sourceFeatureId: best.variable.sourceFeatureId ?? null,
      score: best.score,
      confidence,
      alternatives: available.slice(1, 3).map((candidate) => Object.freeze({
        variableName: candidate.variable.name,
        score: candidate.score,
      })),
    }))
  }

  const mappedNames = new Set(mappings.map((mapping) => mapping.variableName))
  return Object.freeze({
    inventory: Object.freeze(candidates),
    mappings: Object.freeze(mappings.sort((left, right) => left.roleId.localeCompare(right.roleId))),
    unmapped: Object.freeze(candidates.filter((variable) => !mappedNames.has(variable.name))),
    rejected: Object.freeze(rejected),
    roleCount: ROLE_DEFINITIONS.length,
  })
}

export const DISCOVERY_ROLE_IDS = Object.freeze(ROLE_DEFINITIONS.map((definition) => definition.roleId))
