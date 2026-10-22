# FPS Arena v2.9.11 — C25 Fixed-Grid Threat Calibration Study

**Date:** 2026-10-12 · **Parent checkpoint:** C24 · **Status:** Offline research only; original production Autopilot unmodified.

## Executive findings

C24's safety-gated encounter sampling captured just 6 weapon-hit-positive 1.8-second windows out of 79 complete eligible windows. **C25 addresses this selection problem by observing regularly scheduled, non-overlapping 1.8-second windows under the existing Release Autopilot**, whether or not there was an eligible micro-dodge opportunity. It does not use hidden server information to make decisions; labels are assigned only after shot/damage events occur. Comparison of C24 vs C25 sample sizes is *not* a matched-policy intervention or proof that the bot dodges better.

- 24 completed, new-seed 75-second TDM simulations on uploaded engine main: 6 map × weapon strata × 4 independent seeds.
- **926 complete periodic windows**, 84 with server-confirmed hostile weapon hit, under original Release controls; all windows begin while the trainee is alive. Censored final windows are not used in score computation.
- Pre-registered match split **12 train / 6 validation / 6 holdout-test**, preserving entire matches and never mixing their windows across splits; 459/233/234 complete windows.
- Actual small MLP **5→7→1**, regularized logistic and smoothed historical-prevalence baselines are trained/evaluated offline. Hyperparameters/model selected by validation log loss, and the test partition is evaluated once.
- **Selected logistic loses to simple prevalence baseline on holdout** (Brier 0.070306 vs 0.069351; log loss 0.272393 vs 0.271325). MLP is shown as a diagnostic candidate, **not** post-hoc deployed because it was not validation-selected.
- Neural/action-value policy training/deployment **BLOCKED**. This is an observational danger predictor, not an optimal left-vs-right action model or hit reaction system.

## Architecture and constraints

`lab/arena/threat-calibration-observer-c25.mjs`: a no-command, deterministic time-grid recorder anchored at game t = 3.0s, advancing by 1.8s. For each grid point with a live local player it freezes the already-delivered C24 public shot cue (1.5s lookback) and local own HP/armor. The server records later hostile shot/tracer/hit events only in their associated time window. No safety gate is modified; **C25 does not execute randomized micro-dodge actions**. All exposed cues may include friendly shots and are delayed by synthetic 65ms network snapshots; enemy hitscan shots resolve before packet delivery.

`lab/arena/train-main.mjs` adds research-only `--c25-dataset`; `lab/arena/run-threat-calibration-c25.mjs` locks the plan before execution with source SHA-256; `lab/arena/evaluate-threat-calibration-c25.mjs` enforces fixed time grids, allowed feature/label fields, seed disjointness, stratum split, match-level bootstrap and separation of validation selection from test reporting. `scripts/verify-c25-provenance.py` independently compares all 24 original result/dataset pairs and recalculates registration/source fingerprints.

### Holdout evaluation (lower is better)

| Candidate | Selected by validation? | Brier | Log loss |
|---|---|---:|---:|
| Training-prevalence baseline | No | 0.069351 | 0.271325 |
| Regularized logistic λ=0.005 | **Yes** | 0.070306 | 0.272393 |
| MLP 5→7→1 (diagnostic λ=0.005) | No | 0.069153 | 0.269505 |

- Training split: 53 positive / 459 windows; validation: 14 / 233; test: 17 / 234.
- Whole-match bootstrap for **baseline Brier minus selected Brier**: 95% interval **[-0.006922, +0.002999]** across 1,500 resamples. This includes zero; six test matches give weak precision.
- Prior delivered public shot cue at test time: 12/160 later hit windows versus 5/74 without cues. A historical shot is not necessarily aimed at the trainee or a calibrated future-hit probability.
- Validation favored logistic over the constant rate; **the improvement did not survive test**. Neural model showed small test differences only descriptively; selecting it *after* seeing test would be test leakage.

### Positive event coverage by map / weapon (all splits, descriptive)

| Stratum | Complete windows | Hit-positive windows |
|---|---:|---:|
| arena/mp5sd | 155 | 9 |
| arena/hk_sl8 | 159 | 4 |
| foundry/m4a1 | 154 | 12 |
| foundry/aa12 | 153 | 15 |
| neon/m4a1 | 152 | 21 |
| neon/mp5sd | 153 | 23 |


## Verification

- **918/918** AI regression tests including 10 new C25 focused tests; **733/733** authoritative game main tests; **5/5** mode smoke (TDM, SND, HP, BR, Zombies), no runtime error.
- Same-seed observability parity: **18/18** gameplay metrics match Release without C25 logging (20-second pilot, Arena/MP5SD).
- `page-agent.js` SHA-256 **6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed**, identical to C24; no production actuation changes.
- Registration SHA-256 **ea8ddeb3e9980538c7e095448bc0c231f33990088983b866401e45f3da98de18** and C25 source fingerprint **c953f8913e5a65cc6dd753afc8e0ce35a64c0839f0ee8f9b26056b8d32aa0ae0** verified independently; all 24 result/dataset pairs match predeclared jobs. Analysis from frozen JSON reproduced exactly.
- ZIPs CRC-checked; not pushed to GitHub; no real browser FPS benchmark.

## Limitations and next steps

The fixed time grid samples survival at window start under the **incumbent Release policy**, not randomized actions. Its hit-risk model cannot estimate the causal benefit of moving left/right or infer an optimal dodge action. Server geometry labels are offline truth only; hitscan traces arrive after the current shot has resolved. Six test matches and 17 positive test windows are inadequate for a reliable deployment-grade danger forecast, let alone action-value neural control. Map-specific prevalence and independent opponents, longer horizons and lag variability require new registered cohorts.

**Release decision:** RESEARCH ONLY; no policy inference on the client. Do not switch the agent's current aim/routing/dodge or claim combat superiority.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/run-threat-calibration-c25.mjs --seconds 75 --workers 4 --out-dir reports/c25/study24
python scripts/verify-c25-provenance.py
node lab/arena/evaluate-threat-calibration-c25.mjs reports/c25/study24/COMBINED-DATASET.json reports/c25/study24/PRE-REGISTERED-PLAN.json reports/c25/study24/RECHECK.json
```
