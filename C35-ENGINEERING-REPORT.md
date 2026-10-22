# FPS Arena v2.9.11 — C35 Independent Causal-Data Technical Pilot

## C21/C16 safe action randomization × C34 public-state telemetry, 90 real `Game.step()` TDM matches

**Checkpoint date:** 2026-10-13. **Research status:** Technical pilot complete; **full causal efficacy study NOT started**; **C36 neural training BLOCKED**. **Production:** unchanged.

### Executive decision

**Engineering PASS:** the C34 source archive is preserved with matching SHA-256; C35 reuses the existing C21 three-arm assignment and C16 safety gate, adds a C34-style predecision PUBLIC state and separate post-assignment SERVER audit, and records authoritative hostile weapon-hit outcomes over three horizons. Ninety registered match seeds were executed in the real headless `Game.step()` training loop. Assignments replay, unit tests and engine regressions pass.

**Statistical/actuation NO-GO:** only **19 hit-positive windows / 1,179 complete randomized windows = 1.61%** had server-confirmed hostile weapon hits, while **395 / 1,193 (33.11%)** assigned opportunities experienced runtime action interruption. Among the 759 micro-strafe assignments, **52.04%** were interrupted. The scientific gates are **not satisfied**; no model was trained, compared, chosen or deployed. **Never interpret this pilot as showing one action is stronger.** No action-conditional outcome comparison was performed.

### Deep Research guidance implemented

The independent Deep Research audit found that `encounter-randomization-c21.mjs` already implemented three-arm randomized opportunities with known propensity `1/3` and `safe-action-explorer-c16.mjs` was the proper safety authority. Replacing those with the previously improvised C35 randomizer would have increased code duplication and jeopardized historical comparability. Consequently:

1. `lab/arena/randomized-safe-action-c35.mjs` extends **C21 directly** (no extra/secret RNG draws) and reuses **unchanged C16** for eligibility; randomization happens after all three arms are eligible.
2. The C35 module snapshots `client`-only coordinates, velocity, HP, armor, delayed enemy body yaw, enemy visible primary, timestamp, locally observable map AABBs, incumbent command, geometry clearance and public pressure band. It retains the C21 public features and explicit `propensity: 1/3`.
3. Separately, after command selection, `afterCommand` records a retrospective **post-assignment, pre-`Game.step()`** server audit. This record is never passed to the controller. Subsequent callbacks from the actual `Game.step()` supply observed server events; `world.damage` identifies true weapon hits by hostile bots, instead of conflating all HP/armor loss with incoming fire.
4. `.16`-second lateral micro-action is delivered only while C16 passes the **per-tick** safety check. The intervention is immediately stopped if a priority command or unsafe state appears. `assignedAction` persists for intention-to-treat even if interrupted; `deliveredAction`, `runtimeOverride` and tick count remain separately logged.
5. Outcomes are windows after actual assignment (0.3, 0.9 and 1.8 s), **not three action counterfactuals**. Late match endings are censored, not mislabeled as complete zero-damage windows.
6. The headless game engine's physics, AI combat, authoritative server damage and the shipped `page-agent.js` remain unchanged. Research-only flags are enforced: `--c35-dataset`, `--c35-enemy-primary`, `--c35-registration-sha` with one Release TDM, one map, one episode.

### Fixed preregistration and parent provenance

- Parent C34 source ZIP SHA-256: `b13a002ad123eb1ee63f73519fd20fb1e3f37ad44c75dbf9ae397015ec6b8df7`.
- C35 technical pilot registration SHA-256: `6dcdd8ca11429ea8510c88bda9bd030c1c093f6068cbe121935491bd5736318c`.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (identical to C34).
- Immutable plan: `reports/c35/pilot-90/PRE-REGISTERED-PLAN.json`. Source SHA-256 snapshots are registered for C35 controller, C21, C16, C14, C34, `train-main.mjs`, engine, bot, page-agent and pilot runner. They must not be modified to replay this cohort; new iterations require a new preregistration identity.
- **90 distinct preselected seeds**, map × weapon × five variants, three policy types (`official`, `mixed`, `stress`) and snapshot lag levels 35, 65, 125 ms. Six controlled opponent primaries are `mp5sd`, `m4a1`, `aa12`, `hk_sl8`, `uzi`, `l115a3`. This is a headless controlled loadout research distribution, **not human multiplayer**.
- `--seconds 180` is a **maximum configured duration**, not a promise each game goes all 180 s. 25 games ended naturally before 180 s. **Actual authoritative simulated duration: 255.3633 minutes**, compared with the scheduled maximum of 270 minutes.

