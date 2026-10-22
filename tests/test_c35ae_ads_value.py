"""C35AE regression: factual-only ADS value, frozen retrospective/prospective designs."""
from pathlib import Path
import importlib.util,hashlib,json,unittest,collections,math
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'scripts/train-c35ae-ads-value.py'
spec=importlib.util.spec_from_file_location('c35ae_ads',P)
T=importlib.util.module_from_spec(spec);spec.loader.exec_module(T)
A=ROOT/'reports/c35ae/offline-ads-value';B=ROOT/'reports/c35ae/prospective-24'
def read(p):return json.loads(Path(p).read_text())
class ADSValueTests(unittest.TestCase):
 def test_immutable_factual_only_and_clean_split(self):
  xs,files=T.read_rows();self.assertEqual(len(xs),1136);self.assertEqual(len(files),24)
  sp=T.group_split(xs);self.assertEqual([len(sp[k]) for k in ('train','validation','holdout')],[12,6,6])
  self.assertEqual(len(set(sum(sp.values(),[]))),24)
  self.assertEqual(sorted({x['weapon'] for x in xs}),sorted(T.GUNS))
  for q in xs:self.assertEqual(q['propensity'],.5);self.assertIn(q['toggle'],[0,1]);self.assertEqual(len(q['base']),18)
 def test_unselected_action_label_never_created(self):
  p=next(B.glob('matches/*randomized.prefire.json'))
  t=read(p)['traces'][0]
  for q in t['rows']:
   self.assertIsNone(q['unselectedOutcome']);self.assertEqual(q['propensity'],.5)
   self.assertEqual(q['publicFeatures']['provenance'],'PUBLIC_BEFORE_GAME_STEP_ONLY')
   self.assertFalse(q['firstCommand']['fire']);self.assertFalse(q['baselineCommand']['fire'])
 def test_action_menu_changes_only_action_dimension(self):
  x=T.read_rows()[0][0];one=T.assignment(x,True);none=T.assignment({**x,'toggle':0},True)
  self.assertEqual(one[:18],none[:18]);self.assertEqual(len(one),24)
  self.assertEqual(one[18],x['toggle']);self.assertEqual(none[18],0)
 def test_models_and_independent_holdout_predictions(self):
  import numpy as np
  m=read(A/'FROZEN-ADS-VALUE-MODELS.json');r=read(A/'HOLDOUT-PREDICTIONS.json')
  self.assertEqual(len(r),301)
  for q in r[::10]:
   for name,v in q['predictions'].items():
    model=m[name];x=np.array([q['rawState']+[q['arm'],q['arm']*q['rawState'][0],q['arm']*q['rawState'][1]/100,q['arm']*q['rawState'][2]/14,q['arm']*q['rawState'][4]/10,q['arm']*q['rawState'][7]/4] if model['actionFeatures'] else q['rawState']])
    y=(x-np.array(model['mean']))/np.array(model['scale'])
    for layer in model['layers']:
     w=np.array(layer['weights']);b=np.array(layer['bias']);y=y@w.T+b if w.ndim==2 else y@w+b
     y=np.maximum(y,0) if layer['activation']=='relu' else 1/(1+np.exp(-np.clip(y,-50,50)))
    self.assertAlmostEqual(float(y.reshape(-1)[0]),v,places=8)
 def test_training_and_prospective_are_disjoint_and_frozen(self):
  r=read(A/'RETROSPECTIVE-EVALUATION.json');d=read(B/'FROZEN-DESIGN.json');p=read(B/'PROSPECTIVE-MODEL-EVALUATION.json')
  old=set(sum(r['split'].values(),[]));fresh={x['setupId'] for x in d['cases']}
  self.assertFalse(old&fresh);self.assertEqual(len(fresh),12)
  self.assertEqual(T.sha(A/'FROZEN-ADS-VALUE-MODELS.json'),d['frozenNeuralModelSHA256'])
  self.assertEqual(T.sha(B/'FROZEN-DESIGN.json'),p['prospectiveRegistrationSHA256'])
  self.assertEqual(p['decision'],'NOT_PROMOTED')
 def test_external_full_shot_and_random_assignment_audit(self):
  a=read(B/'INDEPENDENT-AUDIT.json');self.assertEqual(a['status'],'PASS')
  self.assertEqual((a['matches'],a['shots'],a['pellets'],a['randomAssignments']),(24,1225,2589,572))
  self.assertEqual(a['fireMutations'],0);self.assertEqual(a['unselectedOutcomeLabels'],0)
 def test_no_policy_promotion_after_external_holdout(self):
  a=read(A/'RETROSPECTIVE-EVALUATION.json');b=read(B/'PROSPECTIVE-MODEL-EVALUATION.json')
  self.assertFalse(a['promotePolicy']);self.assertFalse(a['readinessGatePassed'])
  self.assertGreater(b['modelMetrics']['action-logistic']['brier'],b['modelMetrics']['state-logistic']['brier'])
  self.assertGreater(b['modelMetrics']['action-mlp']['brier'],b['modelMetrics']['state-logistic']['brier'])
  self.assertLess(b['policyIPS']['ipsLearnedMinusControlCI95'][0],0)
if __name__=='__main__':unittest.main()
