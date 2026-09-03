"""Same-origin authenticated local API. All evidence endpoints share one boundary."""
from __future__ import annotations

import json
import os
import threading
import time
import sqlite3
from http.cookies import SimpleCookie, CookieError
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

try:
    from scripts.evidence_store import EvidenceError, EvidenceStore, exact
    from scripts.sourcing_service import SourcingService
    from scripts.fea_service import FeaServiceError
except ModuleNotFoundError:
    from evidence_store import EvidenceError, EvidenceStore, exact
    from sourcing_service import SourcingService
    from fea_service import FeaServiceError


_store = None
_lock = threading.Lock()
_login_attempts = []
COOKIE = 'buildready_private'


def local_store():
    global _store
    with _lock:
        if _store is None:
            root = Path(os.environ.get('EVIDENCE_RUNTIME_DIR', Path(__file__).resolve().parents[1] / '.runtime' / 'evidence'))
            _store = EvidenceStore(root)
        return _store


def configured_owners():
    value = os.environ.get('WORKSPACE_ACCESS_TOKEN', '')
    return {'local-operator': value} if len(value) >= 32 else {}


def json_body(handler):
    if handler.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
        raise EvidenceError('JSON_REQUIRED', 'This operation requires application/json.', 415)
    try:
        size = int(handler.headers.get('Content-Length', '0'))
        if not 0 < size <= 65536:
            raise EvidenceError('REQUEST_SIZE', 'JSON requests are limited to 64 KiB.', 413)
        value = json.loads(handler.rfile.read(size))
        json.dumps(value, allow_nan=False)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise EvidenceError('INVALID_JSON', 'The request must contain bounded finite JSON.')
    if not isinstance(value, dict):
        raise EvidenceError('INVALID_JSON', 'The request must be a JSON object.')
    return value


def reply(handler, status, value, *, cookie=None):
    data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(data)))
    handler.send_header('Cache-Control', 'no-store')
    if cookie:
        handler.send_header('Set-Cookie', cookie)
    handler.end_headers()
    handler.wfile.write(data)


