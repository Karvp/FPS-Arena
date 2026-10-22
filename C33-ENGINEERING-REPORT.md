# FPS Arena v2.9.11 — C33 Long Research Checkpoint: Real-Map Collision-Rich Action Learning

**Date:** 2026-10-13. **Parent:** C32. **Stage:** research only.  
**Decision:** **FAIL NEURAL PROMOTION GATE IN BOTH COHORTS.** Stop before costly full-match neural efficacy trials. Production `page-agent.js` is byte-identical to C32.

## Abstract

C31/C32 found that the neural dodge-policy either collapsed to weapon-specific directions or failed to beat simple map-visibility baselines. C32 used constructed AABB covers, and only 10/7,560 arms touched the collision solver. C33 replaces constructed boxes with static canonical AABB geometry for **Arena, Foundry, Neon** and evaluates each encounter through actual engine `shared/movement.js:stepMove()` (movement and collision) and `server/combat.js:fireWeapon()` (shot spread, ray and damage). We preregistered two separate experiments on independent seeds, one an **adaptive follow-up after seeing only A's development-validation failure**. Both apply a strict validation-only policy-selection gate before opening their own sealed test. Both reject neural; **neither is deployed**.

This is **NOT real-encounter replay from Game.step**. C31's historical per-offer data contains relative features, not enough authoritative world positions to reconstruct a logged encounter. C33 uses sampled states placed against **real map walls**; adversarial aim/tracking is schematic. Claims are limited to controlled micro-encounters.

## Study design

| Design | C33-A real-map | C33-B adaptive refined real-map |
|---|---:|---:|
| Maps × enemy weapons | 3 × 6 | 3 × 6 |
| Independently seeded encounter states | 3,240 | 3,240 |
| Train / validation / sealed test | 1,944 / 648 / 648 | 1,944 / 648 / 648 |
| Server counterfactual branches | 9,720 | 9,720 |
| Encounter states with a movement block | 2,487 (76.8%) | 2,492 (76.9%) |
| Encounter states with action-dependent damage | 641 (19.8%) | 670 (20.7%) |
| Enemy shots reproduced | 87,480 | 87,480 |
| Hidden shooter aim/tracking available to learner | **No** | **No** |
| Neural architecture | 16→40→24→3 | 19→40→24→3 |
| Training candidate initialization seeds | 6 | 6 |
| Official neural selection at validation | **FAIL** | **FAIL** |

Total **6,480** scenarios, **19,440** paired arms, **174,960** server shot callbacks. Arm outcomes from the same scenario share initialization and shooting RNG. Scenarios and train/val/test split were written to immutable `PRE-REGISTERED-PLAN.json` **before** the associated outcomes were materialized.

### Actual game geometry and controlled threat

For each map × weapon group we sample 180 seeds. The target starts beside a real static AABB face with a small clearance from collision. The enemy is placed at a legal position 24–90 m away, and the preset exposure mix is approximately 80% pre-action visible and 20% blocked according to the static map raycast. Both exposed and covered placements are selected with **pre-action map information**, not post-outcome server damage. The three candidate actions are baseline/no lateral micro input, micro-left, micro-right. They are simulated in the actual engine for up to 0.16 seconds of action followed by the target's natural movement; an enemy fires on weapon-specific timing over ~1.27 seconds. This is a single enemy model, not an entire game match.

C33-A has 16 features, including distance, lag scalar, x/z velocity, **public body-yaw bearing**, static pre-action LOS to projected endpoints, pre-action left/right movement feasibility computed with `stepMove`, and one-hot enemy weapon. C33-B adds (a) public signed lateral direction and (b) left/right predicted map-constrained movement displacement. B also uses an enemy body yaw generally facing the trainee (±0.25 rad), whereas A deliberately varies body yaw more broadly. Opponent actual firing yaw is independently synthesized with hidden reaction lag, spread and tracking noise and is **not passed to the policy**.

**Important observation-boundary limitation:** the scenario represents a public *style* of state but does **not** replay a real buffered, delayed client snapshot; the lag is a constructed scenario field affecting the adversary's tracking. The new cover/collision features are physically computable from a public static map but their cost and availability in the browser agent have not been verified.

### Selection protocol and leakage controls

- Each arm is evaluated from the same seed and world state; no hidden outcome is exposed as a feature.
- Validation compares the same frozen simple candidates: do nothing, always left, always right, cover LOS, avoid blocked direction, and combined cover-and-clearance heuristic. B also preregisters a `more-side-clearance` baseline.
- Six independent neural initialization seeds per study, fixed training recipe: AdamW, Tanh MLP, supervised counterfactual damage regression plus centered value-ranking loss, validation MSE early stopping. B adaptively modifies the training loss and feature set **before B dataset generation**.
- Policy selection is by **lowest average validation capped damage**, with simple-policy tie preference. A neural may proceed to full-match evaluation only if it exceeds the best simple baseline on validation by ≥2 units and changes direction in at least three of six weapon groups. Neither study passes.
- The development dataset and frozen weights are hashed. Sealed test data are opened by a separate evaluator **after `FROZEN-MODEL.json` exists**. No post-test re-selection or production promotion is allowed.
- B followed inspection of A's development validation. This is an *adaptive research sequence*, not a single preregistered two-part discovery. Seeds are disjoint, but the same maps and game code are reused.

