"""Secret-safe local setup checks. Network checks require explicit read-only flags."""
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict
from urllib.parse import urlsplit

try:
    from scripts.simscale_probe import load_dotenv, probe_project, api_key_from_environment, SimScaleProbeError
except ModuleNotFoundError:
    from simscale_probe import load_dotenv, probe_project, api_key_from_environment, SimScaleProbeError


ONSHAPE_FIELDS = ('ONSHAPE_ACCESS_KEY', 'ONSHAPE_SECRET_KEY', 'ONSHAPE_DOCUMENT_ID', 'ONSHAPE_WORKSPACE_ID', 'ONSHAPE_ELEMENT_ID')
ID_PATTERN = re.compile(r'[A-Za-z0-9]{8,40}')


def configured(value: str) -> bool:
    value = value.strip()
    return bool(value) and not any(marker in value.lower() for marker in ('your_', 'your-', 'paste_', 'replace_', 'changeme', '<', '>'))


def parse_onshape_url(value: str) -> dict[str, str]:
    """Extract viewer IDs, never treat a version ID as a workspace ID."""
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or parsed.hostname != 'cad.onshape.com' or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError('Use an https://cad.onshape.com Part Studio URL without embedded credentials.')
    matched = re.fullmatch(r'/documents/([A-Za-z0-9]{8,40})/w/([A-Za-z0-9]{8,40})/e/([A-Za-z0-9]{8,40})/?', parsed.path)
    if not matched or parsed.query or parsed.fragment:
        raise ValueError('Use a default-configuration workspace Part Studio URL: /documents/ID/w/ID/e/ID, without query or fragment. Version URLs are reserved for later frozen export setup.')
    return dict(zip(ONSHAPE_FIELDS[2:], matched.groups()))


def configuration_status(environment: dict[str, str]) -> dict:
    missing = [name for name in ONSHAPE_FIELDS if not configured(environment.get(name, ''))]
    invalid = [name for name in ONSHAPE_FIELDS[2:] if name not in missing and not ID_PATTERN.fullmatch(environment[name].strip())]
    simscale_missing = [name for name in ('SIMSCALE_API_KEY', 'SIMSCALE_PROJECT_ID') if not configured(environment.get(name, ''))]
    project_valid = bool(re.fullmatch(r'[0-9]{1,30}', environment.get('SIMSCALE_PROJECT_ID', '').strip()))
    safe_mode = environment.get('SIMULATION_PROVIDER', 'recorded').strip() in {'recorded', 'disabled'}
    return {
        'ok': not missing and not invalid and not simscale_missing and project_valid and safe_mode,
        'mode': 'offline-configuration-check',
        'onshape': {'configured': not missing and not invalid, 'missingFields': missing, 'invalidFields': invalid, 'connectionVerified': False},
        'simscale': {'configured': not simscale_missing and project_valid, 'missingFields': simscale_missing, 'projectIdValid': project_valid, 'connectionVerified': False},
        'safeProviderMode': safe_mode,
        'liveSimulationReady': False,
        'note': 'Configuration is not authentication, exact CAD export, free compute entitlement or permission to upload/run. No providers are contacted without an explicit check flag.',
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--onshape-url', help='Print only the three non-secret viewer settings to copy into .env; makes no network requests.')
    group.add_argument('--check-simscale', action='store_true', help='One GET for the locally configured SimScale project.')
    group.add_argument('--check-onshape', action='store_true', help='Use the existing read-only Onshape proxy to check configured model access.')
    args = parser.parse_args()
    if args.onshape_url:
        try:
            for name, value in parse_onshape_url(args.onshape_url).items():
                print(f'{name}={value}')
        except ValueError:
            print('Invalid URL. Use the default Part Studio workspace URL on cad.onshape.com (/documents/ID/w/ID/e/ID) without query/fragment; do not pass keys here.')
            return 1
        return 0
    load_dotenv()
    status = configuration_status(dict(os.environ))
    if not status['safeProviderMode']:
        print(json.dumps({'ok': False, 'error': 'Keep SIMULATION_PROVIDER=recorded or disabled during setup.'}))
        return 1
    if args.check_simscale:
        try:
            result = asdict(probe_project(api_key_from_environment(), os.environ.get('SIMSCALE_PROJECT_ID', '').strip()))
        except SimScaleProbeError as error:
            result = {'ok': False, 'error': {'code': error.code, 'message': error.message}}
    elif args.check_onshape:
        if not status['onshape']['configured']:
            result = {'ok': False, 'onshape': status['onshape'], 'networkAttempted': False}
        else:
            try:
                from scripts.serve import local_onshape_payload
            except ModuleNotFoundError:
                from serve import local_onshape_payload
            code, payload = local_onshape_payload()
            # Provider document text, dimensions and IDs stay out of setup output.
            result = {'ok': code == 200 and payload.get('ok') is True, 'mode': 'read-only-onshape-check',
                      'errorCode': payload.get('error', {}).get('code') if code != 200 else None,
                      'namedVariableCount': len(payload.get('variables', [])),
                      'nativeParameterCount': len(payload.get('nativeDimensions', [])),
                      'exactCadExportVerified': False, 'liveSimulationReady': False}
    else:
        result = status
    print(json.dumps(result, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
