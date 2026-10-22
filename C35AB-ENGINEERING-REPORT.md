# FPS Arena v2.9.11 — C35-AB: Controlled Aim–Movement Randomization

**Date:** 2026-10-14. **Engineering PASS / Randomization PASS / Combat Policy REJECTED.** Production `page-agent.js` unchanged.

## Scope

C35-AA established the authoritative firing-time spread rule `spreadFor(weapon, aim, onGround)`; speed is not a direct spread input. C35-AB performs a **new within-match, opt-in, pre-step 50/50 randomized experiment** at a narrowly eligible public fire-intent tick. All other code paths, C16/C21 controllers and production remain unchanged.

Treatments are mutually exclusive:

- **ADS axis:** when the incumbent is hip-firing at a fresh aligned public target, assign 50% to preserve hip-fire, 50% to enable ADS *for one queued tick*.
- **Hold axis:** when the incumbent is firing with ADS and lateral/forward movement, assign 50% to preserve the movement command, 50% to release four directional inputs *for one queued tick*. ADS and fire are preserved.

Pre-step eligibility: fresh public target age <=225 ms, aim angle <=4°, range 2–90 m, ground and not sliding or in a special movement state; no skill, reload, jump, crouch, slide, use, prone or other priority action, and **no upstream command changes**. Selected action recorded with pre-committed propensity and independent hash RNG before `Game.step()`. Only the selected action has authoritative after-step shot labels. If fire-intent yields zero shots, `playerHit` remains **null**, not fabricated as a miss. C35-AA passive telemetry operates on the **final queued command**.

**Limitations:** A one-tick motor-key release does not guarantee immediate physical velocity zero (inertia); this experiment measures a motor-command intervention, not instantaneous stationary firing. Randomized assignments are sequential within gameplay and can influence subsequent eligibility; a 50/50 offered-tick contrast does not identify all-game or human-match effects. The highly selective ADS stratum is not representative of all hip shots. Do not make causal claims from cross-arm shots or pellet outcomes.

## Preregistered real-game evaluation

**72 actual `Game.step()` TDM games**: 24 paired setups × 3 arms (`release`, `observe`, `randomized`) × 90 seconds = 108 simulated game-minutes, covering six weapons (M4A1, MP5SD, AA-12, HK SL8, L115A3, Uzi), three maps, three lag profiles and opponent mixes. Preregistration and source SHA-256 are stored in `reports/c35ab/matched-72/FROZEN-DESIGN.json`. The reference arm is original v2.9.11 release. `observe` and `randomized` share `shadow80` C21 micro-controller, so only their contrast isolates C35-AB opt-in actions in this new cohort.

| Counter | Release | Shadow observe | C35-AB randomized |
|---|---:|---:|---:|
| Kills | 172 | 273 | 237 |
| Deaths | 11 | 15 | 18 |
| Shots | 1202 | 1595 | 1460 |
| Hit events | 736 | 983 | 839 |
| Pellets | 1752 | 3047 | 2472 |
| Player-hit pellets | 996 | 1656 | 1378 |
| Agent errors | 0 | 0 | 0 |

Paired **24-setup** bootstrap (6000 draws) kills ratio randomized/observe = **0.86813**, 95% CI **[0.75000, 0.99631]**. Kills decrease by 36, deaths increase by 3. The result is **adverse in this cohort**, without establishing future/general-game harm. **Do not promote.**

## Randomized experimental offers

**306** pre-committed 50/50 assignments (158 control / 148 treatment) from randomized arm, all recomputed independently, no nonselected action labels. Of these, **300** are motor-key-hold axis and **6** are hip→ADS axis.

| Axis | Group | Offers | Confirmed shots | Hit-shot offers | Hit per offered tick |
|---|---|---:|---:|---:|---:|
| Motor hold | Control | 156 | 156 | 119 | 76.28% |
| Motor hold | Treatment | 144 | 144 | 118 | 81.94% |
| ADS-on | Control | 2 | 2 | 2 | 100.0% |
| ADS-on | Treatment | 4 | 4 | 2 | 50.0% |

The motor-hold effect on player-hit **per assigned eligible tick** is +5.66 percentage points (setup-cluster bootstrap 95% CI **[-2.68,+12.85] pp**). This does not establish a benefit: the interval includes no improvement, and downstream match performance is worse. ADS axis has only 6 assignments in 4 setups, utterly insufficient for an efficacy claim. Pellet correlations and post-randomization conditioning preclude treating pellets or fired-only subsets as independent causal trials.

## Integrity / test evidence

- 72/72 matches; 4257 authoritative server shots, 7271 pellets reconciled exactly against C35-AA shot audit and result counters.
- Independent Python reimplementation verified **306/306 C35-AB** and **249/249 C21** assignments; all output hashes and frozen source hashes match.
- 0 fire modifications; original command fields preserved except the intended one-tick ADS or 4-key motor axis; 0 agent errors; unselected factual labels remain null.
- Node.js **1250/1250 PASS**; official engine **733/733 PASS**; applicable Python **143 PASS, 5 historical SKIP**, **7 older frozen-source-SHA tests excluded from applicable suite** without rewriting original expected hashes. The C35-AA SHA test was separately run on original C35-AA source: PASS.
- Smoke official TDM / SND / HP / BR / Zombies: **5/5 PASS** with 0 agent errors.
- Original C35-AA 25-second TDM replay with C35-AB disabled: gameplay equivalent after removing creation timestamp, legacy C35-AA trace **byte-for-byte identical**.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Decisions

**C35-AB engineering PASS; experiment negative; ADS axis underpowered; controller REJECTED.** No production change, no C36 policy unlock, no action-value neural model promotion. A follow-up C35-AC should redesign eligibility / causal target with sufficient **ADS exposure** (or controlled seeded paired simulator forks that vary one exact action), preregister power requirements and avoid using immediate hit rates as proxy for survival/kills. Any model must beat state-only baseline on independent match/setup holdout before an opt-in gameplay trial.

## Reproduction

```bash
python scripts/run-c35ab-controlled-aim.py
python scripts/verify-c35ab-independent.py
python scripts/analyze-c35ab-randomization.py
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/source-main/test/run.js
python scripts/run-c35ab-python.py
```

A change to any file listed in `FROZEN-DESIGN.json` requires a new cohort, never reuse the old preregistration silently.
