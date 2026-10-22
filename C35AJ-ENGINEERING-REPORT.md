# FPS Arena v2.9.11 — C35-AJ: Prospective State-Conditioned Tactical Option Value

**Status: ENGINEERING PASS / GAME.STEP COHORT PASS / OFFLINE PREDICTION PASS / NEURAL & TACTICAL POLICY NOT PROMOTED**  
**Date: 2026-10-14**

## Scope and contribution

This research-only checkpoint builds on C35-AI and its independently verified physical after-step audit. It collects a **new frozen 108-match three-arm cohort** across 36 independent setups and six weapons, learns assigned tactical-option value from **pre-assignment public observations only**, and evaluates frozen models on setup-held-out **previously unseen real-engine traces**. All post-step physical displacement, damage, kills, option interruptions and horizon outcomes are **labels, audits or mediators**, never selector inputs.

The underlying multi-tick tactical-option C35-AH and physical observer C35-AI are unchanged. No production `page-agent.js` modification and no neural-controlled matches.

## Preregistration and real engine

- Frozen cohort registration: `reports/c35aj/prospective-108-v1/FROZEN-DESIGN.json` (check SHA-256 in `EXECUTION-AUDIT.json`); source SHA hashes are verified independently in `scripts/verify-c35aj-independent.mjs`.
- 36 paired setups × three arms (`release`, `shadow80 observe`, `shadow80 randomized`) × **90s** = **108 matches / 162 simulated minutes**.
- Six weapons: HK SL8, L115A3, M4A1, MP5SD, AA-12, Uzi. Three maps: Foundry, Neon, Arena; lags 65/85/135/175/215/245 ms, mixed/official/stress opponents. Six setups per weapon.
- 50% incumbent, 25% tactical option A, 25% tactical option B, deterministic assignment seed; up to 1.25s guarded motor option, 6s factual outcome, 7.5s cooldown. Safety checked every command tick. Incumbent aim/ADS/fire/skill untouched.
- **One training setup (`c35aj-07`) produced zero eligible offers**; preserved as real zero-exposure, not fabricated or replaced. Of the other 35 new setups, all data remain audit-visible.

### 108-match summary

| Whole-match metric | Release | Observe | Randomized |
|---|---:|---:|---:|
| Kills | 326 | 305 | **327** |
| Deaths | **14** | 17 | 19 |
| Shots | 2,091 | 1,966 | **2,187** |
| Hit events | 1,214 | 1,208 | **1,340** |
| Agent errors | 0 | 0 | 0 |

Setup-cluster bootstrap 95% ratio Randomized/Observe: **kills [0.95515, 1.19608]**, deaths [0.73684, 1.66667], shots [0.98214, 1.26290], hits [0.99822, 1.23558]. Although randomized kills rose by 22, the confidence interval includes no improvement and deaths also rose by two. **Do not promote.** Do not equate server raw damage across weapons: L115A3 headshot ×100 can dominate raw totals.

### Authoritative tactical audit

- **240** randomized assignments: **128 incumbent / 57 option A / 55 option B**. **222** complete 6s factual returns; **18** right-censored at match end. **325** independent C21 assignments reconstructed.
- **1,400** modified motor-command ticks; **1,396** had nontrivial post-`Game.step()` player displacement, totalling **100.5509 m observed during modified-command ticks**. Not an incremental causal effect relative to the unselected action. **19** teleport/respawn discontinuities excluded. **110** interruptions retained in original assignment groups for intent-to-treat analysis.
- All six guns generated modified motor ticks (152 HK SL8, 124 L115A3, 307 M4A1, 212 MP5SD, 285 AA-12, 320 Uzi). 4,153 research-arm shots and 8,949 pellets were reconciled to authoritative server ledger. **Zero changed fire commands; zero agent errors**.
- `INDEPENDENT-VERIFICATION.json` was produced without importing the randomized option controller and verifies source/artifact SHA hashes, assignment formula, C21 assignments, physical audit parity, fire and outcome ledgers.

## Tactical value models (offline only)

The training labels are realized, factual six-second outcomes from C35-AI legacy and the C35-AJ cohort, including interrupted options. Reward uses clipped damage to limit sniper outliers:

`r = (min(300, server_damage_dealt) - min(300, server_damage_taken) + 100 * (kills - deaths)) / 100`.

