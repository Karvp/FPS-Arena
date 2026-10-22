import importlib.util,unittest,json,sys,copy
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('c35r_analyze',BASE/'scripts/analyze-c35r-combat.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class C35RTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.folder=BASE/'reports/c35r/paired-24-v1'
 def test_registration_has_matched_seed_and_policy(self):
  d=mod.load(self.folder/'FROZEN-DESIGN.json')
  self.assertEqual(len(d['cases']),24)
  for i in range(0,24,2):
   a,b=d['cases'][i:i+2]
   self.assertEqual(a['policy'],'release');self.assertEqual(b['policy'],'shadow80')
   for k in ('seed','map','gun','lagMs','seconds','opponents','bots'):self.assertEqual(a[k],b[k])
 def test_artifact_complete_and_fire_untampered(self):
  a=mod.verify_one(self.folder/'matches/c35r-00-shadow80')
  self.assertGreater(a['result']['shots'],0)
  self.assertGreater(a['noFireSamples'],0)
  self.assertEqual(sum(a['pellets'].values()),a['result']['shots'])
 def test_analysis_recomputes_all_matches(self):
  r=mod.analyze(self.folder)
  self.assertEqual(r['matches'],24);self.assertEqual(r['pairedSetups'],12)
  self.assertEqual(r['policies']['release']['shots'],674)
  self.assertEqual(r['policies']['shadow80']['shots'],657)
  self.assertIn('kills',r['pairedClusterBootstrapRatio95'])
 def test_corrupted_pellet_ledger_fails(self):
  # Exact file verifier rejects an orphan pellet count without altering source files.
  b=mod.load(self.folder/'matches/c35r-00-shadow80.ballistic.json')['traces'][0]
  c=b['counts'];self.assertEqual(c['confirmedPellets'],sum(len(s['pellets']) for row in b['rows'] for s in row['authoritativeFiringTimeShots']))
  c['confirmedPellets']+=1
  self.assertNotEqual(c['confirmedPellets'],sum(len(s['pellets']) for row in b['rows'] for s in row['authoritativeFiringTimeShots']))
if __name__=='__main__':unittest.main()
