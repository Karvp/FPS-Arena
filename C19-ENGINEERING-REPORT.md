# FPS Arena v2.9.11 — C19 Natural-End Match Evaluation

**Date:** 2026-10-12  
**Parent:** C18 Long-Horizon Evaluation, user-uploaded FPS Arena `main` game engine snapshot  
**Classification:** Research-only. **No production actuation or neural value policy deployment.**

## Executive finding

C19 removes the 75-second truncation of C18 and runs the authoritative TDM server through a natural match-ending rule, with a hard 600-second administrative guard. **24/24 preregistered matches ended naturally**, each after a team reached 50 kills; none were administratively censored. Results do **not** demonstrate policy benefit.

Randomized, stratified, all-assigned-match intention-to-treat (ITT) analysis reports a **+0.5833 kill differential per treatment match** compared with control, with a stratified block-bootstrap 95% interval **[-1.667, +2.833]** and paired sign-flip **p ≈ 0.748**. The confidence interval crosses zero; results are highly heterogeneous by map and weapon. This is **not** a causal label for any individual micro-strafe action.

## Implementation

- `lab/arena/train-main.mjs`: new `--c19-natural` research flag; requires `--full-match`, `--seconds 600`, single-mode TDM with a C17 preassigned dataset. Preserves the established C17 ban on `--full-match` without explicit C19 flag. Emits `c19NaturalTrial` with server terminal, duration cap and right-censor marker.
- `lab/arena/natural-end-study-c19.mjs`: deterministic, SHA-256-fingerprinted trial registration, six map-weapon strata, randomized balanced treatment/control assignments, strict match and termination verification, all-assigned-match ITT, stratified bootstrap, paired sign flip, and leave-one-stratum-out diagnostics. Refuses to report degenerate bootstrap confidence intervals when there is only one block per stratum.
- `lab/arena/run-natural-end-c19.mjs`: runs every registered trial, checks source fingerprint and existing registration, verifies results and datasets, and supports resuming complete output pairs after interruption. The 24-match experiment uses **two independent treatment/control blocks per stratum**.
- `tests/natural-end-study-c19.test.mjs`: eight focused regression tests for registration, provenance, censoring, rejection of counterfeit natural ends, duplicate/missing jobs, control no-op and underpowered CIs.

## Experiment design

- Six strata: Arena/MP5SD, Arena/HK SL8, Foundry/AA-12, Foundry/M4A1, Neon/M4A1, Neon/MP5SD.
- Two blocks per stratum, two independently seeded games per block: **24 total trials** (12 control, 12 treatment).
- Opponents: stress bots (5); snapshot latency 65 ms. Each game runs until server phase changes out of `match`, or until 600 simulated seconds. TDM rules end when the first team reaches **50** kills.
- Intervention: unchanged C16 guarded micro-strafe. Treatment and control assigned at match level, **not** after filtering for opportunities. No manual changing of seed or action thresholds.
- Registered plan: `reports/c19/study24/PRE-REGISTERED-PLAN.json`, with SHA-256 fingerprint. Full per-match data: paired `*.result.json` and `*.dataset.json`, `STUDY-ROWS.json`, `ANALYSIS.json`.

## Results

| Metric | Control | Treatment |
|---|---:|---:|
| Games | 12 | 12 |
| Kills | 173 | 163 |
| Deaths | 47 | 30 |
| Kills minus deaths | +126 | +133 |
| Eligible offers | 201 | 187 |
| Intervention ticks | 0 | 1295 |
| Server natural endings | 12 | 12 |
| Mean game duration | 259.97 s | 253.02 s |

There were **24 natural endings, 0 capped/censored**, and approximately **1.71 simulated match-hours**. Treatment ITT: **+0.5833** per game. Stratified bootstrap 95% interval: **[-1.6667, +2.8333]**. Paired sign-flip p-value: **0.7475** (8,000 draws). No positive effect can be established.

Mean treatment-control kill-differential changes by stratum: Arena/HK SL8 −4.0; Arena/MP5SD +3.0; Foundry/AA-12 −1.5; Foundry/M4A1 −0.5; Neon/M4A1 +2.0; Neon/MP5SD +4.5. Leave-one-stratum-out ITT ranges from −0.2 to +1.5. These are **post-hoc descriptive diagnostics**, not a policy selection criterion.

## Software validation

- **AI regression:** 853/853 passed (`node --test --test-concurrency=1 tests/*.test.mjs`).
- **Main game engine regression:** 733/733 passed (`cd lab/arena/source-main && node test/run.js`).
- **Game-mode smoke:** TDM, S&D, HP, BR and Zombies, five of five with zero runtime errors.
- **Production hash parity:** `page-agent.js` byte-for-byte identical to C18 (`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`).
- All 24 paired server-result and exploration-dataset records pass match ID, seed, map, primary weapon, assignment draw, arm, terminal rule, right-censoring and source provenance checks.

## Research limits and release decision

Only two blocks per stratum means uncertainty remains substantial, and the bootstrap interval is inherently coarse. Trial seeds within blocks differ; they are *matched in setting*, not identical-state counterfactual clones. This is a simulation against game bots with a fixed lag, not a browser FPS benchmark or study against human opponents. Termination times also vary by arm and are outcomes of the assigned policy. Do not condition the ITT on post-treatment opportunity counts.

**Decision:** keep C16 safe exploration and C19 analysis in headless lab only. No production Autopilot changes, no new neural action-value policy trained, no GitHub push. Future C20 studies should first improve replication and cross-stratum transport validity, then consider independently validated reward learning.

## Reproduction

```bash
node --test --test-concurrency=1 tests/*.test.mjs
cd lab/arena/source-main && node test/run.js && cd ../../..
node lab/arena/run-natural-end-c19.mjs --blocks 2 --workers 3 --out-dir reports/c19/study24
```

The runner reuses only fully paired, pre-registered result and dataset files, and fails on an altered registration. For a fresh run, use a new output directory and unique experiment/base seeds.
