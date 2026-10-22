# FPS Arena v2.9.11 — C35-Y: Safe Exploration & Neural Action-Value Falsification

**Date:** 2026-10-14  
**Status:** ENGINEERING PASS · EXPOSURE EXPANSION PASS · NEURAL ACTION SUPERIORITY FAIL · POLICY NOT PROMOTED

## 1. Research objective

C35-X had 421 factual completed assignment windows but only 85 actually executed alternative motor ticks across C35-W/X. Its offline action-conditioned models failed to outperform a model seeing only public state. C35-Y tests a **research-only, higher-exposure one-tick randomized motor policy**, using **60% incumbent / 20% alternative A / 20% alternative B** instead of C35-W's original 80/10/10. The public-state safety menu and guards remain unchanged; no changes to production `page-agent.js`, server simulation logic, C16/C21 precedence, fire, aim, reload or weapon selection.

The 60/20/20 probabilities are recorded **before** `Game.step()`, and only actually assigned/executed actions receive factual 30-tick server outcome labels **after** `Game.step()`. Counterfactual unchosen outcomes are explicitly null. Assignment is deterministic via seed/index hash, independent from server truth and game RNG. This is a **randomized one-tick intent-to-treat experiment**, not a validated long-horizon Q(s,a) policy.

## 2. Prospective experimental design

The frozen registration `reports/c35y/expansion-72/FROZEN-DESIGN.json` locks source SHAs and **24 new map/weapon/seed setups × 3 matched arms × 90 s = 72 authoritative matches / 108 simulated minutes**. Each matched set holds map, seed, lag, opponents and weapon fixed. The arms are baseline `release`, `shadow80` passive `observe`, and `shadow80` safe randomized `explore`. Six weapons have four setups each: AA-12, MP5SD, M4A1, HK SL8, Uzi, L115A3, crossed with three map types and 70/145/220 ms simulated lag. The source and frozen design are independently checked by `scripts/verify-c35y-independent.mjs`.

| Total cohort | Release | Observe | C35-Y explore |
|---|---:|---:|---:|
| Kills | 226 | **232** | 230 |
| Deaths | 17 | **8** | 10 |
| Shots | 1,323 | 1,416 | 1,416 |
| Hit events | 791 | 877 | **887** |
| Agent errors | 0 | 0 | 0 |

Paired **setup-cluster** 5,000-bootstrap CI for explore/observe kills ratio **[0.8778, 1.1331]**; deaths ratio **[0.75, 2.75]**; shots ratio **[0.8645, 1.1749]**. These are descriptive exploratory CIs; there is **no verified combat gain** and the neural model was never used for combat.

## 3. Assignment and actual exploration

**355/355** C35-Y hash assignments and **212/212** C21 assignments independently verified. Distribution: **215 control, 71 alternative A, 69 alternative B**; **140 actual altered motor ticks**, 352 complete factual windows and 3 right-censored. Every trace records propensity, candidate public features and pre-decision action menu; **0 non-selected action outcomes imputed**, **0 fire commands changed**, **0 agent errors**. The 72 match source, dataset, fire, macro, randomization and result JSON hashes match their preregistered design and per-case audit manifest.

### Coverage by weapon

| Weapon | Eligible randomized offers | Actually executed alternatives |
|---|---:|---:|
| AA-12 | 40 | 11 |
| MP5SD | 137 | 58 |
| M4A1 | 97 | 41 |
| HK SL8 | **0** | **0** |
| Uzi | 81 | 30 |
| L115A3 | **0** | **0** |
| Total | **355** | **140** |

For HK SL8 and L115A3, **21,561** and **21,571** investigated ticks respectively failed the combined `motion-or-priority` guard. This is a **support/positivity failure at eligibility**, not a problem that increasing action randomization probability can remedy. The aggregate guard name does *not* uniquely identify whether the incumbent was stationary, aiming or performing another priority action. C35-Z should instrument the exact public safety rejection reason before modifying safety.

## 4. Offline neural training on historical + independent new cohorts

