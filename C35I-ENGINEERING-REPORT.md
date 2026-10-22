# FPS Arena v2.9.11 — C35-I Weapon-Aware Firing Corridor Audit

**Checkpoint:** C35-I, 2026-10-13. **Status:** ENGINEERING PASS / OBSERVATIONAL MEASUREMENT / MOTOR POLICY NOT PROMOTED / C36 BLOCKED.  
**Parent:** C35-H (the full source archive is preserved, with `page-agent.js` unchanged).

## 1. Rationale

C35-H's motor intervention is sparse (33 ticks in 27 minutes). Furthermore, its fixed 12–85 m distance acceptance ignores the real weapons table (`lab/arena/source-main/shared/weapons.js`): AA12 shotgun falloff ends 16m; MP5SD 34m; M4A1 60m; HK SL8 85m; L115A3 45m. This motivates a measurement pass **before** expanding the motor action family.

The C35-I observer reads *only* the player-side command, the local public client state, delayed enemy snapshot, static map boxes, and the actual shared weapon metadata **before `Game.step`**. After the official engine step, it associates server shot/hit counts solely as audit labels. It does not choose, delay, add or remove motor/trigger/aim inputs.

## 2. New source and command wiring

- `lab/arena/public-firing-corridor-c35i.mjs`: public-facing distance / weapon falloff band, nearest public opponent angular bearing, stale snapshot validity, a conservative 2D *static footprint* intersection proxy, and separate left/right public clearance. Reports quality proxy in [0, 1], descriptive and not an action-value estimator.
- `lab/arena/train-main.mjs`: optional `--c35i-trace` only together with C35-H macro, C35-G fire audit and C35-C `shadow80`. Source `page-agent.js` unchanged.
- `tests/public-firing-corridor-c35i.test.mjs`: 10 unit tests including all major geometry edge cases, 120ms age failure, weapon metadata, no fire mutation, sampling integrity, and pre/post-step temporal separation.
- `scripts/run-c35i-weapon-corridors.py`, `scripts/analyze-c35i-weapon-corridors.py`, `tests/test_c35i_reliability.py`: frozen match-pair runner, independent rehash + original C21 hash verification, and 5 additional Python tests.

**IMPORTANT:** Quality is **not** true visibility, guaranteed hit probability, or firing readiness. The target is the nearest delayed *public* hostile, which may not be the one being aimed at. The 2D footprint ray declares even a low wall an obstruction and is thus an intentionally conservative geometry proxy. Moving cover, full 3D vertical sightlines and ballistic dispersion are not modeled. The apparent accuracy of any grouping must not be used as training or safety labels without further validation.

## 3. Locked new-seed experiment

The frozen design `reports/c35i/pilot-18-weapon-pairs/FROZEN-DESIGN.json` registers 18 setup pairs (3 maps × 6 trainee+opponent primary weapons) × 2 arms (`observe`, `lateral`), 60 seconds each, **36 real `Game.step()` TDM matches / 36 simulated minutes**. Unlike C35-H, the trainee gun varies too; seed, map, weapon, opponent profile, lag, and the C21/C16 research micro path match within each pair. *Both arms retain the parent C35-H motor policy; C35-I is read-only in both.*

| Weapon | Observe server shots | Lateral server shots | Observe valid lane rows | Lateral valid lane rows | Lateral macro ticks |
|---|---:|---:|---:|---:|---:|
| aa12 | 41 | 36 | 41 | 36 | 4 |
| hk_sl8 | 163 | 163 | 162 | 162 | 0 |
| l115a3 | 54 | 53 | 53 | 52 | 1 |
| m4a1 | 87 | 97 | 87 | 97 | 2 |
| mp5sd | 117 | 117 | 116 | 116 | 1 |
| uzi | 25 | 21 | 25 | 21 | 1 |

| Predeclared endpoint | Observe | Lateral |
|---|---:|---:|
| Confirmed server shots | 487 | 487 |
| Micro C21 executed ticks | 228 | 201 |
| Confirmed server hits | 339 | 345 |
| Kills, descriptive only | 106 | 107 |
| Damage taken, descriptive only | 1242 | 1715 |
| Additional C35-H lateral ticks | 0 | 9 |
| All preselected firing-tick corridor samples | 487 | 487 |
| Valid public lane samples | 484 | 484 |
| Static footprint ray unblocked | 210 | 197 |
| Bilateral static sweep clear | 450 | 455 |

The equal **487 vs 487 shots** are an observed cohort-level coincidence; several weapon-level outcomes differ and trajectories diverge after motor interventions. Paired cluster bootstrap (18 setups, 4,000 draws) gives shots ratio lateral / observe **1.00000** with 95% interval **[0.95299, 1.05531]** and lower 5th percentile **0.96084**. Micro executed-tick ratio is **0.88158**, lower 5th percentile **0.75185**: the critical >=0.95 opportunity-preservation gate fails. Only **9 extra lateral ticks** were delivered across 18 treated matches, far too small a policy dose to infer benefit.

Observational geometry: the baseline's static ray was unblocked at **210/487** sampled firing ticks, while bilateral corridor clearance held at **450/487**. This gap is a concrete reason not to treat lateral clearance and an open firing lane as the same condition. Quality associations with post-step hits are noncausal and confounded by weapon, target choice and action selection.

## 4. Validation and safety

- **1,110/1,110 Node AI tests PASS**; **733/733 engine tests PASS**; **33/33 Python regression tests PASS**; **5/5 gameplay smoke PASS**.
- The independent checker verified all **36/36** match outputs, frozen prereg checksum, source SHA lock, match pairing, C21 exact assignment hash, C16 arm symmetry, C35C preoffer linkage, and C35I all-fire-tick sample + post-step shot tally; **0 agent errors and 0 fire suppression/injection**.
- 8-second no-feature replay: C35C dataset, C35G shot trace, C35H macro trace **byte-identical** with and without C35-I enabled; aggregate and game results match after stripping observer-only diagnostic field. `reports/c35i/PARITY-8S.json` records checks.
- Production page-agent SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (UNCHANGED).
- All server post-step shots/hits are logged separately from public predecision geometry. The new observer never feeds its score back into actions. Optional execution only; does not run in browser.

## 5. Scientific decision and next phase

**Technical gate PASS; causal dodge/aim advantage NOT ESTIMATED; production promotion BLOCKED; C36 BLOCKED.** Do not tune thresholds on the above held-out cases and then call those same cases an independent validation sample. Gun subgroup counts represent **only 3 map-level setup pairs per gun**. Large apparent hit differences at weapon level are not evidence of an optimal movement direction.

Suggested **C35-J**: calibrate public corridor 2D/3D mismatch using *after-step* server ray diagnostics, distinguish intended aim target from nearest public hostile without reading world truth for the policy, and preregister a new movement utility/cost objective (damage/exposure and firing opportunity) on separate unseen seeds. Only then consider a weapon-conditioned motor pilot. Keep C16 and C21 immutable and enforce >=0.95 non-inferiority for shots and motor dose with setup-cluster uncertainty.

## Reproduce

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35i-weapon-corridors.py
# Use a fresh output directory to rerun: the original runner refuses overwrite.
python scripts/run-c35i-weapon-corridors.py
```
