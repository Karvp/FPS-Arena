# FPS Arena v2.9.11 — C35-Q Robust Target Confidence & Combat Generalization

**Date:** 2026-10-13. **Decision:** engineering PASS, **predictor NOT promoted**, production untouched, C36 remains locked.

## Implemented

- `scripts/run-c35q-stress.py`: preregistered 12 authoritative `Game.step()` TDM matches, paired at 85/240 ms on six map/weapon/seed setups. No changes to `page-agent.js`, C16/C21, `train-main.mjs` or model coefficients.
- `scripts/c35q_robustness.py`: exact public pre-step confidence vs AFTER-step authoritative shot/pellet ledger comparison. Reports total shot coverage (unconditional), Brier (conditional on valid public candidate), ID risk on confirmed hits only, Wilson 95% upper risk, cluster bootstrap by setup.
- `scripts/verify-c35q-independent.py`: frozen source SHA256 + every raw match artifact SHA256, C21 integer hash action assignments, C16 public-before-action invariants, no direct `fire` changes, server shot and pellet count reconciliation.
- `scripts/run-c35q-release-baseline.py` / `scripts/compare-c35q-tdm.py`: 12 new matched `--profile release` original-v2.9.11 matches and paired comparison against `shadow80` research.
- `tests/test_c35q_robustness.py`: 10 new unit/integration tests for absent candidates, abstention, Wilson risk, replay score and deterministic assignments.

## Preregistration amendment / rejected first design

The first planned 275-ms lag violates an existing maximum-lag constraint (`RandomizedSafeActionC35`: `lagMs<=250`). This version stopped with an error before a full cohort could complete. **We did not raise the engine safety ceiling or cherry-pick the six completed 85-ms cases.** The rejected design and aborted logs are preserved in `reports/c35q/stress-12/`. A separate complete preregistered design `reports/c35q/stress-12-v2/FROZEN-DESIGN.json` was locked **before** the 12 replacement runs at 85/240 ms, with fresh setup IDs. These are the only matches used for new-cohort inference.

## Prospective results on new matched setup seeds

- 12/12 TDM matches, 60 seconds each: **12 simulated minutes**, six setup pairs (Arena/Neon/Foundry × MP5SD/AA-12).
- **239 actual server shots**, **899 authoritative pellets**, **0 foam-blocked pellets naturally observed**, **0 agent errors**.
- **29 C21 offers independently validated**, zero assignment mismatch, zero modified fire commands. All 239 shots and all 899 pellets reconcile to the actual engine ledger.
- Public 350-ms candidate coverage: **239/239 (100%)**. This is *not* evidence that candidates are accurate or that aim improves.
- **One preregistered setup generated zero shots under both lag conditions**, hence there are only **five informative setup clusters** for shot-based bootstrap, not six. The zero-shot setup was NOT dropped from the match count. Do not treat 239 shots or 899 pellets as independent experiments.

### Frozen C35-P model, scored on two external cohorts (no retraining)

| External cohort | Shots | Player-hit Brier (constant → model) | ID correctness Brier on scored hits (constant → model) | Interpretation |
|---|---:|---:|---:|---|
| C35-P unseen HK SL8/Uzi, lag 85/215 | 513 | 0.200830 → **0.196331** | **0.039675** → 0.039732 | Hit positive, ID negative |
| C35-Q fresh MP5SD/AA-12, lag 85/240 | 239 | 0.318657 → **0.302335** | 0.077864 → **0.077791** | Hit positive, tiny ID improvement with CI spanning zero |

95% setup-cluster bootstrap, model minus constant Brier:

- C35-P: hit `[-0.008567, -0.002455]`, identity `[+0.000031, +0.000113]`.
- C35-Q: hit `[-0.034114, -0.005918]`, identity `[-0.000442, +0.000156]`.

At *85 ms*, the hit head is worse than the constant in **both** cohorts (C35-P delta `+0.003402`, C35-Q `+0.009552`). Report pooled scores **and** strata to expose these distribution shifts; calibration is not universally improved.

**Selective-ID risk gate:** On the C35-Q cohort, threshold 90% admits every one of the 141 labeled-hit shots, including 12 wrong IDs (8.51% observed error; shot-level Wilson 95% upper bound 14.29%). Threshold 95% admits **none**. This does not constitute a useful calibrated abstention mechanism. Misses are *never* labeled as target-ID errors; shotgun pellet ties abstain.

## Matched original release vs research shadow80 TDM

12 original-release matches on the exact C35-Q seeds/maps/weapons/lag/opponents (12 simulated minutes each arm):

| Metric | Original v2.9.11 release | C35-Q shadow80 |
|---|---:|---:|
| Kills | 12 | 23 |
| Deaths | 7 | 6 |
| Server-confirmed shots | 133 | 239 |
| Hit events | 68 | 146 |
| Meters traveled | 3565.87 | 3684.65 |
| Agent errors | 0 | 0 |

The research/baseline kill ratio is `1.917`, but the paired setup bootstrap 95% range is **[0.909, 5.400]**, includes no improvement, and the baseline kill count is only 12. The match paths diverge after the first micro action even with matched initial conditions. **This is NOT an advantage demonstrated by the passive C35-Q observer, nor evidence of a new production neural policy.** Both use exactly the same shipped `page-agent.js`.

## Validation and reproducibility

- **1168/1168 Node.js** AI tests pass (original suite). **733/733 authoritative engine** tests pass on this run.
- **96 Python pass, 5 historical skips** (101 executed, includes **10 new C35-Q tests**).
- **5/5 game-mode smoke**, 0 agent errors, original-release profile.
- Independent C35-Q audit PASS. Frozen original C35-P model SHA256 `cf80a51edb18cb3455b81d76af95fea02d486479107e899b7b360c385f0c18ae`.
- Research source engine `train-main.mjs` unmodified relative to parent C35-P; production `page-agent.js` SHA256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**, unchanged.
- Prospective prereg SHA256 `c4c50da9e0a4b6f5f29df96705476d78ea89dc12bff114c44961572489303a4f`.

## Decision & next pass

**C35-Q is an evaluation/analysis improvement, not a motor/aim improvement.** Keep both models research-only: ID calibration failed on one external cohort and cannot meaningfully abstain at the tested thresholds. The hit head has mixed lag-specific behavior. Next: test robust conditional abstention with per-setup safety gate **without** using server truth inside inference, sample longer engagements with more than five informative setup clusters, and stage real dynamic-cover tactics in fresh holdout matches before enabling any action policy. C36 neural training remains blocked.
