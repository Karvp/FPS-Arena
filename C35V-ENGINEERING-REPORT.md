# FPS Arena v2.9.11 — C35-V Factual Movement-Value Dataset and Offline Neural Predictor

Date: 2026-10-13. **ENGINEERING PASS / MLP OFFLINE ONLY / POLICY NOT PROMOTED / C36 FULL ACTION-VALUE RL BLOCKED**.

## What changed

This pass implements a *real* feed-forward neural predictor for the **factual outcome of already-executed movement commands**, rather than misrepresenting hand-coded alternatives as causal Q-values. C35-V `lab/arena/movement-value-observer-c35v.mjs` hooks **before Game.step()** to record a candidate menu of 8 movements, public distance/angle/snapshot freshness, weapon damage-range band, own client state and the actual command. No authoritative server outcomes enter that routine. Only **after Game.step()** does the sidecar receive cumulative own shot events, own hit events, kills and damage taken; it labels the action actually applied over the subsequent 30 ticks (0.5 seconds). End-of-match windows are *censored*, never relabeled as misses. Every unexecuted alternative has `factualOutcome: null`. `heuristicValue` is merely a public-geometry distance/continuity heuristic and is NOT a measured return.

The offline **18-input, 16-tanh-unit MLP** is trained using NumPy (deterministic initialization and optimizer) to forecast `hitWindow` in the subsequent 0.5 second observation window. Public input features: distance, snapshot age, aim angle, local HP, visible hostiles count, firing/ADS intent, weapon-range band, original radial component and heuristic, three weapon-category one-hot variables and four movement-key indicators. **No opponent/server outcome labels, shot ledger, future position or real-world oracle enters the model input**. The resulting weights are serialised at `reports/c35v/factual-value-24-v1/models/FROZEN-MLP.json` and are not loaded anywhere in a controller, page-agent or runtime production agent.

The new opt-in CLI (`--c35v-trace`, `--c35v-setup-id`) is allowed only with C35-U observe/balance + original shadow80 and C35G/H observe audit. C35-V has no `command()` method, produces no input command and cannot affect gameplay. The prior C35-U balance branch remains research-only.

## Registered TDM experiment

