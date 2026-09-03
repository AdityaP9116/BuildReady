import { activeDesign, activeDesignSource, activeSnapshotKey, gate7Handlers, setRegistrationState, workflowState } from './state.js?v=20260903-1'
import { PROPOSAL_POLICY } from './domain.js?v=20260903-1'
import { feaHandlers, feaState } from './fea-state.js?v=20260903-1'

/** @typedef {{ signal?: AbortSignal }} ToolExecutionOptions */
/** @typedef {{ name: string, title: string, description: string, inputSchema: object, annotations: object, execute: Function }} WebMcpTool */
/** @typedef {{ name: string, title: string, description: string, inputSchema: string }} RegisteredTool */
/** @typedef {{ registerTool: (tool: WebMcpTool, options?: ToolExecutionOptions) => Promise<void>, getTools: () => Promise<RegisteredTool[]>, executeTool: (tool: RegisteredTool, input: object, options?: ToolExecutionOptions) => Promise<unknown> }} ModelContextApi */

/** @type {Document & { modelContext?: ModelContextApi }} */
const webMcpDocument = document

function sourceIsExternal() {
  return activeDesignSource().sourceId === 'onshape-live'
}

function designContextTool() {
  const design = activeDesign()
  return Object.freeze({
  name: 'get_active_design_context',
  title: 'Get active design context',
  description: `Read the active ${activeDesignSource().label.toLowerCase()} ${design.designId}/${design.revisionId}, material, process, quantity, selected feature, source provenance, inspection state, and rule-set version.`,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: sourceIsExternal(),
  },
  execute: gate7Handlers.get_active_design_context,
})
}

function inspectionTool() {
  const design = activeDesign()
  return Object.freeze({
  name: 'inspect_cnc_manufacturability',
  title: 'Inspect CNC manufacturability',
  description: `Evaluate five deterministic CNC rules for ${design.designId} revision ${design.revisionId}. Returns severity counts, observed measurements, thresholds, stable finding IDs, and revision-bound evidence references.`,
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
    untrustedContentHint: sourceIsExternal(),
  },
  execute: gate7Handlers.inspect_cnc_manufacturability,
})
}

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
    execute: gate7Handlers.get_issue_details,
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
    execute: gate7Handlers.preview_radius_change,
  })
}

const onshapeDesignTool = Object.freeze({
  name: 'load_onshape_design',
  title: 'Load live Onshape design',
  description: 'Read the connected Onshape Part Studio and make its live variable measurements the active design. Discards any prior inspection because the geometry changed. Document text is untrusted external content.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: true,
  },
  execute: gate7Handlers.load_onshape_design,
})

const onshapeRevisionCheckTool = Object.freeze({
  name: 'check_onshape_revision',
  title: 'Check Onshape revision',
  description: 'Read the connected Part Studio and compare its current microversion with the active snapshot without discarding existing evidence.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: gate7Handlers.check_onshape_revision,
})

function onshapeRevisionActivationTool() {
  const candidate = workflowState.pendingDesignSnapshot
  return Object.freeze({
    name: 'activate_onshape_revision',
    title: 'Activate checked Onshape revision',
    description: 'Replace the active design with the checked Onshape revision. Any inspection, proposal, decision, quote, or review package for the previous revision is discarded.',
    inputSchema: {
      type: 'object',
      properties: {
        expectedCurrentRevisionId: {
          type: 'string',
          enum: [activeDesign().revisionId],
          description: 'The revision currently active in BuildReady.',
        },
        candidateRevisionId: {
          type: 'string',
          enum: candidate ? [candidate.design.revisionId] : [],
          description: 'The candidate returned by check_onshape_revision.',
        },
        discardDerivedEvidence: {
          type: 'boolean',
          description: 'Explicitly acknowledge that revision-bound derived evidence may be cleared.',
        },
      },
      required: ['expectedCurrentRevisionId', 'candidateRevisionId', 'discardDerivedEvidence'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    execute: gate7Handlers.activate_onshape_revision,
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
  execute: gate7Handlers.prepare_quote_comparison,
})

const reviewPackageTool = Object.freeze({
  name: 'generate_review_package',
  title: 'Generate review package',
  description: 'Validate the complete inspected, human-reviewed, simulated, and quoted workflow state, then create one visible evidence package with JSON and Markdown downloads.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 80,
        description: 'Optional display title for the evidence package.',
      },
    },
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: true,
  },
  execute: gate7Handlers.generate_review_package,
})

const prepareStaticStressStudyTool = Object.freeze({
  name: 'prepare_static_stress_study',
  title: 'Prepare static stress study',
  description: 'Validate and freeze a revision-bound linear-static force study. This creates a local draft only; it cannot approve CAD sharing, spend compute, or submit provider work.',
  inputSchema: {
    type: 'object',
    properties: {
      forceN: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 100000,
        description: 'Total applied force magnitude in newtons.',
      },
      direction: {
        type: 'array',
        items: { type: 'number', minimum: -1, maximum: 1 },
        minItems: 3,
        maxItems: 3,
        description: 'Normalized XYZ force direction vector.',
      },
      meshPreset: {
        type: 'string',
        enum: ['medium', 'fine'],
        description: 'Versioned second-order mesh preset.',
      },
      minimumSafetyFactor: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        description: 'Required minimum factor of safety.',
      },
      maximumDisplacementMm: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 1000,
        description: 'Allowed maximum displacement in millimeters.',
      },
    },
    required: ['forceN', 'direction', 'meshPreset', 'minimumSafetyFactor', 'maximumDisplacementMm'],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: sourceIsExternal(),
  },
  execute: feaHandlers.prepare_static_stress_study,
})

