import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../functions/api/onshape/design.js', import.meta.url), 'utf8')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { onRequestGet } = await import(moduleUrl)

const configuredEnv = (suffix = '1') => ({
  ONSHAPE_ACCESS_KEY: 'test-access',
  ONSHAPE_SECRET_KEY: 'test-secret',
  ONSHAPE_DOCUMENT_ID: `00000000000000000000000${suffix}`,
  ONSHAPE_WORKSPACE_ID: '000000000000000000000002',
  ONSHAPE_ELEMENT_ID: '000000000000000000000003',
  ONSHAPE_BASE_URL: `https://mock-${suffix}.invalid`,
})

test('missing configuration is non-retryable', async () => {
  const response = await onRequestGet({ env: {} })
  const payload = await response.json()
  assert.equal(response.status, 503)
  assert.equal(payload.error.code, 'ONSHAPE_NOT_CONFIGURED')
  assert.equal(payload.error.retryable, false)
})

test('malformed identifiers fail before fetch', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch') }
  const response = await onRequestGet({
    env: { ...configuredEnv('4'), ONSHAPE_ELEMENT_ID: '../../caller-controlled' },
  })
  const payload = await response.json()
  assert.equal(payload.error.code, 'ONSHAPE_NOT_CONFIGURED')
  assert.equal(payload.error.retryable, false)
  assert.equal(calls, 0)
})

test('healthy reads use the bounded sanitized contract', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/features')) {
      return new Response(JSON.stringify({
        features: [{ parameters: [
          { parameterId: 'name', value: 'insideRadius' },
          { parameterId: 'value', expression: '4 mm' },
        ] }],
        microversionId: 'abcdef0123456789abcdef01',
        serializationVersion: '1.2.7',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ name: '<script>external</script>' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const response = await onRequestGet({ env: configuredEnv('5') })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.variables.length, 1)
  assert.equal(payload.document.name, '<script>external</script>')
  assert.equal(calls.length, 2)
})

test('authorization errors are non-retryable', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 401 })
  const response = await onRequestGet({ env: configuredEnv('6') })
  const payload = await response.json()
  assert.equal(payload.error.code, 'ONSHAPE_UNAUTHORIZED')
  assert.equal(payload.error.retryable, false)
})
