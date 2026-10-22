# FPS Arena v2.9.11 — C18 Long-Horizon Tactical Evaluation

**Date:** 12 October 2026  
**Parent:** C17 Stratified Policy Evaluation  
**Engine:** User-provided `fps-arena-main(1).zip` synchronized at C7, not live GitHub HEAD  
**Status:** Headless laboratory only; original C16 guarded micro-strafe policy retained; shipped `page-agent.js` unchanged.

## Executive finding

C18 extends the blocked evaluation horizon from **32 seconds (C17)** to **75 seconds**, with a fresh pre-registered set of **48 independent TDM matches across six fixed map × weapon strata (24 randomized two-match blocks)**. The 48 matches represent **60 simulated match-minutes**. The observed intention-to-treat (ITT) mean difference (treatment minus control, `kills − deaths` per match) was **+0.250**, with **95% stratified block-bootstrap interval [-0.917, +1.333]** and two-sided block sign-flip Monte Carlo **p ≈ 0.740** (10,000 replicates). This does **not** establish a combat benefit. No neural value policy should be trained on per-offer counterfactual rewards from these data, and no policy is promoted.

The different signs between C17 (−0.542 in separate 32s study) and C18 (+0.250) are **not** a controlled estimate of the effect of match length; game seeds and trial cohorts differ.

## Experimental registration and integrity

- `lab/arena/long-horizon-study-c18.mjs` defines immutable map × weapon strata, 4 paired blocks per stratum, independent game seeds and pre-treatment balanced assignments via the existing C17 randomizer.
- `reports/c18/study/PRE-REGISTERED-PLAN.json` was written before outcomes. Registration SHA-256: `dd3497cda9fab81c4bff5f7c1f6efd1f82a56b9065e6bcd342a335afb0c80dc4`.
- Every scheduled match must have its exact seed, arm, mode, map, weapon, experiment seed, replicate index, fixed **75-second** horizon and CPU instrumentation. The analyzer rejects missing, duplicate, altered or contaminated matches.
- All matches are included whether or not the safety gate ever admits an action. Exposure is reported as a **post-treatment diagnostic**, not used for ITT selection.
- `lab/arena/verify-long-horizon-c18.mjs` recomputes results and checks every row against its individual authoritative game-result and exploration-telemetry files. **48/48 verified**.
- The client sees 65ms-delayed public snapshots; the actual engine advances through authoritative `Game.step()`.

## Results

| Metric | Control (24 matches) | Treatment (24 matches) |
|---|---:|---:|
| Kills | 89 | 96 |
| Deaths | 16 | 17 |
| Shots | 567 | 635 |
| Matches with eligible opportunities | 23 | 24 |
| Eligible offers observed | 113 | 141 |
| Intervention ticks | 0 | 915 |
| Server damage dealt | 15087 | 15710 |
| Server damage received | 4899 | 4852 |
| Summed explorer.command wall time (ms) | 951.02 | 1159.60 |

### Exploratory effect heterogeneity

| Map / weapon | ITT mean difference | Exposed control | Exposed treatment |
|---|---:|---:|---:|
| arena / hk_sl8 | -1.25 | 4/4 | 4/4 |
| arena / mp5sd | +1.75 | 4/4 | 4/4 |
| foundry / aa12 | +0.00 | 4/4 | 4/4 |
| foundry / m4a1 | +1.25 | 4/4 | 4/4 |
| neon / m4a1 | -0.75 | 4/4 | 4/4 |
| neon / mp5sd | +0.50 | 3/4 | 4/4 |

Each stratum has **only four paired blocks**. The numbers above and leave-one-stratum-out diagnostics are exploratory and must not be used to tailor a policy to individual test seeds. For example, removing `arena/mp5sd` changes the pooled difference to **−0.05**, demonstrating that the positive mean is not robust to all pre-treatment strata.

### Runtime cost

Explorer-only instrumentation accumulated **951.02 ms** across 24 control matches and **1159.60 ms** across 24 treatment matches (1,800 simulated seconds per arm). This is *not* the browser's FPS, frame time or total CPU. The groups naturally traverse different paths; these totals are not a fair microbenchmark of one implementation against another. C16 lazy-geometry optimization was retained; C18 changes research instrumentation only.

## Verification

- `node scripts/build.mjs`: **PASS**.
- `node --test --test-concurrency=1 tests/*.test.mjs`: **845/845 PASS** (7 new C18 tests).
- `cd lab/arena/source-main && npm test`: **733/733 PASS**.
- `cd lab/arena/source-main && npm run check`: **PASS**; two optional audio files remain missing in the provided engine source.
- Five-mode smoke (`tdm,snd,hp,br,zm`, 9s each): **5/5**, 0 runtime errors.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — identical to C17.
- No browser FPS profiling performed, no GitHub push and no extension production activation.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/run-long-horizon-c18.mjs --blocks 4 --seconds 75 --workers 3 --experiment-seed 180018 --base-seed 18180000 --out-dir reports/c18/reproduction
node lab/arena/verify-long-horizon-c18.mjs reports/c18/study
```

The independent verifier operates on the delivered results and does not rerun 48 matches. The experiment runner writes the fixed registration before any match starts and rejects a changed plan in an existing output directory.

## Limitations and release decision

These are **75-second fixed-horizon TDM simulations**, not natural-end matches; bots are simulated and packet loss is not representative of public Internet play. Treatments alter a match trajectory, so per-offer differences cannot be treated as counterfactual labels. Within each pre-treatment two-match block, the two arms have distinct game seeds rather than exact same-seed counterfactual states. Subgroup estimates are imprecise, confidence interval crosses zero, and simulator CPU time is not browser frame latency. No policy-training or promotion is authorized.

**Next:** conduct longer **naturally completed** paired experiments, independent map/weapon blocks, and browser frame-time validation on a low-end device before considering neural action-value learning. Maintain conservative default Autopilot until benefit clears validation on fresh seeds.
