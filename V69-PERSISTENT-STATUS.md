# FPS Arena v69 — Persistent cover-escape research checkpoint

Date: 2026-10-24 (Asia/Bangkok). Canonical codebase:
C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Provenance and isolation

- Parent Git tag research-v68-public-exposure-guard, commit ce0adc1.
- Baseline remains C35AJ authoritative headless simulator; this is NOT a complete restoration of historical v57–v59 sources.
- No changes to v60–v68 frozen source/registries, original FPS Arena engine, original bot server, production Classic LibreWolf extension or original Passive/Aggressive expert neural weights.
- Research-only v69 introduces separate actor lab/arena/tdm-cover-escape-v69.mjs and runner lab/arena/train-main-v69.mjs; not a new neural model, not deployed.
- Only public delayed hostile and teammate states, player HP and pose, static client boxes and declared weapon range guide actions. Server and PRNG prestate are recorded solely for replay matching, not actor input.

## Implemented cover escape

- Four arms: Keep, Route (frozen V67), Cover Escape and Cover Support.
- Retain the old far-public-target trigger and bounded baseline route. Upon LOS/HP-based public danger, look for static boxes casting an actual 3D LOS shadow from nearby threats.
- Search corner and side cover candidates, validate player clearance and box height, then route using bounded static-map 2.9m A* with diagonal-corner prevention.
- If no reachable cover, choose a swept-collision-safe direction away from fresh public threats. On stuck motion, action budget exhaustion or unknown data, release to original baseline commands rather than neutralizing WASD indefinitely.
- Cover arms cap changed WASD to 620 ticks within 1,050 treatment ticks. Fire, aim, ADS, reload, skills, server combat and neural expert are untouched.
- Cover Support adds a conservative supporting-teammate gate on non-danger acquisition; it can coincide with Cover Escape on many situations.
- Static geometry cover does NOT guarantee bulletproof protection, nor infer future opponent trajectories.

## Preregistered full natural-match experiment

- Registry: research/tdm-v69-cover-frozen-registry.json
- Frozen registry SHA256: b5c65d0c547ba97e0cd2f0bf1e211cd5567c8dc72f976aa89e33b63c59e89294
- Registration and all source SHA256 were frozen BEFORE discovery matches; all v60–v68 parent registries remain verifiable.
- 12 new independent discovery seeds × 4 arms = 48 authoritative TDM full-match runs, on Neon/AA12 (6 seeds), Arena/AA12 (2), Foundry/AA12 (2) and Neon/M4A1 (2).
- Three new v69 holdout seeds remain sealed, along with all prior holdouts. Engineering calibration seed 441109 EXCLUDED from reported discovery statistics.
- Real Game.step() authoritative score-50 terminal, 600 simulated-second cap, official simulator bot opponents and 45ms delayed public snapshots.
- Independent four-arm prebranch audit: 12/12 PASS, with identical public trigger/prefix, original server/RNG prestate and counters; all 12 had triggers, zero engine errors.
- Exactly 46/48 match runs finished naturally. On v69-n-aa12-02, both cover arms were censored at 600s while Keep and Route terminated naturally. Preserve the entire evidence; do not equate censoring with safety or success.
- Thus 11/12 independent seed groups are eligible for natural terminal paired differences, BELOW preregistered minimum 12.

## Descriptive all-seed results

| Arm | Avg kills | Avg deaths | Avg damage taken | Avg shots | Natural ends |
| --- | ---: | ---: | ---: | ---: | ---: |
| Keep | 5.417 | 0.583 | 134.50 | 34.25 | 12/12 |
| Route | 8.833 | 1.583 | 352.75 | 50.667 | 12/12 |
| Cover Escape | 6.500 | 1.333 | 289.833 | 39.083 | 11/12 |
| Cover Support | 6.333 | 1.500 | 295.250 | 37.833 | 11/12 |

Cover Escape averaged 4.5 successful cover routes and 94.9 actual active escape ticks per match. These numbers demonstrate actual pathfinding but do not prove optimal survival.

## Paired full natural-match outcome deltas

Differences use 11 independent matched seed groups (not raw arm counts or game ticks). A positive net kills delta is better, positive deaths/damage deltas are worse. Intervals are 95% seed-group bootstrap.

| Comparison | Net kills delta, CI | Deaths delta, CI | Damage delta, CI |
| --- | --- | --- | --- |
| Route – Keep | +2.455 [−0.636,+5.273] | +1.091 [+0.727,+1.455] | +233.364 [+154.545,+317.000] |
| Cover Escape – Keep | +0.364 [−1.818,+2.545] | +0.818 [+0.273,+1.273] | +168.364 [+85.452,+246.545] |
| Cover Support – Keep | 0.000 [−2.273,+2.273] | +1.000 [+0.636,+1.364] | +174.273 [+107.270,+234.273] |
| Cover Escape – Route | −2.091 [−4.000,−0.182] | −0.273 [−0.818,+0.364] | −65.000 [−154.091,+30.093] |
| Cover Support – Route | −2.455 [−4.273,−0.727] | −0.091 [−0.545,+0.455] | −59.091 [−137.000,+16.091] |

- Cover Escape has less mean damage than an unsafe Route baseline but its damage CI includes 0. Both cover arms lose net kills versus Route, with intervals confirming loss on this cohort.
- More importantly, both cover arms increase deaths AND damage versus Keep with intervals excluding 0.
- No action satisfies preregistered net-kills-survival joint gate. Also only 11/12 natural independent matched groups.
- Therefore v69 research DATA/AUDIT PASS, POLICY PROMOTION REJECTED. Do not connect this navigation actor to production.

## Calibration, tests and persistence

- Calibration seed 441109: Keep 0 kills/0 deaths/30 damage; Route 1/1/235; Cover Escape 1/1/201; Cover Support 1/1/201. Calibration excluded from discovery statistics.
- Exactly two extra uninstrumented full natural-match controls on calibration 441109 and new discovery 690101 each equal passive Keep on 105/105 original engine metrics. These are not experiment arms.
- Unit tests validate public cover occlusion, collision, stale data rejection, pretrigger prefix and non-WASD invariance. Raw 48 matches and sealed holdouts independently verified by test.
- Focused v69 tests: 12/12 PASS.
- Full regression test counts in data/v69/v69-full-regression-final.log; one longstanding Windows malformed path C:\C:\Users ... is not patched under frozen production files.
- All 48 discovery JSON + 4 excluded calibration JSON + 2 uninstrumented parity JSON (54 total), scripts, frozen registry, model-free public cover router, audit, evaluation and source-hash manifest are committed in the one persistent Git repository. No redundant source ZIP releases.

## Next v70

The highest-value research direction is a *conditional abstention / opportunity classifier* deciding whether to override Keep at all: no forced acquisition during high-risk unsupported engagements, public estimate of exposure trajectory, supervised paired-group harm/utility labels with strict independent seed group validation. Avoid claiming a new neural network is proven merely because more shots are fired. Use fresh preregistered seeds and keep sealed holdouts untouched.
