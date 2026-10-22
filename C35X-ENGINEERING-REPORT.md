# FPS Arena v2.9.11 — C35-X: Action-Conditioned Neural Value Research

**Date:** 2026-10-14  
**Outcome:** Data/engineering PASS; offline action-conditioned MLP/logistic trained, independently reproduced; combat and model-control promotion REJECTED.

## Objective and integrity

Expand C35-W's propensity-known short randomized motor trials, preserving exact production `page-agent.js` and existing C21/C16 scheduling. Fit action-conditioned predictors of **observed** server hit events within a 30-tick window; compare to (a) constant-prevalence and (b) state-only prediction. Never impute a reward for an action that was not assigned. Avoid claiming estimates constitute identified long-horizon causal Q(s,a). The policy is not integrated for inference into live gameplay.

### Pre-registration incident

C35-X v1 proposed 18 setup-matched triples, six guns and 90 seconds each, but `hksl8` is not a valid engine weapon ID. The engine rejected those rows. **Keep v1 frozen design, logs and partial valid files as a failed experiment; never silently edit that registration or mix valid v1 rows into v2.** The corrected pre-registration v2 uses the engine's actual ID `hk_sl8` and has its own fresh source-lock hash. C35-X v2 completed all 54 matches. The v1 source is retained for audit, not for estimation.

## Experiment

- **54/54 TDM matches**, 18 setup clusters × original `release` / `shadow80` observe / `shadow80` randomized × 90 seconds = **81 simulated minutes**.
- Maps: Arena, Neon, Foundry. Guns: AA-12, MP5SD, M4A1, HK SL8, Uzi, L115A3. 65/125/215 ms lag; official/mixed/stress opponents.
- Safety: C35-W one-tick, deterministic assignment: incumbent 0.8, alternative-A 0.1, alternative-B 0.1, with locally pre-screened public movement menu, no upstream command conflicts. All observed labels arrive after `Game.step()`.
- 179 randomized eligible decisions: **138 control / 21 alternative-A / 20 alternative-B**. 41 altered motor ticks, 177 factual completed windows, 2 right-censored. 179/179 C35-W and 179/179 C21 assignments independently recomputed; SHA of preregistered sources and every match file checked. 0 fires altered; 0 agent errors; 0 nonassigned rewards manufactured.
- Two guns had **zero randomized alternative exposure** in v2: HK SL8 and L115A3, so no action-effect inference there.

## TDM comparison (new v2 cohort; 18 matched setups)

| Metric | v2.9.11 original release | shadow80 observe | C35-X randomized |
| --- | ---: | ---: | ---: |
| Kills | 158 | 205 | 198 |
| Deaths | 11 | 15 | 10 |
| Server shots | 842 | 1,144 | 1,130 |
| Hit events | 547 | 732 | 693 |
| Actual C35-W alternative ticks | 0 | 0 | 41 |
| Agent errors | 0 | 0 | 0 |

For **randomized versus observe**, paired 5,000-resample **setup-cluster** bootstrap 95% CIs: kills ratio **0.86264–1.06711**, deaths ratio **0.40000–0.88235**; shots **0.87416–1.10608**. These exploratory intervals do not establish an optimal or safe policy. Macro differences are not attributable to the newly trained C35-X models, which were NEVER used for gameplay. Contrasts with release also include the preexisting C21 motor experiment, and therefore are not evidence of production neural gains.

## Offline action-conditioned learning

Sources: complete independent C35-W cohort (244 completed randomized windows) plus new C35-X v2 (177) = **421 completed factual assignments**. 85 executed alternative actions (44 old + 41 new). The two unchosen actions remain `unknown` for each sample. Features comprise 11 frozen public state values, 6 weapon indicators, 4 assigned motor keys, 3 assigned arm indicators, and 2 public pre-step heuristic values — **26 features** total. Assignment probabilities are recorded and checked separately; server hit labels do not appear in model inputs.

Split: by preassigned setup suffix mod 5, not by randomized individual shot/pellet/window. From 30 registered clusters, observed nonempty: **15 train setup clusters (302 rows), 5 validation (49), 4 holdout (70)**. Hyperparameters of logistic state-only, logistic action-conditioned and 12-hidden-unit action-MLP were selected ONLY with validation Brier score; one holdout evaluation afterwards. Train-only means and scales; frozen JSON weights, reproducible independent math inference.

| Holdout, 70 actual windows | Brier ↓ | Log-loss ↓ |
| --- | ---: | ---: |
| Constant train-prevalence baseline | 0.215775 | 0.623113 |
| State-only logistic (no assigned action) | **0.043479** | **0.146728** |
| Action-conditioned logistic | 0.043711 | 0.164836 |
| Action-conditioned neural MLP (26 inputs, 12 hidden) | 0.055792 | 0.199005 |

**Action conditioning fails to beat the state-only baseline.** Fixed-predictor, paired bootstrap at 4 nonempty holdout setup clusters: action-logistic minus state-only Brier 95% CI **−0.000076 to +0.000409**; MLP minus state-only **+0.000430 to +0.018057**. These intervals omit retraining uncertainty; 4 independent holdout clusters, including just 16 treated examples, are inadequate for robust generalization. Sklearn MLP lbfgs emitted convergence warnings for two candidate hyperparameters at the predeclared 400-iteration cap; the warnings were retained, not hidden. No neural policy promotion.

### Offline artifacts and reproduction

- `scripts/run-c35x-pilot-v2.py`: source-locked, 54 matches, resumable output hashes; `scripts/run-c35x-pilot.py`: archived rejected v1 registration, with its logs.
- `scripts/verify-c35x-independent.mjs`: independent SHA/C21/C35-W/propensity/censoring/command guard verification.
- `scripts/analyze-c35x-pilot.py`: matched setup-level TDM summaries and bootstrap.
- `scripts/train-c35x-action-value.py`: deterministic setup split, validation-only hyperparameter search, state-only baseline and offline MLP/GLM training.
- `scripts/verify-c35x-frozen.py`: replays JSON weights without sklearn. 70/70 predictions agree, maximum absolute delta **4.94e-10**.
- `reports/c35x/expansion-54-v2/`: raw match results, original C35C/G/H/W traces, logs, design, audit and CSV.
- `reports/c35x/action-value-v1/`: frozen weights, holdout predictions, evaluation and inference parity.
- `tests/test_c35x_action_value.py`: eight focused Python checks.

## Regression and caveats

- Node.js **1,214/1,214 PASS**; official engine **733/733 PASS**; Python applicable **119 PASS, 5 documented SKIP**, excluding **4 historical source SHA lock cases** designed to check the original C35-Q/U/V trees. Running the entire unfiltered Python suite on new source produces 4 expected source-SHA failures (128 tests total); never misreport it as a fully green suite. New C35-X tests 8/8 PASS.
- Game smoke across `tdm,snd,hp,br,zm` = **5/5**, agent errors 0. Initially using the UI name `zombies` in CLI failed fast; `zm` is the correct engine mode. Corrected smoke passes.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, unchanged.
- Windows are sequential within matches; multiple outcomes can share combat events. Randomizing one motor tick identifies only a limited assignment effect under eligibility/exposure, not the counterfactual payoff of all actions in all possible states. Small and uneven treated coverage, especially long-range guns, blocks C36 motor deployment.

**Decision:** C35-X ENGINEERING PASS / OFFLINE NEURAL TRAINING PASS / ACTION-CONDITIONED MODEL SUPERIORITY FAIL / COMBAT POLICY NOT PROMOTED. Next: enrich actions under safe policies with independent setup coverage and evaluate live policy only after a stronger held-out causal decision gate.
