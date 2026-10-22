# FPS Arena v2.9.11 — C22 Engineering Report

**Checkpoint date:** 2026-10-12  
**Parent:** C21 encounter-level randomized value-learning infrastructure  
**Status:** research-only; neither the default Autopilot nor the production extension is changed.

## Executive summary

C22 measures combat risk **without relaxing the C16 safety gate**. It adds a public-observation pressure audit every 0.45 simulated seconds, and evaluates **the same assigned opportunity** over nested, cumulative, nonoverlapping (between offers) windows of **0.9 s** and **1.8 s**. To prevent another experimental action contaminating the 1.8 s outcome, eligible offer cooldown is 1.8 s (C21 used 0.9 s); micro-strafe execution remains 0.16 s with continuous safety rechecks. The three actions (`baseline`, `micro-left`, `micro-right`) are assigned with the unchanged C21 seeded deterministic 1/3 randomization; no game RNG is used.

The predeclared study had **18 completed independent 75-second TDM matches** (3 seeds each of 6 map/weapon strata), yielding **48 opportunities**: 17 baseline, 14 micro-left, 17 micro-right; 2 matches had no offers. **7/48** opportunities had nonzero combined dealt/taken damage by 0.9 s, rising to **14/48** by 1.8 s on the *same assigned opportunities*. Incoming damage occurred in 3 and 5 windows respectively. This improves label density per offer, but still leaves the real-data neural training gate **BLOCKED**.

## Engineering changes

1. `lab/arena/risk-aware-encounters-c22.mjs` — opt-in randomizer subclass. Retains `candidateSetC16` and the same original priority, HP, distance, ground, and public geometry vetoes. Audits eligibility across public state, including blocked encounters, and tags each eligible offer with a deterministic public **pressure proxy** (`low`, `moderate`, `elevated`, `unobserved`). Public inputs include distance, observed hostile count, health, armor and radial target motion; the proxy is *not* a ground-truth imminent-hit likelihood.
2. `lab/arena/evaluate-risk-aware-c22.mjs` — strict schema/provenance and assignment validator, checks overlap, per-horizon event monotonicity, 1.8 s label parity and censoring. Estimates **descriptive** three-arm ITT contrasts using match-cluster bootstrap. The 0.9 s and 1.8 s values are repeated measures on the SAME opportunity, **not two independent samples**.
3. `lab/arena/train-main.mjs` — explicit `--c22-dataset` research-only flag for a single-map, single-episode, Release-profile TDM trial. Gameplay command path is unchanged when the flag is absent.
4. `lab/arena/run-risk-aware-c22.mjs` — preregistered six-stratum study with immutable source fingerprint, fixed seed list, resumable missing output/dataset pairs, job identity verification and combined strict revalidation.
5. `tests/risk-aware-encounters-c22.test.mjs` — 10 focused tests for randomized assignments, safety vetoes, horizon boundaries, label integrity, censoring, payload tampering, training gate and replay determinism.

### Pressure grouping (public proxy)

A score increments by one for each of: distance ≤35 m, at least 2 observed hostiles, health below 90%, armor below 25%, absolute radial speed ≥4 m/s. Scores 0–1 = low; 2 = moderate; 3–5 = elevated. Missing measurements = unobserved. **None of these strata affects action safety or assignment probability.** The safety gate remains exactly as C16, including health ≥75%, distance 24–100 m and vetoing incumbent priority commands.

## Study protocol

- **18 matches = 6 map/weapon strata ×3 distinct seeds**, 75 simulated seconds each, 5 unrestricted stress opponents, fixed 65ms public observation lag, Release Autopilot apart from guarded randomized encounter micro-strafes.
- Game server `fireWeapon`, hit, kill and damage events supply post-action labels; intervention decisions have only delayed public observations and local status.
- Propensities are recorded as **1/3 each** at an offer. Every assigned offer remains in ITT even if its action is interrupted. Outcomes are evaluated for 0.9 and 1.8 s; censoring is explicit.
- Two zero-offer matches remain in the 18-match denominator. Missing/truncated result/dataset pairs are never silently included. Plan and replay verification use source SHA-256.

## Observed data

