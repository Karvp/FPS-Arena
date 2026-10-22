import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from c35m_target_alignment import public_candidates,match_shot,summarize,bootstrap_by_match

class TestC35M(unittest.TestCase):
 def row(self,near='n',aim='a'):
  return {'publicBeforeStep':{'provenance':'PUBLIC_BEFORE_STEP_ONLY','valid':True,'targetId':near,'aimCandidateId':aim},
         'authoritativeFiringTimeShots':[]}
 def shot(self,ids):
  return {'pelletCount':len(ids),'pellets':[{'hitKind':'player' if v else 'range','targetId':v} for v in ids]}
 def test_public_candidates_uses_predecision(self):
  r=self.row();r['serverLabelsAfterStep']={'targetId':'leak'}
  self.assertEqual(public_candidates(r),{'nearest':'n','aim':'a'})
 def test_reject_postdecision_provenance(self):
  r=self.row();r['publicBeforeStep']['provenance']='POST_SERVER'
  with self.assertRaises(AssertionError):public_candidates(r)
 def test_single_pellet(self):
  m=match_shot(self.row(),self.shot(['a']))
  self.assertEqual((m['aimMatchCount'],m['nearestMatchCount']),(1,0))
 def test_shotgun_pellet_cluster(self):
  m=match_shot(self.row(),self.shot(['a']*8+['n']*4))
  self.assertEqual((m['aimMatchCount'],m['nearestMatchCount']),(8,4))
  s=summarize([m]);self.assertAlmostEqual(s['shotMacroImprovement'],1/3)
 def test_no_player_hit_not_counted_as_error(self):
  m=match_shot(self.row(),self.shot([None,None]))
  s=summarize([m]);self.assertEqual(s['shotsWithPlayerHit'],0)
  self.assertIsNone(s['aimShotMacroAverage'])
 def test_target_cannot_be_predicted_from_server_truth(self):
  row=self.row();row['authoritativeFiringTimeShots']=[self.shot(['a'])]
  self.assertEqual(public_candidates(row)['aim'],'a')
  row['authoritativeFiringTimeShots']=[self.shot(['n'])]
  self.assertEqual(public_candidates(row)['aim'],'a')
 def test_shot_macro_not_pellet_weighted(self):
  a=match_shot(self.row(),self.shot(['a']*12));b=match_shot(self.row(),self.shot(['n']))
  s=summarize([a,b]);self.assertAlmostEqual(s['aimShotMacroAverage'],0.5)
  self.assertAlmostEqual(s['aimHitPelletAgreement'],12/13)
 def test_cluster_bootstrap_repeatable(self):
  a=match_shot(self.row(),self.shot(['a']))
  b=match_shot(self.row(),self.shot(['n']))
  self.assertEqual(bootstrap_by_match({'1':[a],'2':[b]},25,72),bootstrap_by_match({'1':[a],'2':[b]},25,72))
 def test_detect_incomplete_pellet_ledger(self):
  bad=self.shot(['a']);bad['pelletCount']=3
  with self.assertRaises(AssertionError):match_shot(self.row(),bad)
 def test_null_candidate_not_always_correct(self):
  m=match_shot(self.row(None,None),self.shot(['a']))
  self.assertEqual((m['aimMatchCount'],m['nearestMatchCount']),(0,0))
if __name__=='__main__':unittest.main()
