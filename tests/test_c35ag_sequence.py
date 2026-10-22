"""C35-AG read-only frozen trial/sequence integrity tests."""
from pathlib import Path
import json,hashlib,unittest
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ag/frozen-72'
load=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
class C35AGSequenceAudit(unittest.TestCase):
 def test_frozen_cohort_and_sources(self):
  d=load(O/'FROZEN-DESIGN.json');e=load(O/'EXECUTION-AUDIT.json')
  self.assertEqual(len(d['cases']),72);self.assertEqual(len(e['cases']),72);self.assertEqual(e['registrationSHA256'],sha(O/'FROZEN-DESIGN.json'))
  self.assertTrue(all(sha(R/k)==v for k,v in d['sourceSHA256'].items()))
 def test_independent_assigned_outcome_counts(self):
  s=load(O/'INDEPENDENT-ANALYSIS.json');self.assertEqual(s['sequence']['assigned'],256);self.assertEqual(s['sequence']['completed'],242);self.assertEqual(s['sequence']['censored'],14)
 def test_realized_sequence_not_counterfactual(self):
  d=load(O/'matches/c35ag-00-randomized.sequence.json')['traces'][0]
  self.assertTrue(all(r['unselectedOutcome'] is None for r in d['rows']))
  self.assertTrue(all(r['sequence']['provenance'].startswith('POST_ASSIGNMENT') for r in d['rows']))
 def test_segmentation_sums_to_confirmed_server_shots(self):
  d=load(O/'matches/c35ag-00-randomized.sequence.json')['traces'][0]
  for r in d['rows']:
   if r['factual']['complete']:
    self.assertEqual(sum(s['shots'] for s in r['sequence']['segments']),r['factual']['shots'])
    self.assertEqual(sum(s['hits'] for s in r['sequence']['segments']),r['factual']['hits'])
 def test_nonleaking_holdout_splits_and_production_unchanged(self):
  m=load(O/'FROZEN-SEQUENCE-PREFIX-NEURAL.json');spl=m['splitsBySetup'];self.assertTrue(set(spl['train']).isdisjoint(spl['holdout']))
  self.assertEqual(m['status'],'OFFLINE_DESCRIPTIVE_NOT_DEPLOYABLE')
  self.assertEqual(sha(R/'page-agent.js'),'6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed')
if __name__=='__main__':unittest.main()
