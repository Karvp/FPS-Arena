import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
O=ROOT/'reports/c35w/randomized-motor-36-v1'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads(Path(p).read_text())
class C35WRegisteredStudy(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.d=read(O/'FROZEN-DESIGN.json');cls.audit=read(O/'INDEPENDENT-AUDIT.json');cls.summary=read(O/'ANALYSIS.json')
 def test_source_sha_and_36_locked_matches(self):
  for p,h in self.d['sourceSHA256'].items():self.assertEqual(sha(ROOT/p),h,p)
  self.assertEqual(len(self.d['cases']),36);self.assertEqual(len(read(O/'EXECUTION-AUDIT.json')['cases']),36)
 def test_exposure_assignment_and_censoring(self):
  a=self.audit;self.assertTrue(a['sourceSHA256Verified']);self.assertTrue(a['filesVerified'])
  self.assertEqual(a['C21Mismatch'],0);self.assertEqual(a['C35WMismatch'],0)
  self.assertEqual(sum(a['byArm'].values()),246);self.assertEqual(a['executedAlternatives'],44)
  self.assertEqual(a['completed']+a['censored'],246)
 def test_simulator_metrics_and_public_fire_invariant(self):
  a=self.summary;self.assertEqual(a['matchCount'],36)
  self.assertEqual(a['aggregate']['randomized']['kills'],83)
  self.assertTrue(all(v['agentErrors']==0 for v in a['aggregate'].values()))
  self.assertEqual(self.audit['fireModifications'],0)
 def test_observe_parity_replays_byte_identical(self):
  d=ROOT/'reports/c35w/parity'
  for suffix in ('dataset','fire','macro'):
   self.assertEqual((d/('off.'+suffix+'.json')).read_bytes(),(d/('observe.'+suffix+'.json')).read_bytes())
