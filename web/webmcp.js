import { gate6Handlers, setRegistrationState, workflowState } from './state.js'
import { PROPOSAL_POLICY } from './domain.js'

/** @typedef {{ signal?: AbortSignal }} ToolExecutionOptions */
/** @typedef {{ name: string, title: string, description: string, inputSchema: object, annotations: object, execute: Function }} WebMcpTool */
/** @typedef {{ name: string, title: string, description: string, inputSchema: string }} RegisteredTool */
/** @typedef {{ registerTool: (tool: WebMcpTool, options?: ToolExecutionOptions) => Promise<void>, getTools: () => Promise<RegisteredTool[]>, executeTool: (tool: RegisteredTool, input: object, options?: ToolExecutionOptions) => Promise<unknown> }} ModelContextApi */

/** @type {Document & { modelContext?: ModelContextApi }} */
const webMcpDocument = document

const designContextTool = Object.freeze({
  name: 'get_active_design_context',
  title: 'Get active design context',
  description: 'Read the active controlled design fixture, revision, material, process, quantity, selected feature, preview state, inspection state, and rule-set version.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: gate6Handlers.get_active_design_context,
})

const inspectionTool = Object.freeze({
  name: 'inspect_cnc_manufacturability',
  title: 'Inspect CNC manufacturability',
  description: 'Evaluate five deterministic CNC rules for BRKT-001 revision B. Returns severity counts, observed measurements, thresholds, stable finding IDs, and fixture evidence references.',
  inputSchema: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        enum: ['all', 'high', 'medium'],
        description: 'Optional severity subset for the inspection response.',
      },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: gate6Handlers.inspect_cnc_manufacturability,
})

function issueDetailsTool() {
  return Object.freeze({
    name: 'get_issue_details',
    title: 'Get issue details',
    description: 'Explain one current CNC finding using deterministic measurements, threshold, calculation, consequence, recommendation, and its visible 3D highlight target.',
    inputSchema: {
      type: 'object',
      properties: {
        findingId: {
          type: 'string',
          enum: workflowState.findings.map((finding) => finding.findingId),
          description: 'A finding ID from the active inspection.',
        },
      },
      required: ['findingId'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    execute: gate6Handlers.get_issue_details,
  })
}

function radiusPreviewTool() {
  const cornerFinding = workflowState.findings.find((finding) => finding.ruleId === PROPOSAL_POLICY.ruleId)
  return Object.freeze({
    name: 'preview_radius_change',
    title: 'Preview radius change',
    description: 'Prepare a bounded, non-destructive inside-radius preview. This tool cannot approve or commit; only the visible human controls can record a decision.',
    inputSchema: {
      type: 'object',
      properties: {
        findingId: {
          type: 'string',
          enum: cornerFinding ? [cornerFinding.findingId] : [],
          description: 'The current internal-corner-radius finding ID.',
        },
        proposedRadiusMm: {
          type: 'number',
          minimum: PROPOSAL_POLICY.minimumRadiusMm,
          maximum: PROPOSAL_POLICY.maximumRadiusMm,
          description: 'Preview radius in millimeters within the allowed bounded range.',
        },
      },
      required: ['findingId', 'proposedRadiusMm'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: false,
    },
    execute: gate6Handlers.preview_radius_change,
  })
}

const quoteComparisonTool = Object.freeze({
  name: 'prepare_quote_comparison',
  title: 'Prepare quote comparison',
  description: 'Calculate two normalized quotes from controlled fictional supplier fixtures for the visibly reviewed design configuration. Full assumptions and DFM notes are untrusted supplier content shown on the page.',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: {
        type: 'integer',
        enum: [250, 500, 1000, 2500],
        description: 'Supported controlled production quantity.',
      },
    },
    required: ['quantity'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: gate6Handlers.prepare_quote_comparison,
})

export function gate6Tools(route = '/design') {
  if (route !== '/design') return Object.freeze([])
  const tools = [designContextTool, inspectionTool]
  if (workflowState.inspectionStatus === 'complete' && workflowState.findings.length > 0) {
    tools.push(issueDetailsTool())
  }
  if (workflowState.inspectionStatus === 'complete'
    && workflowState.findings.some((finding) => finding.ruleId === PROPOSAL_POLICY.ruleId)
    && !workflowState.proposedChange) {
    tools.push(radiusPreviewTool())
  }
  if (workflowState.inspectionStatus === 'complete'
    && ['approved', 'rejected'].includes(workflowState.decisionStatus)
    && workflowState.supplierQuotes.length === 0) {
    tools.push(quoteComparisonTool)
  }
  return Object.freeze(tools)
}

let registrationController = null

export function webMcpAvailable() {
  return Boolean(
    webMcpDocument.modelContext
    && typeof webMcpDocument.modelContext.registerTool === 'function',
  )
}

export function cleanupWebMcpTools() {
  registrationController?.abort()
  registrationController = null
  setRegistrationState(webMcpAvailable() ? 'inactive' : 'unsupported', 0)
}

export async function synchronizeWebMcpTools(route) {
  cleanupWebMcpTools()

  if (!webMcpAvailable()) {
    return
  }

  const controller = new AbortController()
  registrationController = controller
  const tools = gate6Tools(route)
  if (tools.length === 0) {
    setRegistrationState('inactive', 0)
    return
  }
  setRegistrationState('registering', 0)

  try {
    for (const tool of tools) {
      await webMcpDocument.modelContext.registerTool(tool, { signal: controller.signal })
    }

    if (!controller.signal.aborted) {
      setRegistrationState('ready', tools.length)
    }
  } catch (error) {
    controller.abort()

    if (registrationController === controller) {
      registrationController = null
    }

    if (error?.name !== 'AbortError') {
      console.error('BuildReady could not register its WebMCP tools.', error)
      setRegistrationState('failed', 0)
    }
  }
}

export async function executeGate6Tool(toolName, input = {}) {
  const definition = gate6Tools(workflowState.activeRoute).find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error(`TOOL_NOT_AVAILABLE: ${toolName}`)
  }

  if (!webMcpAvailable()) {
    return definition.execute(input, { signal: new AbortController().signal })
  }

  const registeredTools = await webMcpDocument.modelContext.getTools()
  const registeredTool = registeredTools.find((tool) => tool.name === toolName)
  if (!registeredTool) {
    throw new Error(`TOOL_NOT_REGISTERED: ${toolName}`)
  }

  return webMcpDocument.modelContext.executeTool(registeredTool, input)
}

window.addEventListener('buildready:toolavailabilitychange', () => {
  void synchronizeWebMcpTools(workflowState.activeRoute)
})
window.addEventListener('beforeunload', cleanupWebMcpTools, { once: true })
