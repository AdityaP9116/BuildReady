import unittest

from scripts.job_lifecycle import lifecycle, require_transition


class JobLifecycleTests(unittest.TestCase):
    def test_uncertain_work_is_never_retry_safe(self):
        state = lifecycle('WRITE_UNCERTAIN')
        self.assertTrue(state['reconciliationRequired'])
        self.assertFalse(state['retrySafe'])
        self.assertFalse(state['terminal'])

    def test_only_declared_transitions_are_accepted(self):
        require_transition('READY', 'LEASED')
        require_transition('LEASED', 'WRITE_UNCERTAIN')
        require_transition('WRITE_UNCERTAIN', 'COMPLETE')
        for before, after in (('WRITE_UNCERTAIN', 'READY'), ('COMPLETE', 'READY'), ('FAILED', 'COMPLETE')):
            with self.subTest(before=before, after=after), self.assertRaises(ValueError):
                require_transition(before, after)


if __name__ == '__main__':
    unittest.main()
