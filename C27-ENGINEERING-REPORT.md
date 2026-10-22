# FPS Arena v2.9.11 — C27 Temporal Threat Generalization

**Research checkpoint:** C27, 2026-10-12  
**Parent:** C26 Temporal Threat Representation Learning  
**Engine:** uploaded/source-main FPS Arena `Game.step()`; 3 supported classic maps  
**Release decision:** **RESEARCH ONLY — DO NOT DEPLOY** neural risk predictor or any dodge-policy change.

## Executive summary

C27 implements and **trains a genuine gated recurrent unit (GRU)** risk predictor on causal client-visible threat histories. It holds out an entirely new factorial cohort across three simulated opponent policies (`stress`, `mixed`, `official`) and two synthetic snapshot lags (35 and 125 ms). Model selection and GRU epoch choice are frozen using the **C25 development train/validation matches only**, before inspecting C27 outcomes. C25's previous test set and C26's already-inspected 18-match holdout are not training/model-selection data.

Across **36 independent 40-second matches**, 715 valid fixed-grid 1.8-second windows included only **29** future hostile weapon-hit-positive windows. The **validation-selected model was temporal logistic, not GRU**. On the new-seed holdout, this model improved Brier score vs train-prevalence constant from **0.0446517 to 0.0429469** and log loss from **0.2058931 to 0.1879219**. However, the **1,500-resample, whole-match cluster bootstrap 95% interval** of `constant Brier − selected Brier` was **[−0.0015060, +0.0047627]**, including no benefit. These data do not establish robust superiority.

The GRU has independently trained weights, yet failed to win validation and is reported solely as a frozen diagnostic. **No model controls movement**. Production `page-agent.js` is byte-identical to C26.

## 1. Model architecture and information boundary

### 1.1 Prediction target

Binary classification: **at least one future server-confirmed hostile weapon hit** in the 1.8-second interval following the *already-delivered* client snapshot, under the existing Release Autopilot.

### 1.2 Causal inputs

One current and up to two **consecutive complete** previous fixed-grid client snapshots, chronological oldest → newest, with zero-padding and two history-presence masks. Five normalized per-snapshot measurements: received shot-packet count, received near-tracer count, nearest tracer distance, own health fraction and own armor fraction. Three public map one-hots and four own weapon one-hots are contextual inputs. The feature transform strictly rejects unexpected fields in client cues/status. Past, present and future **server-hit/damage labels are never features**. Past censored or missing windows block historical linkage.

GRU architecture: **`GRU(input_size=5, hidden_size=8, sequence_length=3)` + 7 map/weapon categorical inputs + 2 history masks → linear sigmoid hit-probability head**. PyTorch CPU, fixed random seed 27027027, deterministic algorithms, full-batch BCE-with-logits, Adam, gradient clipping and frozen validation-selected epoch. Separately train static logistic (5→1), temporal logistic (24→1), and a constant train-prevalence predictor.

**Causality caveat:** hitscan is instantaneous at fire time; a delivered tracer cannot make an already-resolved hit avoidable. Forecast targets are future hits only, and their labels are appended by the server after the sampled window begins.

## 2. Precommitment and study design

- Development source: **C25**, 12 train matches / 459 windows / 53 positives and 6 validation matches / 233 windows / 14 positives. Previously viewed C25 test matches: 6, excluded.
- Previous C26 18-match holdout: previously viewed; excluded from C27 model fitting/selection. Seeds explicitly excluded from the new cohort.
- Candidates frozen in `reports/c27/study36/FROZEN-MODELS.json` **before** the C27 trial. Frozen artifact SHA-256: `7942f368f85c7ac7717ffce78ad726d4f2aa15e943be3fcb8e1b300944f94d88`.
- Validation selector: minimum *validation log loss*, with preordered tie-break: constant, static logistic, temporal logistic, GRU. GRU epoch selection used development validation, not future holdout.
- New trial: **6 (map, weapon) strata × 3 opponent policies × 2 lag settings = 36 unique-seed matches**; each TDM episode is 40 seconds, with 5 bots, unchanged Release profile, `--c25-dataset` observation only. No exploration/policy override.
- Classic map/weapon strata: Arena/MP5SD, Arena/HK SL8, Foundry/M4A1, Foundry/AA12, Neon/M4A1 and Neon/MP5SD. These maps and weapons already occur in development. **Only opponent policy is unseen in two holdout conditions; this is not a leave-map-out trial.**
- Registered source hash: `b09c70529854cb6edac9d02c52c0342520f23475fa7d1f3d39ac578d5ea40496`. Registered study SHA-256: `6426d5df75f9ebe7f7cebdfd632a8229f6ba0a94b056f6911fb05506d2e0fd0b`.
- Complete raw result/dataset pair is required for every seed. Resume only reuses already-complete results. The independent verifier checks raw result `opponentPolicy` (not only plan IDs), snapshot lag, weapon/map, engine errors, source checksum, development/frozen artifact hashes and paired dataset contents.

### 2.1 Development validation model choice

| Candidate | Validation log loss ↓ | Status |
|---|---:|---|
| Constant train prevalence | 0.245491 | Baseline |
| Static logistic | 0.238198 | Not selected |
| **Temporal logistic** | **0.230057** | **Selected before C27 holdout** |
| GRU 5→8→1 (+ context) | 0.239703 | Real trained neural network; not selected |

Note that validation is reused for GRU early stopping and then model selection; this is permitted within the development phase but creates optimism about validation scores. The new cohort is the independent confirmation stage.

## 3. Unseen-seed C27 results

