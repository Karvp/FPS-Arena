# FPS Arena v2.9.11 — C23 Pressure-Conditioned Tactical Evaluation

**Checkpoint:** 2026-10-12 · **Base:** C22 · **Status:** research only / NO production policy changes.

## Executive finding

C23 is a genuinely new, **pre-registered 18-match held-out cohort** (6 map/weapon strata × 3 seeds; 75 simulated seconds per match) using C22's **unchanged randomized three-action safety-gated controller**. This pass improves evaluation and provenance rather than widening the safety gate, introducing action-value estimates, or claiming to have discovered a better dodge.

- **18/18** independent simulated matches completed with result/dataset pairs; **48** assigned eligible encounters, **47** full 1.8 s windows, **1** explicitly censored.
- **16/47** completed windows have nonzero dealt+received damage; **2/47** have *received* damage. These are sparse defensive labels despite many states classified as elevated pressure.
- **898/898 AI regression**, **733/733 game `main` tests**, five-mode smoke with **0 runtime errors**.
- The **training gate fails**. No real-data neural action-value model was trained or deployed. `page-agent.js` SHA-256 is unchanged from C22: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## New implementation

1. `lab/arena/evaluate-pressure-holdout-c23.mjs`: validates C22 match/offer labels, a frozen research plan, match/job IDs, endpoint definition and disjoint seed cohorts; computes **pre-action public-pressure** action counts and damage balances for the **single predeclared primary horizon of 1.8 seconds**. Resampling occurs at the whole-match level. Sparse subgroup confidence intervals are **suppressed** rather than printing unstable bounds.
2. `lab/arena/run-pressure-holdout-c23.mjs`: freezes a SHA-256 source fingerprint, registered jobs, 6 map×weapon strata, seeds and 75-second length **before launch**; resumes only valid result/dataset pairs; checks the active client/server provenance. Uses the existing `--c22-dataset` instrumented simulator, **not a new action policy**.
3. `tests/pressure-conditioned-holdout-c23.test.mjs`: ten focused regression tests covering registration integrity, no seed reuse, unregistered jobs, unchanged randomized safety controller, thin-sample rejection, deterministic evaluation, zero-offer matches and match-aware statistics.
4. `scripts/verify-c23-provenance.py`: independent replay-file audit, recomputes source/registration fingerprints, rejects seed collisions against the **C22 exploratory cohort**, validates every match/result pair, and checks the production bundle against C22.

### Study protocol and leakage control

- 6 strata: Arena/MP5SD, Arena/HK SL8, Foundry/M4A1, Foundry/AA-12, Neon/M4A1, Neon/MP5SD.
- 3 new seeds per stratum (base `23023000`, stratum-separated); fixed **75 s**, **5 stress opponents**, **65 ms snapshot lag**, `release` profile.
- At an eligible encounter, unchanged C21 seeded assignment to `baseline`, `micro-left`, or `micro-right`, each with logged probability 1/3. C16 vetoes remain in force at every modified tick; action duration is 0.16 s. Offers separated by 1.8 s.
- Pressure is a **pre-assignment proxy**, not a server-truth future-hit probability: distance, hostile count, health fraction, armor fraction and target radial motion.
- Server hit, shot, kill, damage events are used only **after** assignment for labels. Outcomes are cumulative 1.8-second *policy* outcomes, not isolated causal Q-values for a single tick.
- Every match contributes to sample accounting, including matches without offers. Censored windows are retained but excluded from complete-window descriptive damage analysis.

**Source fingerprint:** `5e67ede40ed58229d2d62f2e9fd064ffe6030fe99568dbb204519d437560e225`  
**Plan registration:** `c82a5c3cb64e490f85f24caa0691d6b847a892b1f5d070675a65a7a89dad0641`.

## Held-out observations

| Metric | C23 holdout |
|---|---:|
| Independently seeded 75-second matches | 18 |
| Assigned encounters | 48 |
| Complete / censored 1.8-second outcomes | 47 / 1 |
| Complete encounters with any dealt or taken damage | 16 |
| Complete encounters with incoming damage | 2 |
| Baseline complete offers / matches covered | 16 / 10 |
| Micro-left complete offers / matches covered | 18 / 7 |
| Micro-right complete offers / matches covered | 13 / 8 |

| Map / weapon | Matches | Offers | Nonzero complete windows | Incoming-damage windows |
|---|---:|---:|---:|---:|
| Arena / MP5SD | 3 | 8 | 2 | 1 |
| Arena / HK SL8 | 3 | 16 | 6 | 1 |
| Foundry / M4A1 | 3 | 14 | 7 | 0 |
| Foundry / AA-12 | 3 | 6 | 0 | 0 |
| Neon / M4A1 | 3 | 1 | 1 | 0 |
| Neon / MP5SD | 3 | 3 | 0 | 0 |

