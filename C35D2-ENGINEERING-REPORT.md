# FPS Arena v2.9.11 — C35-D / C35-D2 Public Macro-Transition Prediction

**Date:** 2026-10-13  
**Engine:** authentic headless FPS Arena `Game.step()`, original Release `page-agent.js`  
**Decision:** predictor improves held-out prediction, but *reject `predictive80` as motor arbitration*. Research-only; C36 training/production promotion blocked.

## Executive outcome

The C35-C3 quiet-time heuristic reduced the conditional interruption fraction without preserving delivered micro-action exposure. C35-D asks whether a true data-trained **public incumbent-command transition predictor** can do better. A separate, source-locked observational cohort trained a five-feature regularized logistic probability predictor for whether the existing agent emits any priority command during the next **120 ms**. A sealed holdout demonstrated predictive gains, but low-risk-tail errors remained. C35-D2 then tested the frozen predictor as an opt-in preassignment policy under the historical C21 three-way randomizer and C16 per-tick safety gates. The motor-actuation pilot failed its exposure and reliability objectives.

**No damage/accuracy boosts, synthetic hits, game-rule changes, production-agent edits, post-assignment features, or unobserved counterfactual outcomes.**

## Phase 1: source-locked passive public-command transition collection

- **18 completed** independent TDM matches, three maps (`arena`, `neon`, `foundry`) × six trainee primary weapons (`mp5sd`, `m4a1`, `aa12`, `hk_sl8`, `uzi`, `l115a3`); each 40 seconds: **12 simulated minutes**.
- Design frozen *before* observations: SHA-256 `4547f09cdeab031886b2d7d15f392c6aa7070f817ad5037f5f6c70f9e8f54ae4`.
- Deterministic setup-disjoint train/validation/holdout: **2,624 / 923 / 1,729** completed 120 ms public command windows, total **5,276**; right-censored final windows excluded, never converted to zero-event labels.
- Strict public history features at observation time: time since incumbent command priority, preceding 500 ms priority fraction, preceding 1,000 ms priority state changes, current `aim` and locomotion boolean. Labels are assigned only from subsequent *incumbent public commands*, never server-private weapon-hit truth.
- Frozen ridge logistic model trained **once** on the training split (2,624 samples, 321 positive); validation decides eligibility; sealed six-match holdout never used for fitting or threshold tuning. `FROZEN-FORECAST.json` contains coefficients and immutable training registration.

### Passive probability prediction (held-out 1,729 rows; 185 positive)

| Model | Brier ↓ | Log loss ↓ | ECE, 5 bins ↓ |
|---|---:|---:|---:|
| Training-mean constant | 0.095789 | 0.341351 | 0.015478 |
| Fitted quiet-time-only logistic | 0.091333 | 0.318494 | 0.035013 |
| **C35-D public-history logistic** | **0.084045** | **0.301626** | **0.006234** |

Setup-cluster exploratory bootstrap (6 distinct held-out matches; 10,000 resamples):
- Brier gain vs constant **0.011744**, interval **[0.005866, 0.017890]**.
- Brier gain vs quiet-only **0.007287**, interval **[0.003098, 0.011363]**.

**Tail limitation:** Of **724** holdout samples receiving a predicted transition risk ≤5%, **46** actually observed a priority command within 120 ms (**6.35%**). A low global ECE does not guarantee calibrated conditional decisions near the safety boundary. These observational labels also do not measure micro-action interruption or actual dodge competence.

## Phase 2: frozen `predictive80` motor-action feasibility pilot

- **36/36 completed**, 18 matched map×enemy-weapon setups, two policies (`legacy80`, `predictive80`); each 90 seconds, **54 simulated minutes**.
- Source and frozen model hash locked before outcome collection: SHA-256 `ec292f930f705f071abd44864b33d486495e642b5781fa992cc351e349573d6c`.
- Predictor used to estimate a 120ms upcoming macro-priority transition probability. `predictive80` proposes an 80ms micro only if predicted risk ≤0.05, no current priority, and original symmetric C16 clearance passes; C21 hash assignment untouched, and C16 continues to check every delivered tick.
- Arm offer counts are path-dependent because selected movement changes later encounters. These are **matched setups, not identical counterfactual world trajectories**.

