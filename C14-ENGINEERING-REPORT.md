# FPS Arena v2.9.11 — Continuation C14: Safety-Gated Match-Level Exploration

**Date:** 2026-10-12  
**Base:** C13 neural-behavior-cloning research, with the user-provided `fps-arena-main(1).zip` server in `lab/arena/source-main`.  
**Deployment:** **Headless research only.** No production AI change, neural action-value training, browser actuation, or GitHub push.

## Executive finding

C13 collected incumbent movement decisions but did not identify whether *alternate* commands would have been better. C14 adds a pre-registered two-arm, match-level experimental assignment in the authoritative headless server. The treatment can add one brief left or right micro-strafe when **both** alternatives pass a conservative public-world geometry and priority screen. Both assigned and withheld offers are observed. The game’s own RNG sequence is not consumed by C14's assignments.

**Conclusion:** The C14 mechanism actually actuates in headless matches, but opportunities are too rare and some interventions are harmful. **Do not train an action-value model, claim skill gains, or promote the controller.**

## Implementation

- `lab/arena/safe-action-explorer-c14.mjs`: deterministic per-match hash assignment at probability 0.5; optional forced-arm debugging. Action selection is deterministic but independent of match RNG. The offer candidates are `baseline`, `micro-left`, and `micro-right`, not arbitrary unconstrained movement.
- Eligible conditions: TDM, complete delayed public enemy track (age no more than 0.22s), target distance 24–100m, own health ≥75%, grounded/non-special movement, no firing, reload, skill, jump, plate, heal/use, throw, crouch/slide/prone or existing lateral/retreat command. Two 1m raylike static-AABB corridor sweeps must pass on the *public* map. These are conservative feasibility checks, **not** a guarantee of game-level safety.
- Maximum per-offer command hold 0.16s; new offer cooldown 0.9s; interrupt on any changed eligibility. All nonmovement keys, camera, aiming/firing and server anti-cheat/validator are kept intact.
- **No post-action leakage:** the only model-like input is frozen client public state; actual subsequent shot/hit/kill/damage events are observational outcomes of executed commands. Alternative outcomes are not manufactured.
- `lab/arena/evaluate-exploration-c14.mjs`: validates each match’s assignment, candidate set, propensity, experiment design and unique `(mode,map,seed,loadout)`. Rejects low independent match counts / missing opportunity overlap. Forced pairs remain explicitly *diagnostic*, separate from randomized data.
- `scripts/analyze-c14-exploration.mjs`: CLI to reproduce the evaluation.

## Empirical validation

| Experiment | Conditions | Observations | Inference |
|---|---|---|---|
| Paired MP5SD forced-control vs forced-treatment | 6 × 2 TDM matches, 28s | 1 exposed pair; 1 harmed (Arena / seed 140404, 2 kills → 0), other 5 unchanged | Forced diagnostics; no causal generalization |
| Paired M4A1 forced-control vs forced-treatment | 4 × 2 TDM matches, 60s | 1 exposed pair; all 4 unchanged in kills/deaths/shots | Forced diagnostics |
| Randomized assignment (M4A1) | 8 × 28s TDM matches | 3 control, 5 treatment; only 1 and 1 matches respectively had offers | **Too small to estimate treatment efficacy** |
| Control/Release parity | 6 matched TDM conditions × 13 metrics | All identical | Collector and unactuated branch do not perturb simulation |
| Five-mode smoke | TDM / S&D / HP / BR / Zombies, 10s each | 0 runtime errors | General compatibility, not skill generalization |

On 8 randomized matches, control had 4 offers and zero intervention ticks; treatment had 2 offers and 20 intervention ticks. The unadjusted kill differential differs by 1.267 per match in this *tiny, imbalanced* sample. **This is not evidence of treatment benefit**: only two matches had any offers, maps and events vary, and no uncertainty-bound effect can be reliably estimated.

Across all 10 forced matched pairs, 0 improved, 1 harmed, 9 unchanged; only 2 pairs included an action offer. The negative MP5SD scenario remains a regression reference, not a fixture to optimize against.

## Correctness and build

- AI regression suite: **812/812 PASS** (13 new tests relative to C13).
- Main game engine test suite: **733/733 PASS**; `tools/check.js` PASS.
- Five-mode simulator smoke: **0 errors**.
- `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — identical to C13.
- Control parity: PASS across 6 conditions × 13 gameplay metrics.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/train-main.mjs --modes tdm --episodes 8 --seconds 28 --seed 140801 --profile release --classic-maps arena,foundry,neon --trainee-primary m4a1 --opponents stress --out reports/c14/randomized.json --c14-dataset reports/c14/randomized-opportunities.json
node scripts/analyze-c14-exploration.mjs reports/c14/randomized.json reports/c14/randomized-opportunities.json reports/c14/randomized-analysis.json
```

For paired forced-arm diagnostics use `--c14-force-arm control` and `treatment`, **on the same seed and map**. Forced selections are not randomized trials. Full raw match reports and opportunity logs are in `reports/c14/` of the source ZIP.

## Next gate (C15)

Improve collection throughput without relaxing combat priority safeguards; diversify independent match conditions and randomization by map/weapon; report intent-to-treat and *opportunity-exposed* analysis with appropriate design limitations. Predefine minimum opportunity coverage, holdout and harm thresholds before tuning. Only after a meaningful number of independent randomized matches should a contextual value/ranking policy be considered; even then it must be evaluated online in a safe headless lab and must outperform simple nonlearned baselines.
