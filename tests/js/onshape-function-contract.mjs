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

test('native-only immutable inventory excludes suppressed and unused extents', async () => {
  const calls = []
  const extrude = (id, bound, suppressed = false) => ({ featureId: id, featureType: 'extrude', suppressed,
    parameters: [{ parameterId: 'bodyType', value: 'SOLID' }, { parameterId: 'endBound', value: bound },
      { parameterId: 'depth', expression: '25*millimeter', value: 0 }] })
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('/currentmicroversion')) return Response.json({ microversion: 'abcdef0123456789abcdef01' })
    if (String(url).includes('/features')) return Response.json({ features: String(url).includes('/m/') ? [
      extrude('blind', 'BLIND'), extrude('up-to-next', 'UP_TO_NEXT'), extrude('up-to-face', 'UP_TO_SURFACE'),
      extrude('suppressed', 'BLIND', true),
      { featureId: 'fillet', featureType: 'fillet', parameters: [{ parameterId: 'radius', expression: '2 mm' }] },
      { suppressed: true, parameters: [{ parameterId: 'name', value: 'wallThickness' }, { parameterId: 'value', expression: '1 mm' }] },
    ] : [extrude('earlier-workspace-value', 'BLIND')] })
    return Response.json({ name: 'Native model' })
  }
  const response = await onRequestGet({ env: configuredEnv('7') })
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(payload.variables, [])
  assert.deepEqual(payload.nativeDimensions.map((item) => item.featureId), ['blind', 'fillet'])
  assert.equal(payload.nativeDimensions[0].semanticStatus, 'unassigned')
  assert.equal(payload.nativeDimensions[0].value, undefined)
  assert.equal(calls.filter((url) => url.includes('/m/')).length, 1)
})

test('mismatched immutable revision is rejected', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/currentmicroversion')) return Response.json({ microversion: 'abcdef0123456789abcdef01' })
    if (String(url).includes('/m/')) return Response.json({ microversionId: '999999999999999999999999' })
    return Response.json({ features: [] })
  }
  const response = await onRequestGet({ env: configuredEnv('8') })
  const payload = await response.json()
  assert.equal(payload.error.code, 'ONSHAPE_REVISION_UNVERIFIED')
})
