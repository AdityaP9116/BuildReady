"""Manual-first quotation contracts. No supplier network calls or FEA prerequisite."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

try:
    from scripts.evidence_store import EvidenceError, EvidenceStore, Principal, digest, exact, text_field
except ModuleNotFoundError:
    from evidence_store import EvidenceError, EvidenceStore, Principal, digest, exact, text_field


ID = re.compile(r'^[A-Za-z0-9]{8,40}$')
MONEY = re.compile(r'^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$')
CHARGES = ('setup', 'finish', 'inspection', 'packaging', 'shipping', 'tax', 'other')


def decimal_amount(value):
    if not isinstance(value, str) or not MONEY.fullmatch(value):
        raise EvidenceError('INVALID_MONEY', 'Money must be a nonnegative decimal string with at most six decimal places.')
    number = Decimal(value)
    return format(number.normalize(), 'f')


def money_display(value: Decimal) -> str:
    return format(value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), '.2f')


def iso_date(value, label, *, nullable=False):
    if nullable and value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise EvidenceError('INVALID_DATE', f'{label} requires an ISO calendar date.')
    try:
        date.fromisoformat(value)
    except ValueError:
        raise EvidenceError('INVALID_DATE', f'{label} is not a calendar date.')
    return value


def source_identity(value):
    exact(value, {'documentId', 'elementId', 'microversionId', 'versionId', 'configuration', 'partIds'})
    for key in ('documentId', 'elementId', 'microversionId', 'versionId'):
        if not isinstance(value[key], str) or not ID.fullmatch(value[key]) or value[key].lower() == 'unknown':
            raise EvidenceError('INVALID_SOURCE', 'Full immutable Onshape identifiers are required.')
    config = value['configuration']
    if not isinstance(config, dict) or len(config) > 30:
        raise EvidenceError('INVALID_CONFIGURATION', 'Configuration must be explicit structured key/value data; {} means default.')
    normalized_config = {text_field(key, 'Configuration key', 80): text_field(item, 'Configuration value', 200) for key, item in config.items()}
    parts = value['partIds']
    if not isinstance(parts, list) or len(parts) != 1 or not isinstance(parts[0], str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', parts[0]):
        raise EvidenceError('SINGLE_PART_REQUIRED', 'Exactly one explicitly identified part is supported.')
    return {**value, 'configuration': normalized_config, 'partIds': sorted(parts)}


def requirements(value):
    exact(value, {'material', 'process', 'quantity', 'purchaseUnit', 'tolerances', 'finish', 'inspection', 'delivery', 'exceptions'})
    exact(value['material'], {'grade', 'condition', 'substitutions'})
    exact(value['delivery'], {'country', 'region', 'shippingBasis', 'targetDate'})
    if type(value['quantity']) is not int or not 1 <= value['quantity'] <= 100000 or value['purchaseUnit'] != 'each':
        raise EvidenceError('INVALID_QUANTITY', 'This contract supports 1–100000 individual parts, not packs or price-break extrapolation.')
    missing = []

    def optional(item, label, maximum=400):
        if item is None:
            missing.append(label)
            return None
        return text_field(item, label, maximum)

    result = {key: value[key] for key in ('quantity', 'purchaseUnit')}
    for key in ('process', 'tolerances', 'finish', 'inspection', 'exceptions'):
        result[key] = optional(value[key], key)
    result['material'] = {key: optional(item, 'material.' + key) for key, item in value['material'].items()}
    result['delivery'] = {key: optional(value['delivery'][key], 'delivery.' + key) for key in ('country', 'region', 'shippingBasis')}
    result['delivery']['targetDate'] = iso_date(value['delivery']['targetDate'], 'Target date', nullable=True)
    return result, missing


class SourcingService:
    def __init__(self, store: EvidenceStore):
        self.store = store

    def prepare_request(self, principal: Principal, workspace: str, payload: dict) -> dict:
        exact(payload, {'source', 'stepArtifactId', 'requirements', 'requestId', 'expectedVersion', 'idempotencyKey'})
        identity = source_identity(payload['source'])
        scope, missing = requirements(payload['requirements'])
        artifact, _ = self.store.content(principal, workspace, payload['stepArtifactId'])
        if artifact['kind'] != 'step':
            raise EvidenceError('STEP_REQUIRED', 'The manufacturing request must bind an actual STEP artifact.')
        content = {
            'schemaVersion': 'rfq-manifest-1.0', 'canonicalization': 'rfq-canonical-1.0',
            'source': identity, 'designSourceHash': digest(identity),
            'cadBinding': 'user_attested', 'exportVerified': False,
            'step': {'artifactId': artifact['id'], 'digest': artifact['digest'], 'byteSize': artifact['size']},
            'requirements': scope, 'scopeIncomplete': missing,
        }
        pricing = {key: item for key, item in content.items() if key != 'step'}
        pricing['step'] = {key: item for key, item in content['step'].items() if key != 'artifactId'}
        content['requestHash'] = digest(pricing)
        key = text_field(payload['idempotencyKey'], 'Idempotency key', 100)
        request_digest = digest({key: item for key, item in payload.items() if key != 'idempotencyKey'})
        with self.store.connect(write=True) as db:
            self.store.authorize(db, principal, workspace)
            existing = db.execute('SELECT * FROM idempotency WHERE workspace=? AND operation=? AND key=?', (workspace, 'prepare_rfq', key)).fetchone()
            if existing:
                if existing['digest'] != request_digest:
                    raise EvidenceError('IDEMPOTENCY_CONFLICT', 'The retry key already refers to different content.', 409)
                record_id, version = existing['result'].split(':')
                return self.store.get_record(principal, workspace, record_id, version=int(version), db=db)
            record = self.store.save_record(db, principal, workspace, 'rfq', content,
                                            identity=payload['requestId'], expected=payload['expectedVersion'])
            db.execute('INSERT INTO idempotency VALUES (?, ?, ?, ?, ?)', (workspace, 'prepare_rfq', key, request_digest, f"{record['id']}:{record['version']}"))
            return record

    def request_challenge(self, principal: Principal, workspace: str, identity: str, version: int, action: str) -> dict:
        record = self.store.get_record(principal, workspace, identity)
        if record['version'] != version or (record['kind'], action, record['state']) not in {('rfq', 'freeze_rfq', 'draft'), ('quote', 'review_quote', 'draft')}:
            raise EvidenceError('VERSION_CONFLICT', 'Reload the pending draft before approval.', 409)
        artifact_id = record['content']['step']['artifactId'] if record['kind'] == 'rfq' else record['content']['artifactId']
        self.store.content(principal, workspace, artifact_id)
        approval = self.store.challenge(principal, workspace, action, identity, record['contentHash'])
        return {**approval, 'review': record}

    def freeze(self, principal: Principal, workspace: str, identity: str, version: int, nonce: str) -> dict:
        record = self.store.get_record(principal, workspace, identity)
        self.store.content(principal, workspace, record['content']['step']['artifactId'])
        with self.store.connect(write=True) as db:
            current = self.store.get_record(principal, workspace, identity, db=db)
            if current['version'] != version or current['state'] != 'draft' or current['kind'] != 'rfq':
                raise EvidenceError('VERSION_CONFLICT', 'The request changed; review the new draft.', 409)
            self.store.consume(db, principal, workspace, 'freeze_rfq', identity, current['contentHash'], nonce)
            return self.store.save_record(db, principal, workspace, 'rfq', current['content'], identity=identity, expected=version, state='frozen')

    def quote_draft(self, principal: Principal, workspace: str, payload: dict) -> dict:
        exact(payload, {'requestId', 'requestVersion', 'artifactId', 'supplier', 'quoteReference', 'issuedAt', 'validUntil', 'offerType', 'scopeMatch', 'deviations', 'quantity', 'currency', 'unitPrice', 'statedTotal', 'charges', 'leadTime', 'citations', 'quoteId', 'expectedVersion'})
        rfq = self.store.get_record(principal, workspace, payload['requestId'], version=payload['requestVersion'])
        if rfq['kind'] != 'rfq' or rfq['state'] != 'frozen':
            raise EvidenceError('FROZEN_REQUEST_REQUIRED', 'Select an exact frozen request version.')
        artifact, _ = self.store.content(principal, workspace, payload['artifactId'])
        if artifact['kind'] not in {'supplier_pdf', 'supplier_json'}:
            raise EvidenceError('QUOTE_SOURCE_REQUIRED', 'Original supplier PDF or uploaded JSON is required.')
        exact(payload['supplier'], {'identity', 'name', 'independenceAttested'})
        supplier = {'identity': text_field(payload['supplier']['identity'], 'Supplier identity', 100).casefold(),
                    'name': text_field(payload['supplier']['name'], 'Supplier name', 120),
                    'independenceAttested': payload['supplier']['independenceAttested'] is True}
        if payload['offerType'] not in {'supplier_quote', 'indicative_estimate', 'unknown'} or payload['scopeMatch'] not in {'supplier_confirmed', 'user_attested', 'unresolved'}:
            raise EvidenceError('INVALID_CLASSIFICATION', 'Explicit offer type and scope association are required.')
        if type(payload['quantity']) is not int or not 1 <= payload['quantity'] <= 100000 or payload['currency'] not in {'USD', 'EUR', 'GBP', 'CAD'}:
            raise EvidenceError('INVALID_BASIS', 'The quoted quantity or currency is unsupported.')
        exact(payload['charges'], set(CHARGES))
        charges = {}
        for name, charge in payload['charges'].items():
            exact(charge, {'state', 'amount', 'basis', 'includedIn'})
            state = charge['state']
            if state not in {'quoted_separately', 'included', 'explicit_zero', 'not_applicable', 'excluded', 'unknown'}:
                raise EvidenceError('INVALID_CHARGE', 'The charge treatment is unsupported.')
            if charge['basis'] not in {'per_order', 'per_unit'}:
                raise EvidenceError('INVALID_CHARGE', 'Charge basis must be explicitly per order or per unit.')
            amount = decimal_amount(charge['amount']) if state == 'quoted_separately' else None
            if state != 'quoted_separately' and charge['amount'] is not None:
                raise EvidenceError('INVALID_CHARGE', 'Only separately quoted charges accept an amount.')
            included = charge['includedIn']
            if state == 'included' and included != 'unitPrice':
                raise EvidenceError('INVALID_CHARGE', 'This version supports inclusion in unit price only; other structures require manual review.')
            if state != 'included' and included is not None:
                raise EvidenceError('INVALID_CHARGE', 'Inclusion references are only valid for included costs.')
            charges[name] = {'state': state, 'amount': amount, 'basis': charge['basis'], 'includedIn': included}
        citations = payload['citations']
        if not isinstance(citations, dict) or len(citations) > 40:
            raise EvidenceError('INVALID_CITATIONS', 'Provide bounded field-level source references.')
        for field, citation in citations.items():
            text_field(field, 'Field path', 100)
            exact(citation, {'artifactId', 'locator', 'rawValue'})
            if citation['artifactId'] != artifact['id']:
                raise EvidenceError('CITATION_SCOPE', 'Citations must refer to the preserved original.')
            text_field(citation['locator'], 'Page/section or JSON Pointer', 150)
            text_field(citation['rawValue'], 'Original source wording', 500)
        deviations = payload['deviations']
        if not isinstance(deviations, list) or len(deviations) > 20:
            raise EvidenceError('INVALID_DEVIATIONS', 'Provide an explicit bounded deviation list.')
        normalized = {
            'schemaVersion': 'supplier-quote-1.1', 'sourceKind': 'supplier_document_upload',
            'artifactId': artifact['id'], 'sourceDigest': artifact['digest'],
            'requestId': rfq['id'], 'requestVersion': rfq['version'], 'requestHash': rfq['content']['requestHash'],
            'supplier': supplier, 'quoteReference': text_field(payload['quoteReference'], 'Quote reference', 120),
            'issuedAt': iso_date(payload['issuedAt'], 'Issue date'), 'validUntil': iso_date(payload['validUntil'], 'Expiry', nullable=True),
            'offerType': payload['offerType'], 'scopeMatch': payload['scopeMatch'],
            'deviations': [text_field(item, 'Deviation', 300) for item in deviations],
            'quantity': payload['quantity'], 'currency': payload['currency'],
            'unitPrice': decimal_amount(payload['unitPrice']) if payload['unitPrice'] is not None else None,
            'statedTotal': decimal_amount(payload['statedTotal']) if payload['statedTotal'] is not None else None,
            'charges': charges, 'leadTime': text_field(payload['leadTime'], 'Lead-time basis', 300) if payload['leadTime'] is not None else None,
            'citations': citations, 'reviewStatus': 'pending',
        }
        if normalized['validUntil'] is not None and normalized['validUntil'] < normalized['issuedAt']:
            raise EvidenceError('INVALID_DATE', 'Quote expiry cannot precede issuance.')
        with self.store.connect(write=True) as db:
            return self.store.save_record(db, principal, workspace, 'quote', normalized, identity=payload['quoteId'], expected=payload['expectedVersion'])

    def review(self, principal: Principal, workspace: str, identity: str, version: int, nonce: str) -> dict:
        record = self.store.get_record(principal, workspace, identity)
        quote = record['content']
        self.store.content(principal, workspace, quote['artifactId'])
        required = {'supplier', 'quoteReference', 'issuedAt', 'quantity', 'currency', 'offerType'}
        if quote['scopeMatch'] == 'supplier_confirmed':
            required.add('scopeMatch')
        if quote['unitPrice'] is not None:
            required.add('unitPrice')
        if quote.get('statedTotal') is not None:
            required.add('statedTotal')
        if quote['validUntil'] is not None:
            required.add('validUntil')
        if quote['leadTime'] is not None:
            required.add('leadTime')
        required.update('charges.' + key for key, item in quote['charges'].items() if item['state'] not in {'unknown', 'excluded'})
        if not required.issubset(quote['citations']):
            raise EvidenceError('CITATIONS_REQUIRED', 'Known terms and supplier-confirmed scope need field-level original-source citations.')
        if quote['deviations'] and quote['scopeMatch'] == 'supplier_confirmed':
            raise EvidenceError('SCOPE_DEVIATION', 'Deviating supplier terms cannot be reviewed as an exact match.')
        with self.store.connect(write=True) as db:
            current = self.store.get_record(principal, workspace, identity, db=db)
            if current['version'] != version or current['state'] != 'draft' or current['kind'] != 'quote':
                raise EvidenceError('VERSION_CONFLICT', 'The quote changed; review the new draft.', 409)
            self.store.consume(db, principal, workspace, 'review_quote', identity, current['contentHash'], nonce)
            reviewed = {**quote, 'reviewStatus': 'reviewed', 'reviewedBy': principal.owner,
                        'reviewedAt': datetime.fromtimestamp(self.store.clock(), timezone.utc).isoformat(),
                        'citationVerification': 'human_attested_not_parser_verified'}
            return self.store.save_record(db, principal, workspace, 'quote', reviewed, identity=identity, expected=version, state='reviewed')

    def compare(self, principal: Principal, workspace: str, payload: dict) -> dict:
        exact(payload, {'requestId', 'requestVersion', 'requestHash', 'offers'})
        rfq = self.store.get_record(principal, workspace, payload['requestId'], version=payload['requestVersion'])
        if rfq['kind'] != 'rfq' or rfq['state'] != 'frozen' or rfq['content']['requestHash'] != payload['requestHash']:
            raise EvidenceError('RFQ_MISMATCH', 'Comparison needs the exact frozen request hash and version.', 409)
        if not isinstance(payload['offers'], list) or not 0 <= len(payload['offers']) <= 20:
            raise EvidenceError('INVALID_OFFERS', 'Select at most 20 exact quote versions.')
        seen, offers, exact_totals = set(), [], {}
        today = datetime.fromtimestamp(self.store.clock(), timezone.utc).date().isoformat()
        for item in payload['offers']:
            exact(item, {'id', 'version'})
            if item['id'] in seen:
                raise EvidenceError('DUPLICATE_OFFER', 'Select only one version of each offer.')
            seen.add(item['id'])
            record = self.store.get_record(principal, workspace, item['id'], version=item['version'])
            if record['kind'] != 'quote':
                raise EvidenceError('QUOTE_REQUIRED', 'Every selected offer must be a quote.')
            latest = self.store.get_record(principal, workspace, item['id'])
            quote = record['content']
            blockers, caveats, missing = [], [], []
            try:
                self.store.content(principal, workspace, quote['artifactId'])
                available = 'available'
            except EvidenceError as error:
                if error.status not in {409, 410}:
                    raise
                available = 'unavailable'
                blockers.append('original_evidence_unavailable')
            if record['state'] != 'reviewed':
                blockers.append('review_pending')
            if record['version'] != latest['version']:
                blockers.append('superseded_by_newer_version')
            if quote['requestHash'] != payload['requestHash'] or quote['quantity'] != rfq['content']['requirements']['quantity']:
                blockers.append('different_request_or_quantity')
            if quote['scopeMatch'] == 'unresolved' or quote['deviations'] or rfq['content']['scopeIncomplete']:
                blockers.append('scope_unresolved_or_deviating')
            elif quote['scopeMatch'] == 'user_attested':
                caveats.append('scope_user_attested_not_supplier_confirmed')
            validity = 'unknown' if quote['validUntil'] is None else ('expired' if quote['validUntil'] < today else 'current')
            if quote['issuedAt'] > today:
                validity = 'unknown'
                blockers.append('future_issue_date')
            if validity == 'expired':
                blockers.append('expired')
            elif validity == 'unknown':
                missing.append('validUntil')
            if quote['offerType'] != 'supplier_quote':
                caveats.append('not_confirmed_firm_offer')
            if not quote['supplier']['independenceAttested']:
                caveats.append('supplier_independence_unresolved')
            if quote['leadTime'] is None:
                missing.append('leadTime')
            total = Decimal(0)
            if quote['unitPrice'] is None:
                missing.append('unitPrice')
            else:
                total = Decimal(quote['unitPrice']) * quote['quantity']
            for name, charge in quote['charges'].items():
                if charge['state'] in {'unknown', 'excluded'}:
                    missing.append('charges.' + name)
                elif charge['state'] == 'quoted_separately':
                    total += Decimal(charge['amount']) * (quote['quantity'] if charge['basis'] == 'per_unit' else 1)
            complete_costs = not any(field == 'unitPrice' or field.startswith('charges.') for field in missing)
            stated = quote.get('statedTotal')
            if stated is None:
                missing.append('statedTotal')
            elif complete_costs and Decimal(stated) != total:
                blockers.append('supplier_total_mismatch')
            exact_totals[record['id']] = total
            offers.append({
                'id': record['id'], 'version': record['version'], 'contentHash': record['contentHash'],
                'sourceKind': quote['sourceKind'], 'supplier': quote['supplier'], 'reviewStatus': quote['reviewStatus'],
                'designMatch': quote['scopeMatch'], 'validity': validity, 'evidenceAvailability': available,
                'currency': quote['currency'], 'knownCostTotal': money_display(total),
                'landedCostTotal': money_display(total) if complete_costs else None,
                'statedTotal': stated, 'computedTotal': money_display(total),
                'totalReconciliation': 'not_stated' if stated is None else (
                    'not_reconcilable' if not complete_costs else (
                        'matches_source' if Decimal(stated) == total else 'contradicts_source')),
                'missingFields': missing, 'blockingReasons': blockers, 'caveats': caveats,
                'charges': quote['charges'], 'leadTime': quote['leadTime'],
            })
        currencies = {item['currency'] for item in offers}
        if len(currencies) > 1 or any(currency != 'USD' for currency in currencies):
            for item in offers:
                item['blockingReasons'].append('currency_policy_unsupported_or_mixed')
        independent = len(offers) >= 2 and len({item['supplier']['identity'] for item in offers}) == len(offers) and len({item['supplier']['name'].strip().casefold() for item in offers}) == len(offers)
        blocked = any(item['blockingReasons'] for item in offers)
        eligible = independent and not blocked and all(not item['missingFields'] and not item['caveats'] for item in offers)
        content = {
            'schemaVersion': 'quote-comparison-1.1', 'policyVersion': 'usd-half-up-complete-landed-reconciled-1.1',
            'requestId': rfq['id'], 'requestVersion': rfq['version'], 'requestHash': payload['requestHash'],
            'evaluatedAt': datetime.fromtimestamp(self.store.clock(), timezone.utc).isoformat(),
            'outcome': 'eligible' if eligible else ('blocked' if blocked else 'conditional'),
            'ranking': [item['id'] for item in sorted(offers, key=lambda item: exact_totals[item['id']])] if eligible else None,
            'independentOfferCountConfirmed': len(offers) if independent and all(item['supplier']['independenceAttested'] for item in offers) else 0,
            'offers': offers, 'engineeringReadiness': {'status': 'not_evaluated', 'manufacturingRelease': False},
            'note': 'One offer is a sourcing assessment, not a comparison. No purchase or supplier selection is performed.',
        }
        with self.store.connect(write=True) as db:
            return self.store.save_record(db, principal, workspace, 'comparison', content, state='historical_evaluation')
