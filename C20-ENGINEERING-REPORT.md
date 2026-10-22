# FPS Arena v2.9.11 — C20 Robust Tactical Value Research

**Date:** 2026-10-12  
**Parent:** C19 natural-ended simulation suite, based on user-uploaded FPS Arena `main` snapshot  
**Scope:** Offline research only. No modification to production `page-agent.js`, weapon logic, safety gates or C16 explorer.

## Executive conclusion

C20 introduces paired *common-random-number* simulation forks. Both policy arms receive the **same map, loadout, opponent configuration, lag and initial game RNG seed**. Unlike C19's independent game seeds per arm, this controls the initial state and removes an important source of comparison noise. Later RNG streams and terminal times may legitimately diverge when the policy changes gameplay.

All **24/24 server-authored TDM matches** ended naturally when a team reached the 50-kill threshold; **zero** were capped at 600 simulated seconds. There were **12 unique paired game seeds** across six predeclared map/weapon strata (two pairs per stratum).

**Paired treatment-minus-control outcome** `(kills - deaths)`: **+1.0833 per game seed**. A *descriptive*, within-stratum paired bootstrap with 4,000 draws produced **[0, +2.1667]**. The signs were 7 positive and 5 negative, exact two-sided sign-test **p ≈ 0.7744**. The estimated gain is extremely heterogeneous and unstable; it is not evidence sufficient for production use.

The actual trained neural stratum-contrast diagnostic **underperformed a zero-effect baseline** on leave-one-stratum-out evaluation. **No per-action neural Q-value model was trained or deployed.**

## Code changes

- `lab/arena/train-main.mjs`: a research-only `--c20-matched-seed` gate requiring natural-end C19 mode, full-match, C17 assignment and no forced arm. Explicit `c20MatchedSeedTrial` provenance is emitted. Assignment metadata explicitly states same-seed simulator forks (not independent randomized matches).
- `lab/arena/matched-seed-study-c20.mjs`: deterministic SHA-256 preregistration, C17-compatible opposite-arm assignments for both forks of each seed, full source/arm/result/terminal validation, same-seed uniqueness, all-pairs analysis, stratified bootstrap, leave-one-stratum-out sensitivity and a no-actuation parity assertion.
- `lab/arena/run-matched-seed-c20.mjs`: resumable 24-match runner that fails on incomplete result/dataset file pairs, source fingerprint changes, altered preregistration or mislabeled run outcomes.
- `lab/arena/stratum-value-diagnostic-c20.mjs`: small actual MLP, `7 pre-treatment categorical inputs -> 8 tanh neurons -> 1 continuous match-level policy-contrast estimate`, full-batch fixed-epoch SGD and regularization; seeded initialization and fixed hyperparameters, no game seed or outcome leakage in features. Performance is measured with leave-one-map/weapon-stratum-out folds, against effect=0 and training-fold global mean.
- `lab/arena/evaluate-stratum-value-c20.mjs`: revalidates source trial records before training an offline diagnostic, then persists model weights and held-out predictions.
- 13 new regression tests (`matched-seed-study-c20.test.mjs`, `stratum-value-diagnostic-c20.test.mjs`) covering duplicate/missing pair, wrong arm/seed/provenance, fake match completion, censoring, no-op parity, determinism, feature constraints and fold isolation.

## Pre-registered trial

- Six strata: Arena/MP5SD, Arena/HK SL8, Foundry/AA-12, Foundry/M4A1, Neon/M4A1, Neon/MP5SD.
- Two game seeds per stratum. **Both control and treatment are executed for each seed** (12 pairs = 24 trials). C17's pseudo-random assignment chooses arm execution order, but the final design is **controlled two-fork simulation**, not a randomly assigned population experiment.
- Unchanged C16 safe exploration; five stress opponents; 65 ms delayed public snapshot; natural TDM terminal or 600-second hard administrative censoring.
- Paired full-game outcomes: kill differential, shot count, duration, terminal state. Every pair is included, regardless of whether an exploration opportunity appeared.
- Source and experiment registration: `reports/c20/study24/PRE-REGISTERED-PLAN.json`.

## Results

