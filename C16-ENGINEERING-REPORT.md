# FPS Arena v2.9.11 — C16 Efficient Tactical Exploration

**Date:** 2026-10-12  
**Base:** C15 Opportunity Scheduler, C7 snapshot of the user's uploaded `fps-arena-main(1).zip`  
**Release disposition:** headless research only; unchanged production `page-agent.js`; no GitHub push, no live browser validation.

## Executive finding

C16 avoids sweeping both lateral collision paths when already-vetoed by unchanged cheap public-snapshot safety gates. **It reduces exploration command computation without changing observed offers, actions, events, or game outcomes on matched C15/C16 replays.** It does not demonstrate combat performance gains.

## Implementation

- New `lab/arena/safe-action-explorer-c16.mjs` implements `candidateSetC16`, using `publicPolicyState` and *the exact C14 veto thresholds*. It returns early before `publicClearanceC14` only if a prior gate has conclusively blocked the offer. Otherwise, both left/right clearance checks run as before. Early return omits secondary geometry-rejection diagnostics only; first rejection reason and eligibility remain identical.
- C14's two `candidateSetC14` internal calls now optionally dispatch through an instance-level `candidateSet` implementation. C14/C15 instances have no override and retain their original behavior.
- New `--c16-dataset` flag on the *main-engine headless* trainer is exclusive with `--c14-dataset`/`--c15-dataset`. `--profile-exploration` measures `explorer.command()` by `process.hrtime.bigint()`. No timing results affect game commands, assignment or RNG.
- Action timing unchanged: retries after rejection 0.12 seconds, 0.9 seconds after an eligible offer; maximum strafe 0.16 seconds. HP, activity, stance, threat range, two-sided static geometry, lag, priority action guards and match-level assignment are unchanged.

## Tests and matching replays

- AI regression: **830/830**, game `main`: **733/733**.
- Main-engine smoke: TDM, S&D, Hardpoint, Battle Royale and Zombies — **5/5, 0 errors**.
- `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — identical to C15 production build.
- **32 headless paired replay matches** = 8 independent seeds × C15/C16 × control/treatment, each 32 seconds. These form **16 matched pairs**. All had identical server gameplay fields, eligible offer counts, selected actions and per-offer observational outcomes.
- 3752 C16 offer probes across those runs; 3741 early-rejected geometry evaluations avoided, 56 actual two-sided geometry evaluations run (also includes repeated active-window rechecks).
- Across 30720 measured `explorer.command()` invocations per model, aggregate instrumented duration was **1058.086 ms (C15)** vs **420.317 ms (C16)** — **2.52×** faster in this set of runs. This is not a whole-engine CPU or FPS speedup.

## Focused static-geometry microbenchmark

220 synthetic public collision boxes; median of five rounds with 1,800 calls per round, alternating method order:

| Scenario | C15 median | C16 median | Ratio |
|---|---:|---:|---:|
| priority-rejected | 225.74 ms | 4.11 ms | 54.94× |
| distance-rejected | 205.76 ms | 3.29 ms | 62.54× |
| eligible-clear | 211.34 ms | 224.71 ms | 0.94× |

Synthetic benchmarks deliberately stress rejected probes. Eligible geometry is not skipped. Measurements are not browser FPS, don't control garbage collection or engine load, and should be rerun on low-end hardware before considering integration.

## Randomized match evidence (separate holdout)

40 distinct seed/map/loadout 45-second TDM matches, match-randomized (not per-offer). Randomized arms: **18 control** and **22 treatment**; matches exposed to at least one opportunity: **14 control** and **18 treatment**. There were no runtime errors.

| Metric | Control | Treatment |
|---|---:|---:|
| Matches | 18 | 22 |
| Offers | 43 | 72 |
| Intervention ticks | 0 | 535 |
| Kills | 61 | 60 |
| Deaths | 5 | 10 |
| Shots | 350 | 320 |
| Damage dealt | 10268 | 9279 |
| Damage taken | 2022 | 2615 |

Unadjusted (treatment minus control) average kill-minus-death difference = **-0.838 per match**, with percentile bootstrap 95% interval **[-2.995, +1.258]** (10,000 match-level bootstrap replications). Group composition is imbalanced: MP5SD appears 8 times in treatment and only 2 times in control. This small-sample unstratified CI does **not** establish an advantage, nor should conditioning on exposed matches be treated as a causal effect. The predeclared independent-per-arm minimum is 20; control reached 18, so the gate **fails**, even though exposure counts exceed the per-arm 10 minimum.

No per-offer counterfactual outcome labels are generated. No neural action-value model was trained.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
python scripts/run-c16-study.py --workers 4
node scripts/analyze-c16-study.mjs
node scripts/benchmark-c16-probe.mjs
```

Results are in `reports/c16/study/` and `reports/c16/probe-microbenchmark.json`. For a fresh clean rerun, remove previously generated C16 study outputs first; runner reuses complete run and dataset files when both exist, but verifies their metadata.

## Risks and next step

C16's optimization is real but only relevant to headless exploration: changing the default Autopilot is unwarranted. C17 should increase independent randomized match units, pre-stratify seed/map/loadout to reduce treatment imbalance, measure true client main-thread latency/FPS, and use match-level safety/non-inferiority gates before any action-value learner is considered. The safety eligibility thresholds should not be weakened to accumulate samples.
