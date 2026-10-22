import sys,unittest,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from c35o_freshness_analysis import describe,join_case,THRESHOLDS,load,dump

def candidates(eligible=True):return {t:{'eligible':eligible,'aimId':'hostile' if eligible else None,'projectedAimId':None,'confidence':'nominal'} for t in THRESHOLDS}
def sample():
 c=candidates();return {'setupId':'x','lagMs':215,'map':'arena','gun':'m4a1','hasPlayerHit':True,'pellets':1,'playerPellets':1,'dynamicFoamPellets':0,'dynamicCoverBoxes':0,
  'candidates':c,'agreement':{t:{'aim':1.0,'projected':None} for t in THRESHOLDS}}
class Tests(unittest.TestCase):
 def test_coverage(self):self.assertEqual(describe([sample()])['thresholds']['200']['shotCoverage'],1)
 def test_no_coverage(self):
  a=sample();a['candidates']=candidates(False)
  self.assertEqual(describe([a])['thresholds']['200']['shotCoverage'],0)
 def test_misses_remain_in_denominator(self):
  a=sample();b=sample();b['hasPlayerHit']=False;b['playerPellets']=0
  self.assertEqual(describe([a,b])['shotsWithPlayerHit'],1)
  self.assertEqual(describe([a,b])['thresholds']['200']['hitShotsWithValidCandidate'],1)
 def test_dynamic_foam_accounted(self):
  a=sample();a['dynamicFoamPellets']=1
  self.assertEqual(describe([a])['dynamicFoamPellets'],1)
 def test_no_false_aim_labels_on_misses(self):
  a=sample();a['hasPlayerHit']=False;a['agreement']={t:{'aim':None,'projected':None} for t in THRESHOLDS}
  self.assertIsNone(describe([a])['thresholds']['200']['aimAgreementHitConditional'])
 def test_ledger_join(self):
  with tempfile.TemporaryDirectory() as d:
   case={'id':'case','setupId':'x','lagMs':30,'map':'arena','gun':'m4a1'}
   p=Path(d)/'case';pub={'t':1.0,'publicBeforeStep':{'provenance':'PUBLIC_BEFORE_STEP_ONLY','thresholdsMs':candidates()},'serverLabelsAfterStep':{'shots':1}}
   shot={'pelletCount':1,'pellets':[{'hitKind':'player','targetId':'hostile'}],'dynamicCoverBoxes':0}
   truth={'t':1.0,'serverLabelsAfterStep':{'shots':1},'authoritativeFiringTimeShots':[shot]}
   dump(str(p)+'.track.json',{'schema':'fpsarena-c35o-public-track-traces-v1','traces':[{'counts':{'fireModified':0,'storedDropped':0,'confirmedShots':1},'rows':[pub]}]})
   dump(str(p)+'.ballistic.json',{'schema':'fpsarena-c35l-shot-truth-traces-v1','traces':[{'counts':{'fireModified':0,'storedDropped':0,'confirmedShots':1,'confirmedPellets':1},'rows':[truth]}]})
   rows,audit=join_case(case,d)
   self.assertEqual(len(rows),1);self.assertEqual(audit['shots'],1)
   self.assertEqual(rows[0]['agreement']['200']['aim'],1.)
 def test_reject_timestamp_mismatch(self):
  with tempfile.TemporaryDirectory() as d:
   c={'id':'case'}
   dump(Path(d)/'case.track.json',{'schema':'fpsarena-c35o-public-track-traces-v1','traces':[{'counts':{'fireModified':0,'storedDropped':0},'rows':[{'t':1}]}]})
   dump(Path(d)/'case.ballistic.json',{'schema':'fpsarena-c35l-shot-truth-traces-v1','traces':[{'counts':{'fireModified':0,'storedDropped':0},'rows':[{'t':2}]}]})
   with self.assertRaises(ValueError):join_case(c,d)
if __name__=='__main__':unittest.main()
