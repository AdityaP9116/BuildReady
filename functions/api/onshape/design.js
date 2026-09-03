/**
 * Read-only Onshape proxy for BuildReady.
 *
 * BuildReady is a static page, so it cannot call Onshape directly: the Onshape
 * REST API does not serve browser origins, and an API secret must never reach a
 * client. This function is the only component that holds credentials.
 *
 * It is deliberately not a pass-through. It resolves exactly one configured
 * Part Studio, reads its feature list, extracts the named variables BuildReady
 * understands, and returns a small sanitized payload. No caller-supplied path,
 * document, or query reaches Onshape.
 *
 * Required environment bindings (Cloudflare secrets):
 *   ONSHAPE_ACCESS_KEY, ONSHAPE_SECRET_KEY,
 *   ONSHAPE_DOCUMENT_ID, ONSHAPE_WORKSPACE_ID, ONSHAPE_ELEMENT_ID
 * Optional:
 *   ONSHAPE_BASE_URL (defaults to https://cad.onshape.com)
 */

const DEFAULT_BASE_URL = 'https://cad.onshape.com'
const REQUEST_TIMEOUT_MS = 8000
const MAX_VARIABLES = 100
const MAX_NAME_LENGTH = 64
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 250
const CACHE_TTL_MS = 15000

/** Onshape ids are opaque hex-ish strings; refuse anything else before building a URL. */
const ID_PATTERN = /^[A-Za-z0-9]{8,40}$/

/** Transient upstream conditions worth a retry. Everything else fails fast. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Isolate-local response cache with single-flight coalescing.
 *
 * The Onshape model changes rarely relative to how often an agent may re-read
 * it, and Onshape enforces per-account rate limits. Caching briefly keeps a
 * chatty agent from exhausting the quota, and coalescing means concurrent
 * viewers share one upstream call instead of racing.
 */
const cachedResponses = new Map()
const inFlightReads = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function failure(code, message, status, retryable = false) {
  return jsonResponse({ ok: false, error: { code, message, retryable } }, status)
}

/**
 * Walks an Onshape feature-list parameter tree collecting `{ name, expression }`
 * pairs from assignVariable features. The tree is walked structurally rather
 * than by btType version, so Onshape schema revisions do not break extraction.
 */
function collectVariables(node, found, depth = 0) {
  if (depth > 12 || found.length >= MAX_VARIABLES || !node || typeof node !== 'object') return found

  if (Array.isArray(node)) {
    for (const item of node) collectVariables(item, found, depth + 1)
    return found
  }

  if (Array.isArray(node.parameters)) {
    let name = null
    let expression = null
    for (const parameter of node.parameters) {
      if (!parameter || typeof parameter !== 'object') continue
      if (parameter.parameterId === 'name' && typeof parameter.value === 'string') {
        name = parameter.value
      }
      if (parameter.parameterId === 'value' && typeof parameter.expression === 'string') {
        expression = parameter.expression
      }
    }
    if (name && expression && name.length <= MAX_NAME_LENGTH) {
      found.push({
        name,
        expression: expression.slice(0, MAX_NAME_LENGTH),
        sourceFeatureId: typeof node.featureId === 'string' ? node.featureId.slice(0, MAX_NAME_LENGTH) : null,
        sourceFeatureName: typeof node.name === 'string' ? node.name.slice(0, MAX_NAME_LENGTH) : null,
      })
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectVariables(value, found, depth + 1)
  }
  return found
}

/**
 * One authenticated read, with bounded retries on transient upstream failures.
 *
 * Each attempt gets its own timeout so a single stalled connection cannot
 * consume the whole budget. A 429 honours Retry-After when Onshape supplies a
 * sane one, otherwise exponential backoff applies.
 */
async function onshapeGet(path, env) {
  const baseUrl = env.ONSHAPE_BASE_URL || DEFAULT_BASE_URL
  const credentials = btoa(`${env.ONSHAPE_ACCESS_KEY}:${env.ONSHAPE_SECRET_KEY}`)
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: 'application/json;charset=UTF-8; qs=0.09',
        },
      })

      if (response.ok) {
        const declaredLength = Number(response.headers.get('content-length') ?? 0)
        if (declaredLength > MAX_RESPONSE_BYTES) {
          throw Object.assign(new Error('The Onshape response exceeded the configured size limit.'), {
            code: 'ONSHAPE_RESPONSE_TOO_LARGE', httpStatus: 502, retryable: false, fatal: true,
          })
        }

        const text = await response.text()
        if (text.length > MAX_RESPONSE_BYTES) {
          throw Object.assign(new Error('The Onshape response exceeded the configured size limit.'), {
            code: 'ONSHAPE_RESPONSE_TOO_LARGE', httpStatus: 502, retryable: false, fatal: true,
          })
        }
        try {
          return JSON.parse(text)
        } catch {
          // A body that is not JSON means an interception or an outage page,
          // never a model. Retrying can legitimately recover from that.
          throw Object.assign(new Error('Onshape returned a non-JSON body'), { status: 502 })
        }
      }

      lastError = Object.assign(new Error(`Onshape responded ${response.status}`), {
        status: response.status,
      })
      if (!RETRYABLE_STATUS.has(response.status)) throw lastError

      if (attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(response.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 5
          ? retryAfter * 1000
          : BACKOFF_BASE_MS * 2 ** (attempt - 1)
        await sleep(waitMs)
      }
    } catch (error) {
      if (error?.fatal || error?.status === 401 || error?.status === 403 || error?.status === 404) {
        throw error
      }
      lastError = error
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1))
    }
  }

  throw lastError ?? new Error('Onshape request failed')
}

