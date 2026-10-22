# FPS Arena v2.9.11 — C35-AE Engineering Report

## Executive decision

Checkpoint **C35-AE — Neural ADS Retention Value**: **engineering PASS; offline training PASS; independent prospective evaluation PASS; neural controller NOT PROMOTED**. The frozen model runs only in offline scripts and the standalone JavaScript inference helper. It never altered any `Game.step()` command in the 24 new matches; the pre-existing C35-AD randomized ADS controller did so in the research arm. Production `page-agent.js` remains byte-identical.

## Scientific question and causal design

Question: Given only a pre-step public state, which of two **short** ADS actions (retain initial ADS or toggle for ≤0.28 s on a non-firing eligible tick) predicts at least one authoritative hit-shot in the next 0.7 s?

- Data source: preregistered **72 C35-AD matches**, 24 setup clusters, randomized 50/50 ADS with propensity known before action and *real* post-step server outcomes. **1,145 offers, 1,136 factual complete windows**. Only 1,136 are eligible labels, not independent trials; the other nine censored windows are excluded.
- Features: **18 public pre-step variables**: ADS, target range, aim angle, target age, movement speed, radial/lateral speed, expected gun spread, four movement inputs, and six weapon indicators. The action model adds six explicitly action-dependent terms. **No post-step features, target health/damage outcomes, or unselected-action labels** are used in training.
- Train/validation/holdout: setup-cluster, weapon-stratified split of 12/6/6 setups, covering each gun in all three partitions. Samples: **546 train / 289 validation / 301 holdout**. Candidates fixed in advance: constant, state logistic, action logistic and 18→16→8→1 action MLP; validation Brier chooses the action candidate. These are offline factual outcome models, **not proven long-term Q(s,a) optimizers**.
- Frozen retrospective registration SHA-256: `f32a0ea8904f745a17d98940d2bc670fe92f9fcb5d69c9b2334605dfb41eee45`. Frozen prospective registration SHA-256: `540642073a8c0bff284364e36c92947428d352431a8318c8bc254c5ec47bbe7b`.

## Retrospective setup holdout (301 windows, six clusters)

| Predictor | Validation Brier ↓ | Holdout Brier ↓ | Holdout log-loss ↓ |
|---|---:|---:|---:|
| constant | 0.16038 | 0.13178 | 0.43329 |
| state-logistic | 0.14439 | 0.11750 | 0.38930 |
| action-logistic | 0.14380 | 0.11680 | 0.38445 |
| action-mlp | 0.17309 | 0.15165 | 0.58332 |

On this **small six-setup holdout**, action-logistic has Brier 0.11680 vs state-only 0.11750, an extremely small advantage; neural MLP underperforms. Brier is predictive accuracy, not proof of better intervention.

## Truly new-seed evaluation — 24 actual Game.step() matches

- **12 new independent setup clusters**, six guns × two new seeds, three classic maps, 90 seconds each, paired `observe` and C35-AD `randomized` arms: 24 matches / **36 simulated minutes**. Frozen models were not retrained or used in the engine.
- Independent SHA audit: **572/572 C35-AD randomizations**, **121/121 historical C21 assignments**, **1,225 shots** and **2,589 pellets** reconciled; 568 completed factual offers, four censored. Zero agent errors, fire mutations or imputed outcomes.

| Predictor (frozen, no retraining) | New-seed Brier ↓ | New-seed log-loss ↓ |
|---|---:|---:|
| constant | 0.13461 | 0.44028 |
| state-logistic | 0.10535 | 0.34822 |
| action-logistic | 0.10628 | 0.35624 |
| action-mlp | 0.13783 | 0.61968 |

**Action logistic now LOSES to state-only** (Brier 0.10628 vs 0.10535). Neural MLP also loses. Across this prospective evaluation the additional action feature is not reproducibly beneficial for prediction.

## Off-policy evaluation: honest action assignment, no fabricated labels

IPW/IPS values below estimate factual-window *binary hit occurrence*, with inverse propensity 1/0.5. They do not measure total kills or all-match performance. Policy values are valid only under randomization/overlap, and depend on assumptions about interference/carryover.

| Policy | Retrospective 301 windows | New-seed 568 windows |
|---|---:|---:|
| Retain original command | 0.19934 | 0.14789 |
| Toggle ADS short dose | 0.11296 | 0.17253 |
| Toggle only if hip-fire | 0.21263 | 0.15845 |
| Action-logistic greedy | 0.18605 | 0.16197 |

Cluster bootstrap 95% for greedy-minus-control: older 6-setup [-0.050955, 0.036496], new 12-setup [-0.019967, 0.045113]. **Both include zero**. The retrospective estimate is negative. These intervals are exploratory due to only 6/12 clusters and within-match dependence.

## Prospective all-match outcomes (old randomized controller, NOT learned neural policy)

| Metric | Observe shadow80 | C35-AD randomized ADS |
|---|---:|---:|
| kills | 98 | 94 |
| deaths | 7 | 11 |
| shots | 631 | 594 |
| hits | 371 | 365 |
| agentErrors | 0 | 0 |

Kill ratio randomized/observe: **0.95918**, cluster-bootstrap 95% [0.6781609195402298, 1.2211805555555553]. Deaths are higher in randomized arm. There is no validated long-horizon benefit of C35-AE because C35-AE did not control these matches.

## Engineering regression and safeguards

- Node.js **1,275/1,275 PASS** (including four frozen Python/JS forward-parity tests); original official engine **733/733 PASS**.
- Python applicable **150 PASS + 5 historical skips**, **7 historical source-SHA-lock tests intentionally excluded** without modifying their checks. These tests freeze older engine states; rerunning them on new files would fail by design.
- Prospective sources/registrations/results and the frozen neural artifact are independently SHA verified. The report includes new JSON weights, 301 exact retrospective inference vectors and 568 new-seed model score rows.
- Standalone `lab/arena/ads-value-c35ae.mjs` supports deterministic action scoring and is NOT imported into runtime controller/`page-agent.js`. Zero changes to C16/C21 assignments, firing, core engine, or all old recorded source artifacts.
- Production SHA-256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`** unchanged. Historical C35-AD `Game.step()` replay and five-mode smoke were already validated at C35-AD; C35-AE did not touch live engine logic. No new five-mode active-neural trial is claimed.

## Limitations and promotion decision

- Immediate 0.7-second hit occurrence is a *proxy* for combat strength; it ignores survival, position, map objectives and future kills.
- Randomization tests a **temporary ADS toggle** on a non-firing tick, not permanent ADS behavior or all times/modes. Other actions and priority-safety gates restrict the eligible population.
- Nearby offers and their windows may affect each other; setup bootstrap partly accounts for clustering but is not a complete trajectory-level causal model.
- Small holdout setup count; chosen action model may overfit, and the neural MLP performed poorly. No inference about unchosen factual outcomes; only randomized IPS comparisons are used.
- Prospective matches compare previous C35-AD controller with Observe, **not a deployed learned policy**. Browser integration, human opponents and long-term safety not tested.

**Decision: Engineering PASS / Frozen model reproducibility PASS / Causal action-value superiority NOT DEMONSTRATED / Neural runtime policy NOT PROMOTED.** Do not enable C36 on the evidence of C35-AE.

## Next steps

Collect larger *independent* ADS opportunities and a reward combining kills, damage taken and duration of weapon-specific engagement. Consider nonlinear treatment-effect learners and calibration by weapon/ADS baseline, preregister validation setups before tuning, and only then test an active neural controller on matched `Game.step()` combats and survival objectives.
