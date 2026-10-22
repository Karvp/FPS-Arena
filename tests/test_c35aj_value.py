"""Offline-only prospective experimental-value invariants (not a deployment test)."""
import unittest,json,csv,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
O=R/'reports/c35aj/prospective-108-v1';N=R/'reports/c35aj/neural'
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
class C35AJResearch(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.design=read(O/'FROZEN-DESIGN.json');cls.audit=read(O/'EXECUTION-AUDIT.json')
  cls.evaluation=read(N/'EVALUATION.json');cls.weights=read(N/'FROZEN-TACTICAL-MODELS.json')
  cls.csv=list(csv.DictReader((N/'FACTUAL-ASSIGNMENTS.csv').open()))
 def test_registration_locked_and_source_unchanged(self):
  self.assertEqual(sha(O/'FROZEN-DESIGN.json'),self.audit['registrationSHA256'])
  self.assertEqual(len(self.design['cases']),108)
  for file,h in self.design['sourceSHA256'].items():self.assertEqual(sha(R/file),h,file)
 def test_source_dataset_provenance_and_counts(self):
  self.assertEqual(self.evaluation['totalAssignments'],len(self.csv))
  self.assertEqual(sum(r['complete']=='True' for r in self.csv),self.evaluation['completed'])
  self.assertEqual(set(r['source'] for r in self.csv),{'legacy-c35ai','prospective-c35aj'})
 def test_factual_only_no_fabricated_unselected(self):
  for r in self.csv:
   self.assertEqual(float(r['propensity']),{'incumbent':.5,'option-a':.25,'option-b':.25}[r['assignedArm']])
   if r['complete']=='False':self.assertEqual(r['reward'],'')
 def test_pre_assignment_input_only(self):
  w=self.weights
  self.assertFalse(w['productionEnabled']);self.assertEqual(w['status'],'OFFLINE_ONLY')
  prohibited=['modifiedTicks','physicalMeters','survived','factualReward','damageTaken','damageDealt','interrupted']
  for k in prohibited:self.assertNotIn(k,w['stateFeatureNames']+w['actionFeatureNames'])
  self.assertTrue(w['predictionParityMaxError']<1e-8)
 def test_setup_holdout_not_in_fit_or_validation(self):
  split=self.evaluation['splitBySetup'];groups=[set(split[k]['setups']) for k in ['train','validation','holdout']]
  self.assertFalse(groups[0]&groups[1] or groups[0]&groups[2] or groups[1]&groups[2])
  self.assertEqual(len(groups[2]),12)
  self.assertEqual(split['holdout']['complete'],77)
 def test_no_generalization_claim_to_six_guns(self):
  self.assertEqual(set(self.evaluation['holdoutWeapons']),{'aa12','uzi'})
  self.assertIn('NOT_PROMOTED',self.evaluation['decision'])
 def test_policy_value_uncertainty_retained(self):
  e=self.evaluation['offPolicyHoldout'];low,high=e['clusterBootstrap95DeltaIPS']
  self.assertLess(low,0);self.assertGreater(high,0)
  self.assertEqual(e['setupClusters'],12)
 def test_new_cohort_physical_and_server_integrity(self):
  audit=read(O/'INDEPENDENT-VERIFICATION.json')
  self.assertEqual(audit['matches'],108);self.assertEqual(audit['agentErrors'],0)
  self.assertEqual(audit['fireMutations'],0)
  self.assertEqual(audit['randomizedAssignments'],240)
  self.assertEqual(audit['complete']+audit['censored'],240)
if __name__=='__main__':unittest.main()
