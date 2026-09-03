import unittest
from scripts.simulation_verification import readiness


class VerificationTests(unittest.TestCase):
    def records(self):
        return [dict(evidenceId=str(i), binding={'source':'same'},setup={'setupHash':'same','topologyMapping':{'meshLevel':i,'body':['b'],'supports':['s'],'loads':['l'],'geometryParityChecked':True}},
                     evidenceMode='live', sourceKind='authorized_api',provider='simscale',currentness='CURRENT',lifecycleState='COMPLETE',
                     retention={'artifactsAvailable':True,'expiresAt':200},
                     result={'runId':str(i),'metrics':{'reactionBalanceErrorPercent':0.5,'maximumDisplacementMm':1+i*.001}}) for i in range(3)]

    def test_calculable_checks_do_not_invent_engineering_verification(self):
        report = readiness(self.records(),now=100)
        self.assertEqual('pass',report['checks']['meshDisplacement'])
        self.assertEqual('pass',report['checks']['reactionBalance'])
        self.assertEqual('unknown',report['checks']['reviewedRegionStress'])
        self.assertFalse(report['engineeringVerified'])

    def test_changed_expired_duplicate_and_nonfinite_records_fail_closed(self):
        records = self.records(); records[1]['binding'] = {'source':'changed'}
        self.assertEqual('fail',readiness(records,now=100)['checks']['sourceBinding'])
        self.assertEqual('fail',readiness(self.records(),now=200)['checks']['sourceBinding'])
        records = self.records(); records[1]['result']['runId'] = '0'
        self.assertEqual('unknown',readiness(records,now=100)['checks']['threeDistinctMeshLevels'])
        records = self.records(); records[1]['result']['metrics']['maximumDisplacementMm'] = float('nan')
        self.assertEqual('unknown',readiness(records,now=100)['checks']['meshDisplacement'])
        records = self.records(); records[1]['setup']['topologyMapping']['loads'] = ['other']
        self.assertEqual('fail',readiness(records,now=100)['checks']['sourceBinding'])
