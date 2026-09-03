"""Shared lifecycle contract for every external provider operation."""
from __future__ import annotations


STATES = frozenset({
    'READY', 'LEASED', 'WAITING', 'WRITE_UNCERTAIN', 'NEEDS_RECONCILIATION',
    'COMPLETE', 'FAILED', 'CANCELED',
})
TERMINAL = frozenset({'COMPLETE', 'FAILED', 'CANCELED'})
RETRY_SAFE = frozenset({'READY', 'WAITING'})
RECONCILIATION_REQUIRED = frozenset({'WRITE_UNCERTAIN', 'NEEDS_RECONCILIATION'})
TRANSITIONS = {
    'READY': frozenset({'LEASED', 'WRITE_UNCERTAIN', 'CANCELED'}),
    'LEASED': frozenset({'READY', 'WAITING', 'WRITE_UNCERTAIN', 'COMPLETE', 'FAILED', 'CANCELED'}),
    'WAITING': frozenset({'LEASED', 'WRITE_UNCERTAIN', 'COMPLETE', 'FAILED', 'CANCELED'}),
    'WRITE_UNCERTAIN': frozenset({'NEEDS_RECONCILIATION', 'COMPLETE'}),
    'NEEDS_RECONCILIATION': frozenset({'COMPLETE', 'FAILED', 'CANCELED'}),
    'COMPLETE': frozenset(), 'FAILED': frozenset(), 'CANCELED': frozenset(),
}


def require_transition(before: str, after: str) -> None:
    if before not in STATES or after not in TRANSITIONS[before]:
        raise ValueError(f'Unsupported provider job transition: {before} -> {after}.')


def lifecycle(state: str) -> dict[str, bool | str]:
    if state not in STATES:
        raise ValueError('Unknown provider job state.')
    return {
        'state': state,
        'terminal': state in TERMINAL,
        'retrySafe': state in RETRY_SAFE,
        'reconciliationRequired': state in RECONCILIATION_REQUIRED,
    }
