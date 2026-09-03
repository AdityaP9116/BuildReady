import {
  activeDesign,
  gate7Handlers,
  workflowState,
} from './state.js?v=20260903-1'
import { PROPOSAL_POLICY } from './domain.js?v=20260903-1'
import {
  classifyInsightQuery,
  composeInsightResponse,
  suggestedInsightQuestions,
  transcriptMarkdown,
} from './insight-engine.js?v=20260903-1'
import { toolErrorEnvelope } from './error-contract.js?v=20260903-1'

const MAX_MESSAGES = 40
// Version persisted conversations so a deployment never restores answers made
// under an older completeness or wording contract.
const TRANSCRIPT_SCHEMA_VERSION = '2'
const STORAGE_PREFIX = `buildready:model-insight:v${TRANSCRIPT_SCHEMA_VERSION}:`

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function availableSessionStorage() {
  try {
    const storage = window.sessionStorage
    // Merely accessing sessionStorage can succeed while operations are blocked
    // in a third-party iframe, so perform a harmless capability probe.
    const key = `${STORAGE_PREFIX}probe`
    storage.setItem(key, '1')
    storage.removeItem(key)
    return storage
  } catch {
    return memoryStorage()
  }
}

function snapshot() {
  return {
    design: activeDesign(),
    workflow: workflowState,
    provenance: workflowState.designSource.provenance,
  }
}

function contextKey() {
  const design = activeDesign()
  const revision = workflowState.designSource.provenance?.microversionId ?? design.revisionId
  return `${STORAGE_PREFIX}${design.designId}:${revision}`
}

