"""Private, durable exact-CAD preparation. Never uploads to SimScale or runs compute.

Use --inspect for read-only source discovery, or --export to retain the single
default-configuration STEP locally for seven days. A failed/uncertain POST is
not retried automatically. Credentials and provider URLs are never persisted.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import asdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time

try:
    from scripts.onshape_export import FrozenPartStudio, OnshapeExportClient, OnshapeExportError
    from scripts.simscale_probe import load_dotenv
except ModuleNotFoundError:
    from onshape_export import FrozenPartStudio, OnshapeExportClient, OnshapeExportError
    from simscale_probe import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / '.runtime' / 'live-demo'


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def illustrative_bracket_setup(geometry, receipt):
    """Draft only for the inspected demo geometry, never generic face recognition."""
    if geometry.get('source') != receipt.get('source') or receipt.get('state') != 'COMPLETE':
        raise ValueError('The draft requires a complete matching CAD receipt.')
    if receipt.get('geometrySha256') != 'sha256-' + fingerprint(geometry):
        raise ValueError('Geometry fingerprint mismatch.')
    if geometry.get('units') != 'SI' or geometry.get('overallSizeMm') != [148.5, 148.5, 28.0]:
        raise ValueError('This illustrative selection is limited to the inspected demo bracket.')
    def close(a, b):
        return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-8)
    supports, loads = [], []
    for face in geometry['faces']:
        if face['type'] == 'CYLINDER' and close(face['radiusM'], .004):
            x, y, _ = face['originM']
            height = face['maxM'][2] - face['minM'][2]
            if (close(abs(x), .06) and close(abs(y), .06)
                    and all(close(a, b) for a, b in zip(face['axis'], [0, 0, 1]))
                    and close(height, .019) and close(face['areaM2'], 2 * math.pi * .004 * .019)):
                supports.append(face)
        if (face['type'] == 'PLANE' and close(face['minM'][2], .003)
                and close(face['maxM'][2], .003)
                and all(close(a, b) for a, b in zip(face['normal'], [0, 0, 1]))
                and max(abs(face[k][0]) for k in ('minM', 'maxM')) <= .02500001
                and max(abs(face[k][1]) for k in ('minM', 'maxM')) <= .04200001):
            loads.append(face)
    corners = {(round(f['originM'][0], 6), round(f['originM'][1], 6)) for f in supports}
    if len(supports) != 4 or len(corners) != 4 or len(loads) != 2:
        raise ValueError('Demo face selection changed or is ambiguous; review it manually.')
    area = sum(f['areaM2'] for f in loads)
    if not close(area, .0022967964603647297):
        raise ValueError('The central load area changed; review it manually.')
    draft = {
        'status': 'illustrative-draft', 'source': receipt['source'],
        'stepSha256': receipt['sha256'], 'geometrySha256': receipt['geometrySha256'],
        'expiresAt': receipt['expiresAt'], 'analysis': 'linear-static',
        'material': {'label': '6061-T6 aluminum — assumed demonstration properties',
                     'youngModulusPa': 68900000000, 'poissonRatio': .33, 'densityKgM3': 2700,
                     'propertySource': 'controlled-material-fixture-1.0.0',
                     'certified': False},
        'support': {'type': 'fixed-displacement', 'translationM': [0, 0, 0],
                    'onshapeFaces': sorted(supports, key=lambda f: f['faceId'])},
        'load': {'type': 'uniform-global-traction', 'totalForceN': [0, 0, -100],
                 'combinedAreaM2': area, 'tractionPa': [0, 0, -100 / area],
                 'onshapeFaces': sorted(loads, key=lambda f: f['faceId']),
                 'distribution': '100 N total across both faces, not 100 N per face'},
        'assumptions': ['Fixed hole walls idealize rigid mounting; no bolt contact or preload.',
                        'Small displacement and linear elasticity; gravity omitted.',
                        'The 100 N load is illustrative, not a user-specified service requirement.',
                        'Constraint-edge peak stresses require singularity review.'],
        'simscaleTopologyMapped': False, 'engineeringVerified': False,
        'computeAuthorized': False, 'manufacturingApproved': False,
    }
    return {**draft, 'setupHash': 'sha256-' + fingerprint(draft)}


def discover_source(get, document, workspace, element):
    for identity in (document, workspace, element):
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9]{8,40}', identity):
            raise ValueError('Configured source identifiers are invalid.')
    micro = get(f'/api/v16/documents/d/{document}/w/{workspace}/currentmicroversion').get('microversion')
    if not isinstance(micro, str) or not re.fullmatch(r'[A-Za-z0-9]{8,40}', micro):
        raise ValueError('The source revision is unavailable.')
    versions = get(f'/api/v16/documents/d/{document}/versions?offset=0&limit=0')
    matches = [v for v in versions if isinstance(v, dict) and v.get('microversion') == micro] if isinstance(versions, list) else []
    if not matches:
        raise ValueError('Create an immutable Onshape version of the current model before export.')
    parts = get(f'/api/v16/parts/d/{document}/m/{micro}/e/{element}')
    if not isinstance(parts, list) or len(parts) != 1 or parts[0].get('bodyType') != 'solid':
        raise ValueError('The demo requires exactly one solid part; select a different Part Studio explicitly.')
    source = FrozenPartStudio(document, element, micro, matches[0].get('id', ''), parts[0].get('partId', ''))
    source.validate()
    return source


def geometry_summary(body, source, *, requested_microversion=None):
    """Normalize bounded final-solid evidence; selections stay draft assumptions."""
    response_revision = body.get('microversionId')
    if isinstance(response_revision, dict):
        response_revision = response_revision.get('theId')
    if (response_revision is not None and response_revision != source.microversion_id) or (
        response_revision is None and requested_microversion != source.microversion_id
    ):
        raise ValueError('Body geometry does not match the frozen revision.')
    bodies = body.get('bodies')
    if not isinstance(bodies, list) or len(bodies) != 1 or bodies[0].get('id') != source.part_id:
        raise ValueError('Body geometry does not identify the selected solid.')
    faces = bodies[0].get('faces', [])
    if not isinstance(faces, list) or not 1 <= len(faces) <= 2000:
        raise ValueError('Unsupported body face count.')
    result = []
    def number(value):
        if type(value) not in (float, int) or not math.isfinite(value):
            raise ValueError('Non-finite geometry value.')
        return value
    def vector(value):
        return [number(value[axis]) for axis in ('x', 'y', 'z')]
    seen = set()
    for face in faces:
        identity = face.get('id')
        # Onshape topology IDs are opaque and can contain base64-like symbols.
        # They are data, never interpolated into a path or HTML here.
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9._~+/=-]{1,100}', identity) or identity in seen:
            raise ValueError('Invalid or duplicate face identity.')
        seen.add(identity)
        surface = face.get('surface', {})
        low, high = vector(face['box']['minCorner']), vector(face['box']['maxCorner'])
        if any(a > b for a, b in zip(low, high)) or number(face['area']) <= 0:
            raise ValueError('Invalid face bounds or area.')
        item = {'faceId': identity, 'type': surface.get('type'), 'areaM2': number(face['area']), 'minM': low, 'maxM': high}
        if item['type'] == 'CYLINDER':
            item.update(radiusM=number(surface['radius']), axis=vector(surface['axis']), originM=vector(surface['origin']))
        elif item['type'] == 'PLANE':
            item.update(normal=vector(surface['normal']))
        result.append(item)
    low = [min(f['minM'][i] for f in result) for i in range(3)]
    high = [max(f['maxM'][i] for f in result) for i in range(3)]
    return {'source': asdict(source), 'units': 'SI', 'faceCount': len(result), 'faces': result,
            'overallSizeMm': [round((b-a)*1000, 6) for a, b in zip(low, high)],
            'manufacturingApproved': False, 'simscaleTopologyMapped': False}


class PreparationStore:
    def __init__(self, root=DEFAULT_ROOT, *, clock=time.time):
        self.root, self.clock = Path(root).resolve(), clock
        for public in (ROOT / 'web', ROOT / 'dist', ROOT / '.git'):
            if self.root == public or public in self.root.parents:
                raise ValueError('CAD storage must remain outside published directories.')
        self.root.mkdir(parents=True, exist_ok=True)
        self.artifacts = self.root / 'artifacts'
        self.artifacts.mkdir(exist_ok=True)
        if self.artifacts.resolve().parent != self.root:
            raise ValueError('CAD storage must not escape its private root.')
        self.database = self.root / 'preparation.sqlite3'
        with self.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS preparations (
                id TEXT PRIMARY KEY, source_json TEXT NOT NULL, state TEXT NOT NULL,
                translation_id TEXT, receipt_json TEXT, expires REAL NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS illustrative_drafts (
                preparation_id TEXT PRIMARY KEY, draft_json TEXT NOT NULL)''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def path(self, identity, suffix):
        if not re.fullmatch(r'[0-9a-f]{64}', identity) or (suffix not in ('step', 'geometry.json') and not re.fullmatch(r'result\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.csv', suffix)):
            raise ValueError('Invalid private artifact path.')
        path = self.artifacts / f'{identity}.{suffix}'
        if path.resolve().parent != self.artifacts.resolve() or path.is_symlink():
            raise ValueError('Private artifact path escaped storage.')
        return path

    def prepare(self, source, client, geometry):
        source.validate()
        if geometry.get('source') != asdict(source):
            raise ValueError('Geometry and export sources differ.')
        identity = fingerprint(asdict(source))
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM preparations WHERE id=?', (identity,)).fetchone()
            if row:
                if row['expires'] <= self.clock() or row['state'] == 'EXPIRED':
                    raise ValueError('The retained preparation expired; an explicit new preparation policy is required.')
                if row['state'] == 'COMPLETE':
                    receipt = json.loads(row['receipt_json'])
                    if 'sha256-' + hashlib.sha256(self.path(identity, 'step').read_bytes()).hexdigest() != receipt['sha256']:
                        raise ValueError('The retained CAD fingerprint failed verification.')
                    if 'sha256-' + hashlib.sha256(self.path(identity, 'geometry.json').read_bytes()).hexdigest() != receipt['geometrySha256']:
                        raise ValueError('The retained geometry fingerprint failed verification.')
                    return receipt
                # No blind replay or concurrent export, even after a process crash.
                raise ValueError('An unfinished export needs explicit reconciliation; no new translation was submitted.')
            expires = self.clock() + 7 * 86400
            db.execute('INSERT INTO preparations VALUES (?, ?, ?, NULL, NULL, ?)', (identity, encoded(asdict(source)), 'WRITE_UNCERTAIN', expires))
        def received(translation_id):
            with self.connect() as db:
                db.execute('UPDATE preparations SET translation_id=?,state=? WHERE id=?', (translation_id, 'TRANSLATING', identity))
        exported = client.export_step(source, on_translation=received)
        if (exported.version_id, exported.microversion_id, exported.part_id, exported.configuration) != (source.version_id, source.microversion_id, source.part_id, source.configuration):
            raise ValueError('Export receipt does not match its source.')
        receipt = {k: v for k, v in asdict(exported).items() if k != 'content'}
        if receipt['sha256'] != 'sha256-' + hashlib.sha256(exported.content).hexdigest():
            raise ValueError('Export digest mismatch.')
        geometry_bytes = encoded(geometry).encode()
        receipt.update(preparationId=identity, source=asdict(source), expiresAt=expires,
                       geometrySha256='sha256-' + hashlib.sha256(geometry_bytes).hexdigest(),
                       state='COMPLETE', evidenceLevel='version-bound-step-export', liveSimulationReady=False,
                       uploadedToSimscale=False, sourceIdentityVerified=True, geometryParityVerified=False, engineeringVerified=False)
        for suffix, content in (('step', exported.content), ('geometry.json', geometry_bytes)):
            with self.path(identity, suffix).open('xb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        with self.connect() as db:
            db.execute('UPDATE preparations SET state=?,receipt_json=? WHERE id=?', ('COMPLETE', encoded(receipt), identity))
        return receipt

    def cleanup(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            rows = db.execute("SELECT id FROM preparations WHERE expires<=? AND state!='EXPIRED'", (self.clock(),)).fetchall()
            for row in rows:
                for suffix in ('step', 'geometry.json'):
                    self.path(row['id'], suffix).unlink(missing_ok=True)
                db.execute("UPDATE preparations SET state='EXPIRED',receipt_json=NULL WHERE id=?", (row['id'],))
                db.execute('DELETE FROM illustrative_drafts WHERE preparation_id=?', (row['id'],))
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_run_specs'").fetchone():
                    db.execute('DELETE FROM live_run_specs WHERE preparation_id=?', (row['id'],))
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_topology_mappings'").fetchone():
                    db.execute('DELETE FROM live_topology_mappings WHERE preparation_id=?', (row['id'],))
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_run_bindings'").fetchone():
                    db.execute('DELETE FROM live_run_bindings WHERE preparation_id=?', (row['id'],))
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_result_files'").fetchone():
                    files = db.execute('SELECT result_id FROM live_result_files WHERE preparation_id=?', (row['id'],)).fetchall()
                    for item in files:
                        self.path(row['id'], 'result.'+item['result_id']+'.csv').unlink(missing_ok=True)
                    db.execute('DELETE FROM live_result_files WHERE preparation_id=?', (row['id'],))
        return len(rows)

    def draft_setup(self, identity):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM preparations WHERE id=?', (identity,)).fetchone()
            if row is None or row['state'] != 'COMPLETE' or row['expires'] <= self.clock():
                raise ValueError('A current completed preparation is required.')
            receipt = json.loads(row['receipt_json'])
            if receipt['sha256'] != 'sha256-' + hashlib.sha256(self.path(identity, 'step').read_bytes()).hexdigest():
                raise ValueError('Retained STEP fingerprint mismatch.')
            geometry = json.loads(self.path(identity, 'geometry.json').read_bytes())
            draft = illustrative_bracket_setup(geometry, receipt)
            db.execute('INSERT OR REPLACE INTO illustrative_drafts VALUES (?, ?)', (identity, encoded(draft)))
            return draft


def cleanup_default_preparations():
    if (DEFAULT_ROOT / 'preparation.sqlite3').is_file():
        return PreparationStore().cleanup()
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--inspect', action='store_true')
    action.add_argument('--export', action='store_true')
    action.add_argument('--draft-setup', metavar='PREPARATION_ID')
    args = parser.parse_args()
    if args.draft_setup:
        draft = PreparationStore().draft_setup(args.draft_setup)
        print(json.dumps(draft, indent=2))
        return
    load_dotenv()
    client = OnshapeExportClient(access_key=os.environ.get('ONSHAPE_ACCESS_KEY', ''), secret_key=os.environ.get('ONSHAPE_SECRET_KEY', ''))
    # The bounded client validates the only permitted origin and rejects redirects.
    def get(path):
        with client._request('GET', path) as response:
            raw = response.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError('Source response exceeded the bounded read limit.')
        return json.loads(raw)
    source = discover_source(get, os.environ.get('ONSHAPE_DOCUMENT_ID'), os.environ.get('ONSHAPE_WORKSPACE_ID'), os.environ.get('ONSHAPE_ELEMENT_ID'))
    body = get(f'/api/v16/parts/d/{source.document_id}/m/{source.microversion_id}/e/{source.element_id}/partid/{source.part_id}/bodydetails')
    geometry = geometry_summary(body, source, requested_microversion=source.microversion_id)
    result = {'ok': True, 'source': asdict(source), 'faceCount': geometry['faceCount'], 'overallSizeMm': geometry['overallSizeMm'], 'liveSimulationReady': False}
    if args.export:
        store = PreparationStore()
        store.cleanup()
        result['export'] = store.prepare(source, client, geometry)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OnshapeExportError, ValueError, KeyError, OSError, sqlite3.Error) as error:
        print(json.dumps({'ok': False, 'errorCode': getattr(error, 'code', 'PREPARATION_BLOCKED'),
                          'message': 'Preparation did not finish. Check immutable source, private storage and any pending export receipt; no SimScale upload or solve was initiated.'}))
        raise SystemExit(1) from None
