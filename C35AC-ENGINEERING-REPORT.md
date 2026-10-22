# FPS Arena v2.9.11 — C35-AC Controlled ADS Toggle Experiment

**Date:** 2026-10-14. **Status:** Engineering PASS / Public-state one-tick ADS randomization PASS / ADS-off strongly harmful in the eligible shooting state / Combat policy REJECTED / C36 production neural control BLOCKED.

## Design and implemented code

From full C35-AB source, added `lab/arena/ads-randomization-c35ac.mjs`, 10 new Node tests and a `--c35ac-trace`/`--c35ac-policy observe|randomized` integration in real `lab/arena/train-main.mjs` with a frozen source-registration hash. Original production `page-agent.js` is unchanged. C35-AB, C35-AA and earlier controllers remain available.

The previous C35-AB ADS experiment offered only six hip-fire trials because the incumbent agent already used ADS on the vast majority of otherwise eligible firing ticks. C35-AC instead **randomizes ADS toggle vs maintaining the incumbent ADS state at publicly eligible firing ticks**. Both strata are retained and must be **analyzed separately**:

* **Pre-step ADS=true:** assign `control` to keep ADS, `toggle` to turn ADS off for **one tick**; 50/50 hash-seeded RNG and propensity recorded before `Game.step()`.
* **Pre-step ADS=false:** assign `control` to keep hip-fire, `toggle` to turn ADS on for **one tick**. This stratum is nearly absent in natural gameplay.

Eligibility: public target age ≤225 ms, aim angle ≤4°, target range 2–90m; agent intends to fire, is alive and grounded, no special-motion or priority action, and no upstream C21 action change. The controller edits **only the `aim` field**, never changes firing, movement, yaw/pitch, reload, or skills. The authoritative server shot/pellet truth is joined **after the selected action**; unchosen outcomes remain null. A fire-intent tick with no confirmed shot is **not labeled as a miss**.

**Causal target:** an intention-to-treat effect of one-tick ADS toggle among the *eligible pre-step states in this experiment*. Repeated assignments are dependent within matches; a single tick can change later gameplay, so downstream kills cannot be attributed to a particular tick. This is not the causal effect of ADS in all player/game states, nor is it an estimate of the hip→ADS effect.

## Frozen study, true engine execution

Frozen registration `reports/c35ac/matched-72/FROZEN-DESIGN.json` SHA-256: `dc028cb9e3a7ce20136c050d17132950f452f37588d6f33502565576d32f376f`.

**72/72 real `Game.step()` TDM matches**: 24 matched setups × 3 arms (`release`, `observe`, `randomized`) × 90 sec = **108 simulated game minutes**. Six guns: M4A1, MP5SD, AA-12, HK SL8, L115A3 and Uzi, on Arena, Neon and Foundry, across registered lag/opponent variants. `observe` and `randomized` both share `shadow80` C21 micro-actions; `release` is the original v2.9.11 benchmark. Only `randomized` enables the new intervention.

| Whole-match measure | v2.9.11 release | Shadow observe | C35-AC randomized |
|---|---:|---:|---:|
| Kills | 193 | 218 | 215 |
| Deaths | 12 | 7 | 9 |
| Shots | 1,051 | 1,267 | 1,480 |
| Hit events | 676 | 794 | 855 |
| Pellets | 1,194 | 2,114 | 2,316 |
| Pellet player hits | 840 | 1,203 | 1,317 |
| Agent errors | 0 | 0 | 0 |

Paired 24-setup bootstrap (6,000 draws) kills ratio `randomized / observe` **0.9862** (95% CI **[0.772093, 1.234973]**). No proven improvement; randomized arm loses 3 kills and suffers 2 additional deaths in this cohort, despite recording more shots/hit events. No production promotion.

## Randomized-offer outcomes — primary finding

**306** independently recomputed experimental offers, 304 pre-step ADS=true, **2** pre-step ADS=false. Primary ADS=true stratum:

| Randomized ADS-on baseline | Maintain ADS control | Toggle ADS off treatment |
|---|---:|---:|
| Assigned eligible offers | 141 | 163 |
| Confirmed server shots | 141 | 163 |
| Assigned offers with ≥1 player-hit pellet | 102 | 18 |
| Player-hit shots per assigned offer | **72.34%** | **11.04%** |

**ITT difference (toggle − control): −61.30 percentage points**. Setup-cluster bootstrap 95% CI **−70.60 to −51.21 pp**. Strong negative result for removing ADS *in this narrow, aligned, about-to-shoot state*; do not interpret as an argument to permanently ADS while moving or to always ADS. The hip-fire baseline has **two control offers and zero assigned toggle** — no statistically identified hip→ADS effect, and no ADS-on efficacy claim.

### By gun, ADS-on baseline only

| Weapon | Keep ADS: hit/offers | ADS off: hit/offers | Note |
|---|---:|---:|---|
| M4A1 | 33/51 | 6/51 | Large short-term decrease |
| MP5SD | 7/11 | 4/25 | Sparse and imbalanced |
| AA-12 | 15/15 | 7/7 | Shotgun multi-pellet, close-range ceiling |
| HK SL8 | 19/26 | 0/24 | All sampled off-ADS shots missed |
| L115A3 | 16/18 | 0/26 | All sampled off-ADS shots missed |
| Uzi | 12/20 | 1/30 | Large short-term decrease |

C35AA authoritative spread and pellet observations confirm server ADS state parity on all labeled offers; **do not count individual pellets as independent randomizations**. The large spread ratio for some scoped weapons is part of the engine's documented `spreadFor(weapon, aim, onGround)` mechanism, not a separately learned neural result.

## Integrity, compatibility and tests

* All **72** output hashes validated against `EXECUTION-AUDIT.json`; frozen source hashes validated. **3,798** server-confirmed shots and **5,624** pellets reconciled to C35AA row-by-row, 0 dropped shot rows, 0 agent errors.
* Python-independent hash PRNG: **306/306** C35-AC assignments and **239/239** C21 assignments recomputed. Every non-ADS command field preserved, 0 fire changes, 0 unselected outcome labels.
* Node.js **1,260/1,260 PASS** (10 new C35AC tests). Official engine **733/733 PASS**. Applicable Python **143 PASS + 5 historic SKIP**; seven older frozen-source SHA tests excluded from the applicable suite without modification. Five-mode smoke TDM/SND/HP/BR/ZM **5/5**, 0 errors.
* C35AC `observe` vs opt-out replay: **gameplay equivalent**, and C35AA/C35C/C35G/C35H traces **byte-identical**; proof `reports/c35ac/replay/REPLAY-VALIDATION.json`.
* `page-agent.js` SHA-256 unchanged: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Decision and next work

**Keep as research-only.** The experiment establishes an immediate gameplay risk of disabling ADS on an aligned firing tick, while not establishing an all-match policy improvement or whether turning ADS on during natural hip-fire is beneficial. Training/acceptance of neural action-value models still requires diverse randomized alternatives, independent setup holdouts, uncertainty and direct controlled match evaluation. **Do not promote C35-AC to production or unlock C36.**

## Reproduce

```bash
python scripts/run-c35ac-ads-toggle.py
python scripts/verify-c35ac-independent.py
python scripts/analyze-c35ac-randomization.py
node --test --test-concurrency=2 tests/*.test.mjs
node lab/arena/source-main/test/run.js
python scripts/run-c35ac-python.py
```

The frozen registration locks training runner, tests, engine files and controller. If changed, produce a **new registration/cohort** rather than repurposing historical samples.
