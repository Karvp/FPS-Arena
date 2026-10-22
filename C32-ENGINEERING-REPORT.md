# FPS Arena v2.9.11 — C32 Long Checkpoint: Observable Geometry, Cover and State-Sensitive Action Value

**Research date:** 13 October 2026  
**Parent:** C31 controlled enemy-weapon transfer  
**Decision:** **NO NEURAL PROMOTION.** Neither new neural model was chosen by its registered validation competition against trivial policies. C32 therefore stops *before* full-game policy efficacy trials. This is a pre-specified gate failure, not a published combat-performance gain.

## Executive summary

C31 found that the frozen C30 neural model changes direction substantially when enemy weapon ID changes, but not when lateral geometry changes *within* a weapon category. In C32, we changed the controlled server-based micro-encounter experimental apparatus rather than simply enlarging the MLP. It uses the game's actual `shared/movement.js:stepMove()` (including collisions) and `server/combat.js:fireWeapon()` (raycast, hitbox, range and spread). Each encounter evaluates **baseline / micro-left / micro-right**, with the same initial state and shared shot seed. Static AABB covers are placed at various offsets/heights and included in raycasts. The enemy's tracking reaction, actual aim error and ADS state are withheld from the model; the learner gets only constructed public-style geometry (including a simple map-visibility query), delayed-public-style relative motion, body yaw and enemy weapon ID.

Two *separately locked* experiments were run:

- **C32-A original public-feature calibration:** 1,080 independently seeded encounters = 3,240 server counterfactual arms. Development/train/validation/test: 648/216/216. Observed 72.7% positive-offset examples in train.
- **C32-B distinct, adaptively initiated balanced study:** following inspection of A **development validation** (but not its sealed test), an independent preregistration introduced horizontal reflection to avoid training imbalance. 1,440 independently seeded encounters = 4,320 arms. Train/validation/test: 864/288/288. Positive-offset share in train 51.4%. B seeds have no overlap with A.

Both train MLP **14→32→24→3**, four predetermined weight initialization seeds, up to 500 epochs each, AdamW, SmoothL1 regression plus a pairwise action-difference term, and early stopping from validation prediction MSE. The policy candidate itself is chosen **solely by mean capped damage in validation**, competing against no intervention, always left, always right, a static cover-visibility heuristic, and an away-from-bearing heuristic. The test split remains sealed until after writing the `FROZEN-MODEL.json` containing all four neural models, validation scores, and the selected policy. Both studies selected **non-neural** choices:

- **C32-A validation winner: always-left** (16.114 mean capped damage), while best neural-only candidate scored 18.447.
- **C32-B validation winner: cover-visibility** (16.149), while best neural-only candidate scored 18.220.

The neural policy gate therefore **FAILS**, even though every learner was actually optimized, frozen and assessed. Source and raw data ship with this checkpoint for reproduction, not promotion.

## Holdout results: capped damage per independently seeded scenario (lower is better)

| Policy | C32-A (216) | C32-B (288) |
|---|---:|---:|
| Baseline — do not alter motion | 20.2503 | 18.0331 |
| Always left | 20.8332 | 19.2297 |
| Always right | 23.4217 | 18.7180 |
| Public-map cover-visibility heuristic | 19.2088 (diagnostic; not selected in A) | **15.6869 (selected in B)** |
| Best neural-only model *by development validation* | 23.6690 | 19.2146 |
| Omniscient post-outcome oracle, NOT a usable policy | 10.2525 | 9.2862 |

C32-A's selected always-left policy did **not** beat the simple incumbent/no-change baseline on A test (mean improvement = **−0.583**, paired scenario bootstrap 95% **[−5.437, +4.409]**). C32-B's locked cover heuristic improved over no-change by **+2.346 capped-damage units** on B test, bootstrap **[+0.161, +4.825]**; versus always-left its improvement was **+3.543**, interval **[+0.118, +7.120]**. These intervals resample *scenario seeds*, not individual shots or three arms. They are conditioned on this controlled synthetic environment and are not evidence of improvement in multiplayer game play. Both experiments are part of an adaptive research sequence; repeated testing reduces interpretive strength of nominal intervals.

C32-A test had action-dependent outcomes in **35.6%** of scenarios; C32-B test in **29.2%**. Many scenarios produce zero damage for all arms because walls, weapon range or missed fire; simple per-sample MSE and accuracy alone would be misleading. Reporting the hindsight oracle is useful for computing *regret* but gives the oracle hidden future information and cannot be compared as a deployable policy.

## Simulator implementation and provenance