Primary two-arm design SHA-256: `ac84fbd9ea981a9092ede676de798920873eb771905140f56fd56618527b4538`. 12 independent map–weapon–seed setups, exactly paired **C35-U observe and balance**; 24 matches × 75 seconds = **30 simulated minutes**. Maps: Arena, Neon and Foundry; weapons AA-12, MP5SD and M4A1; lag: 65, 125, 215 ms; official/mixed/stress bot opponents. A separately preregistered 12-match original **`release` (zero research flags)** supplement raises the comparison to **36 TDM / 45 simulated minutes**. The official shipped `page-agent.js` has unchanged SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` for all arms.

| Metric | v2.9.11 original release | C35-U observe (shadow80) | C35-U balance (shadow80) |
|---|---:|---:|---:|
| Kills | 39 | 64 | 66 |
| Deaths | 4 | 7 | 11 |
| Authoritative own shots | 377 | 479 | 461 |
| Server own hit events | 238 | 346 | 354 |
| Macro direction-modified ticks | 0 | 0 | 371 |
| Agent errors | 0 | 0 | 0 |

Isolated old C35-U motor treatment is **balance vs observe**, not C35-V itself: bootstrap resampling 12 matched setups yields kills ratio 95% interval [0.7352941176470589, 1.3962264150943395] and deaths ratio [1.1, 3.5]. None justifies promoting Balance. Observe/release comparison includes preexisting C21/C16 randomized micro-action and cannot be attributed to C35-V.

## Genuine factual data and data limitations

- 24 matched C35-V research matches, 18000 scheduled sampling ticks and **1933 eligible public-geometry windows** (10.7% of scheduled samples). `counts.stale` in this version is a *legacy name for every refused sample*, including priority/movement and target/geometry problems; **it must NOT be reported as a pure stale-snapshot count**. Improve the reason-specific count next pass.
- **1924 factual windows resolved**, **9 censored**, and **15464 unexecuted action-menu entries all containing `factualOutcome:null`**. They cannot be used as target Q labels.
- Overlapping 0.5s windows from nearby decisions cause substantial within-match dependence. Analysis and holdout use setup groups, NOT random shot/pellet/tick splitting. Each arm's actual outcome is observational and confounded by target/hazard state and past actions. It is not an off-policy unbiased counterfactual value estimate.
- No physical browser/real network latency, human opponents or natural dynamic-cover exposure. Weapon-band safety uses static public boxes; dynamic foam is not incorporated. Candidate enumeration may not include every action variant; only safe/continuous directions are assigned finite proxy scores. The formal movement-control guard remains separate from C16 micro authorization.

## Deterministic neural training and holdout

Group split by setup (both arms of each setup kept in same partition): **train 941 rows / six setups**, **validation 330 rows / three setups**, **sealed holdout 653 rows / three setups**. All stats for feature standardization are fit only on train; checkpoint epoch selected on validation (epoch 64); holdout untouched by model choice. Re-running training reproduces exact model SHA-256 `aad3ee3d0aff82c080d5d53eeeaf9a7145622cd1bba538a54975bc3cb37ba520`.

Target: binary `server own hit events > 0` in 30 authoritative ticks **after** public action observation. On the held-out setup groups:

| Held-out metric (lower is better) | Train-rate constant | Offline MLP |
|---|---:|---:|
| Brier score | 0.160639 | **0.087646** |
| Log-loss | 0.505466 | **0.310168** |
| Positive windows / held-out rows | 120 / 653 | same labels |

Descriptive difference in Brier (constant minus MLP): 0.072993. A 4,000-resample *three-setup* bootstrap produced [0.07094998357470461, 0.07935788168737462], but this is **not a convincing generalization or causal confidence interval**: only three independent holdout clusters, selection bias for eligible windows, many overlapping samples. A useful predictor for a *factual* hit window need not rank safe alternatives correctly, predict kills or reduce deaths. This small predictor remains entirely offline; **C36 full action-value / reinforcement-learning policy training is blocked** pending counterfactual data, randomization/propensity and control-level non-inferiority.

## Engine, safety and reproducibility checks

- Original C21 assigned offers = **85**; assignment-hash mismatches **0**. Server shot reconciliation mismatches **0**. Controller fire suppression/injection **0/0**; agent errors **0**; malformed rows **0**.
- Native Node test suite **1,206 / 1,206 pass** (including 7 new C35-V observer tests); official game engine **733 / 733 pass**; five gameplay smoke modes TDM/SND/HP/BR/Zombies **5/5 and zero agent errors**.
- Python: complete run on edited C35-V source showed **3 expected SHA-locked historical identity failures** for checkpoints C35-Q and C35-U, plus 5 historical skips. Re-run excluding *only those three* gave **108 pass / 5 skip** across 113 executed tests (including five added C35-V tests). The unchanged C35-Q checksum tests passed **10/10** on original C35-Q, unchanged C35-U checksum tests passed **6/6** on original C35-U. Logs for both the initial failures and original-version validation are provided; no hidden false claim of full-suite pass.
- Same-seed **42-second OFF/ON replay**: C35C dataset, C35G fire, C35H macro, C35U motor sidecars are **byte-identical**; gameplay results equal after ignoring C35-V-only counters and report generation timestamp. See `evaluation-runs/parity/PARITY.json`.
- Experimental registrations, case SHA-256 and all outputs are preserved; no previous reports overwritten. Full source and raw-evaluation ZIPs receive CRC verification and a SHA-256 manifest.

## Next research gate

**C35-W — Causal Action-Value Teacher:** collect explicit randomized alternative actions in *strictly C16-safe windows*, log propensity and selection before any server outcome, compare same-seed rollout with rollback-safe engine state or prospective randomized assignments, and audit support/overlap. Do not treat `heuristicValue` or unobserved alternative outcomes as labels. Evaluate a heldout teacher offline and reject if counterfactual performance or 95% non-inferiority limits fail. Release production remains exactly v2.9.11; this model is not an aimbot or online predictor.