### Pilot results and integrity

| Measurement | Verified value |
|---|---:|
| Matches with zero agent errors | **90 / 90** |
| Registered game seeds | **90 unique** |
| Maximum configured simulated time | 270.000 minutes |
| **Actual simulated time** | **255.363 minutes** |
| Total safe randomized opportunities | **1,193** |
| Complete 1.8-s outcome windows | **1,179** |
| Censored windows | **14** |
| Hit-positive complete opportunities | **19** |
| Total server-confirmed hostile weapon hit events | **31** |
| Aggregate hostile weapon damage in complete windows | **1,052.58525** |
| Hit-positive opportunity rate | **1.6115%** |
| Match bootstrap 95% for hit-positive rate | **0.820%–2.545%** |
| Offers per match | **13.2556** |
| Match bootstrap 95% offers per match | **11.911–14.622** |
| Assigned baseline / micro-left / micro-right | **434 / 362 / 397** |
| Interrupted offers / all offers | **395 / 1,193 = 33.11%** |
| Interrupted micro offers / micro offers | **395 / 759 = 52.04%** |
| Mean micro executed ticks | **7.195 of 9.6 planned** (nominal 60 Hz) |
| Assignment hash/probability mismatch | **0** |
| Overlap, safety or public-field lineage issues in independent verifier | **0** |

*Bootstrap*: 5,000 resamples of independent match clusters, seed 350359. These are exploratory **nuisance** confidence intervals, *not* evidence of treatment efficacy. Actions were assigned by the historical C21 deterministic 32-bit hash; exact 1/3 propensity is logged, but finite sample counts need not be identical. Counts are somewhat imbalanced (exploratory χ²(2)=6.520, nominal p≈0.038), despite zero assignment-replay mismatches. A further pre-registered balance diagnostic is appropriate before the full trial; there is no evidence here of a preferred action.

Offers by map: **Arena 415**, **Foundry 462**, **Neon 316**. Offers by controlled enemy primary: **MP5SD 226**, **M4A1 159**, **AA12 147**, **HK SL8 199**, **Uzi 243**, **L115A3 219**.

**No arm-specific incoming-damage means, p-values or neural fit were computed from the pilot.** The observed hit rate does not identify the causal effect of strafing, because it pools assigned actions and their observed outcomes.

### Why a 750-match full cohort is not automatically justified yet

Extrapolation from the 90-match technical pilot, under the explicitly uncertain assumption of a stationary match opportunity process:

| Planned full cohort | Expected complete offers | Expected hit-positive windows |
|---|---:|---:|
| 750 × up to 180 s | ~9,825 | ~158 |
| 975 × up to 180 s hard cap | ~12,772 | ~206 |

The Deep Research planning target was **at least 3,900 complete offers with at least 200 hit-positive opportunities** and a **≤5% action interruption** gate. At pilot rates, 750 games may meet the raw offer count but still fail the event target. Even 975 games barely reach the nominal 200 positives **in expectation** and would not repair the 33% interruption rate. Positive windows are clustered within matches and weapons; 200 is a floor, not proof of adequate statistical power for every stratum or contrast.

The near 52% interruption rate **does not mean the safety system violated a gate**. It means C16 correctly refused to continue many actions after a new priority command or state transition. This prevents unsafe control, but it reduces intervention dose and complicates dose-based analyses. Primary ITT must continue to retain all original assignments, rather than deleting interrupted offers.

### Recommended C35-B engineering experiment (not yet executed)

