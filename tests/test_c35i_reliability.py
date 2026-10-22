"""C35-I regression guards: enrolled paired corpus and pre/post decision ledger."""
import importlib.util,json,unittest,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35i/pilot-18-weapon-pairs'
class C35IAuditTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.plan=json.loads((OUT/'FROZEN-DESIGN.json').read_text())
  cls.result=json.loads((OUT/'RESULTS.json').read_text())
 def test_setup_pair_count_and_full_randomized_denominator(self):
  self.assertEqual(self.plan['nSetups'],18)
  self.assertEqual(len(self.plan['cases']),36)
  arms={(x['setupId'],x['policy']) for x in self.plan['cases']}
  self.assertEqual(len(arms),36)
 def test_six_weapon_categories_and_three_maps(self):
  self.assertEqual({x['gun'] for x in self.plan['cases']},{'mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'})
  self.assertEqual({x['map'] for x in self.plan['cases']},{'arena','neon','foundry'})
 def test_no_shot_suppression_or_lost_rows(self):
  for c in self.plan['cases']:
   t=json.loads((OUT/'matches'/(c['id']+'.lane.json')).read_text())['traces'][0]
   stats=t['counts'];self.assertEqual(stats['suppressed']+stats['injected'],0)
   self.assertEqual(stats['sampledFire'],stats['incumbentFire'])
   self.assertEqual(stats['sampledFire'],len(t['rows']))
 def test_poststep_labels_reconcile_server_shots(self):
  for c in self.plan['cases']:
   stem=OUT/'matches'/c['id']
   trace=json.loads(Path(str(stem)+'.lane.json').read_text())['traces'][0]
   result=json.loads(Path(str(stem)+'.result.json').read_text())
   self.assertEqual(sum(row['serverLabelsAfterStep']['shots'] for row in trace['rows']),result['aggregate']['shots'])
 def test_micro_controller_assignment_preserved(self):
  spec=importlib.util.spec_from_file_location('c35i_analysis',ROOT/'scripts/analyze-c35i-weapon-corridors.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  # The frozen C35-I prereg locks train-main.mjs by SHA-256. A newer
  # observational hook necessarily changes that hash. Verify this historical
  # replay in its original archived C35-I source, not against C35-J code.
  old=self.plan['sourceSHA256']
  if any(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v for k,v in old.items()):
   self.skipTest('C35-I frozen source SHA differs in C35-J branch; run in archived C35-I source')
  v=module.verify();self.assertIn('PASS',v['safety']);self.assertEqual(v['status'],'NO_POLICY_PROMOTION_OBSERVATION_ONLY')
if __name__=='__main__':unittest.main()
