import sys,unittest,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from c35n_shot_outcome import public_cues,parse_match,describe,cluster_ci,analyze,dump

class C35NTests(unittest.TestCase):
 def setUp(self):
  self.c={'id':'t','setupId':'t','map':'neon','gun':'aa12','lagMs':120,'opponents':'stress'}
  self.p={'valid':True,'targetId':'enemy1','aimCandidateId':'enemy2','aimCandidateDiffers':True,'geometryValid':True,'nearest3DClear':False,'nearest2DClear':True,'coverType':'intersects-ray-height','features':{'snapshotAge':.18},'provenance':'PUBLIC_BEFORE_STEP_ONLY'}
 def fixture(self,pellets):
  shot={'phase':'AFTER_SERVER_FIRE_RESOLUTION_ONLY','pelletCount':len(pellets),'pellets':pellets,'seq':7,'t':1.2,'rewindSeconds':.12,'dynamicCoverBoxes':1}
  counts={'fireModified':0,'storedDropped':0,'confirmedShots':1,'serverShotEvents':1,'confirmedPellets':len(pellets),'hitPlayerPellets':sum(x['hitKind']=='player' for x in pellets),'worldPellets':sum(x['hitKind']=='world' for x in pellets)}
  return {'schema':'fpsarena-c35l-shot-truth-traces-v1','traces':[{'counts':counts,'rows':[{'publicBeforeStep':self.p,'authoritativeFiringTimeShots':[shot]}]}]}
 def parse(self,obj):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'shot.json';dump(p,obj);return parse_match(self.c,p)
 def test_age_bin(self):self.assertEqual(public_cues(self.p)['ageBin'],'>150ms')
 def test_reject_server_leak(self):
  p={**self.p,'pellets':[]}
  with self.assertRaises(ValueError):public_cues(p)
 def test_reject_wrong_provenance(self):
  with self.assertRaises(ValueError):public_cues({**self.p,'provenance':'SERVER_AFTER_STEP'})
 def test_no_hit_shot_not_identity_negative(self):
  r=self.parse(self.fixture([{'hitKind':'range'}]));self.assertIsNone(r[0]['aimHitFraction']);self.assertEqual(describe(r)['shotsWithNoPlayerHit'],1)
 def test_foam_class(self):
  r=self.parse(self.fixture([{'hitKind':'world','worldKind':'dynamic-foam'}]));self.assertEqual(describe(r)['dynamicFoamWorldPellets'],1)
 def test_foam_requires_provenance(self):
  with self.assertRaises(ValueError):self.parse(self.fixture([{'hitKind':'world','worldKind':'n/a'}]))
 def test_shot_weight_not_pellet_weight(self):
  p=[{'hitKind':'player','targetId':'enemy2'}]*3+[{'hitKind':'range'}]*9
  r=self.parse(self.fixture(p));self.assertEqual(describe(r)['shots'],1);self.assertEqual(describe(r)['aimAgreementAmongHitShots'],1)
 def test_missing_counter_rejected(self):
  o=self.fixture([{'hitKind':'range'}]);o['traces'][0]['counts']['confirmedShots']=2
  with self.assertRaises(ValueError):self.parse(o)
 def test_unknown_hit_kind_rejected(self):
  with self.assertRaises(ValueError):self.parse(self.fixture([{'hitKind':'meteor'}]))
 def test_false_candidates_no_fake_label(self):
  self.p={**self.p,'valid':False,'targetId':None,'aimCandidateId':None};r=self.parse(self.fixture([{'hitKind':'player','targetId':'enemy1'}]));self.assertIsNone(describe(r)['aimAgreementAmongHitShots'])
 def test_bootstrap_deterministic(self):
  r=self.parse(self.fixture([{'hitKind':'player','targetId':'enemy2'}]));a=cluster_ci({'t':r},'playerHitShotRate',100);self.assertEqual(a,[1,1])
 def test_coverage_empty(self):self.assertIsNone(describe([])['publicCandidateCoverage'])
 def test_real_c35m_cohort(self):
  root=Path(__file__).resolve().parents[1]/'reports/c35m/new-seed-18'
  if not (root/'FROZEN-DESIGN.json').exists():self.skipTest('no raw cohort included')
  # no write to historical ANALYSIS.json
  result=analyze(root,'C35N-RETROSPECTIVE-CALIBRATION.json')
  self.assertEqual(result['overall']['shots'],624)
  self.assertEqual(result['overall']['pellets'],1240)
  self.assertEqual(result['overall']['dynamicFoamWorldPellets'],0)

if __name__=='__main__':unittest.main()
