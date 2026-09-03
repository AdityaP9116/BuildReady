from __future__ import annotations

import contextlib
import io
import json
import unittest
from unittest.mock import patch

from scripts.integration_preflight import ONSHAPE_FIELDS, configuration_status, parse_onshape_url, main


class IntegrationPreflightTests(unittest.TestCase):
    def environment(self):
        return {**{name: '1234567890abcdef' for name in ONSHAPE_FIELDS}, 'SIMSCALE_API_KEY': 'sensitive-simscale-key',
                'SIMSCALE_PROJECT_ID': '123456789012345', 'SIMULATION_PROVIDER': 'recorded'}

    def test_configuration_is_not_live_verification_and_never_exposes_values(self):
        result = configuration_status(self.environment())
        self.assertTrue(result['ok'])
        self.assertFalse(result['liveSimulationReady'])
        self.assertFalse(result['onshape']['connectionVerified'])
        for value in self.environment().values():
            self.assertNotIn(value, json.dumps(result))

    def test_missing_placeholder_malformed_and_unsafe_settings(self):
        result = configuration_status({})
        self.assertFalse(result['ok'])
        self.assertEqual(result['onshape']['missingFields'], list(ONSHAPE_FIELDS))
        for field, value in (('ONSHAPE_ACCESS_KEY', 'PASTE_YOUR_KEY_HERE'), ('ONSHAPE_WORKSPACE_ID', '../bad'),
                             ('SIMSCALE_PROJECT_ID', 'bad'), ('SIMULATION_PROVIDER', 'simscale')):
            with self.subTest(field=field):
                self.assertFalse(configuration_status({**self.environment(), field: value})['ok'])

    def test_workspace_url_mapping_and_version_rejection(self):
        url = 'https://cad.onshape.com/documents/12345678/w/23456789/e/34567890'
        self.assertEqual(parse_onshape_url(url), dict(zip(ONSHAPE_FIELDS[2:], ['12345678', '23456789', '34567890'])))
        for wrong in (url.replace('/w/', '/v/'), url.replace('https:', 'http:'), url.replace('cad.onshape.com', 'cad.onshape.com.attacker.invalid'),
                      url.replace('https://', 'https://user:password@'), url + '?configuration=nondefault', url + '#secret'):
            with self.subTest(url=wrong), self.assertRaises(ValueError):
                parse_onshape_url(wrong)

    def test_offline_cli_does_not_contact_providers(self):
        with patch('scripts.integration_preflight.load_dotenv'), patch.dict('os.environ', self.environment(), clear=True), \
                patch('sys.argv', ['preflight']), patch('scripts.integration_preflight.probe_project') as probe, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(), 0)
            probe.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['mode'], 'offline-configuration-check')

    def test_onshape_check_does_not_contact_network_when_unconfigured(self):
        with patch('scripts.integration_preflight.load_dotenv'), patch.dict('os.environ', {}, clear=True), \
                patch('sys.argv', ['preflight', '--check-onshape']), patch('scripts.serve.local_onshape_payload') as probe, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(main(), 1)
            probe.assert_not_called()
        self.assertFalse(json.loads(output.getvalue())['networkAttempted'])


if __name__ == '__main__':
    unittest.main()
