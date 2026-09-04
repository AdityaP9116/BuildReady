const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,48}$/

export function toolErrorEnvelope(error) {
  const prefixedCode = typeof error?.message === 'string'
    ? error.message.match(/^([A-Z][A-Z0-9_]{2,48}):/)?.[1]
    : null
  const code = CODE_PATTERN.test(error?.code) ? error.code : prefixedCode ?? 'INTERNAL_ERROR'
  const rawMessage = typeof error?.message === 'string' ? error.message : 'Tool execution failed.'
  const message = rawMessage.replace(/^[A-Z][A-Z0-9_]{2,48}:\s*/, '').slice(0, 300)
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code,
      message,
      retryable: Boolean(error?.retryable),
    }),
  })
}

export function attachToolErrorContract(error) {
  const envelope = toolErrorEnvelope(error)
  if (error && typeof error === 'object') {
    try {
      if (!CODE_PATTERN.test(error.code)) error.code = envelope.error.code
      if (typeof error.retryable !== 'boolean') error.retryable = envelope.error.retryable
      error.toolError = envelope.error
    } catch {
      // Native errors such as DOMException can expose read-only properties.
    }
  }
  return envelope
}
