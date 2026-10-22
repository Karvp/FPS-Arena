#!/usr/bin/env python3
"""Focused C27 regression test without modifying prospective study source hash."""
import copy,importlib.util, pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=ROOT/'scripts/temporal-threat-gru-c27.py'
spec=importlib.util.spec_from_file_location('c27',source);mod=importlib.util.module_from_spec(spec);sys.modules['c27']=mod;spec.loader.exec_module(mod)
class C27Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.dev=mod.load(ROOT/'reports/c25/study24/COMBINED-DATASET.json')
  cls.frozen=mod.load(ROOT/'reports/c27/study36/FROZEN-MODELS.json')
  cls.match=cls.dev['matches'][0]
 def test_real_gru_trained(self):
  net=[m for m in self.frozen['candidates'] if m['kind']=='gru'][0]
  self.assertIn('gru.weight_ih_l0',net['state']);self.assertEqual(len(net['state']['gru.weight_ih_l0']),24)
  self.assertGreater(net['config']['selectedEpochByValidation'],0)
  self.assertEqual(len(net['state']['head.weight'][0]),17)
 def test_frozen_model_selected_by_validation(self):
  f=self.frozen
  best=min(range(4),key=lambda i:(f['validationScores'][i]['validation']['logLoss'],i))
  self.assertEqual(f['selectedIndex'],best)
 def test_history_ignores_future_labels(self):
  m=self.match;i=next(i for i,w in enumerate(m['windows']) if i>=2 and w['complete'])
  orig=mod.encode_window(m,i);a=copy.deepcopy(m)
  for j in range(i+1):a['windows'][j]['label']['hostileWeaponHitEvents']=999;a['windows'][j]['label']['hostileWeaponDamage']=99999
  self.assertEqual(mod.encode_window(a,i),orig)
 def test_history_censor_gap(self):
  m=copy.deepcopy(self.match);i=next(i for i,w in enumerate(m['windows']) if i>=2 and w['complete'])
  m['windows'][i-1]['complete']=False
  f=mod.encode_window(m,i)
  self.assertEqual(f['mask'],[0.,0.,1.]);self.assertEqual(f['sequence'][0],[0]*5);self.assertEqual(f['sequence'][1],[0]*5)
 def test_future_server_value_in_public_cue_rejected(self):
  m=copy.deepcopy(self.match);m['windows'][0]['publicCueBeforeWindow']['futureHit']=1
  with self.assertRaisesRegex(ValueError,'public cue leakage'):mod.validate_match(m)
 def test_training_does_not_use_holdout(self):
  f=self.frozen
  self.assertEqual(f['trainMatches'],12);self.assertEqual(f['validationMatches'],6);self.assertEqual(f['previousC25TestExcluded'],6)
  self.assertEqual(set(m['kind'] for m in f['candidates']),{'constant','static-logistic','temporal-logistic','gru'})
 def test_model_forward_and_determinism(self):
  m=self.match;rows,_=mod.dataset_rows({'schema':'fpsarena-c25-fixed-grid-dataset-v1','matches':[m]})
  net=[v for v in self.frozen['candidates'] if v['kind']=='gru'][0]
  p=mod.prediction(net,rows);self.assertTrue(all(0<x<1 for x in p));self.assertEqual(p,mod.prediction(net,rows))
 def test_duplicate_match_rejected(self):
  with self.assertRaisesRegex(ValueError,'duplicate match'):mod.dataset_rows({'schema':'fpsarena-c25-fixed-grid-dataset-v1','matches':[self.match,self.match]})
 def test_unsupported_leaky_win_fields_rejected(self):
  m=copy.deepcopy(self.match);m['windows'][0]['publicStatus']['serverFutureDamage']=123
  with self.assertRaisesRegex(ValueError,'public status leakage'):mod.validate_match(m)
if __name__=='__main__':unittest.main(verbosity=2)
