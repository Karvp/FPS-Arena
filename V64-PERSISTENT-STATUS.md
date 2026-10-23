# FPS Arena TDM v64 — Persistent Research Checkpoint

Verified on 2026-10-23. Canonical codebase: C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Provenance and isolation
- Parent tag research-v63-prospective-shadow, commit f4ded97.
- Research simulator remains C35AJ. Complete v57–v59 source has NOT been reimported.
- All V60–V63 frozen controllers/registries, Classic LibreWolf extension, official server and production Passive/Aggressive neural expert files remain unchanged.
- V64 research uses a separate train-main-v64.mjs and wrapper. Original V61 trigger and action policy remain frozen. Research changes only WASD; fire, aim, ADS, skills and server rules are untouched.
- Public context uses static geometry from the client map and delayed remotes, not privileged future server state. The server/RNG witness is for equality auditing only.

## New 12 public tactical features
Static LOS 3D, target-path cover footprint, cover count, nearby cover distance, teammates within 20m, teammates supporting the target within 25m, visible hostile count, snapshot age, motion validity, radial speed, lateral speed, motion speed.
All extracted before the intervention and Game.step; strict teams, validated boxes, fresh remotes, bounded motion. Missing data is rejected or masked.

## Preregistered 12-group discovery
- Registry: research/tdm-v64-frozen-registry.json
- Registry SHA-256: 1de3b84622556e6b01af95c1b5e3a61c897425f9d9b4470efe6e7f5c11328735
- 12 fresh discovery groups * 4 arms = 48 real simulator replays.
- Independent audit 12/12 PASS; 9 groups triggered, 7 groups had in-window reward/hazard events; 3 groups did not trigger and were not relabeled as having zero reward for training.
- Matched trigger, public prestate/context, selected authoritative prestate and PRNG witness, command prefix and outcome counter deltas.
- Keep arm no-instrument baseline 105/105 original fields identical (Arena/MP5SD seed 640101).
- All 48 trial JSONs (422,817 bytes) retained in the persistent Git repository. Long diagnostic logs stay ignored.
- All 4 legacy sealed holdouts and 3 new v64 holdout groups remain unopened.

## Exploratory regularized context model
- Model type: Ridge regression with alpha 48 (NOT a new neural network). Fold design: leave one independent triggered seed group out, including all four arms.
- Training: 9 triggered groups, 36 paired arm outcome records; 7 hazard-positive arms.
- Utility: kills - 2*deaths - damageTaken/75 within 480 ticks. Hazard: damageTaken>0 or deaths>0.

| Group LOOCV model | Utility MSE (lower better) | Hazard Brier (lower better) |
| --- | ---: | ---: |
| Constant baseline | **0.823511** | **0.181641** |
| Old public action Ridge | 1.029283 | 0.189985 |
| Old + V64 context action Ridge | 0.822306 | 0.204482 |
| Old + V64 context state-only Ridge | 0.872144 | 0.193377 |

- Context-action utility improvement over old-action mean +0.20698; paired-seed bootstrap 95% CI [-0.04878,+0.44876], including zero.
- Utility improvement over constant mean +0.00121; CI [-0.22031,+0.21605], including zero.
- Hazard Brier worsened compared with constant by about +0.02284.
- The conservative action proposal does not switch from Keep on held-group-out tests.
- Model gate FAIL, NO PROMOTION. Improvement against a weak prior-feature Ridge is not proof of reliable tactical control.
- JS shadow inference matched independent NumPy/Python reference on 8 group/variant examples x 4 arms = 32 scores. No inference module is connected to the game command path.

## Files and reproducibility
- V64 source: lab/arena/tdm-public-tactics-v64.mjs, lab/arena/tdm-context-trial-v64.mjs, lab/arena/train-main-v64.mjs.
- Scripts: scripts/tdm_v64_protocol.py, scripts/tdm_v64_train_context.py, scripts/tdm_v64_export_parity.py.
- Artifacts: research/tdm-v64-discovery-audit.json, research/tdm-v64-public-context-shadow-model.json, research/tdm-v64-public-context-evaluation.json, research/tdm-v64-js-python-parity-fixtures.json.
- Unit tests: tests/tdm-v64-public-tactics.test.mjs, tests/tdm-v64-context-shadow.test.mjs.
- Full JavaScript suite under tests/*.test.mjs: 1352/1353 PASS. Exactly one historical Windows C:\C:\Users path failure remains; 0 new regressions. No production code was modified to hide it.
- Research only, neither full natural TDM game nor human gameplay performance has been established.
- Data and source are persisted in one Git repository; no redundant versioned source ZIPs.

## Next
V65: broader independent map/weapon distributions, targeted public observations and calibrated/shrunk actor-specific action value. Freeze the model before new prospective matches and test natural full-match survival. Do not train on sealed holdouts or blindly enlarge neural parameters.
