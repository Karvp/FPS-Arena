from pathlib import Path
import unittest,json,hashlib
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35ah/frozen-54'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text())
class C35AHTacticalTrial(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.d=read(O/'FROZEN-DESIGN.json');cls.a=read(O/'INDEPENDENT-VERIFICATION.json');cls.b=read(O/'INDEPENDENT-ANALYSIS.json')
 def test_frozen_design_and_integrity(self):
  self.assertEqual(len(self.d['cases']),54)
  self.assertEqual(self.a['matches'],54)
  self.assertEqual(self.a['designHash'],sha(O/'FROZEN-DESIGN.json'))
  self.assertTrue(self.a['sourceAndArtifactHashesVerified'])
 def test_intent_to_treat_not_per_tick_counterfactual(self):
  self.assertEqual(self.a['randomizedAssignments'],sum(self.a['byArm'].values()))
  self.assertEqual(self.a['randomizedAssignments'],self.a['complete']+self.a['censored'])
  self.assertTrue(self.a['unselectedOutcomesNull'])
  self.assertEqual(self.a['fireMutations'],0)
 def test_all_six_weapons_reach_exposure(self):
  self.assertEqual(set(self.a['byWeapon']),{'hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'})
  for c in self.a['byWeapon'].values():self.assertGreater(c['modifiedTicks'],0)
 def test_statistical_limits_not_promoted(self):
  for key in ('kills','deaths'):
   lo,hi=self.b['matchedRandomizedOverObserve95'][key]
   self.assertLessEqual(lo,1)
   self.assertGreaterEqual(hi,1)
  self.assertEqual(self.b['randomized']['offers'],self.a['randomizedAssignments'])
 def test_realized_exposure_and_censoring(self):
  self.assertGreater(self.a['totalChangedMotorTicks'],100)
  self.assertEqual(self.b['randomized']['rightCensored'],self.a['censored'])
