# FPS Arena v2.9.11 — C35-AI: Authoritative Physical Displacement & Tactical Option Audit

**2026-10-14 · Engineering PASS / 72 real-engine matches PASS / Combat policy NOT PROMOTED**

## Summary

This research-only checkpoint extends C35-AH bounded (up to 1.25s) randomized multi-tick tactical options with **authoritative player (x,y,z) position measured after each `Game.step()`**. It distinguishes motor inputs, nonzero real movement, inertia while inputs are released, collisions/stalls, and respawn/teleport discontinuities. Server-truth position is **never** passed to any pre-action option selector, public-state model or policy; it is an independent post-step audit signal.

**Engineering fix:** The first research observer inferred option membership from rounded start timestamps and could omit one command tick. A broader timestamp tolerance also failed in 18/24 randomized matches. The final observer receives `c35ahController.active?.index` at the exact command step; assignment ownership is determined by the controller, while displacement is measured only afterward. Explicit invariants detect non-matching active IDs, command changes without an active randomized arm, and command-tick mismatches. No C35-AH option selection logic and no `page-agent.js` production logic were changed.

## Frozen experiment

- **Final preregistration v5**: `reports/c35ai/frozen-72-v5/FROZEN-DESIGN.json`, SHA-256 `1b35a0665b16289d29d9038f812e7e3191b7dd62045af1e9cc7042c54f19e0d9`; source hashes frozen *before* final cohort. Full independent audit validates every case's artifact SHA-256.
- 24 independent matched setups × `release` / `observe` / `randomized` = **72 games × 90 seconds = 108 simulated minutes**. Six guns (HK SL8, L115A3, M4A1, MP5SD, AA-12, Uzi), three maps (Foundry, Neon, Arena), lag 70/130/210/245 ms, opponent types official/mixed/stress. Four independent setups per gun.
- Research randomizer assignments: incumbent 50%, option A 25%, option B 25%. Each option must re-pass public-state target, static-geometry and priority-action guards on each step; interruption does not remove an assignment from intent-to-treat (ITT). Factual outcomes are six-second authoritative counters; 7.5s cooldown. No unchosen counterfactual outcomes generated.
- **Excluded failed registrations** (complete design files and available logs preserved, not merged): v1 missing physical-trace CLI flag; v2 contained unsupported 265ms lag; v3 timestamp-window off-by-one; v4 time-tolerance off-by-one in 18/24 randomized matches. Only v5 is analyzed here.

## Matched 72-game results

| Metric | Release | Observe | Randomized C35-AI |
|---|---:|---:|---:|
| Kills | 218 | **211** | 190 |
| Deaths | **15** | 17 | 16 |
| Shots | **1,266** | 1,228 | 1,093 |
| Hit events | 770 | **771** | 666 |
| Agent errors | 0 | 0 | 0 |

Randomized/Observe **setup-bootstrap 95% ratios** from 5000 matched resamples: **kills [0.7550, 1.0763]**, deaths [0.5882, 1.4615], **server-reported distance [0.9334, 1.0028]**. All include a neutral ratio of 1; no reliable combat improvement. The randomized cohort had 21 fewer kills than Observe. Server distance includes teleports/respawns and is not interchangeable with continuous locomotion measured by observer.

## Authoritative displacement: important distinctions

- Independent SHA / hash-based replay: **148/148 C35-AH assignments** (82 incumbent / 37 option A / 29 option B), **174/174 independent C21 assignments**, full set of 72 registered matches; 138 complete factual return windows, 10 right-censored, 66 interrupted assignments retained in ITT.
- **683 changed motor-command ticks** across randomized research matches. **683 ticks had nonzero server-measured horizontal displacement above 0.005m**, totalling **49.8077 meters observed *during* changed-command ticks**. This is **not** the causal distance induced by choosing that option: momentum may contribute and the unselected trajectory is unknown. It is physical motion that occurred, not a counterfactual effect.
- In randomized matches, **13 server position discontinuities** above 1.5m/tick were excluded from continuous locomotion. Original match distance may include these jumps, so parity to server total distance is required only in matches with zero discontinuities. One must not silently count respawn jumps as real walking/routing distance.
- **90 stalled movement-command ticks within option windows** (a moving input but less than 0.005m real displacement), **199.6494m momentum travel** over all randomized matches during ticks with no movement input (whole-match metric; option-only momentum is 8.29m). No material server data is used to drive pre-action decisions.
- Six-weapon modified-command exposure: HK SL8 60 ticks, L115A3 149, M4A1 65, MP5SD 126, AA-12 59, Uzi 224. No gun has zero exploration exposure in this cohort.
- **2,321 research-arm shots and 3,729 pellets** independently reconciled to authoritative shot ledger. **0 fire-command modifications** and **0 agent errors**.

### ITT / limitations

Randomization applies to the **initial option class**, not actual realized displacement and not all later ADS/aim/fire decisions. Do not select only physically moving/fully completed/noninterrupted offers for causal estimates. Endpoint censoring is not filled with zero. A nonzero position change on the same tick as a command change does not establish the *incremental* effect relative to not changing that command. No new neural policy was trained or live-operated in C35-AI.

## Verification and compatibility

| Gate | Verified result |
|---|---|
| Node.js full suite | **1319/1319 PASS** (11 C35-AI physical tests, including active-index boundary regressions) |
| Official engine suite | **733/733 PASS** |
| Applicable Python tests | **164 PASS, 5 historically SKIPPED**, 9 historical SHA source-lock tests retained unchanged and excluded from current-source runner |
| Full real-engine parity replay | Four upstream traces (`aim`, `dataset`, `fire`, `macro`) and C35-AH option trace byte-identical between no-physical-observer and physical-observe; gameplay results equal with timestamps/diagnostic fields removed |
| Five-mode smoke | **TDM/SND/Hardpoint/Battle Royale/Zombies 5/5 PASS**, zero agent errors |
| Frozen source/assignment/traces | **PASS** independent registered SHA-256, C21 & tactical assignment recomputation, true server shot/pellet checks |
| Production code | `page-agent.js` SHA-256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`** unchanged |

## Key files / reproducibility

- `lab/arena/physical-option-audit-c35ai.mjs`: passive per-tick before/after authoritative displacement, active-option identity, teleport exclusion.
- `lab/arena/train-main.mjs`: experimental observer invoked before and after `Game.step()`; option controller unchanged.
- `tests/physical-option-c35ai.test.mjs`, `tests/test_c35ai_physical.py`.
- `scripts/run-c35ai-physical-options.py`: frozen 72-case design and 3-arm runner, resume only complete/hash-verifiable cases.
- `scripts/verify-c35ai-independent.mjs`: source lock and assignments independently reproduced; teleport-aware distance reconciliation.
- `scripts/analyze-c35ai-physical-options.py`: matched setup bootstrap; observational physical mediator summaries.
- `scripts/check-c35ai-parity-smoke.py`: side-effect-free replay and five-game-mode smoke.
- `reports/c35ai/frozen-72-v5/{FROZEN-DESIGN.json,EXECUTION-AUDIT.json,INDEPENDENT-VERIFICATION.json,INDEPENDENT-ANALYSIS.json,TACTICAL-PHYSICAL-FACTUAL.csv,TDM-THREE-ARM.csv,matches/}`.

**Decision:** Engineering, independent audit and physical data collection **PASS**. Combat improvement and neural policy promotion **FAIL / NOT PROMOTED**. Continue with larger independent map/cover clusters and physically grounded, setup-held-out option-value models; do not change production solely because a new command resulted in movement.
