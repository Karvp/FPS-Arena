"""C35-J independent frozen-source + fire/geometry ledger regression tests."""
import unittest,json,importlib.util,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/c35j/pilot-18-fresh-3d-v2'
class C35JRegression(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.design=json.loads((OUT/'FROZEN-DESIGN.json').read_text())
  cls.summary=json.loads((OUT/'ANALYSIS.json').read_text())
 @unittest.skipIf((ROOT/'lab/arena/public-target-los-c35k.mjs').exists(),"C35J immutable train-main source SHA is verified in archived C35J checkout, not descendant C35K")
 def test_preregister_frozen_files(self):
  for k,v in self.design['sourceSHA256'].items():
   self.assertEqual(hashlib.sha256((ROOT/k).read_bytes()).hexdigest(),v,k)
 def test_complete_paired_design_no_missing_weapons(self):
  self.assertEqual(len(self.design['cases']),36)
  self.assertEqual(len({c['setupId'] for c in self.design['cases']}),18)
  self.assertEqual({c['gun'] for c in self.design['cases']},{'mp5sd','m4a1','aa12','hk_sl8','uzi','l115a3'})
 def test_c35i_legacy_target_team_bug_explicit(self):
  counts=self.summary['policies']
  self.assertGreater(counts['observe']['legacySelectedAllyOrMissing'],0)
  self.assertGreater(counts['lateral']['legacySelectedAllyOrMissing'],0)
  self.assertEqual(counts['observe']['public2DClear3DBlocked'],0)
 def test_fire_and_oracle_denominators(self):
  for policy,stats in self.summary['policies'].items():
   self.assertEqual(stats['fireModified'],0)
   self.assertEqual(stats['storedDropped'],0)
   self.assertEqual(stats['validPublic']+stats['invalidPublic'],stats['fireTicks'])
   self.assertLessEqual(stats['oracleAvailable'],stats['validPublic'])
 @unittest.skipIf((ROOT/'lab/arena/public-target-los-c35k.mjs').exists(),"C35J archived source-lock audit is inapplicable to descendant C35K; new cohort runs original C21 ledger")
 def test_reaudit_original_c21_integer_hash_and_sha(self):
  spec=importlib.util.spec_from_file_location('c35j_analysis',ROOT/'scripts/analyze-c35j-3d-calibration.py')
  m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  report=m.audit();self.assertEqual(report['c21AndC16Rehash'],'PASS')
if __name__=='__main__':unittest.main()
