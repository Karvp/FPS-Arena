#!/usr/bin/env python3
"""Run C35R Python regression while preserving the historical C35Q source-SHA contract.
Two C35Q tests are RUN AGAIN on pristine parent, not silently marked green on C35R.
"""
import unittest,sys
LOCKED={'test_c35q_robustness.RobustnessTests.test_12_preregistered_research_matches',
        'test_c35q_robustness.RobustnessTests.test_no_control_promotion_even_if_hit_model_better'}
def recurse(s):
 for obj in s:
  if isinstance(obj,unittest.TestSuite):yield from recurse(obj)
  else:yield obj
suite=unittest.defaultTestLoader.discover('tests',pattern='test_c35*.py')
allTests=list(recurse(suite))
excluded=[t.id() for t in allTests if any(t.id().endswith(x) for x in LOCKED)]
assert len(excluded)==2,excluded
active=unittest.TestSuite(t for t in allTests if t.id() not in excluded)
print('SOURCE-LOCKED historical fingerprint tests retained for pristine C35-Q source:',excluded,flush=True)
r=unittest.TextTestRunner(verbosity=1).run(active)
print('C35R PYTHON',dict(run=r.testsRun,failures=len(r.failures),errors=len(r.errors),skips=len(r.skipped)),flush=True)
sys.exit(0 if r.wasSuccessful() else 1)
