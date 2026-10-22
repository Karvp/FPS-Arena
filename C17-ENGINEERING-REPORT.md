# FPS Arena v2.9.11 — C17: Stratified Tactical Policy Evaluation

**Date:** 12 October 2026  
**Parent checkpoint:** v2.9.11-C16  
**Game engine:** user-uploaded `forgothtp/fps-arena` main snapshot (C7 sync), not a new GitHub fetch  
**Deployment:** Headless research only. Production `page-agent.js` remains unchanged.

## Executive result

C17 replaces unstratified match assignment with **balanced block-randomized assignment**. Within each pre-treatment map × weapon stratum, pairs of whole matches receive one control and one treatment arm. Randomization happens before seeing any outcome. The action/safety algorithm itself remains **C16**; C17 adds study design, provenance checks and statistical evaluation, not new combat actuation.

A completed 48-match experiment (24 complete paired blocks across six strata, 32 seconds per match) produced an observed **intention-to-treat kill differential of -0.5417 kills-minus-deaths per match**, with block-bootstrap 95% CI **[-1.5417, 0.3333]** and block sign-flip p ≈ **0.3352**. This neither establishes benefit nor conclusively rules out harm. **Do not promote** treatment or train an action-value policy from the observed per-offer outcomes.

## Implemented in source

- `lab/arena/stratified-exploration-c17.mjs`: reproducible hashed assignment by mode/map/loadout/block and matched-block ITT analysis; rejects missing arms, mismatched assignment, duplicate game seeds, forced arms, production actuation, tampered draws and invalid server metrics.
- `lab/arena/train-main.mjs`: new `--c17-dataset`, `--c17-replicate`, `--c17-experiment-seed` research flags; prohibits forced arms and mixed data schemes. Actual game inputs continue through `Game.queueInput()` and `Game.step()`.
- `lab/arena/run-stratified-study-c17.mjs`: source-defined six strata and 1:1 fixed block assignment, independently seeded matches, serialized outcomes.
- `tests/stratified-exploration-c17.test.mjs`: eight targeted correctness/integrity checks.
- C16 short-stride safe-action exploration and all old gating thresholds are unchanged.

## Completed experiment

**Study:** 6 strata × 4 paired blocks × 2 arms = 48 matches, one TDM match per seed. Profiles all use Release Autopilot with headless-only C16 explorer (control does not actuate; treatment may add an admissible micro-strafe). All records remain in `reports/c17/study/` and were independently re-analyzed from `study-rows.json` with exact equality to the stored analysis.

| Outcome | Control (24 matches) | Treatment (24 matches) |
|---|---:|---:|
| Kills | 38 | 27 |
| Deaths | 3 | 5 |
| Shots | 241 | 193 |
| Eligible offers logged | 57 | 46 |
| Matches with ≥1 offer | 20 | 16 |
| Intervention ticks | 0 | 350 |
| Server damage dealt | 6550.0 | 5162.0 |
| Server damage taken | 1346.0 | 1624.0 |

**Observed matched-block ITT by stratum** (treatment − control, kills minus deaths per match):

| Stratum | Blocks | Observed difference |
|---|---:|---:|
| tdm|arena|hk_sl8 | 4 | -1.500 |
| tdm|arena|mp5sd | 4 | +0.000 |
| tdm|foundry|aa12 | 4 | -0.500 |
| tdm|foundry|m4a1 | 4 | +0.250 |
| tdm|neon|m4a1 | 4 | -1.000 |
| tdm|neon|mp5sd | 4 | -0.500 |

The six stratum estimates are noisy (four blocks each) and descriptive; do not optimize to these particular seeds. Within a block, treatment and control use **different independent game seeds**, so their observed differences cannot be treated as same-seed counterfactual trajectories. Individual offers are downstream of treatment and must not be filtered on for causal ITT estimation.

## Test evidence

- `node scripts/build.mjs`: PASS.
- `node --test --test-concurrency=1 tests/*.test.mjs`: **838/838 PASS**, 0 failures.
- `cd lab/arena/source-main && npm test`: **733/733 PASS**, 0 failures.
- `cd lab/arena/source-main && npm run check`: PASS; only missing optional audio assets reported.
- Headless smoke `--modes tdm,snd,hp,br,zm --seconds 9`: **5/5 modes, 0 runtime errors**.
- `page-agent.js` SHA-256 matches the unmodified C16 bundle; browser production behavior not changed.

## Interpretation and limitations

The block bootstrap interval crosses zero and the two-sided sign-flip test is not significant. These results warrant **not deploying** the C16 micro-strafe treatment; however absence of significance is not proof of equivalence. This evaluation is limited to short 32-second TDM episodes, six strata, simulated opponents, delayed headless snapshots and no user-visible browser FPS measurements. No policy learning, off-policy causal reward labeling or live production actuation occurs.

## Reproduction

From the bundle root, use `node scripts/build.mjs`, `node --test --test-concurrency=1 tests/*.test.mjs`, then `node lab/arena/run-stratified-study-c17.mjs --blocks 4 --seconds 32 --workers 3 --out-dir reports/c17/reproduction`. The runner will use the same six pre-defined strata and seed construction. To recompute without rerunning matches, import `analyzeStratifiedC17` and evaluate `reports/c17/study/study-rows.json` with `{minimumBlocks:20,minimumExposedPerArm:10,bootstrapReplicates:10000}`.

**Decision:** C17 research-only. Next work should use larger, independently seeded blocked trials and more maps/weapons, explicitly account for rare admissible opportunities and measure end-to-end browser latency; no neural policy promotion.
