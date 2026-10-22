# FPS Arena v2.9.11 — C35-N Miss, Occlusion & Latency Calibration

**Checkpoint:** 2026-10-13. **Branch status:** measurement engineering PASS / intervention NOT PROMOTED / neural C36 BLOCKED.

**Parent:** C35-M. Original production `page-agent.js` unchanged (SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`). Existing `train-main.mjs`, C16/C21, and server combat code unchanged. C35-N adds *offline-only* evaluator, unit tests, pre-registered new-seed simulator runner, independent C21 auditor, and matched original-release comparator.

## 1. What is new

- `scripts/c35n_shot_outcome.py`: collects ALL server-confirmed shots, including complete misses, instead of evaluating only shot instances that hit a player. Valid public candidate is frozen before each step; post-step pellet truth is accessed for audit **after** Game.step().
- Separates any-player-hit binary shot outcome, hit-only target-ID agreement, world-blocked static and foam pellet counts, and rewind latency.
- Reports by gun, map, snapshot-age stratum, simulated lag, nearest-target 3D LOS, candidate disagreement, and dynamic cover. Match-cluster bootstrap rather than treating shotgun pellets as independent samples.
- Synthetic tests fail on server-truth leakage, false hit identity for misses, missing provenance for foam and mismatched ledger totals.
- Frozen new-seed 18-match cohort and independent C21/C16 checks; paired 18-match `release` comparator on exactly matching setups.

## 2. Main new-seed cohort (18 TDM matches × 60 seconds)

| Measurement | Result |
|---|---:|
| Authoritative shots | 623 |
| Player-hit shots | 446 |
| No-player-hit shots (not given target identity labels) | 177 |
| Player-hit shot incidence | 71.59% |
| Shot-incidence cluster 95% interval | 62.34% – 80.38% |
| Pellet rays | 1019 |
| Player-hit pellets | 534 |
| Pellets blocked by static geometry | 267 |
| Dynamic-foam blocked pellets | 0 |
| Shots with active dynamic foam near shooter | 0 |
| Public target coverage | 75.60% |
| Aim candidate agreement, eligible hit shots only | 93.53% |
| Nearest candidate agreement, eligible hit shots only | 71.98% |

**Critical caveats:** The new cohort observed **zero** dynamic-foam shot exposures; therefore C35-N CANNOT validate foam performance in natural play. A synthetic foam fixture validates accounting logic only. The aim/nearest identity agreement is conditional on a player-hit and on a publicly valid candidate, **not** aiming accuracy or counterfactual success. Hit event / shot is not an independent probability because pellet counts vary. Shots from one match are correlated.

### Snapshot lag / target coverage

| Simulated lag | Shots | Player-hit shot incidence | Public candidate coverage |
|---|---:|---:|---:|
| 30 ms | 121 | 64.46% | 100.00% |
| 85 ms | 129 | 86.82% | 100.00% |
| 150 ms | 167 | 74.85% | 99.40% |
| 215 ms | 206 | 63.59% | 26.70% |

At 215 ms, most public hostile tracks fail the C35-K `maxAge=.2s` eligibility constraint. This is a concrete *sensor coverage failure*, not proof of lower combat effectiveness. Lag strata have different map/gun/seed combinations and are not independent randomized lag-only comparisons; no causal lag estimate is claimed.

## 3. Matched original v2.9.11 Release TDM comparator

`--profile release` with **no C35 intervention** is the baseline configuration; `--c35c-policy shadow80` plus passive observers is the research configuration. The shipped agent file is identical. 18 pairs × 60s = 36 simulated match-minutes.

| Outcome | Original release | C35-N shadow80 |
|---|---:|---:|
| Kills | 90.00 | 98.00 |
| Deaths | 3.00 | 4.00 |
| Confirmed shots | 549.00 | 623.00 |
| Hit events | 348.00 | 384.00 |
| Damage received | 1,288.00 | 1,162.00 |
| Distance moved (m) | 4,841.50 | 4,911.74 |

Cluster-bootstrap kills ratio 95% interval: **0.878–1.343**, includes 1. The 18 pairs are exploratory and cannot establish intervention effectiveness.

## 4. Technical verification

- Node AI: 1,147/1,147 PASS.
- Authoritative engine: 733/733 PASS.
- Python regression: 68 PASS, 4 explicit historical SKIP, including 13 new C35-N tests.
- Five-mode release smoke: TDM, SND, HP, BR and ZM; 0 agent errors.
- 18 independent frozen cases: auditor PASS; C21 assignment mismatch 0, C16 preserved, fire command modifications 0; 50 randomized offers, 623 shots and 1,019 pellets accounted.
- Source hashes are locked in `FROZEN-DESIGN.json`; per-match raw hashes in `EXECUTION-AUDIT.json`. Historical source hashes frozen by older C35-M tests remain unchanged.

## 5. Reproduce

```bash
python scripts/run-c35n-miss-cover-latency.py
python scripts/verify-c35n-independent.py
python scripts/compare-c35n-original-tdm.py --no-run
python -m unittest discover -s tests -p 'test_*.py'
node --test --test-concurrency=4 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
```

## 6. C35-O prerequisites

The next experiment should cross randomize *lag within identical map/gun/seed setups* (rather than lag groups with different setups), force a separate authoritative foam-cover exposure cohort, and quantify eligible candidate coverage under alternate bounded snapshot freshness thresholds using ONLY pre-decision public states. Do not promote a motor or target policy based on current agreement scores. Continue keeping C36 neural training blocked until shot outcome/reward signal is adequately supported.
