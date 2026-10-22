# v2.9.11-C35M — Target Alignment & Original TDM Baseline

- Matched v2.9.11 production release policy to the unchanged 18-match C35-L research cohort (18 matched configurations; 36 total TDM games).
- Added `scripts/compare-c35l-v2911-tdm.py` with paired metrics, reproducible per-setup CSV and match-cluster bootstraps.
- Added `scripts/c35m_target_alignment.py`, scoring each *shot* equally to avoid overstating AA-12 multi-pellet evidence, using only public candidate IDs and post-step server collision labels.
- Added `scripts/run-c35m-aim-target-validation.py` and an independently audited 18-match fresh-seed holdout.
- Added `scripts/verify-c35m-independent.py` and `tests/test_c35m_target_alignment.py` (10 tests).
- Retained C35-L historical data and baseline production agent without changes; no motor promotion; C36 remains blocked.

See `C35M-ENGINEERING-REPORT.md` for quantitative results and limitations.
