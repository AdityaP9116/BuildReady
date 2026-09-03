"""Owner-scoped local evidence, sessions and one-use approval challenges.

This is a loopback deployment boundary, not an Internet identity provider.
Original bytes never enter SQLite, static output or tool responses.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class EvidenceError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def digest(value: Any) -> str:
    return 'sha256-' + hashlib.sha256(canonical(value).encode()).hexdigest()


def token_hash(value: str) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise EvidenceError('INVALID_TOKEN', 'The session or approval token is invalid.', 403)
    return hashlib.sha256(value.encode()).hexdigest()


def exact(value: Any, keys: set[str]) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise EvidenceError('INVALID_FIELDS', 'The request fields do not match this contract.')


def text_field(value: Any, label: str, maximum: int = 200) -> str:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= maximum or any(ord(c) < 32 for c in value):
        raise EvidenceError('INVALID_TEXT', f'{label} must be bounded plain text.')
    return value.strip()


@dataclass(frozen=True)
class Principal:
    owner: str
    session_hash: str


class EvidenceStore:
    SCHEMA = 1
    LIMITS = {'step': 25 * 1024 * 1024, 'supplier_pdf': 10 * 1024 * 1024, 'supplier_json': 1024 * 1024}
    MEDIA = {'step': 'application/step', 'supplier_pdf': 'application/pdf', 'supplier_json': 'application/json'}

    def __init__(self, root: Path, *, clock=time.time, quota_bytes: int = 250 * 1024 * 1024):
        self.root = root.resolve()
        repository = Path(__file__).resolve().parents[1]
        if any(self.root == public or public in self.root.parents for public in (repository / 'web', repository / 'dist', repository / '.git')):
            raise EvidenceError('UNSAFE_STORAGE', 'Private storage cannot be inside published directories.', 503)
        self.root.mkdir(parents=True, exist_ok=True)
        self.blobs = self.root / 'blobs'
        self.blobs.mkdir(exist_ok=True)
        self.database = self.root / 'evidence.sqlite3'
        self.clock, self.quota_bytes = clock, quota_bytes
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, self.SCHEMA):
                raise EvidenceError('SCHEMA_UNSUPPORTED', 'The evidence schema requires a supported migration.', 503)
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sessions (
                  token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL, csrf_hash TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS workspaces (
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, policy_json TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS artifacts (
                  id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL,
                  filename TEXT NOT NULL, digest TEXT NOT NULL, size INTEGER NOT NULL, created REAL NOT NULL,
                  expires REAL NOT NULL, availability TEXT NOT NULL, source_kind TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS records (
                  id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL,
                  version INTEGER NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL, state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS versions (
                  record TEXT NOT NULL REFERENCES records(id), version INTEGER NOT NULL,
                  content_json TEXT NOT NULL, content_hash TEXT NOT NULL, state TEXT NOT NULL,
                  PRIMARY KEY(record, version));
                CREATE TABLE IF NOT EXISTS approvals (
                  nonce_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(token_hash),
                  workspace TEXT NOT NULL REFERENCES workspaces(id), action TEXT NOT NULL, subject TEXT NOT NULL,
                  content_hash TEXT NOT NULL, expires REAL NOT NULL, consumed REAL);
                CREATE TABLE IF NOT EXISTS audit (
                  id INTEGER PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id),
                  actor TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL, digest TEXT, timestamp REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS idempotency (
                  workspace TEXT NOT NULL REFERENCES workspaces(id), operation TEXT NOT NULL, key TEXT NOT NULL,
                  digest TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(workspace, operation, key));
                CREATE INDEX IF NOT EXISTS records_scope ON records(workspace, kind, id);
                CREATE INDEX IF NOT EXISTS artifacts_expiry ON artifacts(availability, expires);
                PRAGMA user_version = 1;
            ''')

    @contextmanager
    def connect(self, *, write=False):
        db = sqlite3.connect(self.database, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA busy_timeout=5000')
        try:
            if write:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def login(self, token: str, configured: dict[str, str]) -> tuple[str, str]:
        owner = None
        if isinstance(token, str) and len(token) <= 1024:
            for identity, expected in configured.items():
                if isinstance(expected, str) and len(expected) >= 32 and hmac.compare_digest(token_hash(token), token_hash(expected)):
                    owner = identity
        if owner is None:
            raise EvidenceError('AUTH_REQUIRED', 'The local workspace credential was not accepted.', 401)
        session, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.connect(write=True) as db:
            db.execute('INSERT INTO sessions VALUES (?, ?, ?, ?)', (token_hash(session), owner, token_hash(csrf), self.clock() + 8 * 3600))
        return session, csrf

    def authenticate(self, session: str, csrf: str | None = None, *, write=False) -> Principal:
        with self.connect() as db:
            row = db.execute('SELECT * FROM sessions WHERE token_hash=? AND expires>?', (token_hash(session), self.clock())).fetchone()
        if row is None:
            raise EvidenceError('AUTH_REQUIRED', 'Unlock the private workspace first.', 401)
        if write and (not csrf or not hmac.compare_digest(row['csrf_hash'], token_hash(csrf))):
            raise EvidenceError('CSRF_REQUIRED', 'The request needs a valid session-bound CSRF token.', 403)
        return Principal(row['owner'], row['token_hash'])

    def logout(self, principal: Principal):
        with self.connect(write=True) as db:
            db.execute('UPDATE sessions SET expires=0 WHERE token_hash=?', (principal.session_hash,))

    def authorize(self, db, principal: Principal, workspace: str):
        row = db.execute('SELECT * FROM workspaces WHERE id=? AND owner=?', (workspace, principal.owner)).fetchone()
        if row is None:
            raise EvidenceError('NOT_FOUND', 'The requested evidence is unavailable.', 404)
        return row

    def audit(self, db, principal: Principal, workspace: str, action: str, subject: str, content_hash: str | None = None):
        db.execute('INSERT INTO audit(workspace, actor, action, subject, digest, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                   (workspace, principal.owner, action, subject, content_hash, self.clock()))

    def create_workspace(self, principal: Principal, name: str, policy: dict) -> dict:
        name = text_field(name, 'Workspace name', 100)
        exact(policy, {'cadDays', 'quoteDays', 'metadataUntilDeletion', 'accepted'})
        if policy['cadDays'] != 7 or type(policy['cadDays']) is not int or type(policy['quoteDays']) is not int or not 1 <= policy['quoteDays'] <= 365 or policy['accepted'] is not True or policy['metadataUntilDeletion'] is not True:
            raise EvidenceError('RETENTION_REQUIRED', 'Accept seven-day CAD retention and explicitly choose quote-source retention.')
        identity = str(uuid.uuid4())
        with self.connect(write=True) as db:
            db.execute('INSERT INTO workspaces VALUES (?, ?, ?, ?)', (identity, principal.owner, name, canonical(policy)))
            self.audit(db, principal, identity, 'accept_retention_and_create_workspace', identity, digest(policy))
        return {'id': identity, 'name': name, 'policy': policy}

    def list_workspaces(self, principal: Principal) -> list[dict]:
        with self.connect() as db:
            return [{'id': row['id'], 'name': row['name'], 'policy': json.loads(row['policy_json'])}
                    for row in db.execute('SELECT * FROM workspaces WHERE owner=? ORDER BY id LIMIT 100', (principal.owner,))]

    def _blob(self, artifact_id: str) -> Path:
        try:
            if str(uuid.UUID(artifact_id)) != artifact_id:
                raise ValueError()
        except (ValueError, AttributeError):
            raise EvidenceError('NOT_FOUND', 'The requested evidence is unavailable.', 404)
        path = (self.blobs / artifact_id).resolve()
        if self.blobs.resolve() != path.parent:
            raise EvidenceError('UNSAFE_STORAGE', 'Artifact storage escaped its private root.', 503)
        return path

    def ingest(self, principal: Principal, workspace: str, kind: str, filename: str, content: bytes) -> dict:
        if kind not in self.LIMITS or not isinstance(content, bytes) or not 0 < len(content) <= self.LIMITS[kind]:
            raise EvidenceError('ARTIFACT_SIZE', 'The artifact type or size is unsupported.', 413)
        filename = text_field(filename, 'Filename', 160)
        if '/' in filename or '\\' in filename:
            raise EvidenceError('INVALID_FILENAME', 'Use a display filename without directories.')
        if kind == 'step' and (not content.lstrip().startswith(b'ISO-10303-21;') or b'END-ISO-10303-21;' not in content[-128:]):
            raise EvidenceError('INVALID_STEP', 'A complete single STEP file is required.')
        if kind == 'supplier_pdf' and not (content.startswith(b'%PDF-') and b'%%EOF' in content[-1024:]):
            raise EvidenceError('INVALID_PDF', 'A bounded PDF signature and ending are required; this is not a malware scan.')
        if kind == 'supplier_json':
            try:
                value = json.loads(content)
                canonical(value)
                if not isinstance(value, dict):
                    raise ValueError()
            except (ValueError, UnicodeDecodeError):
                raise EvidenceError('INVALID_JSON', 'Supplier JSON must be a finite JSON object.')
        identity, now = str(uuid.uuid4()), self.clock()
        path = self._blob(identity)
        content_hash = 'sha256-' + hashlib.sha256(content).hexdigest()
        try:
            with self.connect(write=True) as db:
                scope = self.authorize(db, principal, workspace)
                total = db.execute("SELECT COALESCE(SUM(size),0) FROM artifacts WHERE workspace=? AND availability='available'", (workspace,)).fetchone()[0]
                if total + len(content) > self.quota_bytes:
                    raise EvidenceError('STORAGE_QUOTA', 'The private workspace storage quota would be exceeded.', 413)
                days = json.loads(scope['policy_json'])['cadDays' if kind == 'step' else 'quoteDays']
                with path.open('xb') as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                db.execute('INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                           (identity, workspace, kind, filename, content_hash, len(content), now, now + days * 86400, 'available', 'user_upload'))
                self.audit(db, principal, workspace, 'ingest_original', identity, content_hash)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return self.artifact(principal, workspace, identity)

    def artifact(self, principal: Principal, workspace: str, identity: str) -> dict:
        with self.connect() as db:
            self.authorize(db, principal, workspace)
            row = db.execute('SELECT * FROM artifacts WHERE id=? AND workspace=?', (identity, workspace)).fetchone()
        if row is None:
            raise EvidenceError('NOT_FOUND', 'The requested evidence is unavailable.', 404)
        result = dict(row)
        if result['availability'] == 'available' and result['expires'] <= self.clock():
            result['availability'] = 'expired_pending_cleanup'
        return result

    def list_artifacts(self, principal: Principal, workspace: str) -> list[dict]:
        with self.connect() as db:
            self.authorize(db, principal, workspace)
            rows = db.execute('SELECT id FROM artifacts WHERE workspace=? ORDER BY created DESC LIMIT 100', (workspace,)).fetchall()
        return [self.artifact(principal, workspace, row['id']) for row in rows]

    def content(self, principal: Principal, workspace: str, identity: str) -> tuple[dict, bytes]:
        metadata = self.artifact(principal, workspace, identity)
        if metadata['availability'] != 'available':
            raise EvidenceError('EVIDENCE_UNAVAILABLE', 'The original evidence is expired or unavailable.', 410)
        path = self._blob(identity)
        try:
            with path.open('rb') as handle:
                content = handle.read(self.LIMITS[metadata['kind']] + 1)
        except FileNotFoundError:
            content = b''
        if len(content) != metadata['size'] or 'sha256-' + hashlib.sha256(content).hexdigest() != metadata['digest']:
            with self.connect(write=True) as db:
                db.execute("UPDATE artifacts SET availability='integrity_failed' WHERE id=?", (identity,))
                self.audit(db, principal, workspace, 'artifact_integrity_failed', identity, metadata['digest'])
            raise EvidenceError('EVIDENCE_INTEGRITY', 'The original evidence failed its fingerprint check.', 409)
        return metadata, content

    def challenge(self, principal: Principal, workspace: str, action: str, subject: str, content_hash: str) -> dict:
        if action not in {'freeze_rfq', 'review_quote', 'handoff', 'transfer_cad', 'solve', 'delete_artifact'}:
            raise EvidenceError('INVALID_ACTION', 'This approval action is unsupported.')
        nonce = secrets.token_urlsafe(32)
        with self.connect(write=True) as db:
            self.authorize(db, principal, workspace)
            db.execute('INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
                       (token_hash(nonce), principal.session_hash, workspace, action, subject, content_hash, self.clock() + 300))
        return {'nonce': nonce, 'expiresAt': self.clock() + 300, 'action': action, 'subject': subject, 'contentHash': content_hash}

    def consume(self, db, principal: Principal, workspace: str, action: str, subject: str, content_hash: str, nonce: str):
        self.authorize(db, principal, workspace)
        updated = db.execute('''UPDATE approvals SET consumed=? WHERE nonce_hash=? AND session_hash=? AND workspace=?
            AND action=? AND subject=? AND content_hash=? AND expires>? AND consumed IS NULL''',
            (self.clock(), token_hash(nonce), principal.session_hash, workspace, action, subject, content_hash, self.clock()))
        if updated.rowcount != 1:
            raise EvidenceError('APPROVAL_STALE', 'Approval is missing, expired, used or does not match the exact content.', 409)
        self.audit(db, principal, workspace, action, subject, content_hash)

    def save_record(self, db, principal: Principal, workspace: str, kind: str, content: dict, *, identity=None, expected=None, state='draft') -> dict:
        self.authorize(db, principal, workspace)
        if identity:
            if type(expected) is not int or expected < 1:
                raise EvidenceError('VERSION_REQUIRED', 'An exact positive record version is required.', 409)
            prior = self.get_record(principal, workspace, identity, db=db)
            if prior['version'] != expected or prior['kind'] != kind:
                raise EvidenceError('VERSION_CONFLICT', 'The record changed; reload the exact version.', 409)
            version = expected + 1
        else:
            identity, version = str(uuid.uuid4()), 1
        hashed, encoded = digest(content), canonical(content)
        if version == 1:
            db.execute('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?)', (identity, workspace, kind, version, encoded, hashed, state))
        else:
            db.execute('UPDATE records SET version=?,content_json=?,content_hash=?,state=? WHERE id=? AND workspace=?', (version, encoded, hashed, state, identity, workspace))
        db.execute('INSERT INTO versions VALUES (?, ?, ?, ?, ?)', (identity, version, encoded, hashed, state))
        self.audit(db, principal, workspace, f'{kind}_{state}', identity, hashed)
        return {'id': identity, 'workspace': workspace, 'kind': kind, 'version': version, 'content': content, 'contentHash': hashed, 'state': state}

    def get_record(self, principal: Principal, workspace: str, identity: str, *, version=None, db=None) -> dict:
        if version is not None and (type(version) is not int or version < 1):
            raise EvidenceError('VERSION_REQUIRED', 'An exact positive record version is required.', 409)
        if db is None:
            with self.connect() as connection:
                return self.get_record(principal, workspace, identity, version=version, db=connection)
        self.authorize(db, principal, workspace)
        row = db.execute('SELECT * FROM records WHERE id=? AND workspace=?', (identity, workspace)).fetchone()
        if row is None:
            raise EvidenceError('NOT_FOUND', 'The requested evidence is unavailable.', 404)
        selected = row if version is None else db.execute('SELECT * FROM versions WHERE record=? AND version=?', (identity, version)).fetchone()
        if selected is None:
            raise EvidenceError('NOT_FOUND', 'The requested evidence is unavailable.', 404)
        return {'id': identity, 'workspace': workspace, 'kind': row['kind'], 'version': selected['version'],
                'content': json.loads(selected['content_json']), 'contentHash': selected['content_hash'], 'state': selected['state']}

    def list_records(self, principal: Principal, workspace: str, kind: str, *, after='', limit=25) -> list[dict]:
        if type(limit) is not int or not 1 <= limit <= 100:
            raise EvidenceError('INVALID_LIMIT', 'Page size must be between 1 and 100.')
        with self.connect() as db:
            self.authorize(db, principal, workspace)
            rows = db.execute('SELECT id FROM records WHERE workspace=? AND kind=? AND id>? ORDER BY id LIMIT ?', (workspace, kind, after, limit)).fetchall()
            return [self.get_record(principal, workspace, row['id'], db=db) for row in rows]

    def cleanup(self) -> dict:
        deleted = 0
        with self.connect(write=True) as db:
            rows = db.execute("SELECT * FROM artifacts WHERE availability IN ('available','integrity_failed') AND expires<=? LIMIT 100", (self.clock(),)).fetchall()
            for row in rows:
                self._blob(row['id']).unlink(missing_ok=True)
                db.execute("UPDATE artifacts SET availability='expired_deleted' WHERE id=?", (row['id'],))
                db.execute('INSERT INTO audit(workspace,actor,action,subject,digest,timestamp) VALUES (?, ?, ?, ?, ?, ?)',
                           (row['workspace'], 'retention_worker', 'expire_original', row['id'], row['digest'], self.clock()))
                deleted += 1
        return {'deleted': deleted}