This is a **research utility definition**, not measured true human preference and not guaranteed to align with multi-match win rate.

Features are the delayed **public snapshot before the first randomized assignment**, with gun, map, lag, opponent type, aim/ADS/target geometry, incumbent motor keys, and *unlabelled* heuristic scores from the available action menu. The chosen arm is provided to action-conditioned models. No physical outcomes, option duration, interruption or subsequent sequence is used to predict at that point.

Preregistered setup split: historical C35-AI 00–17 plus new C35-AJ 00–23 train; historical C35-AI 18–23 validation; new C35-AJ 24–35 holdout. Observed valid assignments: **274 train / 33 validation / 81 holdout**, of which **252 / 31 / 77** are complete labelled windows. The other 28 records remain right-censored, not filled with zero. **Critical limitation:** by the frozen setup ordering, validation and new prospective holdout disproportionately/entirely cover **AA-12 and Uzi**, not a balanced six-gun generalization test; this is preserved and disclosed rather than silently changing holdout after collecting results.

| Model | Validation MSE (lower better) | Prospective holdout MSE |
|---|---:|---:|
| Constant | 5.3156 | 5.7241 |
| State-only Ridge (α=100) | 3.1194 | **4.0766** |
| Action-conditioned Ridge (α=100) | **3.0928** | **4.0506** |
| Action-conditioned neural MLP (8 hidden) | 3.5518 | 4.8471 |
| Action-conditioned neural MLP (16 hidden) | 3.1388 | 4.3918 |

Selected by validation: action Ridge α=100; the neural MLP **did not beat the simpler baseline**. Frozen Python weights were exported to JSON and independently evaluated via `lab/arena/tactical-value-inference-c35aj.mjs`. **77/77 prospective holdout predictions are reproduced (max absolute error <1e-8)**, including separate predictions for each available arm (these are model estimates, NOT invented counterfactual outcome labels).

### Held-out off-policy value

Using known true propensities .50/.25/.25 and all **77 complete factual** holdout assignments, fixed selected action model vs always keep incumbent:

| Policy | IPS utility estimate | Self-normalized IPS | IPS effective sample size |
|---|---:|---:|---:|
| Always incumbent | 0.7831 | 0.7538 | 40 |
| Action Ridge argmax | 1.0842 | 0.9074 | **23** |

IPS difference model − incumbent = **+0.3010**, **setup-cluster bootstrap 95% [−0.6082, +1.1982]**; SNIPS difference 95% [−0.6606, +1.0959]. **This is underpowered and compatible with harm.** Off-policy effective sample sizes are small, outcome variability includes rare kills and weapon-specific effects, and clustered observations are not independent per tick. **Predictive MSE gain ≠ validated policy gain**. No model selected actions in production or game trials.

## Regression and policy isolation

- **1324/1324 Node.js PASS**, including five new C35-AJ tests for immutable offline artifact, prediction parity, setup split, public-only features and invalid input.
- **733/733 official engine PASS**.
- **172 Python PASS, 5 historical skips**; nine SHA source-lock tests of earlier frozen checkpoints retained unchanged and excluded by the explicit applicable-suite runner. No historical expected checksum was altered.
- **5/5 game-mode smoke PASS** TDM/SND/Hardpoint/BR/Zombies with zero agent errors.
- Observer disabled vs observe-only yields **four prior traces byte-identical, old option trace byte-identical, gameplay parity after removing timestamps/diagnostics**.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (unchanged).

## Reproduce

```bash
# Source-locked cohort already frozen; command refuses changed source or partial cases
python scripts/run-c35aj-tactical-value.py
node scripts/verify-c35aj-independent.mjs
python scripts/analyze-c35aj-prospective.py
python scripts/train-c35aj-tactical-value.py
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python scripts/run-c35aj-python-regressions.py
python scripts/check-c35aj-parity-smoke.py
```

Note: rerunning neural training overwrites only derived research evaluation and weight files. It does **not** overwrite original registered randomized traces or source locks.

**Final decision:** Engineering and research data collection PASS; neural MLP superiority FAIL; action Ridge prediction is modestly better but option-policy advantage unproven. **Keep all tactical and neural model candidates OFFLINE ONLY. Do not promote C36**. Next iteration should rebalance a **gun-stratified independently preregistered holdout** and improve option exposure while preserving the full ITT safety/censoring semantics.
