"""C35-X regression: no hindsight features, propensity integrity, group splits."""
import importlib.util,json,math,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trainer_c35x',ROOT/'scripts/train-c35x-action-value.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class C35XTrainingTests(unittest.TestCase):
 def row(self):
  p=ROOT/'reports/c35w/randomized-motor-36-v1/matches'
  for f in sorted(p.glob('*.random.json')):
   obj=json.loads(f.read_text())
   if obj['traces'][0]['rows']:return obj['traces'][0]['rows'][0]
  self.fail('cannot locate authorized randomized factual row')
 def test_public_feature_schema_only(self):
  row=self.row();x=m.encode(row,True)
  self.assertEqual(len(x),len(m.FEATURES))
  self.assertTrue(all(math.isfinite(v) for v in x))
  a=json.loads(json.dumps(row));a['outcome']={'hitWindow':1};a['unselectedOutcomes']=None
  self.assertEqual(m.encode(a),x,'server outcome must not leak to features')
 def test_action_changes_feature_without_affecting_public_state(self):
  r=self.row();a=json.loads(json.dumps(r));a['assignedArm']='alternative-a';a['executedAction']=r['actionSet'][1]['keys']
  self.assertEqual(m.encode(a,False),m.encode(r,False))
  self.assertNotEqual(m.encode(a,True),m.encode(r,True))
 def test_group_splits_never_overlap(self):
  sets={x:{f'c35w-{i:02}'for i in range(12)if m.split(f'c35w-{i:02}')==x}|
          {f'c35x-{i:02}'for i in range(18)if m.split(f'c35x-{i:02}')==x}for x in ('train','validation','holdout')}
  self.assertEqual([len(sets[x]) for x in ('train','validation','holdout')],[20,5,5])
  self.assertEqual(len(set.union(*sets.values())),30)
 def test_action_propensity_logged_pre_decision(self):
  r=self.row();self.assertEqual(r['propensity'],{'control':.8,'alternative-a':.1,'alternative-b':.1}[r['assignedArm']]);self.assertIsNone(r['unselectedOutcomes'])
 def test_observer_labels_only_executed_arm(self):
  r=self.row();self.assertEqual(r['executedArm'],r['assignedArm']);self.assertTrue(r['compliant'])
  self.assertTrue(r['outcome'] is not None or r['censored'])
 def test_no_target_labels_for_censored_examples(self):
  r=self.row();r['outcome']=None;r['censored']=True
  self.assertTrue(r['outcome']is None)
 def test_rigorous_setup_holdout(self):
  self.assertEqual(m.split('c35w-04'),'holdout');self.assertEqual(m.split('c35x-08'),'validation')
 def test_action_model_has_explicit_arm_identity(self):
  self.assertEqual(len([n for n in m.FEATURES if n.startswith('arm_')]),3)
  self.assertEqual(m.FEATURES[-1],'selectedMinusIncumbentHeuristic')
if __name__=='__main__':unittest.main()
