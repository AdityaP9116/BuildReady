/**
 * Browser side of the optional live Onshape source.
 *
 * Talks only to BuildReady's own same-origin proxy — never to Onshape directly.
 * The Onshape REST API does not serve browser origins and its credentials must
 * stay server-side, so `functions/api/onshape/design.js` is the only component
 * that holds them.
 */

import { mapOnshapeToDesign, OnshapeAdapterError } from './onshape-adapter.js?v=20260903-2'
import { DESIGN_FIXTURE } from './domain.js?v=20260903-2'
import { onshapeProxySearchParams } from './onshape-extension.js?v=20260903-2'

const REQUEST_TIMEOUT_MS = 10000

let sourceConfigPromise = null
let extensionContext = null

export function configureOnshapeExtensionContext(context) {
  extensionContext = context
}

function proxyUrl(config) {
  const url = new URL(config.proxyEndpoint, window.location.origin)
  if (extensionContext) url.search = onshapeProxySearchParams(extensionContext).toString()
  return url
}

function loadSourceConfig() {
  sourceConfigPromise ??= fetch(new URL('./onshape-source.json?v=20260903-2', import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error(`ONSHAPE_CONFIG_UNAVAILABLE: ${response.status}`)
      return response.json()
    })
  return sourceConfigPromise
}

class OnshapeSourceError extends Error {
  constructor(code, message, retryable = false) {
    super(message)
    this.name = 'OnshapeSourceError'
    this.code = code
    this.retryable = retryable
  }
}

/**
 * Reports whether the live source is configured on this deployment, so the UI
 * and tool registration can hide it rather than offering a control that fails.
 */
export async function onshapeSourceAvailable() {
  try {
    const config = await loadSourceConfig()
    const response = await fetch(proxyUrl(config), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Fetches the live Part Studio and maps it onto the design contract the
 * deterministic rule engine already consumes.
 *
 * @param {AbortSignal} [signal] execution signal from the calling WebMCP tool.
 */
export async function fetchOnshapeDesign(signal) {
  const config = await loadSourceConfig()
  const requestedContext = extensionContext ? { ...extensionContext } : null

  let response
  try {
    response = await fetch(proxyUrl(config), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new OnshapeSourceError('ONSHAPE_UNREACHABLE', 'the Onshape source could not be reached.', true)
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.ok) {
    const code = payload?.error?.code ?? 'ONSHAPE_UNAVAILABLE'
    throw new OnshapeSourceError(
      code,
      payload?.error?.message ?? 'the live Onshape source is unavailable.',
      Boolean(payload?.error?.retryable),
    )
  }

  if (requestedContext && Object.entries(onshapeProxyContext(payload.document)).some(
    ([key, value]) => value !== requestedContext[key],
  )) {
    throw new OnshapeSourceError('ONSHAPE_CONTEXT_MISMATCH', 'The response does not match the selected Part Studio. No design was activated.')
  }

  try {
    // The fixture supplies optional visual metadata only. The adapter explicitly
    // leaves live material, process review and production quantity unspecified.
    return mapOnshapeToDesign(payload, config, DESIGN_FIXTURE)
  } catch (error) {
    if (error instanceof OnshapeAdapterError) {
      throw new OnshapeSourceError(error.code, error.message, false)
    }
    throw error
  }
}

function onshapeProxyContext(document) {
  return {
    documentId: document?.documentId,
    workspaceOrVersion: document?.workspaceOrVersion ?? (document?.versionId ? 'v' : 'w'),
    workspaceOrVersionId: document?.workspaceOrVersionId ?? document?.versionId ?? document?.workspaceId,
    elementId: document?.elementId,
  }
}
