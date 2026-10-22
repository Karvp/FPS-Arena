# FPS Arena v2.9.11 — C35-AG Sequence-Level Combat Value

**2026-10-14 · Engineering PASS · Realized 6s sequence audit PASS · Offline sequence training PASS · Neural combat policy NOT PROMOTED**

## Scope and identification

C35-AF measured randomized 0.28-second ADS impulses over a three-second outcome. C35-AG adds a **passive six-second post-assignment realized trajectory**: actual queued ADS/fire/WASD/jump/crouch/reload flags run-length encoded into segments, sampled public movement state, authoritative per-segment shots/hits and six-second total damage dealt/received, kills/deaths and survival. The initial C35-AD ADS decision retains registered propensity 0.5 per arm. C35-AD cooldown is 7.5s **only when C35-AG is opted in**; the six-second measurement windows do not overlap.

**Identification boundary:** Only the initial eligible ADS impulse is randomized. Subsequent movement, aim retention, fire inputs, positioning and duration are *post-treatment trajectories*. They are neither randomized independent action choices nor ground-truth counterfactual Q-values. Unchosen outcomes are `null` and censored windows stay censored. The sequence model predicts realized outcomes **after seeing 1s of actions** and cannot legitimately decide initial ADS. Production `page-agent.js` is untouched.

## Preregistered headless engine study

**24 setup clusters × three arms × 90s = 72 independent `Game.step()` TDM matches and 108 simulated minutes.** Six guns HK SL8, L115A3, M4A1, MP5SD, AA-12 and Uzi (four setup seeds per gun), maps neon/arena/foundry and lag 65/150/245ms; matched initial seeds and opponents across `release`, C35C `shadow80 observe` and C35-AD `randomized` with C35-AG sequence capture. Initial action assignment remains C35AD seeded 50/50 control/toggle. Frozen registration file `reports/c35ag/frozen-72/FROZEN-DESIGN.json` SHA-256:

`f3684b65f7e1666801237f8a97fd52994ab15f653d98a933669e933efec065d9`

| Match measure (sum across 24 setups) | Release | Observe | Randomized ADS |
|---|---:|---:|---:|
| Kills | 180 | 225 | **234** |
| Deaths | 15 | 16 | **13** |
| Shots | 1,059 | 1,410 | **1,446** |
| Hit events | 656 | 806 | **828** |
| Agent errors | 0 | 0 | 0 |

Matched setup-cluster (5,000 bootstrap resamples) randomized/observe kills ratio **95% CI 0.920–1.160**, deaths ratio approximately 0.47–1.33. These intervals do not establish superior performance. Trajectories diverge across arms and are not exchangeable individual action outcomes.

## Independent integrity and sequence semantics

- **256 ADS assignments independently recomputed** using the frozen C35AD hash RNG; **242 complete six-second sequences and 14 right-censored at match end**; 0 overlaps; 1,550 command ticks with changed ADS in 24 randomized matches. Assignment and command flags are logged **before** `Game.step()`. Authoritative labels are computed only after it.
- Recorded trajectories have an average of **35.55 run-length segments per completed six-second window**, mean ADS command fraction **28.58%**, mean moving-command fraction **80.31%**, mean fire-command fraction **1.24%**. These are observational action frequencies, not optimal choices.
- Phase-specific shots (0–1s / 1–3s / 3–6s) average **0.8719 / 1.4835 / 2.1322** per completed window. Verified that segment shot and hit sums equal authoritative window deltas for every completed sequence.
- Audited **2,856 shots and 5,232 pellets** in the two research arms, reconciling source Game.step ballistic ledger with match counters. 204 C21 eligible offers recorded (they are not sequence treatment assignments). No fire command mutations, no simulated agent errors, no fabricated alternate returns.

## Six-second randomized initial-ADS effect, not sequence causation

