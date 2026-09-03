export const SIMULATION_EVIDENCE_SCHEMA_VERSION = 'buildready-simulation-evidence-2.0.0'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function createRecordedSimulationEvidence({ study, result, provider, live, currentness }) {
  const manifest = clone(study.manifest)
  const normalizedProvider = provider === 'recorded' ? 'recorded-local' : provider
  return Object.freeze({
    schemaVersion: SIMULATION_EVIDENCE_SCHEMA_VERSION,
    evidenceId: study.studyHash,
    evidenceMode: 'recorded',
    sourceKind: 'recorded_fixture',
    provider: normalizedProvider,
    live: false,
    binding: Object.freeze({
      preparationId: null,
      snapshotKey: study.snapshotKey,
      source: null,
      stepSha256: null,
      geometrySha256: null,
    }),
    lifecycleState: study.lifecycleState,
    currentness,
    setup: manifest,
    result: clone(result),
    review: Object.freeze({
      columnReview: null,
      engineeringVerification: result?.verification?.engineeringVerified === true ? 'verified' : 'pending',
    }),
    retention: Object.freeze({ expiresAt: null, artifactsAvailable: true }),
    // Compatibility aliases are retained while downstream review/quote code is
    // migrated gate-by-gate to the common binding/setup fields.
    studyId: study.studyId,
    studyHash: study.studyHash,
    snapshotKey: study.snapshotKey,
    approvedAt: study.approvedAt,
    manifest,
  })
}