| Metric | Control | Treatment |
|---|---:|---:|
| Games | 12 | 12 |
| Kills | 170 | 176 |
| Deaths | 46 | 39 |
| Shots | 979 | 1,028 |
| Mean duration (s) | 261.75 | 256.18 |
| Natural ends | 12 | 12 |
| Censored at 600 s | 0 | 0 |

Paired seed effect averaged **+1.0833 kills-minus-deaths**. Seven paired seeds favored treatment; five favored control. All 12 treatment forks exhibited at least one intervention, so the empirical no-op fork-parity branch was not exercised in this cohort (it is enforced in unit tests).

| Stratum | Pairs | Mean paired contrast |
|---|---:|---:|
| Arena / MP5SD | 2 | +8.0 |
| Arena / HK SL8 | 2 | +3.0 |
| Foundry / AA-12 | 2 | −2.0 |
| Foundry / M4A1 | 2 | −8.0 |
| Neon / M4A1 | 2 | +6.0 |
| Neon / MP5SD | 2 | −0.5 |

**Sensitivity:** excluding Arena/MP5SD reverses the average to **−0.3**. The full leave-one-stratum-out range is **−0.3 to +2.9**. With only two paired seeds per stratum, the bootstrap interval is coarse and should not be interpreted as a robust confidence bound outside this set of simulated circumstances. An exact paired sign test is also non-supportive (p≈0.7744).

## Neural value learning diagnostic

The offline MLP regresses **policy-level treatment-control match outcomes**, *not* values of individual left/right actions. Inputs use only one-hot map and weapon known before each match, deliberately excluding the game seed, post-treatment opportunity counts and server-only information. All seeds belonging to an omitted map/weapon stratum are excluded from the corresponding fold's training set.

| Model | Leave-one-stratum-out MAE | RMSE |
|---|---:|---:|
| Neural 7→8→1 | 5.622 | 6.776 |
| Constant zero effect | **5.083** | **5.795** |
| Training-fold mean | 5.767 | 6.700 |

Neural performance fails both metrics relative to the zero-effect benchmark. This is a genuine trained diagnostic, **not an action-value policy**: match-level fork outcomes do not identify separate micro-action rewards. Even with more paired games, a *different* intervention design would be needed to identify left/right Q-values.

The C20 software gate currently rejects neural value training because it has fewer than 60 independent paired seeds, fewer than 8 per stratum, and fewer than 30 active pairs. Passing those sample-count thresholds later would **not by itself** solve per-action identifiability; neural diagnostic output independently hard-blocks online actuation.

## Validation

- AI regression: **866/866 PASS**.
- Authoritative `main` regression: **733/733 PASS**.
- Five game modes (TDM, S&D, Hardpoint, BR, Zombies) headless smoke: **5/5**, zero runtime errors.
- Full paired study: **24/24** valid server natural terminal states, zero administrative censors, 12 paired seeds, 12 active treatment forks.
- Re-running C20 study runner against existing registration and 24 result/dataset pairs reproduces the analysis exactly without replaying or changing the source registration.
- `page-agent.js` SHA-256: **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**, identical to C19.

## Limits and decision

No browser performance/FPS validation or real-human opponent evaluation. These are controlled simulated game forks and not a true randomized clinical-like study. Treatment modifies match dynamics (including subsequent RNG usage) and therefore the shared seed guarantees identical starts, not identical future game states. Two seed replicates per stratum cannot support robust generalization. No individual-action counterfactual label is present and the neural diagnostic is weaker than a zero baseline.

**Do not promote policy or network to production.** Keep default Autopilot unchanged. No GitHub push. Further work should validate across more independent seeds and isolate controlled micro-action choices while retaining safety gates, then require prospective held-out in-game improvements.

## Reproduce

```bash
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
node lab/arena/run-matched-seed-c20.mjs --pairs 2 --workers 3 --out-dir reports/c20/study24
node lab/arena/evaluate-stratum-value-c20.mjs reports/c20/study24
```

Existing registered result/dataset pairs are verified and reused. For a genuinely new prospective experiment, choose a **new output directory and unseen base/experiment seeds before execution**. Never silently overwrite an existing preregistration.