| Engineering metric | `legacy80` | `predictive80` |
|---|---:|---:|
| Attempted preoffers | 10,258 | 11,278 |
| C16 + research-eligible assigned offers | 152 | 70 |
| Micro-assigned offers | 107 | 48 |
| Interrupted micro | 34 | 18 |
| **Interruption per micro** | **31.78%** | **37.50%** |
| **Delivered micro ticks** | **459** | **197** |
| Delivered ticks per attempted preoffer | 0.04475 | 0.01747 |
| Hostile-hit-positive complete windows | 6 | 2 |
| Full-match shots/hits | 1,687 / 1,125 | 1,752 / 1,193 |
| Full-match kills | 214 | 222 |

The `predictive80` research arbiter rejected **208** prospective C16-eligible actions. Other preoffer rejection reasons include situations not eligible under C16; the raw total of forecast-imminent labels must **not** be interpreted as preventable interruptions. No treatment-effect claim may be derived from sparse hostile hits or full-match kills.

### Matched setup bootstrap (predictive minus legacy)

- Interruption conditional on assigned micro: **+5.72 percentage points**; 95% exploratory interval **[−7.94, +20.40] pp**, *does not demonstrate improvement*.
- Delivered micro ticks per preoffer: **−0.02728**; interval **[−0.03862, −0.01756]**, substantial exposure loss.
- Micro assignments per preoffer: **−0.006175**; interval **[−0.009179, −0.003651]**, opportunity loss.
- Research-eligible assignment rate: **−0.008611**; interval **[−0.012217, −0.005599]**.

## Verification and provenance

- Node.js tests: **1,079/1,079 PASS**.
- Official engine tests: **733/733 PASS**.
- Python tests: **22/22 PASS**.
- 5/5 headless-mode smoke (TDM, SND, Hardpoint, Battle Royale, Zombies): no errors.
- Exact C35-B historical 120s replay reproduced same dataset SHA-256 `14ea0cca4b335e167511b407abee260f286d0e3f2bff915b2e38470f72f1bddc` **byte for byte**.
- Independent C35-D2 verifier: locked code/model hashes match, 36 datasets and result hashes match, **0 C21 assignment mismatches**, assignment ↔ eligible preoffer linkage, strict C16 all-three-arm preassignment, unchanged backend/server labels, unknown risk kept unknown.
- Original production `page-agent.js` SHA-256 **`6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**.

## Decision

**C35-D shadow predictor: meaningful observational improvement, retain as research instrumentation. C35-D2 predictive motor controller: reject.** Do not enable it in production, do not start C36 training, and do not infer better dodge ability from the forecast metric. Retain `legacy80` as the engineering comparison and the actual production agent unmodified.

### Next research direction: C35-E (not implemented)

A pre-registered next experiment must treat **delivered micro ticks per attempted preoffer** and firing opportunity preservation as co-primary outcomes, rather than filtering the offer population until conditional interruptions look small. More credible next tests include: predictor calibration conditioned on **C16-eligible** decision points; detection of priority *transitions* rather than generic future priority; explicit weapon phase (shoot/reload) in public history; shadow-only routing through macro-option boundaries; and separate precommitted held-out maps and opponent profiles. Any predictive model update must get an entirely new training/holdout split and independent motor pilot, not tuning on C35-D2 failures and reporting the same matches as confirmation.

## Reproduction

```bash
# Existing frozen passive observational artifacts; do not rewrite after changing registered sources
python scripts/c35d_transition_model.py reports/c35d/public-transition-pilot
python scripts/c35d_holdout_audit.py reports/c35d/public-transition-pilot

# Source-locked C35-D2 motor pilot; only rerun with byte-identical source/forecast
python scripts/run-c35d2-pilot.py
python scripts/verify-c35d2.py
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
```

Two separate ZIPs carry full frozen observational and motor evaluation traces, preregistrations, raw datasets and independent verification files. The main source ZIP contains the opt-in C35-D2 model and runner, not the bulky raw match datasets. Research features are disabled by default.