Total: **36/36 raw matched pairs**, **715 complete windows**, **29 positives** (4.06%). Every opponent profile had 12 matches. No invalid run or runtime error was accepted.

| Frozen candidate | Holdout Brier ↓ | Holdout log loss ↓ | Interpretive status |
|---|---:|---:|---|
| Constant train prevalence | 0.0446517 | 0.2058931 | Registered primary baseline |
| Static logistic | **0.0420220** | 0.1920414 | Not chosen via validation |
| **Temporal logistic** | 0.0429469 | **0.1879219** | **Validation-selected predictor** |
| GRU | 0.0426643 | 0.1949322 | Neural diagnostic only |
| Smoothed map/weapon-rate | 0.0460872 | 0.2026035 | Additional *post-hoc diagnostic* baseline |

The static logistic happens to have the lowest C27 Brier, and GRU a lower C27 Brier than temporal logistic; they **must not be promoted by selecting on test**. The preregistered metric for model selection was validation log loss, not test Brier.

Whole-match cluster bootstrap (1,500 resamples), `constant Brier − validation-selected temporal Brier`, 95% percentile interval: **[−0.0015060, +0.0047627]**. Includes zero; not evidence of a reliably transferable advantage. The windows in each match are correlated and are never treated as independent bootstrap units.

### 3.1 Opponent-domain shift

| Opponent policy | Independent matches | Complete windows | Future-hit positives | Constant Brier | Selected temporal Brier |
|---|---:|---:|---:|---:|---:|
| stress (seen in C25 dev) | 12 | 238 | 16 | 0.0651160 | 0.0621816 |
| mixed (previously unseen) | 12 | 239 | 5 | 0.0295809 | 0.0294851 |
| official (previously unseen) | 12 | 238 | 8 | 0.0393214 | 0.0372307 |

The model improves unadjusted Brier point estimates in each of these descriptive domains, but **12 independent matches/domain and only 5–16 hits/domain cannot establish consistent superiority**. Domain hit prevalences differ greatly; the same training-prior constant can be poorly calibrated out of distribution.

Each opponent profile is also crossed with **35 and 125 ms synthetic lag**, six matches per `(opponent, lag)` subgroup. These are headless snapshot delays, **not measured jitter or actual packet loss**. Detailed subgroup results are in `EVALUATION.json` and `DOMAIN-DIAGNOSTICS.json`.

## 4. Implementation and reproducibility

New components:

- `scripts/temporal-threat-gru-c27.py`: causal history featurizer, genuine PyTorch GRU, logistic control predictors, deterministic development training, immutable model freezing, fixed-cohort and checkpoint validators, holdout scoring and match bootstrap.
- `lab/arena/run-temporal-gru-c27.mjs`: preregistered, resumable 36-episode server simulator, factorial opponents and lags, raw result/dataset pairing.
- `scripts/verify-c27-study.py`: independent raw result, source hash, seed, configuration, opponent-profile, registration and frozen-model verification.
- `scripts/test-c27-temporal.py`: nine adversarial learning/data-integrity tests, including server-label mutation invariance and history censoring.
- `tests/temporal-threat-c27.test.mjs`: eight Node regression tests, including Python focused tests, production disallowance, and exact new cohort.
- `scripts/analyze-c27-domains.py`: secondary diagnostic baseline and stratum reporting, not candidate selection.

Test status: **935/935 AI regression**, **733/733 authoritative game-main regression**, game-static check PASS, smoke **5/5 modes** with zero runtime errors, **9/9 additional focused Python tests**. The rebuilt production `page-agent.js` SHA-256 is `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, unchanged from C26.

From source root:

```bash
# Reproduce frozen selection; will refuse to overwrite changed frozen results:
python scripts/temporal-threat-gru-c27.py freeze

# Only if generating a fresh run with matching preregistered configuration:
node lab/arena/run-temporal-gru-c27.mjs --seconds 40 --workers 4 --base-seed 27027000 \
  --out-dir reports/c27/study36

python scripts/verify-c27-study.py
python scripts/temporal-threat-gru-c27.py evaluate
python scripts/analyze-c27-domains.py
python scripts/test-c27-temporal.py
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
```

> **Provenance detail:** The C25-style match observation format intentionally does not store opponent profile as a feature. The independent verifier checks `opponentPolicy` in each *raw server-run result* against the registered job, so observed opponent-domain labels cannot be inferred solely from a filename or unverified dataset.

## 5. Limits and decision

1. Only **29** future-hit windows from 36 matches; confidence bounds include no benefit, and calibration has not been independently verified with human players.
2. No new map is tested. The existing 3 classic maps/4 loadouts are preexisting categories; extra geographic generalization cannot be claimed.
3. GRU is a **neural risk predictor**, not an action-value/Q-network. Neither GRU nor temporal logistic has been causally shown to improve dodging, routing, or shooting.
4. Hitscan events cannot be undone based on client-delivered tracers. A forecast must be *prospective*, with delivery latency included.
5. Full browser event-loop timing, packet loss/jitter, hardware FPS and online adversarial multiplayer remain untested.
6. Domain differences and repeated within-match windows limit statistical precision. Repeated retrospective model selection on the same held-out labels would invalidate the test.

**Release decision: DO NOT SHIP model inference or modify tactical control.** C27 is a reproducible offline learning/validation milestone. Future C28 should pre-register stronger data collection across independent games, add latency-jitter traces, and require both well-calibrated predictive risk and experimentally identifiable **action-dependent** benefits before any policy rollout. No GitHub push was made.
