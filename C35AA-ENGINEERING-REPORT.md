# FPS Arena v2.9.11 — C35-AA: Aim Stability & Movement Interaction

Date: 2026-10-14. **ENGINEERING PASS / PASSIVE SHOT AUDIT PASS / COMBAT POLICY NOT PROMOTED.**

## Engineering objective

Instrument public pre-step ADS, movement velocity/lateral component, angular aim error, fresh public target age, and public metadata spread. Attach **authoritative firing-time shot outcomes only after the engine resolves shots**. Do not touch production `page-agent.js`, combat commands, C16, C21 or training weights.

### Corrected assumption from prior research

`shared/weapons.js::spreadFor(w, aim, onGround)` uses ADS and grounding status, **not horizontal speed**. The server firing implementation uses the identical spread formula. Changes in player motion can affect exposure/aim geometry and positioning without directly changing the intrinsic spread. This is not evidence that moving is better than standing still.

## New implementation

- `lab/arena/aim-movement-audit-c35aa.mjs`: pre-step strictly public-only target and motion features; post-decision authoritative C35-L sink; after-step per-shot pellet outcomes and strict ledger checks. Every server-confirmed shot gets one row (AA-12 pellets stay grouped within the shot).
- `lab/arena/train-main.mjs`: explicit opt-in `--c35aa-trace` and `--c35aa-setup-id`; passive integration around `world.step()`, no command mutation or production import path.
- `tests/aim-movement-audit-c35aa.test.mjs`: 12 new boundary/physics/ledger cases.
- `scripts/run-c35aa-aim-movement.py`: source-SHA preregistered 12 setups × 3 arms × 75 seconds, 6 weapons, 3 maps and 3 lag profiles.
- `scripts/verify-c35aa-independent.mjs`: independent assignment, propensity, match file-hash and shot/pellet/feature audit.
- `scripts/analyze-c35aa-aim-movement.py`: descriptive shot stratification and matched setup-bootstrap (6,000 draws).
- `scripts/run-c35aa-python.py`: preserves and excludes six historical source-hash-locked tests rather than rewriting their expectations.

## Real TDM cohort

Preregistration SHA-256: `16578b248c98453648b714f327d61f593a14590d66feb569a2770645793600d0`. 36/36 authoritative TDM matches, 12 paired setup clusters, 75 seconds each, **45 game-minutes**. No agent errors. `release` is the same production agent under original release configuration; `observe` and `randomized` share the research `shadow80` micro-controller. Only their direct comparison isolates the C35-W/Y/Z one-tick randomization treatment. C35-AA observer is passive in all arms.

| Metric | Original release | Shadow observe | Randomized |
|---|---:|---:|---:|
| Kills | 84 | 99 | 110 |
| Deaths | 4 | 5 | 5 |
| Confirmed shots | 590 | 673 | 701 |
| Hit events | 300 | 376 | 398 |
| Pellets | 601 | 959 | 1152 |
| Player-hit pellets | 411 | 595 | 653 |

Paired 6,000× setup bootstrap kills ratio randomized/observe = **1.1111**, 95% CI **[0.9160, 1.3506]**; deaths ratio **1.00**, CI **[0.25, 2.0]**. No statistically established combat gain. Original-vs-research comparisons are not estimates of the C35-AA effect.

## Shot-level ADS and movement associations (ALL arms, descriptive only)

| Stratum | Shots | Shots with player hit | Incidence |
|---|---:|---:|---:|
| ADS | 1875 | 1350 | 72.0% |
| Hip | 89 | 43 | 48.315% |
| Still | 88 | 35 | 39.773% |
| Slow | 190 | 142 | 74.737% |
| Fast | 1686 | 1216 | 72.123% |

Movement and ADS groups differ in gun, distance, LOS, target freshness and ability to fire. In particular **all 590 release shots were ADS**, and in a single AA-12 `release` pairing there was only one shot; cross-arm/gun stratification is highly imbalanced. Never attribute these incidence differences causally to ADS or speed.

## Public angular alignment vs shot outcome

| Public aim-angle bin | Shots | Hit-shot incidence |
|---|---:|---:|
| 1-3 | 645 | 63.101% |
| 3-10 | 104 | 57.692% |
| <=1 | 1190 | 76.891% |
| >10 | 16 | 50.0% |
| unknown | 9 | 33.333% |

Angle is to the closest-to-crosshair **fresh public hostile** before `Game.step()`, not the lag-compensated authoritative body at firing. A no-target measurement is unknown, not a forced miss label.

**Spread parity:** 1964/1964 confirmed shots have exact static-metadata-to-server spread agreement (max absolute difference 0.0 degrees); 0 public ADS/server ADS mismatches in this cohort. This finding is source/implementation-specific, not a general physical FPS model.

## Independent audit

- Recomputed and verified **1964 server shots and 2712 pellets** over 36 matches; 0 output hashes missing or mismatched.
- **91/91** C21 assignments and **237/237** C35 randomization assignments, **96** real alternative motor inputs.
- 0 fire changes, 0 agent errors, 0 unselected outcomes assigned labels.
- `page-agent.js` SHA-256 unchanged: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.
- Replay parity: enabled passive C35-AA vs off at same seed and 20s profile `release` has identical gameplay after ignoring only the diagnostic field and normal creation timestamp.
- Full Node regression **1,238 / 1,238 PASS**; official engine **733 / 733 PASS**; applicable Python **144 PASS, 5 historical SKIP**, and **6 historical SHA-locked tests excluded** (NOT rewritten). Raw unfiltered historical runner reported one expected old SHA failure on modified `train-main.mjs`; see test logs.
- Smoke five game modes TDM/SND/HP/BR/ZM **5/5 PASS** without agent errors.

## Limitations, decision and next stage

1. **Selection/confounding:** Neither ADS nor speed was randomized; descriptive shot incidence cannot identify the causal value of ADS or speed.
2. **Gameplay sample:** 12 paired setups and few HIP/no-motion shots; pellet outcomes are clustered within shots (AA-12 has 12 pellets) and shots within setups.
3. **Causal movement teacher:** 96 one-tick redirects are not enough to prove long-term value. No counterfactual shot/ADS labels exist for unchosen actions. The model C35-X/Y failed to beat state-only baselines and was not retrained/promoted here.
4. **Cover:** dynamic foam may not appear in this natural cohort; C35-P controlled ability fixture remains the source of dynamic-foam validity.
5. **Source scope:** production remains unchanged. No browser rendering, human opponents or network jitter beyond simulated lag.

**Decision:** C35-AA engineering PASS; no live combat policy promotion, C36 research gate stays closed. Next pass should run preregistered ADS/movement *randomization* only in demonstrably safe states, and evaluate aim-center variance and survival with independent setup holdouts.

## Reproduction

```bash
python scripts/run-c35aa-aim-movement.py
node scripts/verify-c35aa-independent.mjs
python scripts/analyze-c35aa-aim-movement.py
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/source-main/test/run.js
python scripts/run-c35aa-python.py
```

The runner is frozen by source + preregistration SHA. Changed source requires a NEW cohort rather than silently rewriting the current registration.
