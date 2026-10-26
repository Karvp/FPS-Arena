# FPS Arena v68 — Persistent public-exposure risk research

Date: 2026-10-24 (Asia/Bangkok). Canonical codebase: C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Provenance and safety boundary

- Parent Git tag research-v67-public-acquisition, commit 6488265.
- Source, controller and frozen registries v60–v67 unchanged. Production Classic LibreWolf, official server and Passive/Aggressive trained expert weights remain untouched.
- V68 research-only, separate source lab/arena/tdm-exposure-guard-v68.mjs and runner lab/arena/train-main-v68.mjs. It extends the frozen V67 A* controller without modifying it.
- NO neural critic trained in this pass. The guard is deterministic and **not connected to the production actor**.
- Public inputs only: own HP and position, delayed public hostile and teammate snapshots (maximum age 275ms), public static map geometry and 3D LOS. Server/PRNG prestate used only as independent replay witness.

## Implemented movement guard

- Arms: Keep, Route (unchanged V67 A*), Guarded Route and Guarded Flank. Non-WASD original commands (fire, aim, ADS, reload and skills) are never changed.
- Intervention window: up to 1,050 ticks. Guarded variants cap **actual changed WASD ticks at 520** and neutralize WASD during high-risk public visible contact or critical HP.
- Exposed close hostiles without teammate support, crossfire and low HP are the registered stop triggers.
- Limitation: neutral movement is not a tactical retreat. It can cause stalling and continued exposure. There is no dynamic cover escape planner yet.

## Frozen independent study

- Frozen registry research/tdm-v68-risk-frozen-registry.json
- SHA256: **63568e23fa679c962b957b73b31a5b5d3ef93be8a143c6073de6b20575a978cd**
- Registered BEFORE running any new V68 discovery seed.
- 12 new discovery seed groups x four research arms = 48 authoritative 4v4 TDM replay runs on Neon/AA12, Arena/AA12, Foundry/AA12 and Neon/M4A1, with official bot opponents, 45ms public lag and genuine score-50 server terminal.
- 3 new holdout groups and all old sealed holdouts remain untouched. Calibration seed 441109 is EXCLUDED from discovery.
- Audit **12/12 PASS**: same pre-intervention server/real RNG witness, public far-target features, command prefix, counters, source and team verification. All 12 triggered; no engine errors.
- **46/48 naturally completed**; on seed v68-n-aa12-02, guarded-route and guarded-flank ended at the 600 simulated-second censor cap instead of naturally. This group is excluded from paired natural-match inference, but all raw outcomes remain saved.
- **11/12 fully paired natural-match groups**; preregistered minimum of 12 was not met.

## Descriptive results, all 12 groups per arm

| Arm | Mean kills | Mean deaths | Mean damage received | Mean shots | Natural ends |
| --- | ---: | ---: | ---: | ---: | ---: |
| Keep | **7.50** | **0.33** | **113.50** | 32.17 | 12/12 |
| Route | 6.08 | 1.50 | 333.50 | 39.50 | 12/12 |
| Guarded Route | 5.83 | 1.17 | 251.17 | 38.17 | 11/12 |
| Guarded Flank | 5.42 | 1.25 | 267.17 | 34.83 | 11/12 |

The arm means are descriptive (including capped matches). Use only the 11 eligible group pairs for the next comparisons.

## Matched arm-minus-baseline deltas, 11 seed groups; 95% grouped-bootstrap CI

| Comparison | Delta net kills | Delta deaths | Delta damage taken |
| --- | --- | --- | --- |
| Route – Keep | −2.818 [−4.909,−0.818] | +1.182 [+0.545,+1.818] | +219.727 [+148.909,+290.727] |
| Guarded Route – Keep | −2.636 [−5.093,+0.091] | +0.818 [+0.364,+1.273] | +136.000 [+64.182,+210.093] |
| Guarded Flank – Keep | −3.182 [−5.091,−1.364] | +0.909 [+0.455,+1.364] | +153.455 [+96.364,+215.273] |
| Guarded Route – Route | +0.182 [−2.364,+3.182] | −0.364 [−1.000,+0.182] | **−83.727 [−178.639,−3.909]** |
| Guarded Flank – Route | −0.364 [−2.727,+2.182] | −0.273 [−0.818,+0.182] | −66.273 [−138.820,+0.727] |

The guard reduces damage compared with the unsafe Route policy in one comparison, but all intervention arms are **clearly worse than Keep** on death/damage. The frozen policy promotion gate FAILS. There is no safe production upgrade.

## Reproducibility

- Source: lab/arena/tdm-exposure-guard-v68.mjs, lab/arena/train-main-v68.mjs, scripts/tdm_v68_study.py.
- Results: research/tdm-v68-risk-independent-audit.json and research/tdm-v68-risk-fullmatch-evaluation.json; raw SHA ledger research/tdm-v68-locked-manifest.json.
- 48 raw discovery match JSON, 4 calibration JSON, 2 independent no-instrument controls = **54 JSONs tracked in Git**; keep long logs ignored. Do not copy entire project to more ZIPs.
- Both uninstrumented controls (seed 441109 and fresh seed 680101) match passive Keep on **105/105 original engine outcome fields** exactly; the two uninstrumented runs are NOT part of 48 replay treatments.
- Focused V68 tests 12/12 PASS, including original SHA, prestate matching, motor-only command boundary, censored-match rules and independent JSON hash verification.
- Full JavaScript repository tests 1385/1386 PASS, **one historical Windows malformed path C:\C:\Users error**; zero new test failures.

## Next V69

Replace neutral-WASD freezing with **active retreat-to-cover** using public static geometry, threat LOS, teammate support and bounded escape routing. Add anti-stall and exposure-time limits. Freeze any new algorithm before collecting results, preserve holdouts, test naturally completed 4v4 TDM against both Keep and Route, and require non-increasing deaths/damage with a positive net-kills confidence interval before any promotion. Do not invent an AI model that was never trained.
