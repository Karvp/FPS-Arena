# FPS Arena v2.9.11 — C35-AF Long-Horizon Combat Value

**Date:** 2026-10-14. **Engineering: PASS.** **Factual long-horizon logging: PASS.** **Offline neural training: PASS.** **Policy promotion: REJECTED.**

## Objective and major finding

C35-AE's hit-in-0.7s predictor could not reliably select the better ADS action. C35-AF measures a **3.0-second actual combat outcome** after each *randomized* pre-fire ADS assignment. The logger captures server-cumulative damage dealt, damage taken, kills, deaths, shots, hits and survival, while retaining the unselected outcome as `null`. A prospective ADS impulse in the C35-AD randomizer remains <=0.28 seconds, applied only on eligible non-firing ticks. All new code is opt-in research-only; the production `page-agent.js` is unchanged.

**Primary conclusion:** More realistic longer-horizon labels were collected, but neither full-match TDM nor randomized off-policy estimation establishes an improvement. An action-conditioned MLP is trainable offline yet its offline greedy ADS policy **does not beat keeping the original command**.

## Frozen preregistered 54-match Game.step cohort

18 independent fixed setups (six guns HK SL8, L115A3, M4A1, MP5SD, AA-12, Uzi × three repetitions), three maps, three network delays (70/150/235 ms), mixed/official/stress opponents; three independent 90-second matches per setup: `release`, C35C `shadow80 observe`, C35-AD `randomized` with C35-AF logging and a 4-second randomization cooldown. **54/54 genuine Game.step TDM matches / 81 simulated minutes**. Frozen registration and source hashes: `reports/c35af/frozen-54/FROZEN-DESIGN.json` SHA-256 `f65e5fda2cf8cd6c6c4cbe4b80b038c1309c7113e395f7a446e5365a69ba97df`.

| Aggregated metric | v2.9.11 release | Observe (`shadow80`) | Randomized ADS + C35-AF |
|---|---:|---:|---:|
| Kills | 147 | **168** | 157 |
| Deaths | **11** | **11** | 15 |
| Shots | 898 | **1,068** | 1,059 |
| Hit events | 527 | **637** | 611 |
| Agent errors | 0 | 0 | 0 |

Paired setup-cluster 5,000-bootstrap 95% CIs for randomized/observe: **kills ratio 0.731–1.193**, deaths ratio 0.846–2.833, hits ratio 0.778–1.195. They include no improvement. Trajectory divergence makes the 3-arm match totals insufficient to infer the immediate effect of one ADS toggle.

## Causal data collection and trust boundary

`lab/arena/long-horizon-value-c35af.mjs` observes the C35-AD registered offer **before Game.step**, copies only public pre-step features and the propensity of the assigned ADS arm (`control` or `toggle`, both 0.5); reads factual server counters **after** Game.step; completes 3.0 seconds after assignment. C35-AD is configured with **4-second cooldown only when C35-AF is explicitly enabled**, preventing overlapping measured windows; historic controller behavior when disabled remains unchanged. Every `unselectedOutcome` is `null`.

* **330 randomized assignments** (true exposures); **319 complete**, **11 right-censored**, **0 overlapping windows**; **1,896 ADS command ticks changed** in the randomized arm.
* 319 complete windows by initial ADS: **106 originally ADS** and **213 originally hip-fire**.
* Audited **2,127 research-arm shots / 3,755 pellets** from authoritative ballistic ledger; all 54 result files and seven/fewer per research match traces SHA-checked against the execution audit. Zero agent errors and fire-command mutations.
* Authoritative 3s outcomes are **factual returns of the chosen action on the subsequently evolving trajectory**, not ground-truth Q-values of all possible actions. Windows do not overlap but observations from the same 90-second match are statistically dependent and may be subject to treatment carryover.

## Statistical 3-second treatment effects

Observed treatment-vs-control, **319 complete windows**:

| Metric | Keep original ADS command (n=164) | Toggle ADS briefly (n=155) |
|---|---:|---:|
| Average 3s net damage (raw) | 353.25 | 420.08 |
| Average kills in 3s | 0.360 | 0.303 |
| No death during 3s | 96.34% | 96.77% |

