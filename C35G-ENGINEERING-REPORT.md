# FPS Arena v2.9.11 — C35-G Fire/Motor Opportunity Audit

**Date:** 2026-10-13  
**Parent:** C35-F Opportunity-Constrained Scheduler  
**Decision:** PASS (passive engineering telemetry); **NO production promotion; C36 blocked**.

## Question and design

C35-F's `stagger80` policy lost 10.42% of shots in its initial 18-pair exploratory pilot despite only changing the first movement tick. Was this caused by directly suppressing the incumbent `fire` command, by a loss of a weapon-ready firing tick, or by downstream changes in the ongoing encounter?

C35-G adds a **read-only two-phase Game.step audit** and no new motor policy:

1. After the incumbent public/local command and C16/C21 research arbitration, capture **incumbent fire input, applied fire input, movement input and option-active state**.
2. Read the server-side weapon state **only in a separate audit observer after action selection**. Calculate a conservative *capability proxy* from live magazine, cooldown, reload, stance/immobilization, and switches. This is **not** a target-visible / accurate-shot / counterfactual firing opportunity. It is deliberately forbidden as input to C16/C21 and the actor.
3. Invoke the unchanged official `world.queueInput` and `Game.step()`. Record **authoritative server-confirmed trainee shot events** after the tick.
4. Reconcile the input and server-shot ledgers and independently reconstruct the C21 hash assignments. Refuse sign-off for *any* suppressed or injected incumbent fire key. All match phases are recorded, including warmup; the `readyProxy` rate is therefore *not* conditioned on valid combat engagement.

Frozen prospective design: `reports/c35g/heldout-12-pairs/FROZEN-DESIGN.json`, SHA-256 `5978f60972ce38545ff1ddfa9bbcf6574ebaf218f0f5e7b9eab5465f1dd26a95`.

**24 authentic Game.step TDM matches**, **12 paired setups**, **36 simulated minutes**, two maps (neon/foundry), six opponent primaries (MP5SD, M4A1, AA12, HK SL8, Uzi, L115A3), seeded new match configurations. Both `shadow80` and `stagger80` run as in C35-F. The pairing holds initial seed and setup but **not the post-action game trajectory**. This is a *diagnostic observational replication*, not a causal policy-effect study.

## Results

| Endpoint | shadow80 | stagger80 |
|---|---:|---:|
| Matches | 12 | 12 |
| Incumbent `fire` input ticks | **1,022** | **1,002** |
| Applied `fire` input ticks | **1,022** | **1,002** |
| Server-confirmed shots | **1,022** | **1,002** |
| Incumbent fire commands suppressed / injected | **0 / 0** | **0 / 0** |
| Fire and movement concurrently applied | **1,022 ticks** | **994 ticks** |
| Research micro active/scheduled ticks | **236** | **237** |
| Research changes to movement input | **236 ticks** | **218 ticks** |
| Research micro overlapping fire | **0 ticks** | **0 ticks** |
| Executed micro ticks (C21 ledger) | **236** | **218** |
| Server-only approximate weapon-ready ticks | **54,984** | **55,412** |
| Kills (descriptive only) | 133 | 130 |

**Key interpretation:** The motor scheduler did not directly strip any original fire command. The reduction from 1,022 to 1,002 server shots is accompanied by an identical reduction in the original actor's own `fire` requests during a changed encounter trajectory. This does **not establish** whether staggering caused those trajectory changes or whether the fewer shots were shots of the same quality or utility. Both policy arms already fire and move simultaneously via *incumbent macro movement*. The C16 research micro option avoids priority fire by design. Therefore, a future effort should study firing-compatible **macro combat movement** rather than assume that delaying micro movement can preserve fire utility.

The stagger arm scheduled 237 option-active ticks but altered movement for 218 ticks. Its frozen C35-F option ledger records **19 one-tick deferrals**; these are not counted as executed micro movement. The passive observer's movement-modified count reconciles with the C21 executed tick ledger for this cohort.

`stagger80 / shadow80` server shots (and original fire input) ratio **0.98043**. A 5,000-draw paired-setup bootstrap, treating 12 setups as clusters, yields exploratory **95% interval [0.9110, 1.0384]**, one-sided lower 5th percentile **0.9242**. This does **not pass** the previous 0.95 shots-preservation noninferiority bound. Nor does it show statistically established harm or benefit. The weapon-ready *proxy* changes little and is far too permissive to identify actionable targets.

## Verification

- New observer test suite: **5/5 PASS** (command preservation, server shot reconciliation, timing, capability gating, malformed telemetry).
- Full AI/Node suite: **1,093/1,093 PASS**.
- Official engine suite: **733/733 PASS**.
- Python regression suite: **28/28 PASS**.
- Five-mode smoke (TDM, SND, HP, BR, Zombies): **5/5 PASS**, no agent errors.
- C35-G audit: **24/24 match files**, pre-registered source hashes verified, **0 C21 hash mismatches**, **0 C16 arm-symmetry violations**, **0 fire suppression/injection**, **0 shot-ledger mismatch**.
- Toggle parity: `shadow80` and `stagger80` match datasets are **byte-identical** with and without the extra C35-G trace observer for independently rerun selected seeds.
- Production `page-agent.js` SHA-256 remains `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Limitations and next decision

1. The server-only weapon-ready proxy is instrumented *after* the policy decision and includes warmup/quiet world ticks. It is **not** a realistic firing opportunity; do not train on it as though it were available to the bot.
2. A shot command is **not** a feasible, aimed or valuable shot against an enemy. No geometry-verified/public target-acquisition window is established by this audit.
3. Small setup cluster count, within-match changes in future opponent behavior, and low randomized hostile-hit incidence prevent claims of actual dodge improvement.
4. The fact that stagger and shadow produce different trajectories is exactly why matched seeds cannot identify instantaneous counterfactual fire or motor cost.

**C35-G accepted as engineering infrastructure only**. `stagger80` stays rejected and `shadow80` remains non-intervening. Do not promote to production or unlock C36. Next study should derive an entirely **public, predecision firing corridor** and test benign macro motion changes using *separate prospectively randomized safe units*, while keeping C16 mandatory, weapon/accuracy unchanged, and a strict noninferiority gate for weapon fire as well as delivered motion.

## Reproduce

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35g-observation.py
# This run is non-overwriting; use a fresh workspace for new matches:
python scripts/run-c35g-observation.py
```