function configuredContext(env, request) {
  const url = new URL(request.url)
  const supplied = ['documentId', 'workspaceOrVersion', 'workspaceOrVersionId', 'elementId']
    .some((name) => url.searchParams.has(name))

  if (!supplied) {
    return {
      documentId: env.ONSHAPE_DOCUMENT_ID,
      workspaceOrVersion: 'w',
      workspaceOrVersionId: env.ONSHAPE_WORKSPACE_ID,
      elementId: env.ONSHAPE_ELEMENT_ID,
    }
  }

  const context = {
    documentId: url.searchParams.get('documentId'),
    workspaceOrVersion: url.searchParams.get('workspaceOrVersion'),
    workspaceOrVersionId: url.searchParams.get('workspaceOrVersionId'),
    elementId: url.searchParams.get('elementId'),
  }
  if (![context.documentId, context.workspaceOrVersionId, context.elementId].every(
    (id) => typeof id === 'string' && ID_PATTERN.test(id),
  ) || !['w', 'v'].includes(context.workspaceOrVersion)) {
    throw Object.assign(new Error('The Onshape extension context is malformed.'), {
      code: 'ONSHAPE_BAD_CONTEXT',
      httpStatus: 400,
    })
  }

  // The browser controls context selection but never authorization. API-key
  // deployments must explicitly allow every document the extension can read.
  const allowedDocuments = new Set([
    env.ONSHAPE_DOCUMENT_ID,
    ...(env.ONSHAPE_ALLOWED_DOCUMENT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean),
  ])
  if (!allowedDocuments.has(context.documentId)) {
    throw Object.assign(new Error('This Onshape document is not allowed for this deployment.'), {
      code: 'ONSHAPE_CONTEXT_FORBIDDEN',
      httpStatus: 403,
    })
  }
  return context
}

export async function onRequestGet({ env, request }) {
  const required = [
    'ONSHAPE_ACCESS_KEY',
    'ONSHAPE_SECRET_KEY',
    'ONSHAPE_DOCUMENT_ID',
    'ONSHAPE_WORKSPACE_ID',
    'ONSHAPE_ELEMENT_ID',
  ]
  const missing = required.filter((name) => !env[name])
  if (missing.length > 0) {
    return failure('ONSHAPE_NOT_CONFIGURED', 'The live Onshape source is not configured.', 503)
  }

  let context
  try {
    context = configuredContext(env, request)
  } catch (error) {
    return failure(error.code, error.message, error.httpStatus)
  }
  const { documentId, workspaceOrVersion, workspaceOrVersionId, elementId } = context
  if (![documentId, workspaceOrVersionId, elementId].every((id) => ID_PATTERN.test(id))) {
    return failure('ONSHAPE_NOT_CONFIGURED', 'The configured Onshape identifiers are malformed.', 503)
  }
  const cacheKey = [
    env.ONSHAPE_BASE_URL || DEFAULT_BASE_URL,
    documentId,
    workspaceOrVersion,
    workspaceOrVersionId,
    elementId,
  ].join('|')
  const cachedResponse = cachedResponses.get(cacheKey)
  if (cachedResponse && Date.now() - cachedResponse.storedAt < CACHE_TTL_MS) {
    return jsonResponse({ ...cachedResponse.payload, cached: true })
  }

  // Concurrent callers share one upstream read rather than racing it.
  if (!inFlightReads.has(cacheKey)) {
    inFlightReads.set(
      cacheKey,
      readDesign(env, context).finally(() => inFlightReads.delete(cacheKey)),
    )
  }

  try {
    const payload = await inFlightReads.get(cacheKey)
    cachedResponses.set(cacheKey, { payload, storedAt: Date.now() })
    return jsonResponse(payload)
  } catch (error) {
    if (error?.code) {
      return failure(error.code, error.message, error.httpStatus ?? 502, Boolean(error.retryable))
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return failure('ONSHAPE_TIMEOUT', 'Onshape did not respond in time.', 504, true)
    }
    if (error?.status === 401 || error?.status === 403) {
      return failure('ONSHAPE_UNAUTHORIZED', 'BuildReady is not authorized for this document.', 502)
    }
    if (error?.status === 404) {
      return failure('ONSHAPE_NOT_FOUND', 'The configured Onshape element was not found.', 502)
    }
    return failure('ONSHAPE_UNAVAILABLE', 'The live Onshape source is unavailable.', 502, true)
  }
}

