# FPS Arena v2.9.11 — C35-H Firing-Compatible Macro Movement

**Date:** 2026-10-13  
**Source parent:** C35-G official archive, SHA-256 `d8afc47e382fa4d451096044b82255b963f5f9a11d60bc1fcd57caf417c391fa`  
**Status:** ENGINEERING PASS / POLICY REJECTED / NO PRODUCTION PROMOTION / C36 BLOCKED.

## Purpose

C35-G demonstrated that the incumbent macro controller already moves and fires concurrently, whereas C16 micro-dodge explicitly refuses priority fire commands. C35-H therefore tests a separate public-input macro-fire corridor rather than shortening or delaying micro-dodge actions. **This is a research-only headless experiment, not a safe C16-approved firing maneuver.**

## What was implemented

- `lab/arena/firing-compatible-macro-c35h.mjs`: separate `observe` and `lateral` opt-in arms. At most one three-tick lateral addition every 0.5s, and only while the original agent orders fire+forward without its own lateral/priority command; requires healthy, grounded local movement, a delayed public enemy state <=200ms old, target range 12–85m, and a symmetric static geometry clearance sweep on both sides. Side follows deterministic seed/ordinal hashing; the policy reads no server-only world object and no future outcome.
- `lab/arena/train-main.mjs`: opt-in flags `--c35h-policy observe|lateral`, `--c35h-trace`, requires `C35C shadow80` dataset and `C35G` fire trace. **C16 per-tick research micro checks and C21 hashing remain unchanged**, and the production `page-agent.js` is untouched. The macro policy is applied only after C16 decides its research micro action, before `world.queueInput`/`Game.step`.
- `tests/firing-compatible-macro-c35h.test.mjs`: seven new unit tests for fire/aim preservation, symmetry, stale public target, blocked geometry, priority commands, competing micro changes and non-monotonic time.
- Reproducible preregistered runner and independent ledger checker: `scripts/run-c35h-macro-pilot.py` and `scripts/analyze-c35h-macro-pilot.py`.

### Important safety distinction

C16's `candidateSetC16` *intentionally declares all firing micro-actions ineligible*. The new C35-H **macro** candidate uses public C14 clearance logic with additional preconditions; it does **not** modify C16 or claim C16 certified a simultaneous fire/strafe command. Collision sweep covers public static boxes only; it is not a complete safety proof against moving enemies or dynamic obstacles.

## Preregistered experiment

Frozen plan: `reports/c35h/pilot-18-pairs/FROZEN-DESIGN.json`, SHA-256 `7b28ce2712f0efcd922aeba165e82e141ac90693d2d57a2cecbe26afd113b8ec`. 18 setup pairs (three maps × six enemy primaries), two policy arms, 90s each, **36 genuine authoritative `Game.step()` TDM matches / 54 simulated minutes**. Matched map/seed/opponent conditions but subsequently diverging trajectories. C35-D2 forecast remains frozen at SHA `3c00f92332ca4a7cd4694efe6b98eabcbd888b93020e50875c21f858fb5b0f10`; it is not part of motor actuation decision.

| Endpoint | Observe (baseline) | Lateral (experimental) |
|---|---:|---:|
| Game.step matches | 18 | 18 |
| Server shots | 1,619 | 1,526 |
| Original fire inputs | 1,619 | 1,526 |
| C21 delivered micro ticks | 385 | 381 |
| C35-H additional delivered macro-fire lateral ticks | 0 | 33 |
| All movement modified ticks (C35-G observer) | 385 | 414 |
| C35-H eligible fire corridors (opportunities observed) | 40 | 33 |
| C21 preoffer attempts (whole denominator) | 10,596 | 10,518 |
| Hits | 1,062 | 1,033 |
| Kills (descriptive) | 201 | 192 |
| Damage dealt | 31,530 | 30,548 |
| Damage taken | 2,659 | 2,398 |

The treatment delivered **33 firing-compatible macro movement ticks**, and C35-G movement ledger reconciles exactly: **381 C21 micro ticks + 33 new macro ticks = 414 movement-modified ticks**. Original `fire` inputs were never changed directly; server-confirmed shots match original fire inputs separately in each arm.

### Paired bootstrap (18 setup clusters, 5,000 draws; exploratory)

- Server-shot ratio lateral / baseline: **0.94256**, 95% interval **[0.76040, 1.15970]**, one-sided 5th percentile **0.78675**. Fails the 0.95 non-inferiority threshold.
- Micro tick ratio: **0.98961**, 95% interval **[0.83085, 1.10909]**, one-sided 5th percentile **0.85841**. Also fails 0.95 non-inferiority threshold on its conservative bound.
- Kills, hits, damage and exposure are **descriptive only**. Underlying low positive hostile hit density, interference from divergent world trajectories, limited map coverage and 18 match clusters preclude claims of dodge/combat superiority.

**Policy decision: REJECT FOR PROMOTION.** No C36 unlocking.

## Validation and reproducibility

- C35-H unit tests: **7/7 PASS**.
- Entire Node AI suite: **1,100/1,100 PASS**.
- Authoritative engine suite: **733/733 PASS**.
- Python regressions: **28/28 PASS**.
- Five-mode Release smoke: **TDM/SND/HP/BR/Zombies 5/5 PASS**, zero agent errors.
- Independent ledger: **36/36 PASS**, exact C21 hash, linked preregistered C35C preoffers, C16 arm symmetry, 0 fire suppression/injection, 0 shot-ledger divergence, 0 agent errors.
- Additional no-feature replay on the same seed: **C35C dataset and C35G fire trace byte-identical** to `observe` arm (checked file SHA); aggregate and match gameplay metrics identical after removing observer-only C35H metrics.
- Production page-agent SHA-256 unchanged: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.
- The C35-H observe arm uses an independent read-only controller; it never mutates the original command. Treatment `lateral` only adds a lateral movement bit and cannot alter `fire`, `aim`, yaw/pitch or skills.

### Rerun (fresh output path required)

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35h-macro-pilot.py
# To rerun full pilot, use a separate copy/fresh folder; the runner refuses overwrite:
python scripts/run-c35h-macro-pilot.py
```

## Proposed C35-I

The implemented macro modification is sparse (33 ticks across 27 minutes of treated gameplay). Before expanding exposure, instrument a **public geometric firing-lane quality proxy** and detect incumbent forward/lateral patterns by weapon type, without relying on post-selection server truth. Only then preregister a more powerful action family for evaluation. The next benchmark should additionally distinguish *shots per candidate firing opportunity* from *shots per match minute* while retaining randomization at the setup level and all C16/C21 guarantees.