| Metric | 0.9 s | 1.8 s |
|---|---:|---:|
| Complete assigned windows | 48 | 48 |
| Nonzero dealt-or-taken damage | 7 | 14 |
| Windows with any incoming damage | 3 | 5 |
| Baseline mean damage balance, HP | -15.412 | -10.176 |
| Micro-left mean damage balance, HP | +11.929 | +3.500 |
| Micro-right mean damage balance, HP | +9.706 | +24.706 |

At **1.8 s**, the *descriptive* left-minus-baseline contrast was +13.676 HP (whole-match bootstrap 95% [-25.289, +41.694]); right-minus-baseline was +34.882 HP (bootstrap [+3.412, +69.442]). **Do not treat this as a conclusive win**: only 18 independent matches, 48 assigned windows, few damaging events, multiple horizon/arm/subgroup views, and exposure/eligibility that depends on prior actions. Bootstrap intervals are descriptive and do not correct those limitations or selective policy-search effects. Neither action is promoted.

Opportunity frequency is highly non-uniform: Foundry/M4A1 16, Arena/HK SL8 10, Foundry/AA-12 9, Arena/MP5SD 7, Neon/M4A1 4, Neon/MP5SD 2. This makes generalization to maps and weapons particularly weak.

### Safety gate coverage, not just successful interventions

The 0.45 s observational audit collected **3,006 public-state samples**. Of these, **39** were safe/eligible when audited and **2,967** were not. Public pressure proxy bands: low 193, moderate 1,278, elevated 1,502, unobserved 33. Audited eligible samples by band: low 15, moderate 14, elevated 10; these are sampled instantaneous states, not 39 randomized treatment assignments. Rejections can have multiple simultaneous reasons: incumbent priority command 2,558, distance 2,134, low HP 469, movement state 303, missing/stale public state 133, public geometry 3.

**Interpretation:** frequent pressure-proxy states exist but very few pass all safety constraints. Merely broadening the horizon produces more post-action damage labels per eligible offer, **not** evidence that the policy protects the bot better in high-risk situations.

### Explicit training decision

Hard minimums require ≥30 independent matches, ≥120 complete windows per arm, ≥20 matches covering each arm, ≥90 nonzero windows and ≥30 incoming-damage windows. Observed: 18 matches; 17/14/17 complete per arm; 10/10/13 matches per arm; 14 nonzero windows, 5 with incoming damage. **Training gate: FAIL. No real-data neural Q/action-value model was fitted or enabled in C22.**

## Verification

- **AI regression: 888/888 PASS** (10 new C22-specific tests). 
- **Authoritative `main` engine tests: 733/733 PASS**, static check passes. Two preexisting audio asset warnings are unrelated to this patch.
- **Five-mode smoke (TDM, S&D, Hardpoint, BR, Zombies): 5/5**, zero runtime errors.
- **18/18 complete result/dataset pairs** and immutable study registration/source fingerprint; replay from saved files gives identical analysis.
- **Zero-offer control parity:** same Arena/MP5SD seed 22022001, 75s, with C22 instrumentation on and off: **13/13 gameplay fields exactly equal**.
- `page-agent.js` production SHA-256 = `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, identical to C21.

## Important limitations

- Headless TDM against simulated opponents; no browser FPS, integrated mouse latency or human evaluations.
- C22 uses a *different registered set of seeds* and **longer offer cooldown** than C21. Cross-checking its 0.9 s outcomes against C21's original 18-match aggregate is **not a controlled policy comparison**; the valid density comparison is 0.9 vs 1.8 *within C22's same 48 offers*.
- Delayed snapshot and client-local state are the only inputs to pre-action decisions; server outcomes are appended only after the action. Pressure labels are a user-defined proxy, not ground-truth exposure.
- Longer observation measures the consequences of the **overall incumbent policy after a 0.16 s micro-strafe**, not the isolated effect of strafe under fixed future choices.
- The lab does not establish defensive benefit or generalize to long real-player engagements. No source push and no production policy changes.

## Reproduce

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/run-risk-aware-c22.mjs --repetitions 3 --seconds 75 --workers 3 --out-dir reports/c22/study18
node lab/arena/evaluate-risk-aware-c22.mjs reports/c22/study18/COMBINED-DATASET.json reports/c22/recomputed.json
```

**Next research direction:** increase the number of independently seeded, risk-audited matches; collect *pre-registered* heldout outcomes by actual risk cohort, without weakening movement safety. Consider longer nonoverlapping windows, but report sample loss and carryover. Advance to action-value training only after independently validated data adequacy and safety evidence.
