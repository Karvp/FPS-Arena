# FPS Arena v2.9.11 — C35-F Opportunity-Constrained Motor Scheduling

**Date:** 2026-10-13  
**Scope:** exploratory opt-in headless research, **NOT** a production AI upgrade.  
**Parent:** C35-E Opportunity-Preserving Shadow (`shadow80`).

## Executive decision

Implemented and prospectively evaluated `stagger80`, a *bounded one-tick motor-start deferral* at predecision public-priority risk >=20%, against unchanged `shadow80` action scheduling. The historical C21 seeded three-arm action randomizer and C16 mandatory per-tick safety checks are still authoritative. **C35-F is rejected for promotion:** delivered ticks per prospective attempted offer cannot be shown noninferior within 5%, while shots per simulated minute fall 10.42% point-estimate with wide confidence bounds. No credible causal effect on actual hostile hits can be estimated.

## Implementation

- `lab/arena/opportunity-constrained-scheduler-c35f.mjs`: `OpportunityConstrainedSchedulerC35F` inherits C35-E's original `legacy80` C21/C16 action stream and frozen C35-D public forecast; it never excludes any eligible offer or redraws an action. Only when a micro arm is assigned and the predecision forecast is >=0.20, the scheduler emits the exact original incumbent command on the first tick, rolls back the speculative original C21 tick counters *before* server `Game.step()`, and extends the active option by one authoritative 60-Hz tick. Remaining ticks still pass through unchanged C16 gating. No priority/fire/reload/objective input is silenced. Deferrals that never recover are counted, not treated as success.
- `lab/arena/train-main.mjs`: adds opt-in `--c35c-policy stagger80` requiring the same frozen C35-D2 model already required by `shadow80`. No change to default runner or production `page-agent.js`.
- Added `tests/opportunity-constrained-scheduler-c35f.test.mjs`: rejection of missing/invalid model, no-delay exact shadow parity, one-tick recovery, C16 priority veto after deferral, and a 2,000-tick seeded stress test.
- Added `scripts/run-c35f-pilot.py` (immutable preregistration, source hashes, locked source/seed map and nonoverwriting output), `scripts/resume-c35f-pilot.py` (only resume missing cases), and `scripts/analyze-c35f-pilot.py` (independent seeded hash assignment reconstruction, propensity, per-offer public linkage, censorship, per-match and paired-setup bootstrap).

### Preregistration and design

Registered `reports/c35f/pilot-18-pairs/FROZEN-DESIGN.json` SHA-256: `baa38e5413a066563b7251ea5b7e4fa4bddb95f7697cf6c1411c6a09f02a0c81`.

18 setup pairs (3 real maps × six controlled opponent primaries; 5 bots with registered official/mixed/stress policies, 35/65/125-ms snapshot lag). Each setup runs both `shadow80` and `stagger80` with the same starting seed and **90-second maximum**. This is **36 complete Game.step() TDM matches = 54 server-simulated minutes**. Arms remain 1/3/1/3/1/3 within each policy's time-evolving eligible population. Because interventions change subsequent world trajectories, paired setup does *not* mean identical potential encounter states.

Primary exposure endpoint: **executed micro ticks / all prospectively attempted preoffers**. Co-primary gate: **shots / simulated minute** (proxy for preserving firing; not identical to opportunities). Predesignated exploratory noninferiority lower ratio for both: 0.95. Decision uses a 5,000-resample *paired-setup cluster bootstrap*, one-sided 5th percentile. No post-action filtering on delivered dose or outcome. Sparse hostile hits prevent clinical-style or combat-efficacy claims.

## Observed results

| Endpoint | `shadow80` | `stagger80` |
|---|---:|---:|
| Matches | 18 | 18 |
| Attempted preoffers | 10,632 | 10,595 |
| Randomized safe offers | 122 | 126 |
| Micro-assigned offers | 82 | 87 |
| Interrupted micro actions | 20 | 23 |
| Interruption fraction / micro | 24.39% | 26.44% |
| Executed micro ticks | 360 | 368 |
| **Delivered ticks / preoffer** | **0.03386** | **0.03473** |
| Original first-tick deferrals | 0 | 19 |
| Shots fired | 1,679 | 1,504 |
| **Shots / simulated minute** | **62.19** | **55.70** |
| Kills | 214 | 205 |
| Hit-positive complete randomized windows | 1 | 2 |
| Agent errors | 0 | 0 |

**Ratios (stagger / shadow):** delivered ticks / attempted preoffer **1.0258**, setup cluster 95% CI **[0.8353, 1.2812]**, bootstrap one-sided 5th percentile **0.8622** (fails >=0.95 gate). Shots / minute **0.8958**, 95% CI **[0.7689, 1.0428]**, 5th percentile **0.7895** (fails >=0.95 gate). Neither policy demonstrates improved dodge efficacy. These measures are fragile under small match-cluster count and within-match sequential treatment interference.

### Limitations and safety

1. Deferring one tick changes the duration of the candidate motor option in wall clock time but not the intended 5 delivered motor ticks. A priority transition on the next tick may still prevent recovery. The experiment records *actual* executed ticks rather than assuming recovery.
2. Shots are server-confirmed, but total shots are not equivalent to the exact number of C16-eligible shooting opportunities; the criterion is a coarse co-primary safety proxy, not a definitive fire-quality measurement.
3. Three hit-positive windows across both arms are nowhere near enough to fit or validate a causal dodge policy. The observed 214 vs 205 kills are exploratory only, not a demonstration of superiority.
4. C35-F does not alter opponent skill/accuracy/weapon damage or use future events as control inputs. Post-action labels and C16 interruption diagnostics are never predictive features.
5. All source modifications are limited to the research runner + added research module/tests/scripts and reproducibility artifacts. Original `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Verification

| Check | Result |
|---|---:|
| Full Node/AI suite | **1088 / 1088 PASS** |
| Official engine tests | **733 / 733 PASS** |
| Python regression tests | **28 / 28 PASS** |
| Five-mode release smoke (TDM, SND, HP, BR, Zombies) | **5 / 5 PASS; 0 agent errors** |
| Pilot matches | **36 / 36 complete** |
| C21 per-ordinal independent assignment reconstruction | **PASS** |
| C16 symmetric three-arm preassignment / no new arm veto | **PASS** |
| Bound on maximum delayed starts | **one tick** |
| Censoring and preassignment/offer linkage | **PASS** |
| All study source hash locks | **PASS** |
| Production page-agent bytes | **unchanged** |

These are **engineering** tests; no claim of production improvement.

## Next engineering decision

**Do not promote `stagger80`.** Continue with a C35-G *non-invasive shadow analysis of actual firing opportunity and blocked motion*: measure per-tick opportunity, `fire` command transitions, and authoritative shots under unchanged `legacy80` without changing policy. Before a new actuator is built, predefine opportunity-aware endpoints, evaluate stronger baseline parity and enough independent match clusters; consider identifying explicitly safe windows rather than trusting a public 120-ms priority proxy. The C36 neural action-value gate remains **BLOCKED** due to sparse randomized hostile-hit outcomes. GitHub push: **NO**.

## Reproduce (in source root)

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35f-pilot.py
# Existing studies are protected against overwrite; resume only missing cases.
python scripts/resume-c35f-pilot.py
# New study from scratch ONLY in an empty output directory with byte-identical source.
python scripts/run-c35f-pilot.py
```
