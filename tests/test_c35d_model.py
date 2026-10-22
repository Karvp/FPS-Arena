import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from c35d_transition_model import fit,probability,metrics,vectors

def row(i, label):
 return {'futurePriority':label,'features':{'quietMs':i*100.,'priorityFraction500':0.,'priorityEdges1000':i%3,'aim':i%2,'moving':1}}
class TransitionModelTests(unittest.TestCase):
 def test_no_future_label_is_feature(self):
  r=row(2,1);r2=row(2,0)
  self.assertEqual(vectors([r]).tolist(),vectors([r2]).tolist())
 def test_fitting_nonconstant_data(self):
  rows=[row(i%15,int(i%15<4)) for i in range(120)]
  model=fit(rows);pred=probability(model,rows)
  self.assertEqual(len(pred),120)
  self.assertTrue(all(0<p<1 for p in pred))
  self.assertEqual(model['featureNames'],['quietMs','priorityFraction500','priorityEdges1000','aim','moving'])
 def test_reject_bad_labels(self):
  with self.assertRaises(ValueError):fit([row(1,2)])
 def test_reject_missing_features(self):
  r=row(0,0);del r['features']['moving']
  with self.assertRaises((ValueError,KeyError)):vectors([r])
 def test_brier_exact(self):
  self.assertEqual(metrics([row(1,0),row(2,1)],[0,1])['brier'],0.)
 def test_heldout_zero_probabilities_not_crash(self):
  self.assertTrue(metrics([row(1,0),row(2,1)],[0,1])['logLoss']>=0)
if __name__=='__main__':unittest.main()
