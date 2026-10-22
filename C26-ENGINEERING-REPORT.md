# FPS Arena v2.9.11 — C26 Temporal Threat Representation Learning

**Date:** 2026-10-12  
**Parent:** C25 Threat Signal Calibration  
**Status:** Research only; **NO production policy inference**; **NO browser performance benchmark**.

## Executive finding

C26 tests whether history of *already-delivered public shot cues* improves prediction of a **future server-confirmed incoming hostile weapon hit in a fixed 1.8-second interval**, under incumbent Release Autopilot. C26 uses one frozen 12-match development training split and six validation matches from C25, excludes the six formerly reported C25 test matches from model development, then scores on a new prospective 18-match holdout at synthetic snapshot lags **35, 65, 125 ms**.

**Result: the validation-selected temporal logistic does not consistently outperform baselines on independent holdout.** It modestly improves holdout log loss but worsens holdout Brier score relative to the frozen constant-prevalence predictor. It was not chosen again based on holdout metrics. The neural MLP was trained offline as an explicit candidate but not selected or deployed.

## Architecture and temporal firewall

- `lab/arena/evaluate-temporal-threat-c26.mjs`: deterministic source validator, temporal featurizer, regularized logistic, temporal nonlinear MLP, validation-only model selection, untouched all-new-seed holdout scoring, per-lag metrics and whole-match cluster bootstrap.
- `lab/arena/run-temporal-threat-c26.mjs`: plan SHA-256 fixed before simulation; 6 map × weapon strata × 3 synthetic lag conditions (18 independent seeds), resumable only when both result and dataset are already complete and verified. Runs existing `train-main.mjs` with **Release** profile and observational `--c25-dataset` flag. No movement intervention.
- `scripts/verify-c26-provenance.py`: independent recomputation of source/registration fingerprints, 18 raw result/dataset pairs, seed uniqueness, latency settings, development fingerprint and matching combined dataset.
- **Temporal features:** current pre-window cue/status (5 values), up to two preceding *complete, consecutive* pre-window cue/status snapshots (5+5), two history-presence masks, three public map indicators and four own loadout indicators: **24 real-valued inputs**. Previous server hit labels are **never used as features**. History across missing/censored windows is zeroed with missingness masks. An additional test mutates all past server hit/damage labels and confirms features remain bitwise identical.
- **Neural network:** an actual trained `24→9(tanh)→1(sigmoid)` MLP with deterministic initialization, cross-entropy gradient updates and L2 penalty, evaluated offline; not a Q-network or dodge-action selector.
- **Predeclared endpoint:** any hostile weapon-hit event in future interval (1.8s after the observation). Hitscan shot cues arrive after their own shot resolves, and can only predict future activity.

## Frozen cohorts and model selection

| Set | Source | Matches | Complete windows | Hit-positive | Snapshot lag |
|---|---|---:|---:|---:|---|
| Train | C25 development | 12 | 459 | 53 | 65ms |
| Validation | C25 development | 6 | 233 | 14 | 65ms |
| Previous C25 test | C25 **excluded** | 6 | 234 | 17 | 65ms |
| **New C26 holdout** | 18 newly registered seeds | **18** | **458** | **36** | 35/65/125ms |

Selection was based only on **C25 validation log loss**. Selected model: `temporal logistic (L2 λ=0.005)`, validation log loss **0.226894**. The C26 test cohort did not participate in hyperparameter/model selection.

### New-seed holdout metrics — lower is better

| Predictor | Brier | Log loss | Status |
|---|---:|---:|---|
| Constant train-prevalence | **0.073846** | 0.283041 | Prespecified baseline |
| Map/weapon smoothed prevalence | 0.073344 | **0.274748** | Control comparison |
| Static logistic λ=0.005 | 0.072638 | 0.276198 | Not selected by validation |
| **Temporal logistic λ=0.005** | **0.074291** | **0.275497** | **Validation-selected** |
| Temporal nonlinear MLP 24→9→1 | 0.074703 | 0.276895 | Offline diagnostic, not selected |

Whole-match bootstrap, `constant Brier − selected temporal Brier` (positive favors selected): **95% interval [−0.005645, +0.004403]**, 1200 resamples. Includes zero.

### Holdout by synthetic lag

| Lag | Windows | Hit-positive | Constant Brier | Selected temporal Brier |
|---|---:|---:|---:|---:|
| 35ms | 155 | 10 | **0.063036** | 0.067214 |
| 65ms | 151 | 13 | 0.079594 | **0.076265** |
| 125ms | 152 | 13 | **0.079159** | 0.079546 |

These are descriptive splits of just **six matches per lag**, not evidence of true network-jitter robustness. Fixed grid windows under Release remain correlated within each match. No policy effects are estimated.

## Verification and integrity

- **927/927 AI regression tests** (9 focused C26 tests), **733/733 authoritative game-main tests**, game assets/static check PASS, **5/5 multi-mode smoke episodes with zero runtime errors**.
- Independent verifier: 18/18 complete result/dataset pairs, 18 unique new seeds, all three latencies, 0 overlapping C25 seeds; frozen development and registered source fingerprints verified.
- Resuming registered 18-match runner reproduced **458 windows, 36 positive** without simulating over or rewriting stored completed runs.
- Evaluator independently rechecked from immutable files. `page-agent.js` SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` is identical to C25.
- New analysis and runner are offline research tools; source-main engine and game extension behavior are unchanged.

## Limitations and next experiment

1. Only 36 positives in 18 test matches; no reliable precision for map/weapon/latency subgroups or deployment decisions.
2. Model uses synthetic snapshot lag; real packet loss, browser event loop delay and jitter are not validated.
3. Prev-window public cue history may be stale; no hidden true projectile trajectories, future labels or server geometry are passed to model.
4. The learner estimates **risk under existing Release actions**, not action-conditioned Q-values; it cannot establish left/right or aim decisions.
5. Comparison of unselected predictors' holdout scores is **diagnostic** only; changing the winner post-hoc would constitute selection on test.
6. Training model in ordinary JavaScript demonstrates nonlinearity and offline reproducibility, **not** superior battle performance or deployable AI.

**Decision: DO NOT SHIP.** Keep C26 predictors offline; future work should collect larger diverse prospective datasets and pre-register separate latency-domain tests. Train action-conditioned policies only after causal action values become identifiable.

## Reproduction

```bash
cd fps-c26-work
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
python scripts/verify-c26-provenance.py
node lab/arena/evaluate-temporal-threat-c26.mjs \
 reports/c25/study24/COMBINED-DATASET.json reports/c25/study24/PRE-REGISTERED-PLAN.json \
 reports/c26/study18/COMBINED-DATASET.json reports/c26/study18/PRE-REGISTERED-PLAN.json \
 reports/c26/study18/RECHECK.json
# For a fresh cohort in a new empty output directory, before viewing outcomes:
node lab/arena/run-temporal-threat-c26.mjs --seconds 50 --workers 4 --base-seed 26026000 --out-dir reports/c26/study18
```

No GitHub push was performed.
