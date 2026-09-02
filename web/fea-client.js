const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' })

export class FeaClientError extends Error {
  constructor(code, message, retryable = false, status = 0) {
    super(message)
    this.name = 'FeaClientError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
      cache: 'no-store',
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new FeaClientError('FEA_SERVICE_UNREACHABLE', 'The FEA service could not be reached.', true)
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) {
    throw new FeaClientError(
      payload?.error?.code ?? 'FEA_SERVICE_ERROR',
      payload?.error?.message ?? 'The FEA service returned an invalid response.',
      payload?.error?.retryable === true,
      response.status,
    )
  }
  return payload
}

export const getFeaCapabilities = (signal) => request('/api/fea/capabilities', { signal })
export const postFeaStudy = (manifest, signal) => request('/api/fea/studies', { method: 'POST', body: manifest, signal })
export const postActiveFeaSnapshot = (snapshotKey, signal) => request(
  '/api/fea/current-snapshot',
  { method: 'POST', body: { snapshotKey }, signal },
)
export const getFeaStudy = (studyId, signal) => request(`/api/fea/studies/${studyId}`, { signal })
export const approveFeaStudy = (studyId, approval, signal) => request(
  `/api/fea/studies/${studyId}/approve-and-submit`,
  { method: 'POST', body: approval, signal },
)
export const getFeaStatus = (studyId, signal) => request(`/api/fea/studies/${studyId}/status`, { signal })
export const getFeaResults = (studyId, signal) => request(`/api/fea/studies/${studyId}/results`, { signal })
