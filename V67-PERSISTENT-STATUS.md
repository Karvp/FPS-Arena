# FPS Arena TDM — v67 persistent public-map acquisition checkpoint

Date: 2026-10-24 (Asia/Bangkok). Persistent codebase: C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Project state and frozen boundaries

- Parent Git revision/tag: df89929 / research-v66-diverse-natural-tdm.
- Local simulator baseline remains C35AJ, NOT fully imported/restored v57–v59 research source.
- Original v60–v66 registries, control sources, source-main engine and bot code, Classic LibreWolf extension and shipped Passive/Aggressive expert weights remain unchanged.
- v67 is **research-only**, separate runtime script lab/arena/train-main-v67.mjs and movement proposal lab/arena/tdm-public-acquisition-v67.mjs. No neural critic was fit or promoted in this pass.
- Public-only inputs: own HP/position/yaw, fresh hostile public snapshots (<=275ms), client-visible static map.boxes, declared weapon-range constants. PRNG and authoritative server state are captured solely for pre-branch matching audit; they are never action features.
- Four research arms: Keep (strict passive control), Direct (collision-safe local approach), Route (bounded public-map grid A*), Flank (offset-goal bounded A*). For intervention up to 1,050 ticks, only WASD can change. Shooting, aim, ADS, skills, reload and game-server logic remain under baseline policy.

## Pre-registration and actual natural full-match cohort

- Registry: research/tdm-v67-acquisition-frozen-registry.json
- SHA256: 3b829b193b973a9f71d3d093f763dd1c03fa1106e981b70c7d3f2df4f75f54e4
- Frozen BEFORE all discovery runs; original frozen runner, original V67 actor, engine, old registry hashes preserved.
- 12 new independent discovery seed groups: Neon/AA12 ×6, Arena/AA12 ×2, Foundry/AA12 ×2, Neon/M4A1 ×2. Four matched arms each = 48 authoritative Game.step() 4v4 TDM natural-end games; one team reaches 50 kills. 600-second guard counts as censoring, not natural completion.
- **48/48 natural end, no censored games, no engine errors.**
- **12/12 matched four-arm prestate/PRNG/source audit PASS; all 12 have public far-target trigger.**
- 3 new v67 holdout groups remain unopened, plus all older holdouts.
- The earlier engineering calibration seed 441109 is EXCLUDED from analysis.
- Exact raw match SHA256 per arm is recorded. Two additionally run no-instrument controls matched passive Keep on 105/105 original fields each: one calibration and one discovery Neon/AA12 group. The two no-instrument runs do NOT count among the 48 arms.

## Matched full natural-match results and survival

Across 12 independent matched seed groups:

| Arm | Mean kills | Mean deaths | Mean damage taken | Mean shots |
| --- | ---: | ---: | ---: | ---: |
| Keep | 5.667 | **0.417** | **109.25** | 30.583 |
| Direct | 7.667 | 1.083 | 256.333 | 42.583 |
| Route | 8.083 | 1.417 | 324.167 | 43.667 |
| Flank | **8.667** | 1.583 | 355.583 | 43.583 |

Matched arm-minus-Keep seed-group bootstrap, 95% CI:

| Arm | Net kills improvement | Death increase | Damage taken increase | Shot increase |
| --- | --- | --- | --- | --- |
| Direct | +1.333 [−0.917,+3.750] | +0.667 [+0.333,+1.000] | +147.083 [+56.33,+234.50] | +12.00 [+1.25,+24.92] |
| Route | +1.417 [−1.750,+4.250] | +1.000 [+0.667,+1.333] | +214.917 [+181.75,+247.08] | +13.083 [−1.58,+28.92] |
| Flank | **+1.833 [+0.583,+3.167]** | **+1.167 [+0.750,+1.667]** | **+246.333 [+175.17,+325.42]** | +13.00 [+7.92,+18.33] |

Flank improves net kills with a strictly positive interval on this cohort, BUT **all three intervention arms have significantly worse death/damage survival CIs**. This is NOT a safe policy upgrade.

Team wins against official bots: Keep 9/12, Direct 10/12, Route 10/12, Flank 10/12. This is descriptive; not verified against human opponents or evidence of safe neural-policy superiority. Natural-end times differ and simulator RNG diverges after treatment, so these are matched-fork comparisons, not a perfect causal clone.

## Main technical lesson

V66 had Neon trigger 0/4 and AA12 trigger 0/3. The v67 acquisition trigger no longer requires earlier firing or aiming within effective range. All 12 study groups triggered and actual movement/engagement happened, but an approach-only policy exposes low-range AA12 to hazards. Next stage must reduce exposure via public cover, supported routes, risk gate and early stop/retreat before attempting train or production promotion.

## Immutable-protocol audit erratum

The original preregistered scripts/tdm_v67_acquisition.py contains a Python audit-case local variable named result that shadows the result() reader, yielding UnboundLocalError when invoking its own audit/evaluate CLI. DO NOT silently change this frozen SHA post-registration.

A separate independent, additive auditor in scripts/tdm_v67_independent_audit.py verifies all source hashes, raw files, matching initial counters/prestate/public target, real RNG witness, WASD-only contract, natural score-50 completion and paired statistics; 12/12 groups PASS. The independent JS tests also reread the 48 raw match JSONs and check SHA256. This erratum is **explicitly retained** for reproducibility rather than hidden in a revised frozen source.

## Test and persistence

- tests/tdm-v67-public-acquisition.test.mjs: 4 tests (public-only far-target triggering, safety, obstacle avoidance, matched four-arm prestate).
- tests/tdm-v67-natural-acquisition.test.mjs: 4 tests (registry, frozen hashes, all 48 match records, holdout seal).
- tests/tdm-v67-independent-audit.test.mjs: 4 tests (independent audit erratum, SHA256, safety gate and two full-match uninstrumented parity controls).
- V67-focused 12/12 PASS.
- Entire tests/*.test.mjs regression: 1373/1374 PASS, one pre-existing malformed Windows C:\C:\Users path failure; no new failures (see data/v67/v67-full-node-tests-locked.log).
- Source, frozen registry, additive audit, reports and 48 raw discovery JSONs + 4 calibration JSONs + 2 no-instrument parity JSONs are tracked in one persistent Git repository.
- Keep historical diagnostic stdout and large caches ignored by Git. Do not duplicate a 3GB codebase into multiple ZIP files.

## Next v68 direction

Public exposure-limited *survival-aware* acquisition: score candidate route approach by fresh hostile exposure, static cover, relative allies and own HP; require stop/retreat under rising risk. Register new independent TDM seed cohorts BEFORE outcome collection. Require improved net kills with nonincreasing upper confidence bounds for both death and damage, followed by sealed holdout and representative opponents. Do not auto-promote.
