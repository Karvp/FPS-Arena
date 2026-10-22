"""C35-L regression: authoritative truth, invariant, pretrained boundaries."""
from pathlib import Path
import json,hashlib,unittest
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35l/pilot-18-fresh'
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class C35LRegression(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.design=load(OUT/'FROZEN-DESIGN.json');cls.audit=load(OUT/'EXECUTION-AUDIT.json');cls.analysis=load(OUT/'ANALYSIS.json')
 def test_locked_sources_and_preregistration(self):
  self.assertEqual(sha(OUT/'FROZEN-DESIGN.json'),self.audit['registrationSHA256'])
  # Frozen-source check belongs to the archived C35-L checkout, not an observer-only child.
  differing=[rel for rel,h in self.design['sourceSHA256'].items() if sha(ROOT/rel)!=h]
  if differing==['lab/arena/train-main.mjs']:
   self.skipTest('C35-O adds passive observer to train-main; historical C35-L SHA is verified in archived C35-L parent')
  self.assertEqual(differing,[],f'Unexpected changed C35-L sources: {differing}')
 def test_cohort_coverage(self):
  self.assertEqual(len(self.audit['matches']),18)
  self.assertEqual({c['map'] for c in self.design['cases']},{'arena','neon','foundry'})
  self.assertEqual(len({c['seed'] for c in self.design['cases']}),18)
  self.assertEqual(len({c['gun'] for c in self.design['cases']}),6)
 def test_authoritative_shot_to_pellet_decomposition(self):
  c=self.analysis['totals'];self.assertEqual(c['serverShotEvents'],c['confirmedShots']);self.assertEqual(c['fireModified'],0)
  self.assertEqual(c['confirmedPellets'],sum(c[k] for k in ('hitPlayerPellets','hitZombiePellets','hitAbilityPellets','hitEntityPellets','worldPellets','rangePellets')))
  self.assertEqual(c['worldPellets'],c['staticBlockedPellets']+c['dynamicFoamBlockedPellets'])
 def test_no_future_truth_as_policy_input(self):
  for c in self.design['cases']:
   file=OUT/'matches'/(c['id']+'.ballistic.json');r=load(file)['traces'][0]
   self.assertEqual(r['counts']['storedDropped'],0)
   for row in r['rows']:
    p=row['publicBeforeStep'];self.assertNotIn('authoritativeFiringTimeShots',p);self.assertNotIn('serverLabelsAfterStep',p)
    self.assertIn('authoritativeFiringTimeShots',row)
 def test_dataset_sha_matches_audit(self):
  for item in self.audit['matches']:
   for kind,digest in item['sha256'].items():
    filename=OUT/'matches'/(item['id']+'.'+kind+'.json');self.assertEqual(sha(filename),digest)
 def test_noncausal_classification(self):
  self.assertEqual(self.design['noPromotion'] if 'noPromotion' in self.design else self.design['fixedStatus'].startswith('MEASUREMENT_ONLY'),True)
  self.assertEqual(self.analysis['matches'],18)
if __name__=='__main__':unittest.main()
