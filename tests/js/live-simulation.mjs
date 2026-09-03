import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
globalThis.window = { addEventListener() {}, dispatchEvent() {} }
globalThis.fetch = async url => new Response(fs.readFileSync(fileURLToPath(url)))
const { evidenceCurrentness } = await import('../../web/live-simulation.js')
const design = {sourceIdentity:{documentId:'doc',elementId:'element',microversionId:'micro',configuration:'default'}}
const record = {schemaVersion:'buildready-simulation-evidence-2.0.0',evidenceMode:'live',sourceKind:'authorized_api',live:true,currentness:'CURRENT',provider:'simscale',lifecycleState:'COMPLETE',
  binding:{source:{documentId:'doc',elementId:'element',microversionId:'micro',partId:'part',configuration:''}},retention:{expiresAt:200,artifactsAvailable:true}}
test('live evidence requires exact source, reviewed part and unexpired artifacts', () => {
  assert.equal(evidenceCurrentness(record,design,'checked','part',100),'CURRENT')
  assert.equal(evidenceCurrentness(record,design,'checked','other',100),'STALE')
  assert.equal(evidenceCurrentness(record,design,'changed','part',100),'UNRESOLVED')
  assert.equal(evidenceCurrentness(record,design,'checked','part',200),'EXPIRED')
  assert.equal(evidenceCurrentness({...record,evidenceMode:'recorded'},design,'checked','part',100),'UNRESOLVED')
  assert.equal(evidenceCurrentness({...record,lifecycleState:'FAILED'},design,'checked','part',100),'UNRESOLVED')
  assert.equal(evidenceCurrentness(record,{sourceIdentity:{...design.sourceIdentity,microversionId:'new'}},'checked','part',100),'STALE')
})
