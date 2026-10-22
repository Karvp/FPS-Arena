# FPS Arena v2.9.11 — C34 Long Research Checkpoint
## Real-Match State Capture, Provenance Audit and Sealed Factual Threat Prediction

**Date:** 2026-10-13  
**Parent:** C33. **Status:** research-only; no production policy promotion.  
**Production `page-agent.js` SHA-256:** `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (identical to C33).

### Executive decision

**Pass:** real headless `Game.step()` state logging, client/server information separation, long fixed-seed validation, and validation-selected *factual future-hit* logistic prediction outperforming constant frequency baseline on a sealed 18-match test.  
**Not passed / not attempted:** a learned policy selecting the best dodge action. Factual labels from one executed movement are **not three-arm counterfactuals**. No policy trained from this dataset is authorized for deployment.

This checkpoint addresses C33's key gap: earlier map-realistic scenes were constructed around static obstacles, not observed while the bundled Autopilot controlled a real running `Game.step()` match. It does **not** claim to replay alternate futures from a captured single-world state.

### Implementation

- `lab/arena/real-encounter-observer-c34.mjs`: passive observation-only collector, fixed 1.8-second nonoverlapping windows, per-window delayed client-visible enemy world position/body yaw/weapon, locally synchronized own predicted coordinates/velocity/HP/armor, incumbent commands, C16 eligibility, nearby public map AABBs. It attaches authoritative opponent position/weapon, tick and actual command **only after the original command is selected**. Server-confirmed hostile weapon hits and inflicted HP/armor damage are added during the future observation window.
- `lab/arena/train-main.mjs`: opt-in `--c34-dataset PATH --c34-enemy-primary ID` in a single headless TDM match. Opponent primary is assigned **before** gameplay starts to diversify enemy weapon exposure; it changes the headless experimental environment, **not** shipped bot behavior. No intervention or exploratory commands are applied.
- `scripts/run-c34-real-matches.py`: first preregistered 54-match map × enemy weapon × opponent-policy cohort, three snapshot lag levels 35/65/125 ms, 90 s each; source/agent hashes locked before running; integrity-checked result+dataset pairs.
- `scripts/collect-c34-extra-train.py`: **explicitly adaptive** additional 18-match *training-only* cohort triggered when the initial 18 train matches had 31 positive windows against a preregistered minimum of 40. The fixed original validation and sealed test seeds remained unchanged.
- `scripts/evaluate-c34-real-state.py`: independent provenance/window/causality checks, train/validation-only model fitting and model freezing (`fit`), and separately executed one-time sealed test (`test`). Features are **public observation-derived only**. Models: constant hit frequency, three regularized logistic regressions, three genuine single-hidden-layer neural MLPs (12 neurons). Model choice by lowest **validation Brier**, not test outcome. Game/match-cluster bootstrap (2,400 repetitions) for paired Brier difference. No A/B intervention inference.
- `tests/real-encounter-c34.test.mjs`: 13 focused regressions, including pre-vs-post data boundary, censoring, callback timing, local geometry copying, and sample-overlap constraints.

### Fixed-seed simulation and factual data

| Stage | Independent matches | Duration / match | Complete 1.8 s windows | Windows with hostile weapon hit |
|---|---:|---:|---:|---:|
| Original training | 18 | 90 s | 881 | 31 |
| Adaptive training addendum | 18 | 90 s | 881 | 26 |
| Original validation (unchanged) | 18 | 90 s | 882 | 53 |
| **Sealed test (unchanged)** | **18** | **90 s** | **882** | **45** |
| **Total** | **72** | **108 game minutes total** | **3,526** | **155** |

All 72 sessions completed; zero agent runtime errors. The log includes 138 observation windows whose original input passes C16's unchanged safety gate. This is an **opportunity statistic**, not treatment. All 3,526 windows are complete; sampling and end-time boundaries mean no censored window in this particular cohort. Most observations show at least one nearby genuine map AABB. Average per-match mean displacement of the enemy's delayed public position from simultaneous server truth is about **0.36 m**; this quantifies client lag/interpolation deviation, *not* a targeting error.

The original 54-match preregistration was finalized before gameplay data collection. After seeing only the training-positive count shortfall, the extra 18 *training* games were added as a separately registered **adaptive protocol amendment**. This must not be conflated with one immutable 72-game preregistration. The prior test cases were not opened for model selection or tuning.

### Factual threat prediction — validation-selected model

Input features (23 numbers): public own–enemy relative distance and displacement, local vx/vz, enemy **body yaw** sine/cosine (not secret shooting aim), current hp/armor, snapshot age, local nearby static-map box count, public C16 eligibility, incumbent fire/aim, map one-hot (3) and enemy weapon one-hot (6). No future hit/damage, server ground-truth position, actual enemy aim, or alternative-action outcome is supplied to a predictor.

| Predictor | Validation Brier ↓ | Sealed test Brier ↓ | Sealed test log loss ↓ |
|---|---:|---:|---:|
| Training-frequency constant | 0.057249 | 0.048766 | 0.206265 |
| **Logistic, C=0.3 (selected on validation)** | **0.051092** | **0.042082** | **0.171834** |
| Neural MLP, selected neural seed=11 (diagnostic) | 0.054156 | not selected | not promoted |

The other neural MLPs have validation Brier 0.058504 and 0.057206. All three reached their configured maximum of 170 training iterations without fully converging; no additional tuning was conducted after test opening. Frozen logistic selection preceded test access.

**Sealed test:** 18 complete independently seeded matches; 882 windows, 45 future hostile-hit windows. Absolute Brier improvement of the selected logistic over the training-frequency constant is **0.006683**. Paired match-cluster bootstrap 95% **[+0.001864, +0.012422]** (2,400 resamples). This is positive for the *specific factual prediction task and test distribution*, not proof of model calibration on live human opponents.

**Map-specific caution:** test Brier improves on Arena **0.042403 → 0.035568** and Foundry **0.083760 → 0.069588**, but weakens on Neon **0.020134 → 0.021092**. Enemy-weapons with few hits also have uncertain individual estimates. Multiple exploratory subgroups were inspected *after* the locked test, with no model re-selection. The C34 baseline is only the preregistered training-frequency constant; more competitive map/weapon-aware baselines still need prospective validation before any promotion beyond further research.

### Independent replay and smoke checks

- `1000/1000` AI unit and regression tests, including 13 C34-specific tests.
- `733/733` official upstream game tests, plus successful `node tools/check.js`.
- Five-mode unchanged-production 12-second smoke: TDM, SND, HP, BR, Zombies; `5/5` without runtime errors.
- Same-seed controlled-opponent control parity: C34 passive recorder vs C31 **baseline-only** reference, **18/18 gameplay indicators identical**. This is a targeted parity check, not a proof of universal equivalence.
- Re-running 90-second match 000 produced a **byte-identical C34 telemetry JSON**.
- Source fingerprints match the original registration and adaptive addendum; every stored match has matching seed, lag, map, controlled opponent weapon and opponent policy.
- Rebuilt `page-agent.js` SHA-256 unchanged from C33; no production behavior edits.

### Critical limitations

1. **Single executed action, not counterfactual.** The observed damage after command selection does not tell what would have happened under a different command; causal dodge value cannot be trained from these factual labels alone without additional identification assumptions or branching actual server state.
2. **Headless local-state oracle in adapter.** The simulator directly synchronizes the trainee's own predicted state from the authoritative server before control, while remote opponents still follow delayed packets. Thus own-coordinate fidelity is artificially optimistic compared with real-browser/network play.
3. **Controlled opponent loadouts.** All bots may receive the chosen research primary rather than organic loadouts. This improves weapon coverage but changes the distribution of matches; no extrapolation to humans.
4. **Snapshot timing vs real client rendering.** Delayed buffers and the headless camera differ from an actual rendered client with loss/jitter/interpolation.
5. **Relative window dependence.** Windows are nonoverlapping but game states and strategies within a match are autocorrelated. The bootstrap uses entire games, not shots/windows as independent units.
6. **Positive-label scarcity.** 155 positives among 3,526 complete windows, with heterogeneous prevalence between train, validation and test; neural model scores/early stopping are fragile.
7. **Model interpretation.** Logistic's better Brier need not imply an effective evasive action. No alternate-arm comparison, matched-policy trial, actual shot avoidance advantage, or production deployment occurs in C34.

### Gate decisions

| Gate | Decision |
|---|---|
| Real-Game.step logging and public/private barrier | PASS in headless research |
| 3 maps × 6 controlled enemy primaries × 3 opponent policies | PASS |
| 54 original matches plus explicitly adaptive 18 train | PASS with amendment disclosure |
| ≥ 40 positive windows in training, ≥ 10 validation and test | PASS (57 / 53 / 45) |
| ≥ 1,500 complete windows | PASS (3,526) |
| Validation-selected factual predictor better than training-frequency baseline in sealed test | PASS (Brier) |
| True neural action-value superiority over simple heuristic | **NOT DEMONSTRATED** |
| Full-match randomized combat-policy improvement | **NOT TESTED** |
| Production promotion or GitHub push | **NO** |

### Reproduce

```bash
cd fps-c34-work
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
# Existing prereg plans reject replacement: --resume re-verifies only identical source/plan.
python scripts/run-c34-real-matches.py --resume --workers 4
python scripts/collect-c34-extra-train.py
python scripts/evaluate-c34-real-state.py fit
python scripts/evaluate-c34-real-state.py test
```

**Next sensible checkpoint:** prospectively benchmark the fixed factual predictor against map- and weapon-conditioned frequency baselines, and gather *actual randomized action trials* at eligible encounters or controlled forks of complete server state. Do not mistake delayed client telemetry plus server outcomes for evidence that neural dodging is effective.