function emptyFeaTool(name, title, description, execute) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    execute,
  })
}

const getStaticStressStudyTool = emptyFeaTool(
  'get_static_stress_study',
  'Get static stress study',
  'Read the frozen manifest, lifecycle, currentness, and human-approval state for the active study.',
  feaHandlers.get_static_stress_study,
)
const getSimulationStatusTool = emptyFeaTool(
  'get_simulation_status',
  'Get simulation status',
  'Read provider job status after the visible human approval has submitted the exact frozen study.',
  feaHandlers.get_simulation_status,
)
const getSimulationResultsTool = emptyFeaTool(
  'get_simulation_results',
  'Get simulation results',
  'Read normalized solver evidence, verification state, metrics, limitations, and provider provenance for a completed study.',
  feaHandlers.get_simulation_results,
)
const compareSimulationRequirementsTool = emptyFeaTool(
  'compare_simulation_to_requirements',
  'Compare simulation to requirements',
  'Compare loaded evidence with the frozen safety-factor and displacement requirements. Recorded or unverified evidence returns unknown, never pass or fail.',
  feaHandlers.compare_simulation_to_requirements,
)

function simulationTools() {
  const tools = []
  if (feaState.capabilities && feaState.capabilities.provider !== 'disabled'
    && workflowState.designSource.sourceId !== 'onshape-live') tools.push(prepareStaticStressStudyTool)
  if (feaState.study) tools.push(getStaticStressStudyTool)
  if (feaState.study?.approval) tools.push(getSimulationStatusTool)
  if (feaState.study?.lifecycleState === 'COMPLETE') tools.push(getSimulationResultsTool)
  if (feaState.result) tools.push(compareSimulationRequirementsTool)
  return Object.freeze(tools)
}

export function gate7Tools(route = '/design') {
  if (workflowState.designSource.sourceId === 'onshape-live' && workflowState.sourceFreshness !== 'checked') {
    return Object.freeze([designContextTool(), onshapeRevisionCheckTool,
      ...(workflowState.pendingDesignSnapshot ? [onshapeRevisionActivationTool()] : [])])
  }
  if (route === '/simulation') return simulationTools()
  if (route === '/onshape-panel' && workflowState.supplierQuotes.length === 2) {
    return workflowState.reviewPackage
      ? Object.freeze([])
      : Object.freeze([reviewPackageTool])
  }
  if (route === '/suppliers') {
    return workflowState.supplierQuotes.length === 2 && !workflowState.reviewPackage
      ? Object.freeze([reviewPackageTool])
      : Object.freeze([])
  }
  if (!['/design', '/onshape-panel'].includes(route)) return Object.freeze([])
  const tools = [designContextTool(), inspectionTool()]
  // Offered only while nothing derived exists yet: loading a different design
  // discards findings, so the tool disappears once there is work to lose.
  if (workflowState.onshapeAvailable
    && workflowState.designSource.sourceId !== 'onshape-live'
    && workflowState.inspectionStatus !== 'complete') {
    tools.push(onshapeDesignTool)
  }
  if (workflowState.designSource.sourceId === 'onshape-live') {
    tools.push(onshapeRevisionCheckTool)
  }
  if (workflowState.pendingDesignSnapshot) {
    tools.push(onshapeRevisionActivationTool())
  }
  if (workflowState.inspectionStatus === 'complete' && workflowState.findings.length > 0) {
    tools.push(issueDetailsTool())
  }
  if (workflowState.inspectionStatus === 'complete'
    && workflowState.findings.some((finding) => finding.ruleId === PROPOSAL_POLICY.ruleId)
    && !workflowState.proposedChange) {
    tools.push(radiusPreviewTool())
  }
  if (route !== '/onshape-panel' && workflowState.inspectionStatus === 'complete'
    && ['approved', 'rejected'].includes(workflowState.decisionStatus)
    && workflowState.simulationEvidence?.lifecycleState === 'COMPLETE'
    && workflowState.simulationEvidence?.currentness === 'CURRENT'
    && workflowState.simulationEvidence?.snapshotKey === activeSnapshotKey()
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

  // The extension is cross-origin framed by Onshape. Keep WebMCP on the
  // standalone top-level route; embedded controls call the same handlers
  // directly and never depend on parent-frame tool discovery.
  if (!webMcpAvailable() || route === '/onshape-panel') {
    return
  }

  const controller = new AbortController()
  registrationController = controller
  const tools = gate7Tools(route)
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

export async function executeGate7Tool(toolName, input = {}) {
  const definition = gate7Tools(workflowState.activeRoute).find((tool) => tool.name === toolName)
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
