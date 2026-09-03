"""Inspect expired local originals; --apply explicitly runs bounded local cleanup.

Never contacts providers or deletes provider copies, backups, or audit metadata.
"""
import argparse
import json
import os
from pathlib import Path

try:
    from scripts.evidence_store import EvidenceStore
    from scripts.live_demo_preparation import PreparationStore, DEFAULT_ROOT
except ModuleNotFoundError:
    from evidence_store import EvidenceStore
    from live_demo_preparation import PreparationStore, DEFAULT_ROOT


def maintain(evidence, preparations, *, apply=False):
    with evidence.connect() as db:
        originals = db.execute("SELECT COUNT(*) FROM artifacts WHERE availability IN ('available','integrity_failed') AND expires<=?",
                               (evidence.clock(),)).fetchone()[0]
    with preparations.connect() as db:
        cad = db.execute("SELECT COUNT(*) FROM preparations WHERE expires<=? AND state!='EXPIRED'",
                         (preparations.clock(),)).fetchone()[0]
    result = {'mode':'apply' if apply else 'dry-run', 'expiredOriginals':originals,
              'expiredPreparations':cad, 'deletedOriginals':0, 'expiredPreparationsCleaned':0,
              'providerCopiesDeleted':False, 'backupsDeleted':False, 'auditMetadataRetained':True}
    if apply:
        result['deletedOriginals'] = evidence.cleanup()['deleted']
        result['expiredPreparationsCleaned'] = preparations.cleanup()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Delete expired local originals; irreversible without backup.')
    args = parser.parse_args()
    root = Path(os.environ.get('EVIDENCE_RUNTIME_DIR', DEFAULT_ROOT.parent / 'evidence'))
    print(json.dumps(maintain(EvidenceStore(root), PreparationStore(), apply=args.apply), indent=2))


if __name__ == '__main__':
    main()
