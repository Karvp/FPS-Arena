"""C35-AA regression: preregistration, authoritative shot labels and public boundaries."""
import unittest,hashlib,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R/'reports/c35aa/matched-36'
class AimMovementStudy(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.design=json.loads((O/'FROZEN-DESIGN.json').read_text())
  cls.audit=json.loads((O/'INDEPENDENT-AUDIT.json').read_text())
  cls.analysis=json.loads((O/'ANALYSIS.json').read_text())
 def test_all_matches_present(self):
  self.assertEqual(36,len(self.design['cases']));self.assertEqual(self.audit['matchCount'],36)
 def test_preregister_sha_locked(self):
  for p,h in self.design['sourceSHA256'].items():
   self.assertEqual(hashlib.sha256((R/p).read_bytes()).hexdigest(),h,p)
  self.assertEqual(hashlib.sha256((O/'FROZEN-DESIGN.json').read_bytes()).hexdigest(),self.audit['registrationSHA256'])
 def test_all_shots_and_pellets(self):
  self.assertEqual(1964,self.audit['shotsReconciled']);self.assertEqual(2712,self.audit['pelletsReconciled'])
  self.assertEqual(sum(x['shots'] for x in self.analysis['matchTotals'].values()),1964)
 def test_causal_assignment_verified(self):
  self.assertEqual(91,self.audit['c21AssignmentsRecomputed']);self.assertEqual(237,self.audit['c35ExplorationAssignmentsRecomputed'])
  self.assertEqual(96,self.audit['executedAlternatives'])
 def test_no_shot_mutation(self):
  self.assertEqual(0,self.audit['fireChanges']);self.assertEqual(0,self.audit['agentErrors'])
 def test_public_features_precede_server_truth(self):
  for c in self.design['cases']:
   p=O/'matches'/(c['id']+'.aim.json');trace=json.loads(p.read_text())['traces'][0]
   for row in trace['rows']:
    self.assertEqual('PUBLIC_BEFORE_GAME_STEP_ONLY',row['publicBeforeStep']['provenance'])
    self.assertTrue(row['outcomesOnlyAfterStep'])
    self.assertIn('serverLabelsAfterStep',row)
    self.assertNotIn('hit',row['publicBeforeStep'])
 def test_per_weapon_shot_not_pellet(self):
  self.assertGreater(self.audit['byWeapon']['aa12']['pellets'],self.audit['byWeapon']['aa12']['shots'])
  self.assertEqual(self.audit['byWeapon']['hk_sl8']['pellets'],self.audit['byWeapon']['hk_sl8']['shots'])
 def test_spread_static_metadata_matches_engine(self):
  self.assertEqual(0,self.analysis['spreadDifference']['maxAbsDeg'])
  self.assertEqual(0,self.analysis['aimDisagreements'])
 def test_paired_analysis_no_promotion(self):
  self.assertEqual(12,self.analysis['setups'])
  lo,hi=self.analysis['randomizedVsObserve']['kills']['CI95'];self.assertLess(lo,1);self.assertGreater(hi,1)
