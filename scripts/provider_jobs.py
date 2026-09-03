"""Durable leased operation ledger; uncertain external writes never auto-retry."""
from __future__ import annotations

import json
import math
import re
import secrets
import uuid

try:
    from scripts.evidence_store import EvidenceStore, EvidenceError, Principal, canonical, digest, text_field
except ModuleNotFoundError:
    from evidence_store import EvidenceStore, EvidenceError, Principal, canonical, digest, text_field


class ProviderJobs:
    def __init__(self, store: EvidenceStore):
        self.store = store
        with store.connect(write=True) as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS provider_jobs (
                  id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), operation TEXT NOT NULL,
                  request_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
                  state TEXT NOT NULL, stage TEXT NOT NULL, lease TEXT, lease_until REAL,
                  remote_json TEXT NOT NULL, result_json TEXT, updated REAL NOT NULL,
                  UNIQUE(workspace, operation, idempotency_key));
                CREATE TABLE IF NOT EXISTS compute_authorizations (
                  id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), setup_hash TEXT NOT NULL,
                  max_runs INTEGER NOT NULL, used_runs INTEGER NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS compute_reservations (
                  authorization TEXT NOT NULL REFERENCES compute_authorizations(id),
                  job TEXT NOT NULL REFERENCES provider_jobs(id), PRIMARY KEY(authorization,job));
            ''')

    def create(self, principal: Principal, workspace: str, operation: str, payload: dict, key: str) -> dict:
        if operation not in {'onshape_export', 'simscale_import', 'simscale_solve', 'supplier_api_read'}:
            raise EvidenceError('INVALID_OPERATION', 'The provider operation is unsupported.')
        text_field(key, 'Idempotency key', 100)
        content_hash = digest(payload)
        with self.store.connect(write=True) as db:
            self.store.authorize(db, principal, workspace)
            prior = db.execute('SELECT * FROM provider_jobs WHERE workspace=? AND operation=? AND idempotency_key=?', (workspace, operation, key)).fetchone()
            if prior:
                if prior['request_hash'] != content_hash:
                    raise EvidenceError('IDEMPOTENCY_CONFLICT', 'This operation key has different frozen inputs.', 409)
                return self._public(prior)
            active = db.execute("SELECT COUNT(*) FROM provider_jobs WHERE workspace=? AND state NOT IN ('COMPLETE','FAILED','CANCELED')", (workspace,)).fetchone()[0]
            if active >= 2:
                raise EvidenceError('JOB_LIMIT', 'Resolve existing provider work before scheduling more.', 409)
            identity = str(uuid.uuid4())
            db.execute('INSERT INTO provider_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?)',
                       (identity, workspace, operation, content_hash, key, canonical(payload), 'READY', 'prepared', '{}', self.store.clock()))
            self.store.audit(db, principal, workspace, 'provider_job_prepared', identity, content_hash)
            return self.get(principal, workspace, identity, db=db)

    def get(self, principal, workspace, identity, *, db=None):
        if db is None:
            with self.store.connect() as connection:
                return self.get(principal, workspace, identity, db=connection)
        self.store.authorize(db, principal, workspace)
        row = db.execute('SELECT * FROM provider_jobs WHERE workspace=? AND id=?', (workspace, identity)).fetchone()
        if row is None:
            raise EvidenceError('NOT_FOUND', 'The requested provider job is unavailable.', 404)
        return self._public(row)

    @staticmethod
    def _public(row):
        return {'id': row['id'], 'workspace': row['workspace'], 'operation': row['operation'],
                'requestHash': row['request_hash'], 'state': row['state'], 'stage': row['stage'],
                'remote': json.loads(row['remote_json']), 'result': json.loads(row['result_json']) if row['result_json'] else None}

    def claim(self, principal, workspace, identity) -> str:
        lease = secrets.token_urlsafe(24)
        with self.store.connect(write=True) as db:
            self.get(principal, workspace, identity, db=db)
            updated = db.execute("UPDATE provider_jobs SET state='LEASED',lease=?,lease_until=?,updated=? WHERE id=? AND state IN ('READY','WAITING') AND (lease_until IS NULL OR lease_until<=?)",
                                 (lease, self.store.clock() + 60, self.store.clock(), identity, self.store.clock()))
            if updated.rowcount != 1:
                raise EvidenceError('JOB_NOT_CLAIMABLE', 'This job is leased, terminal or requires reconciliation.', 409)
        return lease

    def before_external_write(self, principal, workspace, identity, lease, stage):
        text_field(stage, 'Provider stage', 80)
        with self.store.connect(write=True) as db:
            self.get(principal, workspace, identity, db=db)
            updated = db.execute("UPDATE provider_jobs SET state='WRITE_UNCERTAIN',stage=?,updated=? WHERE id=? AND state='LEASED' AND lease=? AND lease_until>?",
                                 (stage, self.store.clock(), identity, lease, self.store.clock()))
            if updated.rowcount != 1:
                raise EvidenceError('LEASE_LOST', 'The provider operation lease is no longer valid.', 409)

    def receipt(self, principal, workspace, identity, lease, remote: dict, *, complete=False, result=None):
        # Never persist URLs, signed downloads, API headers or arbitrary response text.
        if not isinstance(remote, dict) or set(remote) - {'translationId', 'storageId', 'cadId', 'cadStateId', 'simulationId', 'runId'}:
            raise EvidenceError('INVALID_RECEIPT', 'Persist only allowlisted provider identifiers.')
        for value in remote.values():
            if not isinstance(value, str) or not value or len(value) > 255 or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-' for c in value):
                raise EvidenceError('INVALID_RECEIPT', 'Provider identifiers must be bounded opaque IDs.')
        with self.store.connect(write=True) as db:
            prior = self.get(principal, workspace, identity, db=db)
            if prior['state'] == 'COMPLETE':
                if prior['result'] != result or any(prior['remote'].get(k) != v for k,v in remote.items()) or not complete:
                    raise EvidenceError('RESULT_IMMUTABLE', 'The completed job already has different evidence.', 409)
                return prior
            if any(k in prior['remote'] and prior['remote'][k] != v for k,v in remote.items()):
                raise EvidenceError('RESULT_IMMUTABLE', 'A recorded provider identity cannot be replaced.', 409)
            updated = db.execute('''UPDATE provider_jobs SET state=?,remote_json=?,result_json=?,lease=NULL,lease_until=NULL,updated=?
                WHERE id=? AND lease=? AND lease_until>? AND state IN ('LEASED','WRITE_UNCERTAIN')''',
                ('COMPLETE' if complete else 'WAITING', canonical({**prior['remote'], **remote}), canonical(result) if result is not None else None,
                 self.store.clock(), identity, lease, self.store.clock()))
            if updated.rowcount != 1:
                raise EvidenceError('LEASE_LOST', 'The receipt needs reconciliation because its lease expired.', 409)
            return self.get(principal, workspace, identity, db=db)

    def recover(self):
        with self.store.connect(write=True) as db:
            # Safe reads may resume; possibly accepted writes stay locked for explicit reconciliation.
            count = db.execute("UPDATE provider_jobs SET state='READY',lease=NULL,lease_until=NULL WHERE state='LEASED' AND lease_until<=?", (self.store.clock(),)).rowcount
            return {'safeJobsReleased': count, 'uncertainWrites': db.execute("SELECT COUNT(*) FROM provider_jobs WHERE state='WRITE_UNCERTAIN'").fetchone()[0]}

    def authorize_runs(self, principal, workspace, setup_hash, max_runs, expires_at, subject, nonce):
        if not isinstance(setup_hash, str) or not re.fullmatch(r'sha256-[0-9a-f]{64}', setup_hash) or type(expires_at) not in (int,float) or not math.isfinite(expires_at) or type(max_runs) is not int or not 1 <= max_runs <= 10 or not self.store.clock() < expires_at <= self.store.clock() + 3600:
            raise EvidenceError('INVALID_COMPUTE_ENVELOPE', 'Authorize 1–10 runs for at most one hour.')
        content_hash = digest({'setupHash': setup_hash, 'maxRuns': max_runs, 'expiresAt': expires_at})
        identity = str(uuid.uuid4())
        with self.store.connect(write=True) as db:
            self.store.consume(db, principal, workspace, 'solve', subject, content_hash, nonce)
            db.execute('INSERT INTO compute_authorizations VALUES (?, ?, ?, ?, 0, ?)', (identity, workspace, setup_hash, max_runs, expires_at))
        return identity

    def reserve_run(self, principal, workspace, authorization, job_id, setup_hash):
        with self.store.connect(write=True) as db:
            job = self.get(principal, workspace, job_id, db=db)
            stored = db.execute('SELECT request_json,lease_until FROM provider_jobs WHERE id=?', (job_id,)).fetchone()
            if job['operation'] != 'simscale_solve' or job['state'] != 'LEASED' or stored['lease_until'] <= self.store.clock():
                raise EvidenceError('INVALID_JOB', 'Only a currently leased solve job can reserve compute.', 409)
            if json.loads(stored['request_json']).get('setupHash') != setup_hash:
                raise EvidenceError('COMPUTE_APPROVAL_REQUIRED', 'The job inputs do not match the approved setup.', 409)
            row = db.execute('SELECT * FROM compute_authorizations WHERE id=? AND workspace=?', (authorization, workspace)).fetchone()
            if row is None or row['setup_hash'] != setup_hash or row['expires'] <= self.store.clock():
                raise EvidenceError('COMPUTE_APPROVAL_REQUIRED', 'An unexpired approval for this exact setup is required.', 409)
            if db.execute('SELECT 1 FROM compute_reservations WHERE authorization=? AND job=?', (authorization, job_id)).fetchone():
                return
            if db.execute('SELECT 1 FROM compute_reservations WHERE job=?', (job_id,)).fetchone():
                raise EvidenceError('COMPUTE_ALREADY_RESERVED', 'This job already has a reservation under another authorization.', 409)
            if row['used_runs'] >= row['max_runs']:
                raise EvidenceError('COMPUTE_BUDGET_EXHAUSTED', 'The approved run count is exhausted.', 409)
            db.execute('UPDATE compute_authorizations SET used_runs=used_runs+1 WHERE id=?', (authorization,))
            db.execute('INSERT INTO compute_reservations VALUES (?, ?)', (authorization, job_id))
