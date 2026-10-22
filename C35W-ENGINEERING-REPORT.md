# FPS Arena v2.9.11 — C35-W Causal Action-Value Teacher (research-only)

## Executive conclusion

**Engineering PASS / randomized movement policy NOT PROMOTED / production unchanged.**

From the real C35-V source archive, C35-W integrates a *one-tick* movement randomization policy into the authoritative `Game.step()` loop, with 80/10/10 probabilities for incumbent, alternative A, and alternative B. It has no access to authoritative server state while selecting actions. Server labels are attached only after engine progression. The C21 safety-gated micro randomizer is unchanged; C35-W has a **separate macro-motor public guard**, not a new authorization under C16.

Research was registered before execution, under `reports/c35w/randomized-motor-36-v1/FROZEN-DESIGN.json`. Hash-locked sources were not changed after registration. Assignment code uses a reproducible hash stream independent of game RNG and C21. It never changes `fire`, `aim`, `yaw`, `pitch`, weapon slot, skill, or any non-movement property. If C21 or another upstream controller has changed any command field, C35-W declines to intervene. Eligibility requires a fresh public hostile, geometric clearance, sane aim range, stable movement state and sufficient health. Trial delivery is exactly one command tick, followed by a 0.9 s offer cooldown. Factual outcome window is 30 ticks (0.5 seconds). Unselected actions are **never** assigned imaginary outcomes.

## Matched TDM cohort

12 setups × 3 arms (`release`, `observe`, `randomized`) × 90 seconds = 36 authoritative TDM matches, **54 simulated minutes**. Maps: Arena, Neon, Foundry. Weapons: AA-12, MP5SD, M4A1. Lag: 65/125/215 ms. Same seed, map, weapon, opponent type and opponent count within each triple. Results:

| Metric | v2.9.11 original release | shadow80 + C35-W observe | shadow80 + C35-W randomized |
|:--|--:|--:|--:|
| Kills | 61 | 72 | 83 |
| Deaths | 8 | 10 | 7 |
| Server-confirmed shots | 492 | 528 | 542 |
| Hit events | 336 | 402 | 408 |
| Distance (m) | 5,216.92 | 5,539.96 | 5,282.07 |
| New C35-W motor ticks | 0 | 0 | **44** |
| Agent errors | 0 | 0 | 0 |

The correct *incremental* counterfactual baseline for C35-W is `shadow80 + observe`, not release. Research changes from Observe to Randomized: **+11 kills, −3 deaths, +14 shots, +6 hits**. The source agent is identical in all arms; release differs from shadow80 in preexisting C21 micro-actions. The 95% setup-cluster bootstrap interval for the **randomized/observe kills ratio is [0.9737, 1.4545]** (5000 resamples), including 1. Deaths ratio interval [0.2308, 1.5000]. **No reliable combat improvement established.** The policy must remain research-only.

## Assignment and factual supervision

Independent code recomputed:
- C21 assignment hash: **104/104** correct, 0 mismatch.
- C35-W assignment hash: **246/246** correct, 0 mismatch.
- C35-W allocations: **202 control (82.1%) / 22 alternative A (8.9%) / 22 alternative B (8.9%)**. Nominal propensities are **0.8 / 0.1 / 0.1**, preserved in the records.
- **44** alternative motor ticks applied; **244** complete outcome windows, **2** right-censored (left NULL).
- 0 altered `fire` commands; 0 agent errors; 0 invented outcomes for unselected actions; every preregistered match and output passed SHA-256 verification.

| Assigned arm | Complete windows | Observed 0.5 s hit windows | Rate |
|:--|--:|--:|--:|
| Incumbent control | 200 | 45 | 22.50% |
| Alternative A | 22 | 9 | 40.91% |
| Alternative B | 22 | 6 | 27.27% |

For pooled alternatives vs incumbent, the 95% **setup-cluster** bootstrap CI for difference in observed hit-window rates is **[−0.22, +27.94] percentage points**, including zero. These overlapping, within-match outcomes are correlated; they are not 246 independent causal outcomes. Randomized assignment supports limited local intention-to-treat estimation for eligible offers; it does not identify the full Q(s,a) landscape across unseen states, or the return of any unexecuted move. Positive differences can reflect finite randomization noise, spillover between sequential actions, and downstream trajectory divergence. The experiment is insufficient for policy learning or promotion.

## Tests and integration safety

- Node.js: **1,214 / 1,214 PASS**, including 8 new C35-W unit tests.
- Official engine: **733 / 733 PASS**.
- Applicable Python regression: **116 tests executed; 111 PASS, 5 SKIP** (documented frozen-history tests). Full unfiltered Python: **120 tests, four historical source-SHA-lock failures**, 5 skips; historic SHA checks target C35-Q/U/V `train-main.mjs` and are not applicable on a modified version. The four checks were not rewritten.
- Full simulator smoke: TDM, SND, HP, BR, Zombies **5 / 5 PASS**, zero agent errors.
- Replay parity: enabling `--c35w-policy observe` leaves C35C/C35G/C35H datasets **byte-identical** to C35-W disabled for a seed-matched 40-second match; gameplay equal after excluding C35-W diagnostic metadata and creation timestamp.
- Production `page-agent.js`: SHA-256 **6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed**; unchanged from C35-V.
- Legacy training and safety modules C16/C21/C35C are not modified.

## Reproduction

From the extracted project root:

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python scripts/run-c35w-python.py
node scripts/verify-c35w-independent.mjs
python scripts/analyze-c35w-pilot.py
```

`python scripts/run-c35w-pilot.py` reruns missing files from the registered cohort, but aborts if hash-locked source/design files have changed. Existing outputs are not overwritten, and all output SHA-256 hashes are audited independently.

Raw outputs: `reports/c35w/randomized-motor-36-v1/matches/*` with C35C datasets, C35G fire telemetry, C35H macro traces, C35W randomization records, match results, and run logs. Summaries `FROZEN-DESIGN.json`, `EXECUTION-AUDIT.json`, `INDEPENDENT-AUDIT.json`, `ANALYSIS.json`, and `TDM-THREE-ARM-36.csv`. Replay parity and five-mode smoke are under `reports/c35w`.

## Recommendation for C35-X

Increase independent setup/seed count while fixing the **unit of randomization and recording probabilities**, test broader weapon strata without relaxing motor safety, assess survival/noninferiority and contextual arm positivity, and quantify effective sample size. Train an **offline action-conditioned outcome model** only if uncertainty, propensity coverage and held-out calibration support it. Do not present a factual C35-V outcome model as a validated action-value/Q policy. No production promotion and no C36 policy rollout.