The three arms are **unevenly represented across exposures** despite 1/3 propensity at each offer: the full 1.8 s windows contain 45 trainee shots in baseline, 45 in micro-left, but only **4 in micro-right**. Therefore a raw damage-balance contrast would conflate shooting opportunities and tactical choice; it is **not a validated measure of dodge superiority**.

### Pressure-conditioned exposure

| Pre-action public proxy band | Audit samples | Audit samples passing safety | Eligible fraction | Complete assigned encounters |
|---|---:|---:|---:|---:|
| Low | 148 | 14 | 9.46% | 13 |
| Moderate | 1,142 | 18 | 1.58% | 20 |
| Elevated | 1,679 | 10 | 0.60% | 14 |
| Unobserved | 37 | 0 | 0% | 0 |

The audit was performed at a 0.45-second interval independently of the randomized-offer scheduler. **Audit eligibility counts are not assignments or independent trials.** A high pressure proxy does not override HP, geometry, distance or incumbent-priority safeguards; it can also describe an opponent threatening the bot without actually landing shots.

For **elevated pressure**, the three actions have only baseline 4, left 5, right 5 complete windows; each arm covers at most five matches. Even the descriptive differences (-21.75 HP for left-minus-baseline, -16.15 for right-minus-baseline) are unsupported by enough independent outcomes. **All subgroup bootstrap confidence intervals were deliberately suppressed.** It would be invalid to pick a preferred action after inspecting these sparse subgroups.

### Exploratory vs holdout cohort

C22 exploratory cohort: 18 matches, 48 offers, **14** damaging complete 1.8 s windows, **5** with incoming damage. C23 newly seeded cohort: 18 matches, 48 offers, **16** damaging complete windows, **2** with incoming damage. These are separate simulation runs, **not** a paired intervention comparison; differences do not establish a treatment effect. The C23 verifier confirmed **zero reused seeds**.

## Statistical and training decision

The C23 gate requires at least **30 independent matches, 120 completed windows per arm in at least 20 matches, 90 nonzero-damage windows, 30 incoming-damage windows, plus adequate moderate/elevated support for every arm**. C23 falls short on every consequential sample-size dimension. Interventions may affect *future eligibility*, and offers within a match are dependent, so treating 47 windows as 47 independent causal units is especially inappropriate.

**Release decision: BLOCKED.** No new real-data Q/value network trained; no claiming more effective evasion or engagement, and no production actuation changes.

## Verification and reproducibility

- `node scripts/build.mjs && node --check page-agent.js` — PASS.
- `node --test --test-concurrency=1 tests/*.test.mjs` — **898 passed / 0 failed**.
- `(cd lab/arena/source-main && node test/run.js && node tools/check.js)` — **733 passed / 0 failed**, static check PASS (preexisting audio warnings unrelated to C23).
- Five-mode `train-main.mjs` smoke test (`tdm`, `snd`, `hp`, `br`, `zm`) — **all 5 completed**, no runtime errors.
- `python scripts/verify-c23-provenance.py` — source fingerprint, preregistration hash, 18 result/dataset pairs, holdout seed isolation and unchanged production agent all PASS.
- Running the C23 evaluator against saved matches reproduces the summary without rerunning simulation.

Reproduction:

```bash
node lab/arena/run-pressure-holdout-c23.mjs --repetitions 3 --seconds 75 --workers 4 --out-dir reports/c23/holdout18
node lab/arena/evaluate-pressure-holdout-c23.mjs reports/c23/holdout18/COMBINED-DATASET.json reports/c23/holdout18/PRE-REGISTERED-PLAN.json reports/c23/holdout18/RECHECK.json
python scripts/verify-c23-provenance.py
```

### Explicit limitations

This is a simulation against stress bots, not a human-play benchmark; no browser FPS, mouse integration latency, or large diverse real-player generalization was measured. The public pressure proxy has not been calibrated against server-confirmed incoming bullet danger. C23 cannot establish that the left or right dodge is beneficial. It does not justify relaxing the C16 safety gate, or learning a neural value policy from the scarce damage events. It does not include an authoritative Git commit for the user-provided `main` snapshot and was not pushed to GitHub.

**Next candidate C24:** collect independent, preregistered *actual threat indicators* (e.g., recent server-confirmed incoming shots/near misses captured after the fact and joined to publicly observable precursors) across longer randomized trials, without exposing hidden server data to the live bot. Emphasize valid defensive signal and generalization, rather than increasing opportunities solely by loosening safety.