async function readDesign(env, context) {
  const { documentId, workspaceOrVersion, workspaceOrVersionId, elementId } = context
  const scope = `/d/${documentId}/${workspaceOrVersion}/${workspaceOrVersionId}/e/${elementId}`
  const microversionPath = workspaceOrVersion === 'w'
    ? `/api/v6/documents/d/${documentId}/w/${workspaceOrVersionId}/currentmicroversion`
    : `/api/v6/documents/d/${documentId}/versions?offset=0&limit=0`
  const [features, metadata] = await Promise.all([
    onshapeGet(`/api/v6/partstudios${scope}/features`, env),
    onshapeGet(`/api/v6/documents/${documentId}`, env),
  ])
  const microversionPayload = features?.microversionId
    ? null
    : await onshapeGet(microversionPath, env)

  const variables = collectVariables(features?.features ?? features, [])
  if (variables.length === 0) {
    throw Object.assign(new Error('The configured Part Studio exposes no named variables.'), {
      code: 'ONSHAPE_NO_VARIABLES',
      httpStatus: 502,
      retryable: false,
    })
  }

  const selectedVersion = workspaceOrVersion === 'v' && Array.isArray(microversionPayload)
    ? microversionPayload.find((version) => version?.id === workspaceOrVersionId)
    : null
  const microversionId = features?.microversionId
    ?? (workspaceOrVersion === 'w' ? microversionPayload?.microversion : selectedVersion?.microversion)
  if (typeof microversionId !== 'string' || !ID_PATTERN.test(microversionId)) {
    throw Object.assign(new Error('Onshape did not identify the current model revision.'), {
      code: 'ONSHAPE_NO_MICROVERSION',
      httpStatus: 502,
    })
  }

  return {
    ok: true,
    source: 'onshape-live',
    document: {
      documentId,
      workspaceId: workspaceOrVersion === 'w' ? workspaceOrVersionId : null,
      versionId: workspaceOrVersion === 'v' ? workspaceOrVersionId : null,
      workspaceOrVersion,
      workspaceOrVersionId,
      elementId,
      // Externally authored text. Bounded here and treated as untrusted downstream.
      name: String(metadata?.name ?? 'Onshape document').slice(0, 120),
      modifiedAt: typeof metadata?.modifiedAt === 'string' ? metadata.modifiedAt : null,
      href: `${env.ONSHAPE_BASE_URL || DEFAULT_BASE_URL}/documents/${documentId}/${workspaceOrVersion}/${workspaceOrVersionId}/e/${elementId}`,
    },
    // Onshape increments this on every model change; BuildReady uses it as the
    // revision precondition so stale inspections can be detected.
    microversionId,
    serializationVersion: typeof features?.serializationVersion === 'string'
      ? features.serializationVersion
      : null,
    variables,
    featureSummary: (Array.isArray(features?.features) ? features.features : [])
      .slice(0, 100)
      .map((feature) => ({
        featureId: typeof feature?.featureId === 'string' ? feature.featureId.slice(0, 64) : null,
        featureType: typeof feature?.featureType === 'string' ? feature.featureType.slice(0, 48) : 'unknown',
        name: typeof feature?.name === 'string' ? feature.name.slice(0, 80) : 'Unnamed feature',
        suppressed: Boolean(feature?.suppressed),
      })),
    retrievedAt: new Date().toISOString(),
  }
}