## Results: validation and sealed holdout

*Capped damage units per independently seeded controlled encounter; lower is better.*

| Policy | A validation | A test | B validation | B test |
|---|---:|---:|---:|---:|
| No intervention | 15.981 | 18.547 | 15.740 | 14.816 |
| Always left | 16.423 | **17.067** | 14.776 | 13.946 |
| Cover-and-clearance (selected by validation) | **14.798** | 17.458 | **14.615** | **13.186** |
| Best neural by *validation* (diagnostic only) | 15.981 | 18.547 | 14.776 | 13.946 |

In A, the neural selected for diagnostic comparison learned **baseline always** and the selected heuristic does not beat always-left on test. In B, neural mostly **always-left** (646/648 test decisions) despite adding movement-space features and weighting differential loss. This is failure to learn a state-sensitive action selector, not a runtime/inference failure.

**A sealed test:** cover-and-clearance versus no intervention: +1.089 mean damage reduction, bootstrap 95% [−0.048, +2.318]; versus always-left: −0.391, interval [−2.171, +1.385].  
**B sealed test:** cover-and-clearance versus no intervention: +1.630, bootstrap 95% [+0.710, +2.676]; versus always-left: +0.761, interval [−1.258, +2.861].

Intervals are **paired scenario-seed bootstrap** intervals from 4,000 resamples. The three action arms and individual shots are not independent observations. Interval estimation is descriptive, not a multiple-comparison-adjusted promotion test; spatial/map reuse and the adaptively generated second cohort create residual dependence/selection considerations.

### Why more examples did not fix neural collapse

C33 greatly expanded physical collision coverage, but **only ~20% of scenarios differentiate the three actions by damage**. All-hit-zero encounters remain common (e.g., from cover, distant weapons, missed shots) and dominate supervised regression, making the training objective gravitate toward average outcomes. Stronger weighting on discriminating scenarios and adding signed movement-space features in B did not produce a model that won validation. This shows that better collision fidelity is necessary for diagnosis but is not itself sufficient for action-value generalization. The oracle that can inspect all future outcomes is not deployable.

## Independent verification

- Server-label replay performed **6,480/6,480** independent scenario reconstructions and **19,440/19,440** arm re-evaluations with **zero mismatches**. Registration/source fingerprints and generated scenario plans match; zero cross-cohort seed overlap.
- C33 dedicated unit regression **13/13 PASS**: canonical geometry, deterministic seed and action-order invariance, hidden-aim feature barrier, actual movement collision, B feature alignment, frozen validation gate, cohort integrity.
- Entire AI suite **987/987 PASS** (C32 974 + 13 new).
- Upstream game engine suite **733/733 PASS**; source checker PASS.
- Five-mode release-profile headless smoke **5/5 PASS**, zero runtime errors (TDM/SND/HP/BR/Zombies).
- Rebuilt `page-agent.js` SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, byte-identical to C32.

## Boundaries and final gates

| Gate | Result |
|---|---|
| Public-only pre-action feature mapping, secret aim separation | PASS in controlled harness |
| Real game AABB, movement solver and firing resolver | PASS |
| Dense movement obstruction exposure ≥35% | PASS (≈77%) |
| Action-dependent server damage ≥10% | PASS (≈20%) |
| Training/validation/holdout split and replay | PASS |
| Neural validation gain ≥2 over best simple baseline | **FAIL A and B** |
| Within-weapon neural action diversity in ≥3 groups | **FAIL A and B** |
| Logged full-game-state replay | NOT IMPLEMENTED; C31 data lacks world coordinates |
| Full-game same-seed neural combat superiority | NOT AUTHORIZED / NOT RUN |
| Browser map-feature inference cost or real network parity | NOT VERIFIED |
| Production promotion / repository push | **NO** |

The next useful experiment should collect **pre-action world-frame positions, directions, local map geometry and observed enemy reactions from true Game.step runs**, preserving the delayed-client information barrier and never using server ground truth to select actions. Alternatively, improve tactical control with an explicitly guarded geometric planner rather than claiming a learned advantage that validation did not demonstrate. Do not turn off safety controls merely to make a neural model fire more often.

## Reproduction

```bash
cd fps-c33-work
node scripts/generate-c33-map-encounters.mjs
python scripts/train-c33-map.py
node scripts/generate-c33-refined.mjs
python scripts/train-c33-refined.py
python scripts/evaluate-c33-sealed.py
node scripts/verify-c33-map-data.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node scripts/build.mjs
node lab/arena/train-main.mjs --profile release --seconds 12 --modes tdm,snd,hp,br,zm --out reports/c33/FIVE-MODE-SMOKE.json
```

The preregistration writer rejects changed files. For a materially new dataset or simulator, use a fresh cohort directory/seed space and new preregistration; do **not** overwrite the historic locked studies.
