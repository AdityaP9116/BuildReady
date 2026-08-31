import { gate3Handlers, setRegistrationState } from './state.js'

/** @typedef {{ signal?: AbortSignal }} ToolExecutionOptions */
/** @typedef {{ name: string, title: string, description: string, inputSchema: object, annotations: object, execute: Function }} WebMcpTool */
/** @typedef {{ name: string, title: string, description: string, inputSchema: string }} RegisteredTool */
/** @typedef {{ registerTool: (tool: WebMcpTool, options?: ToolExecutionOptions) => Promise<void>, getTools: () => Promise<RegisteredTool[]>, executeTool: (tool: RegisteredTool, input: object, options?: ToolExecutionOptions) => Promise<unknown> }} ModelContextApi */

/** @type {Document & { modelContext?: ModelContextApi }} */
const webMcpDocument = document

export const gate3Tools = Object.freeze([
  Object.freeze({
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
    execute: gate3Handlers.get_active_design_context,
  }),
  Object.freeze({
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
    execute: gate3Handlers.inspect_cnc_manufacturability,
  }),
])

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

  if (!webMcpAvailable() || route !== '/design') {
    return
  }

  const controller = new AbortController()
  registrationController = controller
  setRegistrationState('registering', 0)

  try {
    for (const tool of gate3Tools) {
      await webMcpDocument.modelContext.registerTool(tool, { signal: controller.signal })
    }

    if (!controller.signal.aborted) {
      setRegistrationState('ready', gate3Tools.length)
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

export async function executeGate3Tool(toolName, input = {}) {
  const definition = gate3Tools.find((tool) => tool.name === toolName)
  if (!definition) {
    throw new Error(`UNKNOWN_TOOL: ${toolName}`)
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

window.addEventListener('beforeunload', cleanupWebMcpTools, { once: true })
