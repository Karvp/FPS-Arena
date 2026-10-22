# FPS Arena v2.9.11 — C30 State Representation Transfer and Long-Form Falsification

**Date:** 2026-10-13  
**Parent checkpoint:** C29 transfer STOP gate  
**Status:** **RESEARCH-ONLY. TRANSFER GATE PASS; NEURAL POLICY EFFICACY / PROMOTION FAIL.**  
**Production file:** `page-agent.js` deliberately unchanged (SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`).

## Executive outcome

C29 found frozen C28 neural action-value policy could intervene in **49/329 = 14.9%** of qualifying headless-game encounters. Its synthetic support `offset ∈ [-3,3] m`, `|base lateral speed|≤2.8 m/s`, `distance≤75m` was mismatched with delayed client-visible states. C30 collected ONLY **319 observable C29 kinematic samples** (not kill/death outcomes) and generated a separate 1,080-case server-fireWeapon training laboratory. We trained an MLP with physically normalised, broader observable state and ran a preregistered long full-game study.

- **Training laboratory:** 1,080 independent scenarios × 3 arms = 3,240 calls/records, with 648 training, 216 validation, 216 sealed test cases. Uses the uploaded `main` server's `fireWeapon()`. Does **not** simulate world cover, aim intent of real opponents, or full-game routing.
- **Model:** 10→24→12→3 tanh/tanh/sigmoid, trained with PyTorch (weights frozen prior to looking at sealed micro-test or full-match cohort), exported to independently verified JavaScript inference.
- **Preselected *validation winner*:** **always-left rule**, not neural. On 216 validation cases, left averaged 53.6404 capped damage versus neural 53.6716; do not retroactively select neural on test.
- **Sealed micro-lab holdout:** neural 50.0409 capped damage versus always-left 53.4711, descriptive neural advantage +3.4302 (bootstrap 95% +0.4596 to +6.6640). Neural was *not* selected on validation, so this is diagnostic rather than proof of a selected neural policy.
- **Full-Game.step transfer pilot:** 24×105-second new-seed TDM games, **234/234** safety-eligible opportunities with physically supported public features and **234/234** actuations. Threshold precommitted ≥80% transfer coverage, ≥70% actuation coverage, ≥50 offers, all 24 complete. **PASS** (unlike C29), no runtime errors.
- **Full Game.step policy efficacy:** 36 new independent seed blocks × baseline, validation-winning always-left, neural = **108×105-second games**. Every neural action among its **243 eligible offers was left**; neural and always-left yielded identical movement and **18/18 audited gameplay metrics in every one of 36 matched blocks**. Neural-minus-simple mean `(kills − deaths)` is exactly **0**, with all 36 ties. **Policy collapsed to a constant action.**
- **Against incumbent Autopilot:** the same always-left/neural policy had mean paired `(kills − deaths)` advantage **−0.1944/match**, matched-seed bootstrap 95% **[−1.7222,+1.4444]**, paired sign-flip p ≈ **0.84** (no evidence of benefit). Mean damage avoided +8.33, interval **[−45.03,+60.89]** (no evidence of improvement).

**Total precommitted experimental game time:** (24+108)×105 seconds = **13,860 simulated seconds = 231 minutes**; this is not 231 minutes of elapsed wall time or human play. Two additional instrumented research matches were run separately and are excluded from the preregistered causal estimand.

## Method — no future or server-private input to the controller

1. C29 observational calibration reads historical **public** delayed-enemy positions/body yaw plus own motion at safety-eligible moments. Historical kills, damage outcomes and future states are **not training labels**. Their body-yaw relation is a proxy, not authoritative enemy gun aim.
2. Synthetic C30 scenarios are generated from that public kinematic distribution (training/validation/test seed split frozen in `reports/c30/encounters/PRE-REGISTERED-PLAN.json`). Each arm calls the real server's `fireWeapon()`, sharing shot schedule and seed. `body`/`track`/`lead`/`lock`/`partial` are *simulated nuisance aiming behaviours*, not true intent labels.
3. C30 model uses distance/100, snapshot lag/.25, own lateral velocity/12, own lateral displacement divided by distance, and a six-weapon one-hot. `publicModelFeaturesC30` re-derives the vector **before** the server step from the delayed client snapshot. It rejects nonphysical and stale observations, does not silently clamp OOD, never reads authoritative enemy bullet rays.
4. Research controller inherits C16 symmetric static-geometry and movement/health/freshness safety gates, controls at most a 0.16-second lateral intervention, and returns original movement on fallback or baseline prediction. No shipped production file was edited to call this controller.
5. A **separate preregistered pilot/full study** was frozen in `reports/c30/study/PRE-REGISTERED-PLAN.json`. The 108 policy games are gated on passing the separate 24-game pilot. Every seed, weapon/loadout, map, opponent mode, lag and duration is fixed before looking at gameplay outcomes.
6. Whole **matched seed** is the statistical unit. Per-offer and per-shot telemetry are descriptive and are never treated as independent causal observations.

## Full-match quantitative audit

| Policy (36×105s) | Kills | Deaths | Shots | Hits | Damage taken | Eligible offers | Actuated |
|---|---:|---:|---:|---:|---:|---:|---:|
| Original Autopilot | 327 | 27 | 1,683 | 1,085 | 6,735 | 181 | 0 |
| Always-left (validation-winning simple) | 320 | 27 | 1,577 | 1,041 | 6,435 | 243 | 243 |
| C30 neural | 320 | 27 | 1,577 | 1,041 | 6,435 | 243 | 243 |

The original Autopilot and lateral experiments can have **different numbers of later eligible offers because their match trajectories diverge**. Conditioning win-rate estimates on offers after an intervention would be biased. All primary comparisons use entire matched games including games with zero offers.

Neural versus always-left: 0 positive, 0 negative, **36 ties**. All six trainee loadouts (MP5SD, M4A1, AA12, HK SL8, Uzi, L115A3), six paired seeds per loadout, showed neural-vs-simple difference exactly zero.

## Additional failure discovered: opponent-weapon coverage

The independent replay audit `scripts/verify-c30-predictions.mjs` recomputed all 477 public neural decisions from **frozen weights alone** (234 pilot + 243 full). Every output matched the originally recorded prediction; every decision was `micro-left` even though observed lateral offset/distance covered roughly **−1 to +1**. The mean right-minus-left predicted loss margin was about **0.0433** in pilot and **0.0449** in full. This excludes file corruption or accidental random selection as the explanation.

**Important confound:** all **477** research decisions observed the **M4A1 as the nearest enemy weapon**, even though the trainee's own primary weapon varied over six loadouts and three types of opponent logic were configured. Consequently, **this study does NOT test generalisation across enemy weapon types in live encounters**. The variation of trainee loadouts is not variation of shooters whose attacks the bot is dodging. This should be fixed in the next simulator research design.

## Research runtime and parity

- **AI Node regression:** 958/958 PASS, including eight new C30 tests (JS/PyTorch inference parity, public-only snapshot, out-of-domain safety, deterministic three-arm server fireWeapon, provenance).
- **Uploaded upstream main engine:** 733/733 tests PASS; `npm run check` PASS with two pre-existing missing optional audio asset warnings.
- **Smoke modes:** TDM/SND/Hardpoint/BR/Zombies = 5/5 PASS, no runtime errors.
- **Baseline parity:** same-seed C30 original Autopilot versus C16 forced-control: 18/18 recorded gameplay fields identical.
- **Neural/simple exact game parity:** 18/18 gameplay fields in **all 36 matched seed blocks** identical.
- **Exploration profiler:** two extra 60s same-seed headless research games, 3,600 calls per policy. Neural `explorer.command` total 33.2124ms, p95 0.028913ms; simple total 31.0737ms, p95 0.030165ms. These are noisy Node CPU command-only measurements, **not actual browser frame timing**.
- **Production:** `page-agent.js` remains SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` byte-identical to C29. No GitHub push performed.

## Decision and proposal for C31 (large checkpoint)

**C30 is a transfer-compatibility success, but a policy-learning and full-match efficacy failure.** It is **not** justified to promote neural over a simple rule or original Autopilot.

C31 must correct **two distinct gaps**: (1) diversify **enemy** weapons actually present at sampled decisions, not just trainee loadouts; (2) generate action-value supervision from realistic *saved headless Game.step encounters* with walls, enemy movement/aim uncertainties and shared initial state. Hold out entire seeds, enemy types and preferably map layouts. Precommit explicit action-diversity (e.g., all three actions represented with supported exposure) and efficacy gates before running validation. Use direct client-state inputs only at inference; server state can generate offline counterfactual labels but may not leak into inputs. Retain safety-first fallback and entire-match cluster evaluation. Include browser CPU/FPS profiling before considering any deployment.

## Reproduce

```bash
node scripts/generate-c30-encounters.mjs # refuses changed pre-registration/data
python scripts/train-c30-transfer.py # training development only, freeze model
python scripts/evaluate-c30-micro-holdout.py
python scripts/run-c30-study.py --stage pilot --workers 4
python scripts/run-c30-study.py --stage full --workers 4
python scripts/analyze-c30-study.py
node scripts/verify-c30-predictions.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
```

**Limits:** headless engine/client, simulated opponent trajectories rather than real players, no variable packet loss/hardware FPS, and simplified micro-harness are not interchangeable with live-player validation. Neither positive surrogate results nor transfer coverage authorize production.
