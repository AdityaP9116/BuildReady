/**
 * @typedef {object} FeatureRecord
 * @property {string} featureId
 * @property {string} featureType
 * @property {string} label
 * @property {Record<string, number>} dimensions
 * @property {boolean} selected
 * @property {string} objectReference
 * @property {string[]} applicableRuleIds
 * @property {string[]} highlightIds
 * @property {string} revisionProvenance
 */

/** @typedef {{ designId: string, revisionId: string, fixtureVersion: string, name: string, material: {id: string, label: string}, process: {id: string, label: string}, quantity: number, units: string, features: FeatureRecord[] }} DesignFixture */
/** @typedef {{ ruleId: string, version: string, title: string, severity: 'high'|'medium', featureId: string, calculation: object, consequence: string, recommendation: string, evidenceReferences: string[] }} RuleDefinition */
/** @typedef {{ findingId: string, ruleId: string, ruleVersion: string, title: string, severity: 'high'|'medium', featureId: string, observedMeasurements: object, threshold: object, calculation: string, consequence: string, recommendation: string, confidence: 'deterministic', evidenceReferences: string[], highlightIds: string[] }} Finding */
/** @typedef {{ proposalId: string, findingId: string, designId: string, baseRevisionId: string, status: string, changes: object[] }} Proposal */
/** @typedef {{ quoteId: string, supplierId: string, price: number, leadTimeDays: number, assumptions: string[], provenance: object }} SupplierQuote */
/** @typedef {{ packageId: string, designRef: string, findingIds: string[], decisionRecord: object, quoteIds: string[], auditEventIds: string[] }} ReviewPackage */
/** @typedef {{ eventId: string, actor: string, toolName: string, status: string, summary: string, timestamp: string }} AuditEvent */

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

async function loadDomainData() {
  const response = await fetch(new URL('./cnc-domain.json', import.meta.url))
  if (!response.ok) {
    throw new Error(`DOMAIN_LOAD_FAILED: ${response.status}`)
  }

  const data = await response.json()
  if (!data?.design?.features || !Array.isArray(data.rules) || data.rules.length !== 5) {
    throw new Error('DOMAIN_INVALID: expected one design fixture and five CNC rules.')
  }

  return deepFreeze(data)
}

export const DOMAIN_DATA = await loadDomainData()
/** @type {DesignFixture} */
export const DESIGN_FIXTURE = DOMAIN_DATA.design
/** @type {RuleDefinition[]} */
export const CNC_RULES = DOMAIN_DATA.rules
export const RULE_SET_VERSION = DOMAIN_DATA.ruleSetVersion
export const RULE_SET_SCOPE = DOMAIN_DATA.ruleSetScope
export const PROPOSAL_POLICY = DOMAIN_DATA.proposalPolicy
