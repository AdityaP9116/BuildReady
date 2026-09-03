import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  FeaValidationError,
  cantileverExpected,
  createStudyManifest,
  evaluateVerificationEvidence,
  validateStaticStressStudy,
} from '../../web/fea-validation.js'

const domain = JSON.parse(await readFile(new URL('../../web/fea-domain.json', import.meta.url), 'utf8'))
const snapshotKey = 'BRKT-001/onshape-a1b2c3d4e5f6@onshape-1.2.7'

function validInput() {
  return {
    snapshotKey,
    materialKey: 'al-6061-t6-demo',
    load: { type: 'force', magnitude: 0.441, unit: 'kN', direction: [0, -2, 0] },
    selections: { body: 'NS_BODY', fixed: 'NS_FIXED', load: 'NS_LOAD', monitor: 'NS_MONITOR' },
    meshPreset: 'medium',
    requirements: { minimumSafetyFactor: 2, maximumDisplacementMm: 1 },
  }
}

test('a valid force study normalizes to SI and hashes deterministically', async () => {
  const normalized = validateStaticStressStudy(validInput(), domain, snapshotKey)
  assert.equal(normalized.load.magnitudeN, 441)
  assert.deepEqual(normalized.load.direction, [0, -1, 0])
  assert.equal(normalized.mesh.elementOrder, 'second')

  const first = await createStudyManifest(validInput(), domain, snapshotKey)
  const reordered = validInput()
  reordered.requirements = { maximumDisplacementMm: 1, minimumSafetyFactor: 2 }
  const second = await createStudyManifest(reordered, domain, snapshotKey)
  assert.match(first.studyHash, /^sha256-[a-f0-9]{64}$/)
  assert.equal(first.studyHash, second.studyHash)
})

test('unknown, stale, unsupported, and physically invalid inputs fail closed', () => {
  const cases = [
    [{ ...validInput(), unknown: true }, 'FEA_INVALID_INPUT'],
    [{ ...validInput(), snapshotKey: 'stale' }, 'FEA_STALE_SNAPSHOT'],
    [{ ...validInput(), load: { ...validInput().load, type: 'torque' } }, 'FEA_UNSUPPORTED_LOAD'],
    [{ ...validInput(), load: { ...validInput().load, direction: [0, 0, 0] } }, 'FEA_INVALID_DIRECTION'],
    [{ ...validInput(), selections: { ...validInput().selections, fixed: 'NS_LOAD' } }, 'FEA_INVALID_SELECTION'],
  ]
  for (const [input, code] of cases) {
    assert.throws(
      () => validateStaticStressStudy(input, domain, snapshotKey),
      (error) => error instanceof FeaValidationError && error.code === code,
    )
  }
})

test('the analytical cantilever fixture matches its frozen expectations', () => {
  const expected = cantileverExpected(domain.analyticalBenchmark)
  assert.equal(expected.maximumBendingStressMpa, domain.analyticalBenchmark.expectedMaximumBendingStressMpa)
  assert.ok(Math.abs(expected.tipDisplacementMm - domain.analyticalBenchmark.expectedTipDisplacementMm) < 1e-12)
})

test('verification requires numerical, topology, and read-back checks together', () => {
  const passing = {
    analyticalStressErrorPercent: 4.9,
    analyticalDisplacementErrorPercent: 4.9,
    manualParityErrorPercent: 0.9,
    reactionBalanceErrorPercent: 0.9,
    meshDisplacementChangePercent: 1.9,
    meshReviewedStressChangePercent: 4.9,
    requiredSelectionsResolved: true,
    criticalReadBackMatches: true,
  }
  assert.equal(evaluateVerificationEvidence(passing, domain.verificationThresholds).verified, true)
  assert.equal(evaluateVerificationEvidence({ ...passing, reactionBalanceErrorPercent: 1.01 }, domain.verificationThresholds).verified, false)
  assert.equal(evaluateVerificationEvidence({ ...passing, criticalReadBackMatches: false }, domain.verificationThresholds).verified, false)
  for (const value of [null, undefined, '0', false, -1, NaN, Infinity]) {
    assert.equal(evaluateVerificationEvidence({ ...passing, analyticalStressErrorPercent: value }, domain.verificationThresholds).verified, false)
  }
  assert.equal(evaluateVerificationEvidence({ ...passing, meshDisplacementChangePercent: domain.verificationThresholds.meshDisplacementChangePercent }, domain.verificationThresholds).verified, false)
  assert.equal(evaluateVerificationEvidence({ ...passing, meshReviewedStressChangePercent: domain.verificationThresholds.meshReviewedStressChangePercent }, domain.verificationThresholds).verified, false)
})