Combine **244 C35-W**, **177 C35-X**, **352 C35-Y** complete factual randomized assignment windows = **773 samples**, including **225** alternative actions actually executed across the three cohorts. The unchosen candidate actions remain *unlabelled*. Features come exclusively from before-step public snapshots and chosen action keys; server reward counters never appear as input. Fit train-only scaling and validation-selected hyperparameters for constant baseline, state-only logistic, 26-input action-conditioned logistic, and 26→12→1 MLP. Random seed fixed, three model weight files and predictions available. Group by **setup ID suffix mod 5**, not by pellet/shot or correlated windows:

- Train: **510** examples, **25** nonempty setup clusters.
- Validation: **129** examples, **8** nonempty setup clusters.
- Holdout: **134** examples, **7** nonempty setup clusters; **40** treated examples.

| Holdout (134 factual windows) | Brier ↓ | Log loss ↓ |
|---|---:|---:|
| Constant train-prevalence | 0.206383 | 0.603195 |
| **State-only logistic** | **0.083392** | **0.277375** |
| Action-conditioned logistic | 0.091478 | 0.307570 |
| Action-conditioned MLP | 0.106857 | 0.355999 |

Paired holdout **setup-cluster bootstrap** action-minus-state-only Brier 95% intervals: logistic **[−0.000318, 0.019477]**, MLP **[0.000440, 0.070061]**. Logistic is worse on average but improvement is not statistically ruled out; MLP is worse in this fixed-model cluster interval. **Neither qualifies for action selection.** Portable JSON independent inference agrees on all **134 holdout rows**, max absolute error **4.998×10⁻¹⁰**. These are **factual hit-window predictions** conditional on a logged randomized action, not learned counterfactual rewards for unchosen actions, no identification of long-term effects.

The 773 windows are temporally sequential within matches, and may overlap causal pathways; treated examples are uneven across guns and states; no real human latency, policy value or production PvP improvement is established.

## 5. Robustness and backward compatibility

- **Node.js regression: 1,220/1,220 PASS**, including 6 new C35-Y JS tests.
- **Authoritative engine: 732/733 first run** with known intermittently failing `AI glides down and lands` test; **733/733 on immediate rerun**. Both results retained.
- **Python applicable: 128 PASS, 5 previously documented SKIP**, and **5 historical source SHA-lock cases excluded** (4 prior C35-Q/U/V; one C35-W), with no failures in the applicable set; C35-W historical checksum test independently **4/4 PASS on untouched C35-X source**.
- **C35-Y focused Python: 10/10 PASS**; **C35-W/Y combined JS: 14/14 PASS**.
- Five game-mode 15-second smokes: **TDM, SND, HP, BR, ZM: 5/5 PASS**, zero agent errors.
- C35-X original randomized match `c35x-06-randomized` replayed with C35-Y opt-in **OFF**: gameplay result identical except generated timestamp; C35C dataset, C35G fire trace, C35H macro trace **byte-identical**; C35-W random trace equal except newly explicit `exploration:'c35w'` metadata. The default 80/10/10 randomizer and combat logic remain unchanged.
- `page-agent.js` SHA-256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**; no production/server implementation edit.

## 6. Falsification and next step

**C35-Y does not establish a superior action-conditioned neural model or a safe deployment policy.** The best out-of-sample model remains state-only; its output itself has not been tested as a decision policy. Further increasing 60/20/20 randomization is not adequate while the sniper eligibility support is zero. The next checkpoint should separately diagnose public motion guard factors for snipers and improve *coverage without bypassing C16/C21*; evaluate new candidate state-action supports on independent setups before larger model training. No C36 policy promotion permitted.

Reproduction:

```sh
python scripts/run-c35y-exploration.py
node scripts/verify-c35y-independent.mjs
python scripts/analyze-c35y-exploration.py
python scripts/train-c35y-action-value.py
python scripts/verify-c35y-frozen.py
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/source-main/test/run.js
python scripts/run-c35y-python.py
```
