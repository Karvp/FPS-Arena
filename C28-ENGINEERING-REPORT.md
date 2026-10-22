# FPS Arena v2.9.11 — C28 Controlled Encounter Value Evaluation

**Checkpoint:** C28 · October 13, 2026 · **RESEARCH ONLY** (not a production bot modification).
**Parent:** C27 Temporal Threat Generalization.
**Authoritative shot resolution:** `lab/arena/source-main/server/combat.js:fireWeapon()`.

## Executive findings

C28 introduces three-way, common-random-number counterfactual **micro-encounters**, in place of fitting an action-value model to whole-match outcomes. Each scenario compares the same initial state and shot-spread seeds for original motion, 0.16-second left micro-strafe, and 0.16-second right micro-strafe. The micro-harness invokes the **uploaded authoritative game main server `fireWeapon`** for shot spreading, geometry/range and damage, with scripted shooter aiming responses. It is **not `Game.step`**, a full match, or live online play.

**Precommitted study:** 720 seed-distinct encounters, 2,160 executed counterfactual arms; 432 train / 144 validation / 144 sealed holdout encounters. Six weapons: MP5SD, M4A1, AA12, HK SL8, Uzi, L115A3. Features use only weapon identity, distance, estimated lag, target lateral offset and movement velocity; enemy ADS state and opponent tracking script are **not model features**. Shooter ADS and tracking policy are fixed nuisance scenario attributes known only to the simulator.

## 1. Outcomes on the sealed 144-scenario holdout

| Policy (frozen by validation, no test reselection) | Mean capped incoming loss, lower is better |
|---|---:|
| Original movement | 109.104 |
| Training-best constant: left | 85.372 |
| Rule: move away from lateral offset | 83.246 |
| Neural MLP 10→24→12→3 | **80.024** |

**Preregistered validation winner:** `neural_mlp`. Neural improvement vs original movement: **29.080** units/encounter (weapon-stratified paired scenario bootstrap 95% interval **[21.493, 36.733]**).
Neural advantage vs *best simple policy by validation*, `rule_away_from_offset`: **3.222** units/encounter (95% interval **[-1.952, 8.468]**), **includes zero**. Do not claim reliably better than a simple directional rule.
**Unattainable counterfactual oracle** (chooses minimum hindsight damage among all three arms): 73.836 units. It is only a ceiling, not a deployable policy.

Loss definition: server-reported **nominal/unbounded cumulative damage**, converted to the *research-only* surrogate `min(150, nominal damage)` to approximate a full 100 HP + 50 armor budget. This does **not** reproduce the authoritative `Game.damage` armor, death/respawn, healing or cover rules. The simulated target continues to be shot after nominal lethality, though the surrogate loss caps at 150.

### 1.1 Weapon heterogeneity (post-hoc; not used for policy choice)

| Weapon | n | Original | Neural | Simple lateral rule |
|---|---:|---:|---:|---:|
| aa12 | 24 | 143.47 | 108.62 | 107.50 |
| hk_sl8 | 24 | 108.55 | 101.05 | 102.13 |
| l115a3 | 24 | 76.00 | 13.19 | 13.73 |
| m4a1 | 24 | 133.32 | 117.31 | 115.78 |
| mp5sd | 24 | 98.10 | 62.41 | 70.89 |
| uzi | 24 | 95.19 | 77.57 | 89.45 |

Small weapon-specific samples do not justify specific weapon branches, and apparent effects may not transfer to real multi-agent combat.

## 2. Model and strict train/test separation

- Neural value estimator is a genuine PyTorch MLP **10→24→12→3**, `tanh` hidden layers and sigmoid outputs for normalized action-conditional loss. Hidden layers train on 432 three-arm scenario outcome vectors; AdamW + SmoothL1 + validation-MSE early stopping.
- Model frozen at epoch **141**. Among original, training-best constant, fixed away-from-offset rule and MLP, the primary policy was selected **solely** by 144 validation-scenario mean capped loss. Ties favor simpler policies.
- `DEVELOPMENT.json` and `SEALED-HOLDOUT.json` are separate files. Freeze only opens development labels; test outcomes are opened by `evaluate` after `FROZEN-POLICY.json` is immutable. `DATASET-INDEX.json` hashes both files.
- Holdout draws new seeds from the same *scripted* data-generating family; unseen users, new maps, real-time opponent adaptation and genuine domain shift have **not** been tested.
- Paired bootstrap resamples **complete scenarios** (three actions together), stratified by six weapons, 4,000 resamples. It does not count three arms as three independent encounters.

## 3. Engine physics vs deliberately simplified components

**Authoritative:** server `fireWeapon()` disperses pellets using `hashSeq`, checks current AABB/head sphere and max range, calculates falloff/damage; all arms share per-shot sequences. Shot cadence uses the actual weapon interval and magazine size (bolt-action L115A3 fires once in this 1.25s encounter).
**Simplified:** the target travels laterally from a frozen starting state. The candidate action overrides/adds up to `MOVE.speed=6.9 m/s` for first 0.16s, then returns to baseline velocity. The shooter follows a fixed, lagged snapshot-based tracking script (`track`, `lead`, or `lock`) with deterministic aim perturbations. There are **no map walls, pathfinding, vertical routing, game input processing, ADS transition cost, ammo-reload dynamics, recoil accumulation, client interpolation, anti-cheat, skill actions, opponent tactics beyond the script, or live human player behavior**. No 3D renderer/browser FPS is measured.

Scripted `aim` and `tracking` are nuisance data available to the simulator only, **excluded from the model-visible feature vector**. Real clients must never read future server outcomes to decide an action. These controlled micro-trial counterfactuals are not evidence of a benefit in full `Game.step` matches.

## 4. Verification and release status

- C28 independent authoritative replay: **720/720 encounters, 2160 arms** exact re-simulation and split/provenance/hash checks PASS.
- Complete Node AI regression: **945/945 PASS**, including 10 C28-specific tests.
- Authoritative main engine regression: **733/733 PASS**; `npm run check` PASS.
- Release-only five-mode smoke (TDM/SND/HP/BR/Zombies): **5/5**, zero agent errors.
- `page-agent.js` SHA-256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**, exactly equals C27. **Production behavior unchanged.**
- No promotion of the neural risk/action-value model to production; no live browser evaluation and no GitHub push.

## 5. Exact reproducing commands

```bash
node lab/arena/run-counterfactual-c28.mjs reports/c28/micro-v1
python scripts/train-encounter-value-c28.py freeze
python scripts/train-encounter-value-c28.py evaluate
node lab/arena/verify-counterfactual-c28.mjs reports/c28/micro-v1
python scripts/analyze-c28-robustness.py
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
node scripts/build.mjs
```

## 6. C29 recommendation

Integrate the frozen neural policy **only in a quarantined headless client experiment** with the C16 safety gates and evaluate against the best *simple lateral rule* and original Autopilot in full `Game.step` matches using independent common seeds. Then expand to geometry/covers and adaptive opponents. Do not optimize on this C28 sealed test cohort again or claim live improvement.
