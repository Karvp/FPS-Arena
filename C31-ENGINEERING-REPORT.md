# FPS Arena v2.9.11 — C31 Controlled Enemy-Weapon Generalization & Full-Match Falsification

**Study date:** 2026-10-13  
**Parent checkpoint:** C30 state-representation transfer (neural collapsed to left)  
**Outcome:** **MULTI-WEAPON TRANSFER PASS / FULL-MATCH NEURAL SUPERIORITY FAIL / NO PRODUCTION PROMOTION.**  
**Production SHA-256:** `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — byte-identical with C30.  
**Frozen training model:** C30 10→24→12→3 MLP; SHA-256 `0ca2f7ab671f211a0cf08571d574f687204142aa5244589133d17e80bc8eb511`. **No C31 outcome data entered training.**

## 1. Research question and executive result

C30 had 477/477 real headless-game actions as `micro-left` and every nearest enemy at decision time exposed an M4A1 in its delayed public snapshot, regardless of the trainee's own weapon. C31 intentionally assigned **six different enemy primary weapons before the match** while keeping official `Game.step()`, BotBrain, safe action eligibility, and the existing C30 weights untouched. The controller reads ONLY delayed client-visible features; server weapon ground truth is joined **after** action selection for audit.

The fixed registered study had **36 independent 75-second transfer-pilot games** followed (only after a PASS) by **36 new independent seed blocks × baseline / always-left / frozen neural**, each **105 seconds**, for **108 efficacy games**. In total **144 research games = (36×75 + 108×105) / 60 = 234 simulated minutes**, not wall-clock time or human participation.

- **Transfer gate PASS:** 247/247 eligible pilot offers had valid feature vectors and 247/247 client-delivered weapon IDs agreed with server ground truth. Six enemy weapons were represented; **170 left / 77 right** actions (31.2% non-left), versus 477/477 left in C30.
- **However, model remains weapon-dominated:** In pilot, AA12 had 36/40 right actions and Uzi 39/39 right; MP5SD/M4A1/HK SL8 had no right actions. Replacing motion geometry within the observed same-weapon dataset changed only **4.5%** of frozen model decisions (diagnostic feature perturbations only). Switching weapon one-hot changed **52.9%** of hypothetical decisions.
- **Whole-game neural vs always-left** across 36 matched seed blocks: mean `(kills−deaths)` **-0.8611/match**, stratified bootstrap percentile 95% **[-1.7222222222222223, -0.027777777777777776]**, *exact* paired sign-flip test **p=0.102294921875** for 14 nonzero matched differences (22 ties). No credible neural advantage; there is a concerning negative point estimate.
- **Neural vs incumbent baseline:** mean `(kills−deaths)` **+0.3889/match**, bootstrap interval **[-0.7222222222222222, 1.5833333333333333]**, not conclusive. Comparing raw totals from different game branches is not a valid statistical unit; use matched full games.
- **Production:** no change, no browser validation, no GitHub push.

## 2. Locked design and information barrier

`reports/c31/study/PRE-REGISTERED-PLAN.json` contains all 72 disjoint seed blocks, six enemy weapons, trainee guns, maps, official/mixed/stress opponents, latency 35/65/125 ms, 75/105-second run lengths, model checksum, source checksum, all endpoints and **all pass/fail gates**. Its SHA-256 registration identifier is `74271ffdc0644accf641ac09e0774c83d1912e381d19b8b40e45690faf12b051`. The runner refuses silent source or registration changes; completed valid runs are reused without altering seeds.

The enemy primary is assigned with `ServerPlayer.setLoadout(enemyPrimary, ...)` to all added bots **before** `world.startMatch()`. This is a controlled experiment: the six enemy weapons do **not** describe ordinary out-of-box matches. The combat engine still runs its authoritative state transitions, real collision and map geometry, official or stress BotBrain, weapon damage/spread/recoil handling, respawns and full team combat. Skill-generated special weapons may temporarily appear in other environments, but the full pilot verified client/server weapon identity for every recorded opportunity.

`ResearchPolicyC31 extends ResearchPolicyC30`, inheriting the original C16 safety gate and 0.16s maximum micro-strafe; the frozen network receives delayed **client** weapon/geometry/velocity and predicts once at a safe offer. The authoritative server weapon at that instant is attached **after** `super.command(...)` returns; it cannot influence movement. Neither server raycasts, future hits, hidden aim intent nor matchup outcome enters inference or training.

### Precommitted pilot thresholds

| Gate | Requirement | Observed | Result |
|---|---:|---:|---|
| Independent pilot matches | ≥36 | 36 | PASS |
| Safe offers | ≥120 | 247 | PASS |
| Weapon categories | 6 | 6 | PASS |
| Offers per weapon | ≥8 | 32–56 | PASS |
| Feature coverage | ≥90% | 100% | PASS |
| Client/server weapon agreement | ≥95% | 100% | PASS |
| Non-left model decisions | ≥8% | 31.2% | PASS |
| Weapon categories with non-left | ≥2 | 3 | PASS |
| Runtime errors | 0 | 0 | PASS |

The pass **authorizes the independent efficacy stage**, not promotion.

## 3. What the model actually learned

| Enemy primary | Pilot left | Pilot right | Full-efficacy neural left | Full-efficacy neural right | Neural − simple mean `(K−D)` |
|---|---:|---:|---:|---:|---:|
| aa12 | 4 | 36 | 17 | 42 | -3.667 |
| hk_sl8 | 56 | 0 | 52 | 0 | +0.000 |
| l115a3 | 30 | 2 | 53 | 7 | -1.000 |
| m4a1 | 40 | 0 | 44 | 0 | +0.000 |
| mp5sd | 40 | 0 | 46 | 0 | +0.000 |
| uzi | 0 | 39 | 0 | 56 | -0.500 |

**Frozen-model feature perturbations:** All 247 recorded actions were re-predicted from saved client feature vectors with exact action agreement. Swapping physical features from other recorded offers while holding weapon fixed changed 183/1976 (9.26%) predictions; restricting the borrowed kinematics to other observations of **the same gun** changed 87/1950 (4.46%); switching only one-hot gun across other five classes changed 653/1235 (52.87%). These hypothetical combinations may lie off the actual state manifold, so they **diagnose reliance, not real-game counterfactual action value**.

A model that chooses 'AA12→right, Uzi→right, M4A1→left' is not yet a state-sensitive dodge policy. It can produce more than one action without any material adaptation to an opponent's angular firing pressure or local cover. **This checkpoint does not train or select new network weights post hoc.**

## 4. Authoritative full-game result

| 36 same-seed branches per policy | Kills | Deaths | K−D total | Shots | Hits | Engine damageTaken | Intervention ticks |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 380 | 24 | 356 | 2222 | 1429 | 70887 | 0 |
| simple | 426 | 25 | 401 | 2704 | 1671 | 25901 | 2063 |
| neural | 391 | 21 | 370 | 2418 | 1440 | 34139 | 2153 |

**Unit of inference:** independent seed block. No tests treat individual offers or shots as independent observations. A policy can change later movement and the number/timing of future offers, so subgroup comparisons conditioned on post-action offers are not intention-to-treat estimates.

| Matched full-match comparison | Mean Δ(K−D) / game | Stratified bootstrap 95% | Paired sign-flip p (two-sided, Monte Carlo) | Wins / Losses / Ties |
|---|---:|---|---:|---|
| neural_minus_simple | -0.8611 | [-1.7222, -0.0278] | 0.102294921875 (exact) | 4 / 10 / 22 |
| neural_minus_baseline | +0.3889 | [-0.7222, +1.5833] | 0.6147 | 17 / 15 / 4 |
| simple_minus_baseline | +1.2500 | [-0.1389, +2.5833] | 0.1380 | 18 / 13 / 5 |

The neural-vs-simple bootstrap percentile interval is slightly below zero, while the exact paired sign-flip test at the seed unit gives p≈0.102. These measures use different assumptions with only 36 blocks and many ties. They should not be collapsed into a single claim of statistical significance. **No superiority of neural is demonstrated.** Multiple weapon-specific comparisons are exploratory and not multiplicity-corrected.

An additional 40-second controlled-gun M4A1 baseline run matches the C30 baseline with original default bot weapons on **16/16 gameplay fields**, confirming the no-op research controller itself did not change the incumbent game on this parity fixture.

## 5. Tests and data integrity

- Node AI regression: **962/962 PASS**, including 4 C31-specific tests.
- Main game engine `node test/run.js`: **733/733 PASS**; `npm run check`: **PASS**, with the pre-existing optional audio warnings.
- 5-mode server smoke: TDM/SND/Hardpoint/Battle Royale/Zombies, **5/5**, 0 runtime errors.
- All 36 pilot and 108 efficacy `run.json`/`dataset.json` pairs audited, with model source SHA, seed, enemy gun, map, lag, opponent policy, test duration, assignment, and post-decision weapon truth checked.
- After release build, `page-agent.js` SHA-256 remains `{hash_current}` and matches C30 byte for byte.
- `scripts/analyze-c31-study.py` independently rebuilds descriptive statistics, cluster inference, per-gun summaries, and refuses partial cohorts.
- `scripts/audit-c31-feature-reliance.mjs` independently recomputes all pilot choices and feature-perturbation diagnostics. No model was updated during analysis.

## 6. What is *not* established

This result is **not** evidence for production improvements, nor a test against human players. Opponent guns were explicitly controlled; a real match has random loadouts, weapon switching, cover, changing aim state, packet jitter, actual rendering and human behavior. The observer uses body yaw rather than authoritative enemy aim. The encounter C30 `fireWeapon` micro-harness remains simplified and its action-loss predictions have not been calibrated to full-game realized damage. Headless CPU profiling is not the same as browser frame time. The full-game branch comparison only tests policies as wholes; it does not identify the causal effect of one strafe event. The neural model did not beat always-left during its original C30 model-selection validation, so the study remains diagnostic.

## 7. C32 decision / substantial next checkpoint

**Do not promote or patch the shipped Autopilot.** First collect balanced, observable decision states for each enemy gun **and** within-gun variation in range, body yaw, lateral velocity, cover, and opponent firing behavior. Construct realistic server-state micro-counterfactuals with actual cover collision and shared initial state, while restricting model features to delayed public snapshots. Predefine action-diversity *within each gun* and oracle regret on untouched held-out encounters; include tests that force geometry to dominate weapon-shortcut when justified. Once those gates pass, evaluate with 36–100+ independent whole-match paired seeds and direct browser instrumentation before any promotion.

## Reproduction

```bash
python scripts/run-c31-study.py --stage pilot --workers 6
python scripts/run-c31-study.py --stage efficacy --workers 8
python scripts/analyze-c31-study.py
node scripts/audit-c31-feature-reliance.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
node lab/arena/train-main.mjs --profile release --seconds 12 --modes tdm,snd,hp,br,zm --out reports/c31/FIVE-MODE-SMOKE.json
```

The preregistered runner reuses validated existing episodes, never retunes seeds based on observed outcomes, and refuses changed source or frozen registration.
