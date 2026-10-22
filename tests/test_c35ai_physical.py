from pathlib import Path
import unittest,json,hashlib
R=Path(__file__).resolve().parents[1];O=R/'reports/c35ai/frozen-72-v5'
read=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
class PhysicalAuditStudy(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.d=read(O/'FROZEN-DESIGN.json');cls.a=read(O/'INDEPENDENT-VERIFICATION.json');cls.b=read(O/'INDEPENDENT-ANALYSIS.json')
 def test_source_lock_and_72_real_matches(self):
  self.assertEqual(len(self.d['cases']),72)
  self.assertEqual(self.a['designHash'],sha(O/'FROZEN-DESIGN.json'))
  self.assertTrue(self.a['sourceAndArtifactHashesVerified'])
  self.assertEqual(self.a['matches'],72)
 def test_command_is_not_displacement(self):
  self.assertLessEqual(self.a['actualMovingTicksWithChangedCommand'],self.a['totalChangedMotorTicks'])
  self.assertGreaterEqual(self.a['actualTravelWithChangedCommandMeters'],0)
  self.assertGreaterEqual(self.a['teleportTicks'],0)
 def test_intent_to_treat_including_interruptions(self):
  self.assertEqual(self.a['complete']+self.a['censored'],self.a['randomizedAssignments'])
  self.assertTrue(self.a['unselectedOutcomesNull'])
  self.assertEqual(self.a['fireMutations'],0)
  self.assertEqual(self.a['randomizedAssignments'],self.b['options']['assigned'])
 def test_setup_holdout_and_coverage(self):
  self.assertEqual(self.b['setupClusters'],24)
  self.assertEqual(set(self.a['byWeapon']),{'hk_sl8','l115a3','m4a1','mp5sd','aa12','uzi'})
  self.assertEqual(sum(self.a['byArm'].values()),self.a['randomizedAssignments'])
 def test_invalid_registration_kept_not_mixed(self):
  q=R/'reports/c35ai/frozen-72-v1-invalid/INVALIDATION.md'
  self.assertTrue(q.is_file())
  self.assertIn('omitted',q.read_text())
 def test_total_option_level_audit(self):
  self.assertGreater(self.a['totalChangedMotorTicks'],0)
  self.assertEqual(self.a['agentErrors'],0)
