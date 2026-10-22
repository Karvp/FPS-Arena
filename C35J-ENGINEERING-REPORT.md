# FPS Arena v2.9.11 — C35-J: 3D Firing Corridor Calibration and Public Team-ID Audit

**Date:** 2026-10-13  **Status:** ENGINEERING PASS / OBSERVER ONLY / NO MOTOR PROMOTION / C36 BLOCKED  
**Parent:** C35-I, 44,150,308-byte source ZIP (SHA-256 `6a0bc7fecfa02f7fbe9b72df68f9723eaba4a4d15c564cb5a250baad978253a5`).  
**Source:** original production `page-agent.js` SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` — unchanged.

## 1. Problem and high-value finding

C35-I employed a conservative **2D footprint** ray from the current player to the *nearest public target*. That could call a valid line over short cover "blocked". We implemented C35-J's 3D ray using the engine's own `rayWorld` and `eyeHeightOf` shared primitives to compare public body-center sightlines with the old 2D proxy. All 3D computations remain **observational**, never inputs to a game controller.

A more fundamental problem surfaced in the first 36-match diagnostic run: the headless client publishes the local team as string (`red`/`blue`) while remote snapshot `tm` uses numeric team codes (`0`/`1`); C12/C35-I's public enemy filter compares `remote.team !== client.local.team`, which can misclassify a teammate as hostile. The first pilot's uncorrected nearest-target comparisons **were rejected as invalid for geometry calibration** and retained under `reports/c35j/pilot-18-fresh-3d/`. This does **not** establish the same error in the production `page-agent.js` agent; no production file was edited.

C35-J separately normalizes public team IDs using `client.you.tm` or the publicly available local team name, distinguishes C35-I's historical selected ID from the **new nearest verified hostile**, and performs both corrected 2D and corrected 3D ray comparisons on the **same target**. It selects an additional public aim-aligned candidate by smallest 3D angular separation; this is not a claim about player intent.

## 2. Architecture and leakage boundaries

- `lab/arena/firing-corridor-calibration-c35j.mjs`: runs before authoritative `Game.step()` and uses only the local visible pose, delayed enemy snapshots, static public boxes, shared weapon-independent geometry, and own aim direction. Estimates the 3D line from local eye (stance and lean) to approximate target body center; logs the legacy 2D result, **corrected** same-target 2D result, corrected 3D result and public angular target candidate.
- After authoritative `Game.step()`, an isolated audit function reads world boxes, living world players and the shooter pose. It labels the **post-step** static/combined-world ray results and actual server shot/hit counter deltas. This oracle is **NOT** the server's actual firing-time ray (server combat may use lag compensation, spread, several pellets and target pose rewind). There is no oracle to model action feedback path.
- `lab/arena/train-main.mjs`: `--c35j-trace` requires `--c35i-trace`, `--c35g-trace`, `--c35h-trace`, `--c35c-dataset` and `shadow80`. The standard headless engine and C16/C21 controls are not changed.
- C35-J's only effect is adding an observer field to outputs and writing separate JSON. It neither changes a user command nor alters `fire`, `aim`, map topology, targets or movement.

## 3. Frozen fresh-seed paired pilot

`reports/c35j/pilot-18-fresh-3d-v2/FROZEN-DESIGN.json` locks 18 setups (three maps: arena/neon/foundry × six trainee/opponent guns: MP5SD, M4A1, AA-12, HK SL8, Uzi, L115A3), with C35-H `observe` and `lateral` arms, 60 seconds per match, 36 real authoritative `Game.step()` TDM games / **36 minutes simulated**. The source-code SHA lock is checked on replay. All shots observed with no subsampling. This remains an observational measurement trial, **not** a causal evaluation of a new policy.

| Endpoint | Observe | Lateral |
|---|---:|---:|
| Fire command ticks / server shots | 621 | 557 |
| Pre-step public geometry valid | 621 | 556 |
| Historical C35-I target missing from corrected hostile candidates | 533 | 464 |
| Corrected 2D blocked but 3D unobstructed | 153 | 168 |
| Corrected 2D unblocked but 3D blocked | 0 | 0 |
| Different public aim-aligned and nearest-hostile IDs | 210 | 191 |
| Nearest-hostile post-step oracle available | 508 | 449 |
| Fire command modification | 0 | 0 |

Among valid predecision public rows, **24.64%** (153/621) in observe and **30.22%** (168/556) in lateral are footprint-blocked but 3D-clear. Because two-dimensional footprints are more conservative, no examples of 2D-clear/3D-blocked were observed. This is a property of the two proxies, **not shot-hit classification accuracy**.

The historical C35-I target was not a currently eligible correctly team-filtered hostile on **997 of 1,177 valid rows** (533 + 464): this includes teammates and potentially missing/unavailable targets; the single category must not be overstated as 997 confirmed teammates. The C35-I calibration validity is materially limited as a consequence. The corrected nearest-vs-aim-aligned ID diverged on 401 rows, showing that nearest and aim-aligned are not exchangeable.

Paired setup-cluster bootstrap of the *difference in footprint/3D disagreement rates* (lateral minus observe) is **+5.58 percentage points**, 95% exploratory interval **−2.44 to +17.92 pp**. The intervals include 0; this comparison is descriptive because later trajectories diverge and no geometry feature ever controls the game.

**Caveats:** sample count is fire-conditioned and correlated within 18 setups; 3 map pairs per gun are insufficient for generalization; static public geometry does not capture temporary foam walls, moving cover, all ballistics or actual target identity; server post-step ray measurements differ from firing-time truth; do not train neural action-value or promote motor policy on these labels.

## 4. Validation

- **1,123 / 1,123** Node AI unit tests PASS (13 new C35-J geometry/temporal/team tests).
- **733 / 733** engine tests PASS; **38** Python regressions: **37 PASS, 1 SKIP** (historic C35-I frozen-source SHA assertion intentionally incompatible with extending `train-main.mjs`; run that specific archival regression in the immutable original C35-I source).
- **5 / 5** TDM/SND/HP/BR/ZM mode smokes PASS; 0 agent errors.
- Independent C35-H verifier replayed **36/36** offer streams with exact C21 integer hash, C16 arm symmetry, original fire constraints, no orphaned preoffers, original 80ms dose integrity. All match SHA-256 hashes, prereg/source SHA locks and observer row/shot counts match.
- 60-second 100-shot replay parity: C35C dataset and C35G fire, C35H macro, C35I corridor JSON **byte-identical** with and without C35-J; engine result same after ignoring only C35-J's new diagnostic field and wall-clock report creation timestamp. See `reports/c35j/parity/PARITY.json`.
- Production `page-agent.js` unchanged.

## 5. Decision and C35-K path

**C35-J measurement gate PASS; C35-I target-selection measurement is affected by public team encoding; causal motor advantage NOT ESTIMATED; motor policy promotion REJECTED; C36 neural training BLOCKED.**

Next C35-K should correct the public C12/C35-I observer target eligibility in a separately preregistered **measurement-only** revision, stratify the geometry by cover height and public target angular separation, and test agreement on firing-time ray events *only if an isolated post-shot server audit exists*. Do not use post-step oracle fields in any predictive input. Only then consider supervised calibration of a public LOS probability followed by independent holdout and opportunity-preserving motor tests.

### Reproduction

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35j-3d-calibration.py
python scripts/verify-c35j-parity.py
# To regenerate from scratch without overwriting frozen cohort files,
# change OUT to a fresh directory in scripts/run-c35j-3d-calibration.py.
```
