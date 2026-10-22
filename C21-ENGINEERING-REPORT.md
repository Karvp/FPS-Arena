# FPS Arena v2.9.11 — C21 Engineering Report

**Date:** 2026-10-12  
**Parent:** C20 common-seed research on user-provided authoritative `main` snapshot  
**Status:** **research checkpoint, no production actuation**

## Executive summary

C21 closes C20's action-identifiability gap **in the experimental design** by randomizing individual eligible encounters among `baseline`, `micro-left` and `micro-right` with known pre-action 1/3 propensities. It observes **only the assigned arm's real server result** in a fixed non-overlapping 0.9-second window. No per-individual counterfactual outcomes are invented. Actions are a 0.16-second micro-strafe added to the incumbent command, with safety rechecks on every modified tick.

The 18-match, six-stratum (65 seconds each) predeclared study produced **70 offers, 69 uncensored windows, 1 censored window, 349 lateral intervention ticks and 28 interruptions**. Four matches had zero offers. Only **10** complete windows had nonzero combat damage. **C21 cannot establish that either lateral action is better. The hard gate blocked training the 12→12→1 neural value model on these real samples.**

## Source and algorithm

- `lab/arena/encounter-randomization-c21.mjs`: pre-action safety eligibility from C16. Seed-index deterministic hash independent of `Math.random`; action probabilities 1/3 each, logged per window; complete priority/movement/health/distance/public geometry veto; instant safe interruption.
- `lab/arena/train-main.mjs`: opt-in `--c21-dataset` available only in a single fixed-map TDM release match. Public delayed observation and original agent command are captured before authoritative `Game.step()`. Server socket sends shot/hit/dmg/kill labels after the action.
- `lab/arena/evaluate-encounters-c21.mjs`: validates unique match identity, source schema, 1/3 propensities, exact assignment regeneration, 9 pre-action feature values, windows without overlap, censoring and server outcomes; estimates descriptive contrasts with bootstrap resampling *entire matches*, not individual windows.
- `lab/arena/action-value-network-c21.mjs`: implemented a 12-input (9 pre-action features plus 3 one-hot actions) → 12 tanh hidden → 1 predicted 0.9-second damage-balance network, with deterministic fitting and match-disjoint evaluation. **The trainer refuses the actual 18-match dataset.** Synthetic regression fixtures are only a software functionality test, not combat training.
- `lab/arena/run-encounters-c21.mjs`: immutable SHA-256 preregistration and source fingerprint; fixed job IDs, seed/map/loadout validation, resumed missing result/dataset pairs without changing the registered jobs.

## Planned experiment and outcomes

- **18 complete simulated TDM matches:** 3 independent seeds for each of Arena/MP5SD, Arena/HK SL8, Foundry/M4A1, Foundry/AA-12, Neon/M4A1, Neon/MP5SD.
- **65 seconds** per match; 5 stress bots, 65ms delayed public snapshots; original Release Autopilot except at randomized safe interventions.
- Each eligible encounter has a fixed 0.9s outcome window and at least 0.9s until another eligible offer. Failed safety probes retry after 0.12s without changing action.
- No intervention at all when Release Autopilot issues priority commands or when public conditions are invalid. An interrupted action is still analyzed under its **original assignment** (intention-to-treat).

| Arm | Complete windows | Average dealt damage / window | Average received damage / window | Mean damage balance |
|---|---:|---:|---:|---:|
| Baseline | 20 | 26.400 | 0.000 | 26.400 |
| Micro-left | 28 | 13.286 | 0.000 | 13.286 |
| Micro-right | 21 | 9.714 | 0.000 | 9.714 |

Observed differences in damage balance compared with baseline:

- **Micro-left:** -13.114 HP/window; descriptive clustered 95% bootstrap [-32.409, 0.000].
- **Micro-right:** -16.686 HP/window; descriptive clustered 95% bootstrap [-36.160, 3.859].

These estimates are highly sparse and heterogeneous and should **not** be interpreted as proof that lateral movement worsens performance. In particular **no eligible windows recorded incoming damage**, although the full 18 matches recorded 2,544 HP of damage taken. The safety gate preferentially exposes relatively safe conditions, limiting defensive-learning signal. Actions may change future eligibility, so even randomized conditional assignments are not equivalent to independent identically distributed samples.

### Explicit neural training gate

A real-data training run requires at least **30 independent matches**, at least **120 completed windows per arm**, at least **20 independent matches covering each arm**, at least **90 nonzero-damage windows**, and a match-disjoint holdout with coverage of all three arms. This is a minimum adequacy check, not sufficient evidence of efficacy. Current coverage is 11/12/11 matches for baseline/left/right, with 10 nonzero windows. **Gate: BLOCKED**, `NEURAL-GATE.json` records `model: null`.

## Verification

| Verification | Result |
|---|---|
| AI test suite | **878/878 PASS**, 12 new tests |
| Authoritative game-main test suite | **733/733 PASS** |
| Authoritative game-main static checks | PASS |
| TDM / S&D / Hardpoint / BR / Zombies smoke | **5/5 PASS**, 0 runtime errors |
| Trial results and datasets | **18/18** valid and preregistered |
| No-op control on zero-offer seed 21021200 | **13/13 gameplay metrics identical** with instrumentation off |
| Production page-agent SHA-256 | `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — exact C20 match |

## Scope and study caveats

This is a controlled headless simulation, not a browser rendering/FPS test and not testing against human opponents. There are 18 independently seeded games, **not 69 independent randomized matches**. The outcome window is intentionally short (0.9s), so observed damage is sparse and does not represent match utility. Only the selected action's outcome exists; actual counterfactual labels are unobserved. Random assignment is deterministic and reproducible, but game dynamics following a choice are not otherwise held fixed. No neural policy was trained on C21 real data, promoted, or connected to the extension. No GitHub push.

**Decision:** continue research; do not change default Autopilot or claim improvement from C21.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/run-encounters-c21.mjs --repetitions 3 --seconds 65 --workers 3 --out-dir reports/c21/study18
node lab/arena/evaluate-encounters-c21.mjs reports/c21/study18/COMBINED-DATASET.json reports/c21/study18/RECHECK.json
```

Registration `reports/c21/study18/PRE-REGISTERED-PLAN.json` is immutable for this study. Use a **new directory and unseen seed** for any future study, never overwrite registered files.
