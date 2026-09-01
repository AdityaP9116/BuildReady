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
const MAX_VARIABLES = 40
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
let cachedResponse = null
let inFlight = null

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

function failure(code, message, status) {
  return jsonResponse({ ok: false, error: { code, message, retryable: status >= 500 } }, status)
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
      found.push({ name, expression: expression.slice(0, MAX_NAME_LENGTH) })
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
          throw Object.assign(new Error('Onshape response too large'), { status: 413, fatal: true })
        }

        const text = await response.text()
        if (text.length > MAX_RESPONSE_BYTES) {
          throw Object.assign(new Error('Onshape response too large'), { status: 413, fatal: true })
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

export async function onRequestGet({ env }) {
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

  const documentId = env.ONSHAPE_DOCUMENT_ID
  const workspaceId = env.ONSHAPE_WORKSPACE_ID
  const elementId = env.ONSHAPE_ELEMENT_ID
  if (![documentId, workspaceId, elementId].every((id) => ID_PATTERN.test(id))) {
    return failure('ONSHAPE_NOT_CONFIGURED', 'The configured Onshape identifiers are malformed.', 503)
  }

  if (cachedResponse && Date.now() - cachedResponse.storedAt < CACHE_TTL_MS) {
    return jsonResponse({ ...cachedResponse.payload, cached: true })
  }

  // Concurrent callers share one upstream read rather than racing it.
  inFlight ??= readDesign(env, documentId, workspaceId, elementId).finally(() => {
    inFlight = null
  })

  try {
    const payload = await inFlight
    cachedResponse = { payload, storedAt: Date.now() }
    return jsonResponse(payload)
  } catch (error) {
    if (error?.code) return failure(error.code, error.message, error.httpStatus ?? 502)
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return failure('ONSHAPE_TIMEOUT', 'Onshape did not respond in time.', 504)
    }
    if (error?.status === 401 || error?.status === 403) {
      return failure('ONSHAPE_UNAUTHORIZED', 'BuildReady is not authorized for this document.', 502)
    }
    if (error?.status === 404) {
      return failure('ONSHAPE_NOT_FOUND', 'The configured Onshape element was not found.', 502)
    }
    return failure('ONSHAPE_UNAVAILABLE', 'The live Onshape source is unavailable.', 502)
  }
}

async function readDesign(env, documentId, workspaceId, elementId) {
  const scope = `/d/${documentId}/w/${workspaceId}/e/${elementId}`
  const [features, metadata] = await Promise.all([
    onshapeGet(`/api/v6/partstudios${scope}/features`, env),
    onshapeGet(`/api/v6/documents/${documentId}`, env),
  ])

  const variables = collectVariables(features?.features ?? features, [])
  if (variables.length === 0) {
    throw Object.assign(new Error('The configured Part Studio exposes no named variables.'), {
      code: 'ONSHAPE_NO_VARIABLES',
      httpStatus: 502,
    })
  }

  return {
    ok: true,
    source: 'onshape-live',
    document: {
      documentId,
      workspaceId,
      elementId,
      // Externally authored text. Bounded here and treated as untrusted downstream.
      name: String(metadata?.name ?? 'Onshape document').slice(0, 120),
      modifiedAt: typeof metadata?.modifiedAt === 'string' ? metadata.modifiedAt : null,
      href: `${env.ONSHAPE_BASE_URL || DEFAULT_BASE_URL}/documents/${documentId}/w/${workspaceId}/e/${elementId}`,
    },
    // Onshape increments this on every model change; BuildReady uses it as the
    // revision precondition so stale inspections can be detected.
    microversionId: typeof features?.microversionId === 'string' ? features.microversionId : null,
    serializationVersion: typeof features?.serializationVersion === 'string'
      ? features.serializationVersion
      : null,
    variables,
    retrievedAt: new Date().toISOString(),
  }
}