function message(role, text, extra = {}) {
  return Object.freeze({
    messageId: `insight-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    text: String(text).slice(0, 4000),
    timestamp: new Date().toISOString(),
    intent: extra.intent ?? null,
    citations: Object.freeze(extra.citations ?? []),
    followUps: Object.freeze(extra.followUps ?? []),
  })
}

function sanitizedStoredMessage(item) {
  const citations = Array.isArray(item.citations)
    ? item.citations.slice(0, 20).map((citation) => ({
      label: String(citation?.label ?? 'evidence').slice(0, 120),
      reference: String(citation?.reference ?? '').slice(0, 500),
    }))
    : []
  const followUps = Array.isArray(item.followUps)
    ? item.followUps.slice(0, 6).map((value) => String(value).slice(0, 160))
    : []
  return Object.freeze({
    messageId: String(item.messageId ?? `restored-${Date.now()}`).slice(0, 120),
    role: item.role,
    text: String(item.text).slice(0, 4000),
    timestamp: String(item.timestamp ?? new Date().toISOString()).slice(0, 64),
    intent: typeof item.intent === 'string' ? item.intent.slice(0, 64) : null,
    citations: Object.freeze(citations),
    followUps: Object.freeze(followUps),
  })
}

function welcomeMessage() {
  const design = activeDesign()
  const live = workflowState.designSource.sourceId === 'onshape-live'
  return message(
    'assistant',
    `I’m ready to help with ${design.name}${live ? ' in the active Part Studio' : ''}. Run the manufacturing check, ask about a finding, or ask how a dimension was recognized. BuildReady is read-only and does not change your CAD.`,
    { intent: 'welcome', followUps: suggestedInsightQuestions(snapshot()) },
  )
}

export class ModelInsightAssistant {
  constructor(storage = null) {
    this.storage = storage ?? availableSessionStorage()
    this.context = ''
    this.messages = []
    this.busy = false
    this.abortController = null
    this.allowContextTransition = false
    this.syncContext()
  }

  syncContext() {
    const nextContext = contextKey()
    if (nextContext === this.context) return false
    if (!this.allowContextTransition) this.abortController?.abort()
    this.context = nextContext
    this.messages = this.load() ?? [welcomeMessage()]
    this.persist()
    return true
  }

  load() {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.context) ?? 'null')
      if (parsed?.schemaVersion !== TRANSCRIPT_SCHEMA_VERSION || !Array.isArray(parsed.messages)) return null
      return parsed.messages.slice(-MAX_MESSAGES).filter((item) => (
        item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string'
      )).map(sanitizedStoredMessage)
    } catch {
      return null
    }
  }

  persist() {
    try {
      this.storage.setItem(this.context, JSON.stringify({
        schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
        messages: this.messages.slice(-MAX_MESSAGES),
      }))
    } catch {
      // Conversation persistence is a convenience; storage failure never blocks inspection.
    }
  }

  add(nextMessage) {
    this.messages = [...this.messages, nextMessage].slice(-MAX_MESSAGES)
    this.persist()
  }

  clear() {
    this.abortController?.abort()
    this.busy = false
    this.messages = [welcomeMessage()]
    this.persist()
  }

  stop() {
    this.abortController?.abort()
  }

  suggestions() {
    return suggestedInsightQuestions(snapshot())
  }

  markdown() {
    return transcriptMarkdown(this.messages, snapshot())
  }

  json() {
    const design = activeDesign()
    return JSON.stringify({
      schemaVersion: '1.0.0',
      design: { designId: design.designId, revisionId: design.revisionId, name: design.name },
      microversionId: workflowState.designSource.provenance?.microversionId ?? null,
      exportedAt: new Date().toISOString(),
      messages: this.messages,
      disclaimer: 'Demonstration DFM guidance only; not production manufacturing approval.',
    }, null, 2)
  }

  async runTool(name, input, signal) {
    const handler = gate7Handlers[name]
    if (!handler) throw new Error(`INSIGHT_TOOL_UNAVAILABLE: ${name}`)
    return handler(input, { signal })
  }

  async prepareIntent(intent, signal) {
    if (intent.kind === 'live_source'
      && workflowState.onshapeAvailable
      && workflowState.designSource.sourceId !== 'onshape-live'
      && workflowState.inspectionStatus !== 'complete') {
      this.allowContextTransition = true
      try {
        await this.runTool('load_onshape_design', {}, signal)
      } finally {
        this.allowContextTransition = false
      }
    }

    const inspectionKinds = new Set(['inspect', 'risks', 'explain', 'recommendations', 'preview'])
    if (inspectionKinds.has(intent.kind) && workflowState.inspectionStatus !== 'complete') {
      await this.runTool('inspect_cnc_manufacturability', { severity: 'all' }, signal)
    }

    if (intent.kind === 'explain' && workflowState.findings.length) {
      const finding = workflowState.findings.find((item) => item.featureId === intent.featureId)
        ?? workflowState.findings.find((item) => item.findingId === workflowState.selectedFindingId)
        ?? workflowState.findings[0]
      if (finding) {
        await this.runTool('get_issue_details', { findingId: finding.findingId }, signal)
      }
    }

    if (intent.kind === 'preview' && !workflowState.proposedChange) {
      const finding = workflowState.findings.find((item) => item.ruleId === PROPOSAL_POLICY.ruleId)
      if (finding) {
        await this.runTool('preview_radius_change', {
          findingId: finding.findingId,
          proposedRadiusMm: intent.proposedRadiusMm ?? PROPOSAL_POLICY.recommendedRadiusMm,
        }, signal)
      }
    }

    if (intent.kind === 'suppliers'
      && ['approved', 'rejected'].includes(workflowState.decisionStatus)
      && workflowState.supplierQuotes.length === 0) {
      const supportedQuantities = [250, 500, 1000, 2500]
      if (intent.quantity !== null && !supportedQuantities.includes(intent.quantity)) return
      const quantity = supportedQuantities.includes(intent.quantity) ? intent.quantity : activeDesign().quantity
      await this.runTool('prepare_quote_comparison', { quantity }, signal)
    }

    if (intent.kind === 'package'
      && workflowState.supplierQuotes.length === 2
      && !workflowState.reviewPackage) {
      await this.runTool('generate_review_package', {
        title: `${activeDesign().designId}-${activeDesign().revisionId} Manufacturing Review`,
      }, signal)
    }
  }

  async ask(rawQuery) {
    this.syncContext()
    if (this.busy) return null
    const intent = classifyInsightQuery(rawQuery)
    const userMessage = intent.kind !== 'empty' ? message('user', intent.query, { intent: intent.kind }) : null
    if (userMessage) this.add(userMessage)
    const initialContext = this.context
    this.busy = true
    this.abortController = new AbortController()

    try {
      await this.prepareIntent(intent, this.abortController.signal)
      this.syncContext()
      if (userMessage && this.context !== initialContext
        && !this.messages.some((item) => item.messageId === userMessage.messageId)) {
        this.add(userMessage)
      }
      const reply = composeInsightResponse(intent, snapshot())
      const assistantMessage = message('assistant', reply.text, reply)
      this.add(assistantMessage)
      return assistantMessage
    } catch (error) {
      if (error?.name === 'AbortError') {
        const stopped = message('assistant', 'The request was stopped. No additional workflow action was taken.', { intent: 'stopped' })
        this.add(stopped)
        return stopped
      }
      const envelope = toolErrorEnvelope(error)
      const failed = message(
        'assistant',
        `I couldn’t complete that grounded action: ${envelope.error.message}${envelope.error.retryable ? ' You can retry it.' : ''}`,
        { intent: 'error', followUps: suggestedInsightQuestions(snapshot()) },
      )
      this.add(failed)
      return failed
    } finally {
      this.busy = false
      this.abortController = null
    }
  }
}

export function createModelInsightAssistant(storage) {
  return new ModelInsightAssistant(storage)
}
