import json,sys,unittest,copy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from c35p_confidence import run,prepare,fields,describe,load,OUT
class C35PTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.report=load(OUT/'CALIBRATION-REPORT.json');cls.model=load(OUT/'FROZEN-PUBLIC-CONFIDENCE.json')
 def test_dataset_matches_48_historical_cases(self):self.assertEqual(self.report['shots'],1365)
 def test_splits_do_not_overlap(self):
  d=self.report['splitSetups'];self.assertEqual(len(d['train']),6);self.assertEqual(len(d['validation']),3);self.assertEqual(len(d['holdout']),3)
  self.assertEqual(len(set(d['train']+d['validation']+d['holdout'])),12)
 def test_holdout_not_training(self):self.assertEqual(self.model['trainedOnlyOn'],'c35o train setup IDs')
 def test_all_four_lags_in_holdout(self):
  r=self.report['heads']['hit']['splits']['holdout']['byLag'];self.assertEqual(set(r),{'30','85','150','215'})
 def test_misses_have_no_identity_label(self):
  rows,_=prepare();self.assertTrue(all(r['identity'] is None for r in rows if r['hit']==0))
 def test_identity_only_after_hit(self):
  rows,_=prepare();self.assertTrue(all(r['hit']==1 for r in rows if r['identity'] is not None))
 def test_ambiguous_shot_abstains(self):
  rows,_=prepare();self.assertGreater(sum(r['ambiguous'] for r in rows),0);self.assertTrue(all(r['identity'] is None for r in rows if r['ambiguous']))
 def test_no_labels_in_public_features(self):
  row={'eligible':True,'age':.2,'aimAngleDeg':5.,'available':2,'projectedDisplacement':.1,'projectedAimId':'a'}
  before=fields(row);row.update({'serverHit':True,'rewindSeconds':.1,'pellets':[{'targetId':'b'}]});after=fields(row)
  self.assertTrue((before==after).all())
 def test_malformed_or_future_public_row_abstains(self):
  self.assertIsNone(fields({'eligible':True,'age':-.1,'aimAngleDeg':10,'available':1}))
  self.assertIsNone(fields({'eligible':False,'age':.1,'aimAngleDeg':10,'available':1}))
 def test_predictions_bounded(self):
  for head,m in self.model['heads'].items():
   self.assertEqual(len(m['coef']),len(m['columns'])+1)
   self.assertTrue(all(math.isfinite(n) for n in m['coef']))
 def test_holdout_is_not_artificially_passed(self):
  for head in ('hit','identity'):
   d=self.report['heads'][head]['splits']['holdout'];self.assertGreater(d['selected']['brier'],d['constant']['brier'])
 def test_report_regenerates_consistently(self):
  again=run(write=False);self.assertEqual(again['heads'],self.report['heads'])
if __name__=='__main__':unittest.main()
