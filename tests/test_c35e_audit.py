"""C35E anti-leakage, replay timing, calibration and source-lock unit tests."""
import json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/verify-c35e-shadow.py'))
validate=mod['validate_future']
class C35EAuditTests(unittest.TestCase):
 def test_valid_later_transition(self):
  validate({'tMs':100,'complete':True,'futurePriority':True,'futurePriorityEdge':True},
   [[100,0],[140,0],[160,1],[240,0]],0)
 def test_present_is_not_future(self):
  validate({'tMs':100,'complete':True,'futurePriority':False,'futurePriorityEdge':False},
   [[100,1],[140,0],[240,0]],0)
 def test_outside_window_not_future(self):
  validate({'tMs':100,'complete':True,'futurePriority':False,'futurePriorityEdge':False},
   [[100,0],[215,0],[235,1]],0)
 def test_censor_must_not_appear_as_zero(self):
  validate({'tMs':100,'complete':False,'futurePriority':None,'futurePriorityEdge':None},
   [[100,0],[200,0]],0)
  with self.assertRaises(AssertionError):
   validate({'tMs':100,'complete':False,'futurePriority':False,'futurePriorityEdge':False},[[100,0],[200,0]],0)
 def test_assignment_hash_historical(self):
  self.assertEqual(mod['c21'](35393000,1),mod['c21'](35393000,1))
  self.assertIn(mod['c21'](35393000,3),('baseline','micro-left','micro-right'))
 def test_locked_design_and_frozen_model(self):
  p=json.loads((ROOT/'reports/c35e/shadow-18-setup/FROZEN-DESIGN.json').read_text())
  q=json.loads((ROOT/'reports/c35e/independent-18-holdout/FROZEN-DESIGN.json').read_text())
  self.assertEqual(len(p['cases']),18)
  self.assertEqual(len(q['cases']),18)
  self.assertEqual(q['modelSHA256'],p['modelSHA256'])
  self.assertFalse({c['seed'] for c in q['cases']}&{c['seed'] for c in p['cases']})
if __name__=='__main__':unittest.main()
