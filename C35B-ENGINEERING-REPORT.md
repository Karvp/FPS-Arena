# FPS Arena v2.9.11 — C35-B Micro-Action Reliability & Sparse Signal Diagnosis

**Checkpoint:** 2026-10-13 | **Status:** engineering pilot complete; **NO causal efficacy / neural promotion**. This is a new independent registered technical cohort, not an extension of C35-A efficacy analysis. The game engine, C16 safety and the production `page-agent.js` were not changed.

## Executive decision

C35-A established that 395/1,193 action offers had interrupted intended actions, corresponding to **52.04% of micro-assigned opportunities**, and just 19/1,179 complete windows had hostile weapon hits (1.61%). C35-B directly instruments *why* C16 refuses to continue micro-actions and preregisters three intervention durations: **80 ms, 120 ms and 160 ms**. The historical C21 independent three-way action assignment, C16 preassignment and per-tick safety checks, and C34-style public snapshot / postdecision server-truth boundary remain unchanged.

**108/108 TDM matches** completed on the authentic headless `Game.step()` loop, with 36 matched simulator setups (3 maps × 6 controlled enemy primaries × 2 repeats) and three durations per setup; 120 seconds maximum per match. **Actual server-simulated duration 213.884 minutes**. Across all variants: **1,072 safe offers, 1,061 complete 1.8-second windows, and 12 windows with server-confirmed hostile weapon hits (1.13%)**. The data remain too sparse for a learned causal dodge policy.

**Engineering finding:** shortening the intended micro-action from 160 to 80 ms reduced the observed interruption fraction among micro assignments from **54.33% to 30.30%**. The engineering difference is **24.03 percentage points**, setup-cluster paired bootstrap 95% **[18.22, 30.43] percentage points**. However, short actions had only **~61% of the absolute executed ticks of 160-ms actions**, and interruption at 80 ms still greatly exceeds the proposed **5% gate**. Do not interpret fewer interruptions as improved dodge efficacy: shorter action is a different motor intervention and could reduce displacement / attack opportunities.

## C35-B methods and original vs new behavior

1. New `lab/arena/micro-action-reliability-c35b.mjs` extends `RandomizedSafeActionC35` rather than replacing its underlying randomizer. Duration is externally fixed by a preregistered `--c35b-dose-ms 80|120|160` argument. Public command, snapshot, original safety gate and assignment stream are preserved.
2. If C21 interrupts an action, C35-B **retrospectively after refusal** rechecks C16 and attaches the reasons, tick count and elapsed time for engineering diagnosis. These reasons are **post-assignment variables and never features fed to the controller**. An ineligible offer never generates an assignment.
3. C35-B adds public/local position displacement from the original pre-assignment position at ~100/300/900 ms. These are **descriptive**: motion includes incumbent ongoing movement and further actions, so cannot be interpreted as incremental strafe efficacy.
4. C35-A and C35-B both store assigned action for intention-to-treat (ITT), the actual executed ticks and server-only hostile weapon hits after assignment. No unexecuted arm is given an outcome label. All 1.8-second windows remain nonoverlapping; censored outcomes are not counted as complete zero-damage observations.
5. `lab/arena/train-main.mjs` gets separate `--c35b-dataset`, `--c35b-enemy-primary`, `--c35b-registration-sha` flags. Other dataset flags are mutually exclusive; without a C35-B flag the path is unchanged.

### Immutable preregistration and provenance

