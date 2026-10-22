import unittest,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'reports/c35v/factual-value-24-v1'
SHA=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
class C35VProductionSeparation(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.d=json.loads((BASE/'FROZEN-DESIGN.json').read_text())
  cls.audit=json.loads((BASE/'C35V-INDEPENDENT-AUDIT.json').read_text())
  cls.model=json.loads((BASE/'models/EVALUATION.json').read_text())
 def test_source_locked_and_all_24_actual_engine_matches(self):
  for p,h in self.d['sourceSHA256'].items():self.assertEqual(SHA(ROOT/p),h,p)
  self.assertEqual(len(self.d['cases']),24)
  self.assertEqual(self.audit['matches'],24)
  self.assertTrue(self.audit['pass'])
 def test_research_never_alters_fire_or_c21_assignment(self):
  for x in ['fireSuppression','fireInjection','c21Mismatches','shotMismatch','agentErrors','invalidRows']:
   self.assertEqual(self.audit[x],0)
  self.assertEqual(self.audit['unlabeledAlternatives'],15464)
 def test_factual_labels_and_censoring_are_distinct(self):
  self.assertEqual(self.audit['observerRows'],self.audit['completeRows']+self.audit['censoredRows'])
  for c in self.d['cases']:
   p=BASE/'matches'/(c['id']+'.value.json')
   x=json.loads(p.read_text())['traces'][0]
   for r in x['rows']:
    self.assertTrue(all(a['factualOutcome'] is None for a in r['actions']))
    self.assertEqual(bool(r['factual']),not bool(r.get('censored',False)))
 def test_group_split_never_leaks_setup(self):
  groups=[set(s['setups']) for s in self.model['splits'].values()]
  for i in range(3):
   for j in range(i):self.assertFalse(groups[i]&groups[j])
  self.assertEqual(sum(v['rows'] for v in self.model['splits'].values()),self.audit['completeRows'])
 def test_model_not_eligible_to_actuate(self):
  self.assertIn('BLOCKED',self.model['promotion'])
  policy=(ROOT/'lab/arena/weapon-aware-positioning-c35u.mjs').read_text()
  self.assertNotIn('FROZEN-MLP',policy)
  self.assertNotIn('C35V', (ROOT/'page-agent.js').read_text())
if __name__=='__main__':unittest.main()
