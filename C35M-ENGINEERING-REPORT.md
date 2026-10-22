# FPS Arena v2.9.11 — C35-M Public Aim-Target Alignment and Original TDM Baseline

**Checkpoint date:** 2026-10-13. **Status:** OFFLINE MEASUREMENT ENGINEERING PASS / MOTOR PROMOTION BLOCKED / C36 BLOCKED.

**Parent:** C35-L Firing-Time Ballistic Ground Truth (`d583ed4ed91a853c490bb1712f6d4d1f58eec6cf300ec03503b44e4bb5ee6283`). No changes to shipped `page-agent.js`, `server/combat.js`, `train-main.mjs`, C16, or C21 in this checkpoint. Only research offline analysis, independent verification, holdout runner, tests, and reports were added.

## 1. New matched comparison against v2.9.11 original

**Estimand and comparator:** `node lab/arena/train-main.mjs --profile release`, without C35 research flags, run with the **same seeds, maps, gun, opponent policy, lag, duration and bot count** as the previously collected C35-L 18-case cohort. This is the original v2.9.11 *release policy configuration*, **not** a recovered pre-C1 historical source artifact. The actual shipped page-agent code is identical across arms and checkpoints. C35-L differs because its `shadow80` research action assignment can intervene; its passive truth observer cannot.

- 18 paired setups × 2 arms = 36 authoritative `Game.step()` matches, each 60 seconds (36 simulated match-minutes).
- Gun set: MP5SD, M4A1, AA-12, HK SL8, Uzi, L115A3. Maps: Arena, Neon, Foundry. Opponent settings official/mixed/stress, lag 35/65/125ms.
- Research matches are existing **unchanged historical C35-L data**; the comparator was generated newly, without reusing or replaying any C35-L state.

| Metric | Original `release` | C35-L `shadow80` research | Research/original |
|---|---:|---:|---:|
| Server-confirmed shots | 531 | 656 | 1.2354× |
| Server hit events | 307 | 422 | 1.3746× |
| Kills | 97 | 123 | 1.2680× |
| Deaths | 4 | 9 | 2.2500× |
| Damage received | 1,532 | 2,248 | 1.4674× |
| Distance (m) | 4,746.73 | 5,013.56 | 1.0562× |
| Hit events / shot | 57.82% | 64.33% | +6.51 percentage points |

**Paired-setup bootstrap** (3,000 resamples): kills research/original 95% percentile interval **0.9478–1.9649×**; shots **0.9691–1.8111×**; deaths **1.2727–7.0000×**. No robust combat-improvement claim follows from 18 setups. Hit events per shot is **not** an independent hit probability (a shot may emit several pellets/hit events). Damage counters also depend on game mechanics, and are descriptive only.

By map, kills original/research: Arena 33/34; Neon 26/42; Foundry 38/47. Deaths original/research: Arena 0/1; Neon 0/2; Foundry 4/6.

**Limitation:** This was an exploratory comparator assembled after C35-L data existed. It is not a prospectively randomized policy trial with sealed outcomes; match trajectories diverge after small action changes. All computations and paired setup rows are in `reports/c35l/v2911-original-comparison/`.

## 2. C35-M alignment model, public-only inputs

C35-K/J introduced two different public candidate IDs **before** firing:

- `nearest`: closest publicly visible hostile in the delayed snapshot.
- `aim`: hostile with the smallest public angular difference from the firing orientation.

C35-L now supplies server-side **after-step** pellets with actual collision target IDs. C35-M **only** compares these target IDs after shooting; it never provides authoritative labels to an actor, never chooses a motor command, and does not retroactively alter the candidate IDs.

**Primary scoring rule:** For each authoritative shot having at least one pellet that hit a player, calculate the fraction of its player-hit pellets matching the publicly selected candidate ID, then average across shots. A 12-pellet shotgun blast has the same overall weight as a 1-pellet rifle shot. Shots without player-hit pellets are **unscored**, not treated as bad target selection. Causal intent is unknown.

### Discovery cohort (18 historical C35-L matches)

- 656 shots / 1,151 pellets / 654 player-hit pellets.
- 492 shots with at least one player-hit pellet.
- Public candidate agreement with actual hit target, shot-level macro-average: **nearest 64.43%, aim 94.79%** (difference **+30.36 percentage points**).
- Pellet-weighted descriptive agreement: nearest 410/654, aim 600/654.

### Independent new-seed cohort (18 different games, frozen prior to simulation)

- Locked registration SHA-256: `b84ff32d178f6656ec25cabb146bdc4cc2777764dff1e4f487b51a5d2a3add15`.
- 18 fresh setups, 60 seconds per match: 624 shots, 1,240 pellet rays, 649 player-hit pellets.
- 500 shots with ≥1 player-hit pellet.
- **Primary shot-level agreement: nearest 66.60%; aim 92.40%; difference +25.80 percentage points.**
- Match-cluster 95% bootstrap CI for improvement: **+15.43 to +34.40 percentage points** (3,000 draws over 18 independent matches).
- Secondary pellet-weighted agreement: nearest 454/649 = 69.95%; aim 605/649 = 93.22%.
- The 124 shots with no player-hit pellet were not scored for candidate ID.
- Independent audit: **83 C21 offers, 0 assignment mismatches, 624 server shots equal to 624 shot events, all 1,240 pellet rays classified, 0 research-modified fire inputs, all public candidates timestamped before authoritative truth**.

This independently supports replacing the **research measurement target proxy**, not the production target/aim policy. Neither candidate is necessarily the true *intended* target, and a hit is a post-selection event that can bias agreement scores. New model training/policy promotion remains blocked.

## 3. Technical verification

- Node.js tests: **1,147/1,147 pass** (unchanged source/runtime modules).
- Authoritative engine tests: **733/733 pass**.
- Python regressions: **55 pass / 4 explicit historical skips**, including 10 C35-M unit tests.
- Independent new-seed audit: PASS for all 18 matches and the C21/C16/truth separation invariants.
- Source checksum freezes: PASS. Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

**An issue discovered and fixed before release:** an initial C35-M discovery analysis wrote to the historical C35-L `ANALYSIS.json` filename, triggering two historical Python regression failures. The new C35-M analysis was moved to `reports/c35m/discovery-18/ANALYSIS.json` and the C35-L report regenerated *from unchanged raw C35-L match files*. All Python regressions then passed. The new cohort data were not altered in this correction.

## 4. Reproduce

```bash
python scripts/compare-c35l-v2911-tdm.py --no-run  # audit existing paired TDM results
python scripts/run-c35m-aim-target-validation.py  # verifies frozen design and reuses immutable completed games
python scripts/verify-c35m-independent.py
python -m unittest discover -s tests -p 'test_*.py'
node --test --test-concurrency=4 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
```

Supporting result paths: `reports/c35l/v2911-original-comparison/SUMMARY.json`, `PAIRED-18.csv`, `reports/c35m/discovery-18/ANALYSIS.json`, `reports/c35m/new-seed-18/{FROZEN-DESIGN.json, EXECUTION-AUDIT.json, INDEPENDENT-AUDIT.json, ANALYSIS.json}`.

## 5. Release decision

**Measurement PASS / Research-only.** Do not enable a new controller or promote C35-L `shadow80`. Original production code is unchanged. For next phase C35-N, evaluate a *public before-decision* aim-target estimator under new held-out conditions including misses, moving occluders, latency and varying gun classes, then run a prospectively registered A/B intervention before claiming gameplay improvement. **C36 neural training remains BLOCKED.**
