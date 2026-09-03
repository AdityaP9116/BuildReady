import { revisionPrecondition, WorkflowRuleError } from './workflow-rules.js?v=20260903-3'

const response = await fetch(new URL('./supplier-fixtures.json', import.meta.url))
if (!response.ok) throw new Error(`SUPPLIER_FIXTURE_LOAD_FAILED: HTTP ${response.status}`)

export const SUPPLIER_FIXTURES = Object.freeze(await response.json())

/** Display-only placeholders, never attached to CAD/FEA or eligible as real offers. */
export function fictionalQuotePreview(quantity = 250) {
  if (!Number.isInteger(quantity) || !SUPPLIER_FIXTURES.supportedQuantities.includes(quantity)) {
    throw new WorkflowRuleError('UNSUPPORTED_QUANTITY', 'Choose a supported fictional demonstration quantity.')
  }
  return Object.freeze({ sourceKind: 'fictional_fixture', designMatch: 'unresolved',
    reviewStatus: 'not_supplier_evidence', simulationVerified: false, quantity,
    quotes: Object.freeze(SUPPLIER_FIXTURES.suppliers.map((supplier) => Object.freeze({
      supplierName: supplier.name, fictional: true, currency: supplier.currency,
      unitPrice: supplier.unitPrices[String(quantity)], setup: supplier.toolingCost,
      knownSubtotal: Number((supplier.unitPrices[String(quantity)] * quantity + supplier.toolingCost).toFixed(2)),
      shipping: null, tax: null, total: null, leadTimeDays: supplier.leadTimeDays,
      label: 'Illustrative placeholder — not priced for the active CAD and not a commercial offer',
    }))),
  })
}

function canonicalConfiguration({ fixture, proposal, decisionRecord, quantity }) {
  return [
    fixture.designId,
    fixture.revisionId,
    fixture.fixtureVersion,
    fixture.material.id,
    fixture.process.id,
    quantity,
    proposal.proposalId,
    proposal.after.insideRadiusMm,
    decisionRecord.decision,
    decisionRecord.revisionPrecondition,
  ].join('|')
}

export function configurationHash(configuration) {
  let hash = 0x811c9dc5
  for (let index = 0; index < configuration.length; index += 1) {
    hash ^= configuration.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`
}

export function prepareQuoteComparison({ fixture, proposal, decisionRecord, quantity }) {
  if (!proposal || !decisionRecord || !['approved', 'rejected'].includes(decisionRecord.decision)) {
    throw new WorkflowRuleError('DECISION_REQUIRED', 'record a visible human decision before preparing quotes.')
  }
  if (!Number.isInteger(quantity) || !SUPPLIER_FIXTURES.supportedQuantities.includes(quantity)) {
    throw new WorkflowRuleError(
      'UNSUPPORTED_QUANTITY',
      `quantity must be one of ${SUPPLIER_FIXTURES.supportedQuantities.join(', ')}.`,
    )
  }
  const currentPrecondition = revisionPrecondition(fixture)
  if (proposal.revisionPrecondition !== currentPrecondition
    || decisionRecord.revisionPrecondition !== currentPrecondition
    || decisionRecord.proposalId !== proposal.proposalId) {
    throw new WorkflowRuleError('STALE_PROPOSAL', 'the proposal or decision does not match the active revision.', true)
  }

  const hash = configurationHash(canonicalConfiguration({ fixture, proposal, decisionRecord, quantity }))
  const quotes = SUPPLIER_FIXTURES.suppliers.map((supplier) => {
    const unitPrice = supplier.unitPrices[String(quantity)]
    const partsSubtotal = Number((unitPrice * quantity).toFixed(2))
    return Object.freeze({
      quoteId: `${supplier.supplierId}-${quantity}-${hash}`,
      supplierId: supplier.supplierId,
      supplierName: supplier.name,
      fictional: supplier.fictional,
      currency: supplier.currency,
      quantity,
      unitPrice,
      partsSubtotal,
      toolingCost: supplier.toolingCost,
      totalPrice: Number((partsSubtotal + supplier.toolingCost).toFixed(2)),
      leadTimeDays: supplier.leadTimeDays,
      assumptions: Object.freeze([...supplier.assumptions]),
      dfmNotes: Object.freeze([...supplier.dfmNotes]),
      factors: Object.freeze({ ...supplier.factors }),
      configurationHash: hash,
    })
  })

  return Object.freeze({
    fixtureVersion: SUPPLIER_FIXTURES.schemaVersion,
    fixtureScope: SUPPLIER_FIXTURES.scope,
    revisionPrecondition: currentPrecondition,
    proposalId: proposal.proposalId,
    decision: decisionRecord.decision,
    configurationStatus: decisionRecord.decision === 'approved' ? 'approved_preview' : 'original_revision',
    configurationHash: hash,
    quantity,
    quotes: Object.freeze(quotes),
  })
}
