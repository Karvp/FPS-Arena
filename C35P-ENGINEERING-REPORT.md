# FPS Arena v2.9.11 — C35-P Engineering Report

**Checkpoint date:** 2026-10-13. **Scope:** public target-confidence calibration and controlled authoritative foam. **Decision:** Engineering PASS; calibration policy REJECTED, production untouched, C36 locked.

## Key findings

C35-P fixes the distinction between **candidate coverage**, **whether a shot hit any player**, and **whether the public aim-ID matches the server-confirmed hit target**. They are separate endpoints. A complete miss has *no valid target-identity ground truth*, and shotgun multi-pellet target ties are abstentions, not mislabeled negatives. Only public pre-`Game.step()` snapshot features enter the predictor.

### Stage A: retrospective C35-O (48 real Game.step TDM matches)

The pre-existing registered C35-O cohort has 12 map/weapon/seed setups crossed with four lag levels. C35-P separated all 12 **setup IDs** into 6 training, 3 validation, and 3 completely held-out setups; splits apply to all lag levels, never to individual pellets or shots.

| Head (heldout C35-O) | Trials | Constant-prior Brier | Selected model Brier | Result |
|---|---:|---:|---:|---|
| P(player hit given pre-step public candidate) | 342 | 0.290254 | 0.290605 | Worse than constant |
| P(aim target correct **conditional on real hit**) | 215 | 0.092115 | 0.092271 | Worse than constant |

Both validation-selected models use **public snapshot age only**; richer public features did **not** win validation model selection. Do not claim confidence is calibrated across maps/weapons from these results.

### Stage B: frozen-model prospective external holdout

After freezing the models and source checksums, C35-P ran **12 additional authoritative TDM matches**: 6 independent map–weapon–seed setups (Arena/Neon/Foundry × HK SL8/Uzi), each at lag 85 and 215 ms; 60s per match (12 simulated minutes). These two guns and seeds were not in the old 48-match calibration design. All assignments use historical C21 and safety via C16; `shadow80` is the research motor policy for this cohort; **no aim policy is changed**.

- Authoritative confirmed shots: **513**; pellets **513** (non-shotgun cohort); C21 assignments verified **28**; all 12 matches with **zero agent errors**, **zero fire-command modifications**, and **zero C21 assignment mismatches**.
- Eligible public candidates at 350ms: **513/513**. This is only sensor coverage, not hit probability.

| Frozen endpoint (new-seed cohort) | Scored shots | Constant training prior Brier | C35-P Brier | Setup-cluster bootstrap model-minus-constant 95% |
|---|---:|---:|---:|---|
| P(any player hit) | 513 | 0.200830 | 0.196331 | [-0.008796, -0.002444] |
| P(public aim-ID correct \| confirmed hit) | 385 | 0.039675 | 0.039732 | [0.000031, 0.000110] |

Bootstrap resamples **six setup clusters** (entire paired-lag groups) with fixed RNG, **3,000 draws**. CI is exploratory due to only six setups. The external hit predictor modestly improved Brier but ID confidence **did not beat** even a training-prior constant. Prior retrospective heldout results were worse for both. **Do not promote either head** to online aim/movement control; no evidence of causal combat improvement.

### Stage C: actual official foam ability / ballistic collision

New authoritative server test (`tests/c35p-real-foam-ability.test.mjs`) creates a dynamic foam wall using **`Game.abil.explode({kind:'foam', ...})`**, the official ability effect, rather than manually adding fake collision boxes. Using the same shooter, target, shot RNG and bullet direction:

- **No foam:** M4A1 pellet hits the player.
- **Foam active:** same M4A1 pellet hits `worldKind='dynamic-foam'`, and foam exists as a real timed ability zone.

This demonstrates the dynamic obstacle collision and label in a controlled case; **zero naturally foam-blocked pellets** appeared in the 12 new-seed matches or C35-O natural cohort. Foam tactical prevalence and agent behavior in real matches remain unverified.

## Supplemental paired original-v2.9.11 TDM comparison

After the source and predictor were frozen, the same **12 matches** were also run under unmodified `--profile release`, with no C35 micro intervention; initial map, gun, seed, opponents and lag were matched to the C35-P prospective cohort. **24 simulated TDM minutes across both policies.** These are matched initial setups, NOT guaranteed identical trajectories.

| Metric | Original release | Research `shadow80` |
|---|---:|---:|
| Kills | 78 | 76 |
| Deaths | 2 | 4 |
| Shots | 439 | 513 |
| Hit events | 243 | 260 |
| Meters traveled | 3418.71 | 3062.24 |

The research policy kills ratio is **0.974**; 95% cluster-bootstrap interval **[0.819, 1.333]**, resampling six paired setup clusters. Shots/hits rose but kills did not, and deaths doubled from an extremely small baseline (2 to 4). This does **not** demonstrate better combat ability. The prediction observer itself makes no control changes, so any gameplay difference concerns `shadow80` research micro movements, not calibration.

## Integration and safety

- `lab/arena/public-target-confidence-c35p.mjs`: frozen, public-only scorer and opt-in passive observer, reads client snapshot before step; only shot counter is attached afterward.
- `lab/arena/train-main.mjs`: new `--c35p-trace` requires `--c35o-trace`, `--c35l-trace`, passive `observe` and `shadow80`. **No altered command, C16 or C21.**
- `scripts/c35p_confidence.py`: strict train/validation/holdout split by complete setup; no hallucinated miss targets.
- `scripts/run-c35p-prospective.py`: preregistered source-hashed 12-match cohort, checksummed outputs.
- `scripts/verify-c35p-independent.py`: checks source SHA, every dataset SHA, C21 hash assignment, public/pre-step predicted score against Python frozen model, firing-time pellet audit, 6-setup bootstrap.
- `scripts/verify-c35p-parity.py`: C35-P observer disabled, **all eight C35C/G/H/I/J/K/L/O research sidecars byte-identical**, gameplay equal after dropping C35-P diagnosis and creation timestamp.

**Production `page-agent.js` SHA256:** `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (unchanged). Server truth labels NEVER enter the public scorer. No policy promotion; C36 remains blocked.

## Validation summary

- Node AI / control / observer: **1168/1168 PASS**.
- Authoritative engine: **732/733 first run**, one intermittent AI-gliding-landing test failed; rerun **733/733 PASS**. This is a pre-existing intermittent test candidate and must not be concealed.
- Python: **86 PASS, 5 explicit historical skips, 0 failures**.
- Five game-mode smoke: **5/5 PASS**, zero agent errors.
- Frozen new-seed 12/12 matches; C21 assignment 28/28; independent auditor PASS; legacy sidecar replay 8/8 byte-identical.

## Decision / C35-Q

Maintain C35-P strictly passive. Investigate distribution shift under high lag and out-of-distribution weapons, calibrate with additional **independent setups and human-like conditions**, and create genuine tactical foam encounters via opponent behavior rather than fixed fixtures. Require positive holdout calibration plus prospective no-regression **shots, deaths, and beneficial movement** before discussing control activation.
