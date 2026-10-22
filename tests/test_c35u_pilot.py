"""Independent C35-U manifest invariants (not tests of tactical superiority)."""
from pathlib import Path
import json,hashlib,unittest,sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35u/weapon-balance-36-v1'
def get(p):return json.loads((OUT/p).read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class WeaponPositioningAuditTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.d=get('FROZEN-DESIGN.json');cls.a=get('C35U-ANALYSIS.json');cls.c=get('C35U-INDEPENDENT-AUDIT.json');cls.exec=get('EXECUTION-AUDIT.json')
 def test_source_frozen_before_matches(self):
  self.assertEqual(sha(OUT/'FROZEN-DESIGN.json'),self.exec['registrationSHA256'])
  for p,h in self.d['sourceSHA256'].items():self.assertEqual(sha(ROOT/p),h,p)
 def test_fixed_three_arm_pairing(self):
  cs=self.d['cases'];self.assertEqual(len(cs),36)
  for i in range(12):
   v=[c for c in cs if c['setupId']==f'c35u-{i:02d}']
   self.assertEqual({c['arm'] for c in v},{'release','observe','balance'})
   for k in ['seed','map','gun','lagMs','seconds','bots','opponents']:
    self.assertEqual(len({c[k] for c in v}),1)
 def test_original_release_is_unmodified(self):
  self.assertEqual(self.a['productionAgentSHA256'],sha(ROOT/'page-agent.js'))
  self.assertEqual(self.a['totals']['release']['modifiedTicks'],0)
 def test_server_shot_and_c21_integrity(self):
  self.assertTrue(self.c['pass']);self.assertEqual(self.c['researchMatches'],24)
  self.assertEqual(self.c['fireInjection'],0);self.assertEqual(self.c['fireSuppression'],0)
  self.assertEqual(self.c['assignmentMismatches'],0);self.assertEqual(self.c['shotDisagreements'],0)
 def test_balance_actuation_and_guard(self):
  self.assertGreater(self.a['totals']['balance']['modifiedTicks'],0)
  self.assertEqual(self.a['totals']['observe']['modifiedTicks'],0)
  self.assertEqual(self.a['totals']['balance']['agentErrors'],0)
 def test_no_production_promotion_from_small_cohort(self):
  ci=self.a['matchedBootstrap95BalanceToObserve']
  self.assertLess(ci['kills'][0],1);self.assertGreater(ci['deaths'][1],1)
  self.assertEqual(self.a['promotion'],'REJECT')
if __name__=='__main__':unittest.main()
