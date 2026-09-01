/**
 * Browser side of the optional live Onshape source.
 *
 * Talks only to BuildReady's own same-origin proxy — never to Onshape directly.
 * The Onshape REST API does not serve browser origins and its credentials must
 * stay server-side, so `functions/api/onshape/design.js` is the only component
 * that holds them.
 */

import { mapOnshapeToDesign, OnshapeAdapterError } from './onshape-adapter.js'
import { DESIGN_FIXTURE } from './domain.js'

const REQUEST_TIMEOUT_MS = 10000

let sourceConfigPromise = null

function loadSourceConfig() {
  sourceConfigPromise ??= fetch(new URL('./onshape-source.json', import.meta.url))
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
    const response = await fetch(config.proxyEndpoint, {
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

  let response
  try {
    response = await fetch(config.proxyEndpoint, {
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

  try {
    // The fixture supplies context Onshape variables do not describe: material,
    // process, quantity, feature labels, and highlight targets.
    return mapOnshapeToDesign(payload, config, DESIGN_FIXTURE)
  } catch (error) {
    if (error instanceof OnshapeAdapterError) {
      throw new OnshapeSourceError(error.code, error.message, false)
    }
    throw error
  }
}