New implementation: `lab/arena/counterfactual-fire-c32.mjs`. The world contains canonical AABB boxes (zero/low/narrow/central/laterally offset); cover LOS features are calculated from those static boxes with `rayWorld`, not by calling authoritative future damage logic. `stepMove()` enforces engine movement physics and collision; `fireWeapon()` generates raycast hit outcomes for each predeclared shot. Separate `aimError` and `tracking` nuisance factors affect the simulated adversary's firing response but are **not in the 14-feature vector**. Model features are distance, observation delay, initial velocity, body-relative lateral offset, public body-yaw bearing, three static-visibility probes, and one-hot enemy weapon. Body yaw is not interchangeable with server's actual shooting aim.

**Important limits on physical fidelity:** The opponent's aiming/controller behavior is schematic, and the layout is a constructed static map, not a sampled game map. Only **10 of 7,560 action branches** actually encountered movement collision: the larger benefit comes from improved *bullet LOS cover modeling*, not from extensive close-quarter collision or routing tests. The simulation does not model multi-enemy threats, allies, full network state transitions, item pickups, player deaths/respawns or their downstream causal effects. The "cover-visibility" feature is derived from a handcrafted static map; C32 **does not** establish that an equivalent query can be computed cheaply and accurately in the browser production agent. The simulator uses simplified target command scheduling between shots, so it is not a direct reimplementation of every live movement tick.

## Registration and leakage controls

**C32-A** source fingerprint: `eb63bc46134c570c79b59dadd7bcd90bee173c69073de5f80c4904dbb34ba809`, registration: `521cebace3b226ffa39a2c088045e7f4c95e1dafbcd951e2d8cc38afe7352a9f`.  
**C32-B** source fingerprint: `25f4bc7a42f5b55d52a572d1f3a8ca02f41999aa707d6d0aae3deaebdc4d97e0`, registration: `1a502fedb7861cdacb23d3fbe168913b9653f7274be31ae12faf5df528b80e0d`.

Each study materializes a complete numbered plan and writes isolated `DEVELOPMENT.json` and `SEALED-HOLDOUT.json`. Frozen selection names and all weights are written before sealed evaluation. The evaluator validates matching registered source/dataset fingerprints, splits and seed uniqueness, and does not retune the model using test results. The independent verifier regenerates **all 2,520 encounters and 7,560 arm labels**, including geometry and public features, and reports **zero mismatches**. C32-B was designed in response to the **observed A-development imbalance** and must not be represented as a single untouched study that was fully preregistered before C32-A.

## Engineering verification

- New dedicated regression tests: **12/12 PASS**, including hidden aim information barrier, movement obstruction, cover LOS, replay determinism, action-order independence and locked-validation-only model selection.
- Entire AI regression: **974/974 PASS**.
- Official main game engine: **733/733 PASS**; engine source check PASS.
- Five supported mode headless smoke: **5/5 PASS**; no runtime errors.
- Independent all-label source replay: **2,520/2,520 scenarios, 7,560/7,560 arms, 0 mismatches**.
- Rebuilt production `page-agent.js` SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — **byte-identical to C31**.
- No new production Autopilot behaviors, user-browser deployment, claims against humans, GitHub changes, or promotion of C32 cover heuristic.

## Gate decisions and next research checkpoint

| Gate | C32 result |
|---|---|
| Server-combat label/replay fidelity | PASS |
| Authoritative shared movement collision path | PASS as integration, but sparse collision exposure |
| No hidden aim labels in model inputs | PASS for controlled feature mapper |
| Cover/bearing/action sampling diversity | PARTIAL (reflected B reduces offset imbalance; still rare action-differentiating outcomes) |
| Neural validation superiority over simple rule | **FAIL both A and B** |
| Neural actual-game transfer / full-match efficacy | **NOT AUTHORIZED / NOT TESTED** |
| Production promotion | **BLOCKED** |

A useful next checkpoint is *not* a larger net on this same data. It should sample real, collision-rich eligible states and map geometry using **delayed client-observable** features, broaden opponent aim and cover exposure, and test whether per-weapon within-state counterfactual actions differ frequently enough to learn. It must require a validation gain over the cover heuristic, a transfer-coverage gate and noncollapsed within-weapon action diversity before spending hundreds of full-match seeds. Only after such a gate may full-game same-seed baseline/simple/neural comparison be meaningfully run.

## Reproduce

```bash
cd fps-c32-work
node scripts/generate-c32-encounters.mjs
python scripts/train-c32-cover.py
node scripts/generate-c32-balanced.mjs
python scripts/train-c32-balanced.py
python scripts/evaluate-c32-frozen.py
node scripts/verify-c32-data.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/train-main.mjs --profile release --seconds 12 --modes tdm,snd,hp,br,zm --out reports/c32/FIVE-MODE-SMOKE.json
```

The generator refuses to replace differing registered artifacts. Running in a *new directory* is required if any source or scenario registration changes. Python uses torch/numpy; Node uses native engine modules.