Do **not** increase the number of neural parameters, or relax C16 simply to increase positive-label density. First run a separately preregistered pilot to identify which *pre-action public* states yield longer, safely delivered micro interventions. Diagnose interrupt reasons and actuation duration **without conditioning the primary treatment estimate on post-assignment delivery**. Candidate changes to test in a new branch:

1. Reduce micro command duration from 0.16 s to 0.08–0.12 s as separate registered randomized-dose experiments (the shorter action may also be less effective; do not interpret lower interruption as combat success).
2. Add a public-state *pre-decision* label for likelihood of forthcoming priority actions, or use an explicit safe time-to-next-command gate if one can be computed from existing public control state. Never use future ground truth.
3. Benchmark static geometry and lag strata, and quantify whether the eligible encounter pool is too low-threat for the proposed dodge task. Do not move the safety boundary or change attack accuracy simply to manufacture hits.
4. Consider adding more proximal endpoints to C35-B: movement displacement, line-of-sight change, predicted exposure and firing opportunity; these are secondary engineering signals **not replacements for actual server damage**.
5. Re-preregister new seeds and source SHA; rerun the engineering pilot and only then freeze an independent C35 confirmatory cohort.

### Test and regression verification

- **1,012 / 1,012** AI Node unit/regression tests, including **12 new C35-specific** tests.
- **733 / 733** upstream source-main engine tests.
- **5 / 5** headless smoke modes (TDM, SND, HP, BR, Zombies), zero runtime errors.
- **90 / 90** registered randomized match result/dataset envelopes checked. Independent verifier recomputed every C21 assignment by seed/offer ordinal and confirmed every window's monotonic horizons, closed/censored labels and pre/post namespace boundary.
- Same-seed existing C34 observation-only run compared between original C34 worktree and C35 without C35 flags: result metrics **equal** (excluding creation timestamp), C34 telemetry **byte-identical** with SHA-256 `43063b4c8d6f587d6dfa14181a402806450b49c51b6b6ec6b66641e5d8007a86`.
- Re-ran C35 registered match **000** independently: C35 data JSON **byte-identical** and result metrics equal excluding creation timestamp. Replay dataset SHA-256 `a62be8a55d23cfcef2d517fae4836985ad212479e7310e392ab45b4aba0204b2`.
- No changes to `page-agent.js`, and **no C35 neural policy trained or promoted**.

### Reproduction

```bash
cd fps-c35-work
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
node lab/arena/train-main.mjs --profile release --modes tdm,snd,hp,br,zm --seconds 20 --seed 5836001 --out /tmp/c35-five-modes.json
# The registered plan and exact sources must match; this runs 90 fixed matches.
python scripts/run-c35-randomized-pilot.py --resume --workers 6
python scripts/verify-c35-pilot.py --dir reports/c35/pilot-90
python scripts/analyze-c35-pilot-nuisance.py
```

The `--resume` command enforces **byte-for-byte immutable plan content and source SHA lock**, and skips all verified match pairs. Existing test and pilot data may be independently checked without simulation rerun. The output package includes `INDEPENDENT-VALIDATION.json`, `PILOT-NUISANCE.json`, the registered plan, all match datasets and logs, source and tests.

### Scope and decision

This checkpoint establishes **engineering feasibility of C21 randomized arms in actual `Game.step()` with strong state provenance**, but has **not established power, consistent action delivery, or improved combat behavior**. Full C35 trial, C36 neural learning, C37 prospective efficacy and C38 deployment evaluation are **not passed**. The correct technical decision is **research-only / no production promotion** until a new C35-B design addresses the measured shortcomings.

Relevant literature behind the evaluation design includes Li et al. (2010) [unbiased offline evaluation](https://arxiv.org/abs/1003.5956), Dudík et al. (2011) [doubly robust evaluation](https://arxiv.org/abs/1103.4601) and Lin (2013) [regression adjustment for randomized experiments](https://arxiv.org/abs/1208.2301). Those methods remain prospective for C36; they were not used to claim efficacy from this pilot.