Primary explorative proxy reward: `(clip(damageDealt,0,300)-clip(damageTaken,0,300)+100*(kills-deaths))/100`, guarding against L115A3's 100× headshot multiplier. Original raw damage is retained in the trace.

On **242 complete randomized windows**: 129 initial ADS-control vs 113 toggle. Mean observed reward: control **1.6606**, toggle **1.3993**. Propensity-weighted Horvitz–Thompson treatment-minus-control estimate **−0.4636**, setup-cluster bootstrap **95% CI −1.06895 to +0.13633**; kills difference IPS −0.05785 with CI −0.33884 to +0.22222; survival difference IPS −0.15702 with CI −0.38174 to +0.04878. These are not evidence for toggling ADS or for a learned policy. Within-match carryover and right censoring are limitations; full-sample inference must include the original assignment units and treatment-history effects.

## Actual offline neural learning (one-second sequence prefix)

To investigate real temporal features without target leakage, `scripts/train-c35ag-sequence-prefix.py` extracts **only** initial public pre-assignment fields and the **first second of queued action flags**; the target is the final factual six-second bounded combat return. Shots/hits, damage and other *outcome counters* are not input features. This is **descriptive one-second-to-six-second forecasting**: the first second is post-treatment, so do not use this model to choose the pre-treatment ADS impulse or claim causal superiority.

24 setup clusters are split by entire setup, 12 training / 6 validation / 6 held out: **121 train / 61 validation / 60 holdout windows**.

| Method | Validation MSE ↓ | Holdout MSE ↓ |
|---|---:|---:|
| Constant | 3.6867292 | 5.0621818 |
| Predecision + initial action Ridge | 3.8588762 | 2.8069900 |
| **One-second sequence prefix Ridge** | **3.4701767** | **2.4520610** |
| Sequence-prefix neural MLP (18→16→8→1) | 3.9645942 | 2.8645661 |

MLP strongly fits training data (1.1121 MSE) but is **worse than prefix Ridge on validation and holdout**; promotion fails. Offline model weights are exported as `reports/c35ag/frozen-72/FROZEN-SEQUENCE-PREFIX-NEURAL.json`; a pure JS inference function in `lab/arena/sequence-prefix-inference-c35ag.mjs` replays all **60 holdout predictions** to numerical tolerance <1e-7. Neither the MLP nor Ridge was ever called from gameplay.

## Regression and compatibility

| Gate | Result |
|---|---|
| Node.js full suite | **1,300/1,300 PASS** (12 new C35AG tests) |
| Official engine tests | **733/733 PASS** |
| Applicable Python | **155 PASS, 5 SKIP**; 7 historical source SHA identity tests retained unchanged and excluded from *current-source* regression |
| Five-mode release smoke | **TDM/SND/HP/BR/ZM 5/5 PASS, 0 agent errors** (new observer disabled) |
| C35-AF off-vs-C35-AG-disabled replay | **Six traces aim/dataset/fire/macro/prefire/long byte-identical; normalized game results identical** |
| Independent frozen case/hash audit | **72/72 matches, all artifact SHA-256, 256 C35AD assignments PASS** |
| Production checksum | `page-agent.js` SHA-256 **6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed** |

## Risks and next phase

The current trial randomizes only one micro ADS impulse per eligible pre-fire window, not the entire six-second ADS/movement/firing policy. Six-second windows within a match are not independent, and 242 windows/24 setups remain too few for learning a general multi-step policy. Reward caps are diagnostics, not the objective of winning. Further work should randomize *preapproved bounded multi-step options at the **engagement** level*, with explicit assignment probability, option compliance, exclusion criteria and whole-engagement endpoints; then compare a policy against incumbent on truly held-out matched matches.

**C35-AG engineering PASS / REALIZED SEQUENCE DATA PASS / FROZEN RANDOMIZATION AUDIT PASS / NEURAL SEQUENCE MLP NOT BETTER THAN RIDGE / NEURAL COMBAT POLICY NOT PROMOTED.**
