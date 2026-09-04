/**
 * Validated Onshape extension context and client-messaging bridge.
 *
 * Onshape loads extension UIs in a cross-origin iframe and passes document
 * context through the Action URL. Query parameters and postMessage payloads are
 * untrusted until validated here. The server proxy independently validates and
 * authorizes the same identifiers; this module is not an authorization layer.
 */

const ID_PATTERN = /^[A-Za-z0-9]{8,40}$/
const MESSAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const KEEP_ALIVE_MS = 60000

export class OnshapeExtensionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`)
    this.name = 'OnshapeExtensionError'
    this.code = code
  }
}

function requiredId(params, name) {
  const value = params.get(name)
  if (!value || !ID_PATTERN.test(value)) {
    throw new OnshapeExtensionError('INVALID_ONSHAPE_CONTEXT', `${name} is missing or malformed.`)
  }
  return value
}

function validateServer(value, pageOrigin) {
  let server
  try {
    server = new URL(value)
  } catch {
    throw new OnshapeExtensionError('INVALID_ONSHAPE_SERVER', 'server must be an absolute URL.')
  }

  const localDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)
  if (server.protocol !== 'https:' && !(localDevelopment && pageOrigin.startsWith('http://'))) {
    throw new OnshapeExtensionError('INVALID_ONSHAPE_SERVER', 'server must use HTTPS.')
  }
  if (!localDevelopment && !server.hostname.endsWith('.onshape.com')) {
    throw new OnshapeExtensionError('INVALID_ONSHAPE_SERVER', 'server must be an Onshape origin.')
  }
  if (server.username || server.password || server.pathname !== '/' || server.search || server.hash) {
    throw new OnshapeExtensionError('INVALID_ONSHAPE_SERVER', 'server must contain only an origin.')
  }
  return server.origin
}

/** Parse and validate the Action URL context supplied by Onshape. */
export function parseOnshapeExtensionContext(url = window.location.href) {
  const parsed = new URL(url)
  const params = parsed.searchParams
  const workspaceOrVersion = params.get('workspaceOrVersion') ?? 'w'
  if (!['w', 'v'].includes(workspaceOrVersion)) {
    throw new OnshapeExtensionError(
      'INVALID_ONSHAPE_CONTEXT',
      'workspaceOrVersion must be "w" or "v".',
    )
  }

  const context = {
    documentId: requiredId(params, 'documentId'),
    workspaceOrVersion,
    workspaceOrVersionId: requiredId(params, 'workspaceOrVersionId'),
    elementId: requiredId(params, 'elementId'),
    serverOrigin: validateServer(params.get('server'), parsed.origin),
  }
  return Object.freeze(context)
}

export function isEmbeddedWindow(windowObject = window) {
  return windowObject.self !== windowObject.top
}

/**
 * Starts the documented Onshape applicationInit/keepAlive handshake.
 * Incoming messages are accepted only from the exact parent window and the
 * exact server origin passed in the validated Action URL.
 */
export function connectOnshapeExtension(
  context,
  { windowObject = window, onMessage = () => {} } = {},
) {
  if (!isEmbeddedWindow(windowObject)) {
    throw new OnshapeExtensionError(
      'ONSHAPE_FRAME_REQUIRED',
      'this route must be opened from an Onshape extension panel.',
    )
  }

  let visible = true
  let disposed = false
  const messageBase = {
    documentId: context.documentId,
    workspaceId: context.workspaceOrVersionId,
    elementId: context.elementId,
  }
  const send = (messageName, extra = {}) => {
    if (disposed) return
    windowObject.parent.postMessage({ ...messageBase, messageName, ...extra }, context.serverOrigin)
  }
  const handleMessage = (event) => {
    if (event.source !== windowObject.parent || event.origin !== context.serverOrigin) return
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return
    if (!MESSAGE_NAME_PATTERN.test(event.data.messageName ?? '')) return
    if (event.data.messageName === 'show') visible = true
    if (event.data.messageName === 'hide') visible = false
    onMessage(Object.freeze({ ...event.data }))
  }

  windowObject.addEventListener('message', handleMessage)
  send('applicationInit')
  const keepAlive = windowObject.setInterval(() => {
    if (visible) send('keepAlive')
  }, KEEP_ALIVE_MS)

  return Object.freeze({
    send,
    dispose() {
      if (disposed) return
      disposed = true
      windowObject.clearInterval(keepAlive)
      windowObject.removeEventListener('message', handleMessage)
    },
  })
}

/** Only the identifiers required by the same-origin read proxy are forwarded. */
export function onshapeProxySearchParams(context) {
  return new URLSearchParams({
    documentId: context.documentId,
    workspaceOrVersion: context.workspaceOrVersion,
    workspaceOrVersionId: context.workspaceOrVersionId,
    elementId: context.elementId,
  })
}
