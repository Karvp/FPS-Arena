"""C35K cohort-level public target/geometry audit regression."""
import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35k/pilot-18-fresh'
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class C35KReliability(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.plan=load(OUT/'FROZEN-DESIGN.json');cls.audit=load(OUT/'EXECUTION-AUDIT.json');cls.data=load(OUT/'ANALYSIS.json')
 def test_registration_and_source_lock(self):
  if (ROOT/'lab/arena/ballistic-truth-c35l.mjs').exists():
   self.skipTest('C35K source lock applies only to historical C35K checkout; C35L extends train-main and server/combat')
  self.assertEqual(sha(OUT/'FROZEN-DESIGN.json'),self.audit['registrationSHA256'])
  for rel,h in self.plan['sourceSHA256'].items():self.assertEqual(sha(ROOT/rel),h,rel)
 def test_complete_independent_holdout(self):
  self.assertEqual(len(self.plan['cases']),18);self.assertEqual(len(self.audit['matches']),18)
  self.assertEqual({c['map'] for c in self.plan['cases']},{'arena','neon','foundry'})
  self.assertEqual(len({c['gun'] for c in self.plan['cases']}),6)
  self.assertEqual(len({c['seed'] for c in self.plan['cases']}),18)
 def test_command_and_server_ledgers(self):
  x=self.data['totals'];self.assertEqual(x['fireModified'],0)
  self.assertEqual(x['shots'],x['fireTicks']);self.assertEqual(x['eligible']+0,x['fireTicks'])
  self.assertEqual(x['validGeometry'],x['clear3D']+x['blocked3D'])
 def test_poststep_separation_and_counter_hashes(self):
  lookup={x['id']:x for x in self.audit['matches']}
  for c in self.plan['cases']:
   path=OUT/'matches';id=c['id'];k=load(path/(id+'.identity.json'))['traces'][0]
   self.assertEqual(k['counts']['storedDropped'],0)
   self.assertEqual(len(k['rows']),k['counts']['fireTicks'])
   self.assertEqual(sha(path/(id+'.identity.json')),lookup[id]['sha256']['identity'])
   for r in k['rows']:
    self.assertNotIn('postStepOracle',r['publicBeforeStep'])
    self.assertNotIn('serverLabelsAfterStep',r['publicBeforeStep'])
    self.assertIn('serverLabelsAfterStep',r)
 def test_descriptive_only_not_promotable(self):
  self.assertEqual(self.data['status'],'MEASUREMENT_ONLY_C36_BLOCKED')
  self.assertEqual(self.data['c21C16OriginalLedger'],'PASS')
  self.assertTrue(0<=self.data['identityMismatchRate']<=1)
  self.assertEqual(len(self.data['bootstrap95AcrossMatchSeeds']),2)
if __name__=='__main__':unittest.main()
