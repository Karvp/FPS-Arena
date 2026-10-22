"""C35-Q offline risk/abstention invariants and real replay verification."""
import sys,unittest,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from c35q_robustness import wilson_upper,brier,score,bootstrap,run,SOURCE,MODEL
import importlib.util
spec=importlib.util.spec_from_file_location('c35q_independent',ROOT/'scripts/verify-c35q-independent.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
arm=module.arm
class RobustnessTests(unittest.TestCase):
 def test_wilson_zero_is_unknown(self):self.assertIsNone(wilson_upper(0,0))
 def test_wilson_zero_mistakes_positive_bound(self):self.assertGreater(wilson_upper(0,20),0)
 def test_wilson_more_errors_greater(self):self.assertGreater(wilson_upper(5,20),wilson_upper(1,20))
 def test_all_abstain_has_no_fake_brier(self):
  rows=[dict(available=False,label={'hit':None,'identity':None},pred={'hit':None,'identity':None})]
  self.assertIsNone(score(rows)['hit']['brier']);self.assertIsNone(score(rows)['identity']['brier'])
 def test_miss_never_scored_as_wrong_id(self):
  rows=[dict(available=True,label={'hit':0,'identity':None},pred={'hit':.5,'identity':.6})]
  self.assertEqual(score(rows)['identity']['n'],0)
 def test_threshold_nothing_admitted_has_no_fake_perfect_score(self):
  rows=[dict(available=True,label={'hit':1,'identity':1},pred={'hit':.4,'identity':.8})]
  self.assertIsNone(score(rows)['idThreshold95']['observedError'])
 def test_arm_hash_deterministic(self):
  self.assertEqual(arm(42,1),arm(42,1));self.assertIn(arm(42,1),('baseline','micro-left','micro-right'))
 def test_12_preregistered_research_matches(self):
  r=run(write=False);self.assertEqual(r['datasets']['c35q_new_seed_lag_stress']['setupCount'],5) # one preregistered setup has zero shots; keep it as a limitation
 def test_no_control_promotion_even_if_hit_model_better(self):
  r=run(write=False);self.assertFalse(r['gates']['liveControl']);self.assertFalse(r['gates']['identity'])
 def test_duplicate_clusters_yield_narrow_bootstrap(self):
  r=[dict(setup='a',label={'hit':1},pred={'hit':1.0})]
  ci=bootstrap(r,'hit',reps=100);self.assertAlmostEqual(ci[0],ci[1],places=9)
if __name__=='__main__':unittest.main()
