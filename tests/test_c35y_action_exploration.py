"""C35Y prospective research checks: labels and splits are audited, not causal counterfactuals."""
import unittest,json,sys,math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(R/'scripts'))
import importlib.util
spec=importlib.util.spec_from_file_location('cytrainer',R/'scripts/train-c35y-action-value.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
O=R/'reports/c35y/expansion-72'
read=lambda p:json.loads(p.read_text())
class C35YExperiment(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.design=read(O/'FROZEN-DESIGN.json');cls.audit=read(O/'INDEPENDENT-AUDIT.json');cls.model=read(R/'reports/c35y/action-value-v1/ACTION-VALUE-EVALUATION.json')
 def test_completed_cohort(self):
  self.assertEqual(len(self.design['cases']),72);self.assertEqual(self.audit['matchCount'],72)
 def test_random_assignment_integrity(self):
  self.assertEqual(self.audit['c35yMismatch'],0);self.assertEqual(self.audit['c21Mismatch'],0);self.assertEqual(self.audit['c35yAssignmentsRecomputed'],355)
 def test_mandatory_factual_integrity(self):
  self.assertEqual(self.audit['completed']+self.audit['censored'],self.audit['c35yAssignmentsRecomputed'])
 def test_no_unselected_reward(self):self.assertTrue(self.audit['actionUnchosenOutcomesUnlabelled'])
 def test_no_live_fire_changed(self):self.assertEqual(self.audit['fireMutation'],0)
 def test_propensity_per_row(self):
  cases=[c for c in self.design['cases'] if c['arm']=='explore']
  for c in cases:
   rows=read(O/'matches'/f'{c["id"]}.random.json')['traces'][0]['rows']
   for row in rows:
    self.assertEqual(row['propensity'],{'control':.6,'alternative-a':.2,'alternative-b':.2}[row['assignedArm']]);self.assertIsNone(row['unselectedOutcomes'])
 def test_setup_split_does_not_leak(self):
  splits=self.model['splits'];ss=[set(splits[k]['setups']) for k in ('train','validation','holdout')]
  self.assertFalse(ss[0]&ss[1]);self.assertFalse(ss[0]&ss[2]);self.assertFalse(ss[1]&ss[2])
 def test_no_model_promotion(self):
  self.assertGreaterEqual(self.model['holdout']['action-logistic']['overall']['brier'],self.model['holdout']['state-only']['overall']['brier'])
 def test_actual_alternative_exposure(self):self.assertEqual(self.audit['executedAlternatives'],140)
 def test_frozen_data_cannot_repair_missing_sniper_support(self):
  p=read(O/'EXPLORATION-ANALYSIS.json')['exposureByWeapon'];self.assertEqual(p['hk_sl8']['offers'],0);self.assertEqual(p['l115a3']['offers'],0)
if __name__=='__main__':unittest.main()