Randomization-aware Horvitz–Thompson **net-damage difference** +45.01 has **setup-cluster bootstrap 95% CI −512.28 to +620.06**; analogous survival CI −0.224 to +0.134 and kills CI −0.180 to +0.025. No well-established superiority. The raw 3s damage average is heavily skewed by intentional L115A3 headshot multiplier **100×** (`lab/arena/source-main/shared/weapons.js`); a lethal headshot may contribute **10,000 raw damage**, even though the practical effect is a kill. Do not compare raw damage means across weapons without robust handling. All raw labels remain unaltered in the dataset.

## Offline three-second combat value model

Exploratory *post-cohort* modeling target, explicitly **not a preregistered causal endpoint**:

`(clip(serverDamageDealt,0,300) − clip(serverDamageTaken,0,300) + 100×(serverKills−serverDeaths)) / 100`

This bounded reward is only a proxy for full-match win rate, gear positioning or strategy. Setup-stratified split (three seeds per gun, one per train/validation/holdout) yields **106 train / 111 validation / 102 holdout** from 6/6/6 setup clusters. Input: public initial ADS, fresh target range and angle, speed, network lag, six gun indicators, plus ADS treatment and two interaction terms for action-conditioned models. No future state or selected outcome enters the input features.

| Predictor | Validation MSE ↓ | Holdout MSE ↓ |
|---|---:|---:|
| Constant train mean | 3.12341 | 1.49236 |
| State-only ridge | **2.68501** | 1.35822 |
| Action-conditioned ridge | 2.72331 | 1.34700 |
| Action-conditioned MLP, 14→16→8→1 | 2.69899 | **1.34295** |

MLP was chosen over action-ridge **by validation only**. Although holdout MSE 1.34295 is slightly below state-only 1.35822, it does **not establish improvement in causal decision value**. Its exported weights are located in `reports/c35af/frozen-54/FROZEN-3S-COMBAT-MODELS.json`; the pure JavaScript offline module `lab/arena/long-horizon-inference-c35af.mjs` supports reproduction, never called from runtime agent. Frozen Python reconstruction parity error <=1e-8 on holdout.

**Independent propensity off-policy on the six-setup holdout (102 windows):** constant keep action IPS **0.6400**, model greedy IPS **0.4947**, estimated difference **−0.1453**, 95% setup-bootstrap CI **−0.3570 to +0.0715**. Estimates use the original randomized 0.5 assignment, not model-assigned labels. Interval includes zero and suggests no demonstrated advantage. The MLP never controlled a `Game.step()` match.

## Tests and regression

* Research observer **9/9 unit tests PASS**; standalone offline inference **4/4 PASS**, and existing long-horizon compatible regressions. Final complete Node.js suite: **1,288/1,288 PASS**.
* Official engine tests **733/733 PASS**.
* Applicable Python historical regression **150 PASS + 5 SKIP**, 7 frozen historical SHA-lock tests intentionally excluded unchanged (`scripts/run-c35ae-python.py`).
* Five-mode TDM/SND/HP/BR/ZM smoke **5/5 PASS**, agent errors zero. C35-AF active logging is opt-in TDM only, not exercised by this inactive five-mode smoke.
* Legacy C35-AE vs C35-AF *with C35-AF disabled* on the same 30-second seeded match: **aim, dataset, fire, macro, prefire trace all byte-identical**, normalized gameplay JSON equal after ignoring generated creation timestamp.
* Source `page-agent.js` SHA-256 unchanged: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Limitations and next milestone

Short ADS impulses are only one element of an FPS policy. The measured 3s kill/survival responses often remain sparse; actions from the same match are dependent; sniper reward tails are extreme. Predictive improvement on 102 holdout windows from just six setup clusters is insufficient. No human-opponent, browser UI, cross-mode, large-scale causal sequence policy or true C36 neural-controller validation was performed.

**C35-AF engineering PASS / Factual 3s measurement PASS / Offline MLP reproducible PASS / Action-value policy SUPERIORITY NOT ESTABLISHED / PRODUCTION NOT PROMOTED.** The next phase should test multi-step engagement outcome models and randomized trajectory-level actions with distinct match units before attempting to deploy a neural controller.
