"""Read-only numerical readiness over retained, consistently bound live records.

No engineering approval is inferred from global peak stress or missing reviewer
evidence. This report computes only the checks supported by captured CSV metrics.
"""
import math
import time


def finite(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def readiness(records, *, now=None):
    now = time.time() if now is None else now
    checks = {key: 'unknown' for key in (
        'sourceBinding', 'threeDistinctMeshLevels', 'reactionBalance', 'meshDisplacement',
        'reviewedRegionStress', 'analyticalBenchmark', 'manualParity', 'engineeringReview')}
    report = {'schemaVersion':'live-verification-readiness-1.0.0', 'checks':checks,
              'engineeringVerified':False, 'productionApproved':False, 'evidenceIds':[], 'displacementChangesPercent':[]}
    if not isinstance(records, list) or not records:
        return report
    report['evidenceIds'] = [r.get('evidenceId') for r in records]
    first = records[0]
    binding = first.get('binding')
    setup_hash = first.get('setup', {}).get('setupHash')
    topology = first.get('setup', {}).get('topologyMapping', {})
    selections = {key: topology.get(key) for key in ('body', 'supports', 'loads')}
    valid = bool(binding and setup_hash) and all(
        r.get('binding') == binding and r.get('setup', {}).get('setupHash') == setup_hash
        and all(selections[key] and r.get('setup', {}).get('topologyMapping', {}).get(key) == value
                for key, value in selections.items())
        and r.get('setup', {}).get('topologyMapping', {}).get('geometryParityChecked') is True
        and r.get('evidenceMode') == 'live' and r.get('sourceKind') == 'authorized_api'
        and r.get('provider') == 'simscale' and r.get('currentness') == 'CURRENT'
        and r.get('lifecycleState') == 'COMPLETE'
        and r.get('retention', {}).get('artifactsAvailable') is True
        and finite(r.get('retention', {}).get('expiresAt')) and r['retention']['expiresAt'] > now
        for r in records)
    checks['sourceBinding'] = 'pass' if valid else 'fail'
    if not valid:
        return report
    levels = [r.get('setup', {}).get('topologyMapping', {}).get('meshLevel') for r in records]
    run_ids = [r.get('result', {}).get('runId') for r in records]
    complete = len(records) == 3 and all(type(v) is int for v in levels) and sorted(levels) == [0,1,2] and len(set(run_ids)) == 3 and all(run_ids)
    checks['threeDistinctMeshLevels'] = 'pass' if complete else 'unknown'
    balances = [r.get('result', {}).get('metrics', {}).get('reactionBalanceErrorPercent') for r in records]
    if all(finite(value) for value in balances):
        checks['reactionBalance'] = 'pass' if all(value <= 1 for value in balances) else 'fail'
    if complete:
        ordered = sorted(records, key=lambda r:r['setup']['topologyMapping']['meshLevel'])
        values = [r.get('result', {}).get('metrics', {}).get('maximumDisplacementMm') for r in ordered]
        if all(finite(value) and value > 0 for value in values):
            changes = [abs(a-b)/b*100 for a,b in zip(values,values[1:])]
            report['displacementChangesPercent'] = changes
            checks['meshDisplacement'] = 'pass' if all(v < 2 for v in changes) else 'fail'
    return report