def dispatch(handler, method: str, path: str) -> bool:
    if not path.startswith('/api/private/'):
        return False
    handler.is_api_request = True
    try:
        handler.validate_local_api_request()
        # Unlike the legacy fixture API, real-data writes require an Origin.
        if method != 'GET' and handler.headers.get('Origin') != f"http://{handler.headers.get('Host', '')}":
            raise EvidenceError('ORIGIN_REQUIRED', 'A same-origin browser request is required.', 403)
        if method == 'GET' and path == '/api/private/capabilities':
            reply(handler, 200, {'ok': True, 'configured': bool(configured_owners()), 'schemaVersion': 'private-workspace-1.0',
                                'liveSimScale': False, 'supplierApi': False, 'sourceRoute': 'manual_evidence',
                                'note': 'Local authenticated evidence workspace; hosted operation and live SimScale remain gated.'})
            return True
        if not configured_owners():
            raise EvidenceError('WORKSPACE_DISABLED', 'Configure a local workspace access token before using private evidence.', 503)
        store = local_store()
        if method == 'POST' and path == '/api/private/session':
            with _lock:
                now = time.monotonic()
                _login_attempts[:] = [item for item in _login_attempts if now - item < 60]
                if len(_login_attempts) >= 10:
                    raise EvidenceError('LOGIN_RATE_LIMIT', 'Too many unlock attempts; wait before retrying.', 429)
                _login_attempts.append(now)
            body = json_body(handler)
            exact(body, {'accessToken'})
            session, csrf = store.login(body['accessToken'], configured_owners())
            reply(handler, 200, {'ok': True, 'csrfToken': csrf}, cookie=f'{COOKIE}={session}; HttpOnly; SameSite=Strict; Path=/api/private/; Max-Age=28800')
            return True
        cookies = SimpleCookie()
        cookies.load(handler.headers.get('Cookie', ''))
        session = cookies[COOKIE].value if COOKIE in cookies else ''
        principal = store.authenticate(session, handler.headers.get('X-CSRF-Token'), write=method != 'GET')
        query = parse_qs(urlsplit(handler.path).query)
        if any(len(values) != 1 for values in query.values()):
            raise EvidenceError('INVALID_QUERY', 'Repeated query values are not supported.')
        scope = query.get('workspace', [''])[0]
        service = SourcingService(store)
        parts = path.removeprefix('/api/private/').split('/')
        result, status = None, 200
        if parts in (['live-evidence'], ['live-verification']) and method == 'GET':
            with store.connect() as db:
                store.authorize(db, principal, scope)
            if principal.owner != 'local-operator':
                raise EvidenceError('OPERATOR_REQUIRED', 'Only the local operator can read commissioning evidence.', 403)
            try:
                from scripts.live_demo_preparation import PreparationStore
                from scripts.simscale_live import LiveJournal
            except ModuleNotFoundError:
                from live_demo_preparation import PreparationStore
                from simscale_live import LiveJournal
            import re
            identity = query.get('preparation', [''])[0]
            if not re.fullmatch(r'[0-9a-f]{64}', identity):
                raise EvidenceError('INVALID_PREPARATION', 'A complete preparation identifier is required.')
            result = LiveJournal(PreparationStore(), identity, os.environ.get('SIMSCALE_PROJECT_ID', '')).evidence()
            if parts == ['live-verification']:
                try:
                    from scripts.simulation_verification import readiness
                except ModuleNotFoundError:
                    from simulation_verification import readiness
                result = readiness(result)
        elif parts == ['live-demo']:
            # Local operator-only commissioning surface, never an unattended tool.
            with store.connect() as db:
                store.authorize(db, principal, scope)
            if principal.owner != 'local-operator':
                raise EvidenceError('OPERATOR_REQUIRED', 'Only the configured local operator can commission this demo.', 403)
            try:
                from scripts.live_demo_preparation import PreparationStore
                from scripts.simscale_live import LiveClient, LiveWorkflow, SimScaleTransportError
            except ModuleNotFoundError:
                from live_demo_preparation import PreparationStore
                from simscale_live import LiveClient, LiveWorkflow, SimScaleTransportError
            preparation = PreparationStore()
            if method == 'GET':
                with preparation.connect() as db:
                    rows = db.execute("SELECT id,expires,source_json FROM preparations WHERE state='COMPLETE' AND expires>?", (time.time(),)).fetchall()
                result = [{'preparationId': row['id'], 'expiresAt': row['expires'], 'source': json.loads(row['source_json'])} for row in rows]
            elif method == 'POST':
                body = json_body(handler)
                exact(body, {'action','preparationId','approval','mapping','level','kind','identity','simulation','reconciliation'})
                if body['action'] not in {'draft','status','import','topology','advance','reconcile','cancel','results'}:
                    raise EvidenceError('INVALID_ACTION', 'Unsupported commissioning action.')
                client = LiveClient(api_key=os.environ.get('SIMSCALE_API_KEY',''), project_id=os.environ.get('SIMSCALE_PROJECT_ID',''))
                try:
                    live = LiveWorkflow(preparation, body['preparationId'], client, require_cad=body['action'] not in {'status','reconcile','cancel'})
                    if body['action'] == 'draft': result = live.draft
                    elif body['action'] == 'status': result = live.journal.summary()
                    elif body['action'] == 'import': result = live.import_cad(body['approval'])
                    elif body['action'] == 'topology': result = live.topology()
                    elif body['action'] == 'advance': result = live.advance(body['mapping'], body['approval'], body['level'])
                    elif body['action'] == 'reconcile': result = live.reconcile(body['reconciliation'])
                    elif body['action'] == 'results': result = live.capture_metrics(body['simulation'], body['identity'], body['mapping'])
                    else: result = live.cancel(body['kind'], body['identity'], body['simulation'])
                except (ValueError, SimScaleTransportError) as error:
                    # Messages here are local bounded validation text, never raw provider responses.
                    raise EvidenceError(getattr(error, 'code', 'LIVE_OPERATION_BLOCKED'), str(error), 409) from None
        elif parts == ['logout'] and method == 'POST':
            store.logout(principal)
            reply(handler, 200, {'ok': True}, cookie=f'{COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/private/; Max-Age=0')
            return True
        if parts == ['workspaces']:
            if method == 'GET':
                result = store.list_workspaces(principal)
            elif method == 'POST':
                body = json_body(handler)
                exact(body, {'name', 'policy'})
                result, status = store.create_workspace(principal, body['name'], body['policy']), 201
        elif parts == ['artifacts'] and method == 'GET':
            result = store.list_artifacts(principal, scope)
        elif parts == ['artifacts'] and method == 'POST':
            # Authorize and check media/length BEFORE accepting private file bytes.
            with store.connect() as db:
                store.authorize(db, principal, scope)
            kind = handler.headers.get('X-Artifact-Kind', '')
            filename = handler.headers.get('X-Artifact-Filename', '')
            length = int(handler.headers.get('Content-Length', '0'))
            if kind not in store.LIMITS or not 0 < length <= store.LIMITS[kind]:
                raise EvidenceError('ARTIFACT_SIZE', 'The artifact exceeds its supported size.', 413)
            if handler.headers.get('Content-Type') != store.MEDIA[kind]:
                raise EvidenceError('ARTIFACT_MEDIA', 'The declared media type does not match its evidence category.', 415)
            content = handler.rfile.read(length)
            if len(content) != length:
                raise EvidenceError('ARTIFACT_TRUNCATED', 'The file upload was incomplete.')
            result, status = store.ingest(principal, scope, kind, filename, content), 201
        elif len(parts) in {2, 3} and parts[0] == 'artifacts' and method == 'GET':
            if len(parts) == 3 and parts[2] == 'content':
                metadata, content = store.content(principal, scope, parts[1])
                handler.send_response(200)
                handler.send_header('Content-Type', 'application/octet-stream')
                handler.send_header('Content-Disposition', f'attachment; filename="{metadata["id"]}.bin"')
                handler.send_header('Content-Length', str(len(content)))
                handler.send_header('Cache-Control', 'no-store')
                handler.end_headers()
                handler.wfile.write(content)
                return True
            if len(parts) == 2:
                result = store.artifact(principal, scope, parts[1])
        elif parts == ['requests'] and method == 'POST':
            result, status = service.prepare_request(principal, scope, json_body(handler)), 201
        elif parts == ['suppliers'] and method == 'POST':
            result, status = service.save_supplier(principal, scope, json_body(handler)), 201
        elif parts == ['quotes'] and method == 'POST':
            result, status = service.quote_draft(principal, scope, json_body(handler)), 201
        elif parts == ['comparisons'] and method == 'POST':
            result, status = service.compare(principal, scope, json_body(handler)), 201
        elif len(parts) == 1 and parts[0] in {'requests', 'quotes', 'comparisons', 'suppliers'} and method == 'GET':
            kind = {'requests': 'rfq', 'quotes': 'quote', 'comparisons': 'comparison', 'suppliers': 'supplier'}[parts[0]]
            result = store.list_records(principal, scope, kind, after=query.get('after', [''])[0], limit=int(query.get('limit', ['25'])[0]))
        elif len(parts) == 2 and parts[0] == 'records' and method == 'GET':
            version = int(query['version'][0]) if 'version' in query else None
            result = store.get_record(principal, scope, parts[1], version=version)
        elif len(parts) == 3 and parts[0] == 'records' and method == 'POST':
            body = json_body(handler)
            if parts[2] == 'challenge':
                exact(body, {'version', 'action'})
                result = service.request_challenge(principal, scope, parts[1], body['version'], body['action'])
            elif parts[2] in {'freeze', 'review'}:
                exact(body, {'version', 'nonce'})
                operation = service.freeze if parts[2] == 'freeze' else service.review
                result = operation(principal, scope, parts[1], body['version'], body['nonce'])
        if result is None:
            raise EvidenceError('ROUTE_NOT_FOUND', 'This evidence operation is unavailable.', 404)
        reply(handler, status, {'ok': True, 'result': result})
    except (EvidenceError, FeaServiceError) as error:
        reply(handler, error.status, {'ok': False, 'error': {'code': error.code, 'message': error.message}})
    except (ValueError, TypeError, KeyError, RecursionError, CookieError):
        reply(handler, 422, {'ok': False, 'error': {'code': 'INVALID_REQUEST', 'message': 'The request does not match the evidence contract.'}})
    except (OSError, sqlite3.Error):
        reply(handler, 503, {'ok': False, 'error': {'code': 'STORAGE_UNAVAILABLE', 'message': 'Private storage could not complete this operation.'}})
    return True