- Exact registered plan: `reports/c35b/pilot-108/PRE-REGISTERED-PLAN.json`.
- **Registration SHA-256:** `8e56318b5cb0bbcca5dc018f5118c2a8777f2d04f3e62a972460abb441244b78`.
- Fixed configs: 36 initial seeds, 3 maps, six primaries (`mp5sd`, `m4a1`, `aa12`, `hk_sl8`, `uzi`, `l115a3`), precommitted official/mixed/stress opponent policies and 35/65/125 ms snapshot lag variants. Three dose variants reuse base seeds. Game trajectories and the *number of offers* diverge after interventions; matches are **not identical counterfactual encounter states**.
- Preregistration hashes cover the source training runner, C35-B and C35/C21/C16 controllers, engine `game.js`, `bot.js`, producer runner and the shipped production agent. `verify-c35b-reliability.py` checks these and reconstructs assignments independently by C21 integer hash.
- **Production page-agent SHA-256** `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, identical to C35-A.

## Results

| Engineering endpoint | 80 ms | 120 ms | 160 ms |
|---|---:|---:|---:|
| Matches | 36 | 36 | 36 |
| Safe offers | 333 | 362 | 377 |
| Micro-assigned offers | 231 | 244 | 254 |
| Interrupted micro-action | 70 | 112 | 138 |
| **Interruption / micro** | **30.30%** | **45.90%** | **54.33%** |
| Setup-bootstrap 95% interruption rate | 25.40–35.34% | 39.82–51.81% | 49.07–60.00% |
| Executed tick fraction / planned dose | 87.48% | 82.71% | 71.77% |
| Hit-positive complete windows | 4 | 6 | 2 |

**Important:** The 4/6/2 hostile-hit counts are sparse nuisance rates and are not a three-arm treatment-effect comparison; cases across durations have diverged trajectories, and the 80/120/160-ms cohorts represent different *lengths* of micro-actions. There is no powered hypothesis test that a particular dose reduces damage.

**Paired setup-bootstrap**, 5,000 resamples over the 36 setup clusters:

- Interruption-rate reduction, 160→80 ms: **+24.03 pp**, 95% interval **[+18.22, +30.43 pp]**.
- Interruption-rate reduction, 160→120 ms: **+8.43 pp**, 95% interval **[+2.25, +15.78 pp]**.
- Absolute mean executed ticks, 80/160 ms ratio: **0.609**, 95% interval **[0.582, 0.643]**. A shorter, more consistently completed action also has a materially smaller total actuation dose.

### Why actions get interrupted (n = 320 micro interruptions)

| Postdecision C16 diagnosis | Incidents | Fraction of interruptions |
|---|---:|---:|
| Incumbent priority command (e.g., firing) | 231 | 72.19% |
| Public static geometry clearance | 68 | 21.25% |
| Stale/incomplete public snapshot | 11 | 3.44% |
| Distance no longer within safe band | 10 | 3.13% |

**Interpretation:** macro/micro arbitration is the largest delivery bottleneck. These are *reasons for safety refusal*, not bugs to turn off. Removing priority-command checks could sacrifice shots, weapon handling or objective actions and harm gameplay. The C16 all-three-arm safety gate stays authoritative.

### Data adequacy

- 108 matches, 1,072 offers, 1,061 complete windows, 11 censored windows.
- 12 hit-positive complete windows, pooled density **1.131%**. Unlike the 155/3,526 hit windows observed without randomized intervention in C34, this is a **strictly C16-selected, safe, low-threat opportunity population**. The denominators and policies differ; do not treat their rates as direct treatment effects.
- The minimum engineering floor of 300 complete windows is exceeded, but **neither the 80-ms interruption threshold (≤5%) nor the sufficient-hit-data gate** is met.
- The model-training and full-game promotion gates remain closed. Under current sparse signal, larger MLPs, GRUs or Transformers would amplify variance and leakage risk rather than solve the missing observed action value.

## Verification

- **1,024/1,024** AI Node tests, including twelve C35-B focused checks and the original C35 suite; zero failures.
- **733/733** authoritative engine tests; zero failures.
- **5/5** headless-mode smoke runs (TDM/SND/Hardpoint/BR/Zombies), zero errors.
- **108/108** match pairs replay-verified; the independent verifier reconstructs C21 assignment from the seed and ordinal, checks preassignment symmetric C16 candidate sets, nonoverlap, source hashes, public/server data boundaries and hostility labels. **No observed assignment mismatch or safety/provenance violation**.
- Exact reproducibility: rerun C35-B `match-00-80` with the frozen seed/flags gave **identical dataset bytes** and identical result envelope except `created` timestamp; SHA-256 dataset `14ea0cca4b335e167511b407abee260f286d0e3f2bff915b2e38470f72f1bddc`.
- Backwards compatibility: rerun historical C35-A match `000` with the C35 flags on the C35-B branch gave **identical dataset bytes** (SHA `a62be8a55d23cfcef2d517fae4836985ad212479e7310e392ab45b4aba0204b2`) and identical result metrics other than created timestamp.
- All production bytes preserved; no production promotion; no GitHub push.

## Next checkpoint: C35-C / C36 gate (recommended, not executed)

**Priority 1: change the decision interface, not safety constraints.** Explore a hierarchical *interruptible macro option* where the micro-controller only requests a strafe when the macro-controller publicly predicts no immediate firing/reloading/skill transition. Predecision signals must remain strictly causal. Log explicit predecision arbitration, refusal reason, intended duration, delivered duration and server-truth outcome. Keep `fire` and safe emergency controls dominant.

**Priority 2: tackle encounter selection, not artificial damage.** Current safe opportunities rarely overlap hostile-fire windows. Use C34's public threat forecast as a **predecision stratification/measurement instrument** and collect rates per risk bin, preserving C16 safety and full positivity of randomized arms. Do not increase bot weapon damage/accuracy or filter outcomes after assignment to boost positive labels.

**Priority 3: separate horizons and objectives.** Assess 100/300 ms public movement and LOS/cover effects as proximal mechanism diagnostics, but validate against hostile weapon hit/receiving damage and firing opportunity under true server rules. Include shots lost, DPS, combat navigation displacement and match-level K/D. This is not equivalent to claiming a dodge success by early movement alone.

**Gate before training causal action-value model:** reproducible registered pilot, ≥5% delivered-tick failure target met or a revised dose-specific justified gate, sufficient clustered hostile-hit observations in eligible strata based on prospective power, no post-treatment feature leakage, stable propensity and nonoverlap, and a separately sealed evaluation. If the eligible C16 pool remains intrinsically near-zero threat, revise the research question or construct different non-invasive public safe opportunities rather than repeatedly collecting uninformative trials.

### Commands

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
node lab/arena/train-main.mjs --profile release --modes tdm,snd,hp,br,zm --seconds 20 --seed 5836001 --out /tmp/c35b-smoke.json
python scripts/verify-c35b-reliability.py --dir reports/c35b/pilot-108
python scripts/analyze-c35b-reliability.py
# Re-run only using byte-identical preregistered source; plan enforces source lock
python scripts/run-c35b-reliability.py --resume --workers 8
```

The study is **research-only**, on the FPS Arena simulator; it does not establish efficacy against real humans, live deployment, or superiority of neural dodge. Scientific context: C21 randomized trial, C34 threat prediction, Li et al. (2010) [offline bandit evaluation](https://arxiv.org/abs/1003.5956) and Dudík et al. (2011) [doubly robust methods](https://arxiv.org/abs/1103.4601).
