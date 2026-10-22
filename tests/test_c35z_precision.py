"""C35-Z prospective independent check: no action inference for unchosen choices."""
import unittest,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];O=ROOT/'reports/c35z/precision-36'
read=lambda p:json.loads(p.read_text())
class PrecisionExplorationAudit(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.d=read(O/'FROZEN-DESIGN.json');cls.a=read(O/'INDEPENDENT-AUDIT.json');cls.r=read(O/'PRECISION-ANALYSIS.json')
 def test_locked_36_real_games(self):
  self.assertEqual(len(self.d['cases']),36);self.assertEqual(self.a['matchCount'],36)
 def test_12_setups_precisely_two_weapons(self):
  self.assertEqual(self.a['setupCount'],12);self.assertEqual(set(self.a['exposureByGun']),{'hk_sl8','l115a3'})
 def test_source_hash_lock(self):
  for p,h in self.d['sourceSHA256'].items():self.assertEqual(hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),h,p)
 def test_assignment_integrity(self):
  self.assertEqual(self.a['c35zMismatch'],0);self.assertEqual(self.a['c21Mismatch'],0);self.assertEqual(self.a['c35zAssignmentsRecomputed'],125)
 def test_actual_precise_exposure(self):
  e=self.a['exposureByGun'];self.assertEqual(e['hk_sl8']['offers'],79);self.assertEqual(e['l115a3']['offers'],46)
  self.assertEqual(self.a['executedAlternatives'],54)
 def test_no_fake_rewards(self):
  self.assertTrue(self.a['actionUnchosenOutcomesUnlabelled']);self.assertEqual(self.a['fireMutation'],0)
  self.assertEqual(self.a['completed']+self.a['censored'],self.a['c35zAssignmentsRecomputed'])
 def test_no_asserted_combat_superiority(self):
  self.assertLess(self.r['byArm']['precision']['kills'],self.r['byArm']['observe']['kills'])
  lower,upper=self.r['pairedBootstrap6000']['killsRatio'];self.assertLess(lower,1);self.assertGreater(upper,1)
 def test_precise_rejection_reasons_exposed(self):
  for e in self.a['exposureByGun'].values():
   self.assertGreater(e['refused']['static-line-blocked'],0)
   self.assertGreater(e['refused']['stance-or-air'],0)
if __name__=='__main__':unittest.main()
