# FPS Arena v2.9.11 — C35-Z: Precision Exploration Eligibility

Date: 2026-10-14. Decision: **ENGINEERING PASS / EXPOSURE PASS / COMBAT POLICY REJECTED**.

## Executive finding
The C35-Y randomized movement observer reported zero eligible offers for both HK SL8 and L115A3. This was not a demonstrated absence of safe movements. The original `weaponBandC35U` returned `null` for all `Marksman` and `Sniper` weapons and the C35-V menu combined that failure with other reasons as `motion-or-priority`. C35-Y counted **21,561 HK SL8** and **21,571 L115A3** checked ticks, both with **0 offers**.

C35-Z fixes *the research-only action menu*, not the production combat policy. The opt-in `--c35z-precision-explore` enables static-metadata-derived precision weapon bands, a public-only guard breakdown, conservative no-redirect-while-firing, and unchanged safe one-tick assignments at probabilities **0.6/0.2/0.2**. Old experiments remain unchanged when the flag is absent. There is no artificial counterfactual label, and no server outcome enters assignment.

## Source changes
- `lab/arena/precision-exploration-c35z.mjs` — frozen weapon metadata-based Marksman/Sniper bands and public motion/priority blocker diagnostics; refuses a firing-frame redirect.
- `lab/arena/movement-value-observer-c35v.mjs` — **optional** `precisionResearch` branch; legacy default untouched; keep static geometry, fresh target, continuity and two-safe-alternatives safeguards.
- `lab/arena/causal-action-teacher-c35w.mjs` — optional `exploration='c35z'`; retains independent C35-Y hash assignment and documented propensity; only the chosen action receives post-step factual outcomes.
- `lab/arena/train-main.mjs` — explicitly gated `--c35z-precision-explore` headless TDM, only with HK SL8/L115A3 and C35-W randomized source; not exposed by `page-agent.js`.
- `tests/precision-action-exploration-c35z.test.mjs` (6 targeted cases), `tests/test_c35z_precision.py` (8 targeted checks), frozen runner, independent audit, matched analysis, and validation artifacts.

## Preregistration and engine cohort
`reports/c35z/precision-36/FROZEN-DESIGN.json` is hash-locked before executing, registration SHA-256 `5b4d09b35f15e7813400765aae586b65604794006cb453a5c755f6a0b6177ba6`. **12 independent map×seed×weapon×lag setups**, each crossed across `release`, `observe`, `precision` over 75 seconds: **36 real headless `Game.step()` matches, 45 game-minutes**. Six setups each for HK SL8 and L115A3, three maps, lag 70/150/215 ms. All outcomes come from authoritative engine match outputs.

| Metric (all 12 setups) | Original `release` | `shadow80` Observe | C35-Z Precision |
|---|---:|---:|---:|
| Kills | 186 | 147 | 144 |
| Deaths | 0 | 2 | 3 |
| Shots | 595 | 583 | 568 |
| Hit events | 362 | 312 | 316 |
| Agent errors | 0 | 0 | 0 |

Paired 6,000× setup bootstrap, 95% ratio Precision/Observe **kills [0.8594, 1.1043]**, shots **[0.8449, 1.1155]**. The kills difference CI is **[-20,+14]** for a 12-setup resample. **No evidence of improved combat.** Zero deaths in the original `release` denominator prohibit interpreting a deaths ratio vs `release`.

### Weapon-specific outcomes
| Gun | Arm | Kills | Deaths | Shots | Hits |
|---|---|---:|---:|---:|---:|
| HK SL8 | release / observe / precision | 93 / 91 / 92 | 0 / 1 / 2 | 466 / 503 / 486 | 266 / 254 / 261 |
| L115A3 | release / observe / precision | 93 / 56 / 52 | 0 / 1 / 1 | 129 / 80 / 82 | 96 / 58 / 55 |

**Never attribute overall differences vs `release` to C35-Z alone**: `release` and research `shadow80` also differ in the pre-existing C21 research micro-controller. The C35-Z treatment is the difference **Precision vs Observe** at each paired setup.

## Eligibility and safe exploration
| Gun | Legacy C35-Y offers | C35-Z offers | C35-Z executed alternatives | Precision probes |
|---|---:|---:|---:|---:|
| HK SL8 | 0 | 79 | 38 | 24,191 |
| L115A3 | 0 | 46 | 16 | 25,382 |

Independent recomputation **125/125 precision assignments**, **90/90 C21 assignments**, **54 real one-tick motor redirects**, **124 completed factual windows**, 1 end-censored. 71 control, 23 alternative A, 31 alternative B. The precision policy never adds or removes `fire`, and all unselected outcome fields are null.

Primary refusal causes across C35-Z research probes are real public-geometry/stance states, not a missing weapon category: HK SL8 static LOS 13,499, stance/air 7,013; L115A3 static LOS 17,134, stance/air 6,863. Counts are diagnostic **per attempted probe** and must not be interpreted as independent trials or as server-side shot feasibility.

## Regression and compatibility
- Full Node tests: **1,226 / 1,226 PASS**.
- Official authoritative engine tests: **733 / 733 PASS**.
- Applicable Python tests: **136 PASS, 5 historical SKIP**; five historical source-SHA locked test cases excluded rather than rewritten because this checkpoint intentionally changes source.
- All five modes TDM/SND/HP/BR/ZM: smoke PASS, zero agent errors.
- Existing C35-Y `observe` case `c35y-00-observe`: `dataset`, `fire`, `macro`, and `random` traces **byte-identical** with and without C35-Z code; match result exactly equal except creation timestamp.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (unchanged).

## Interpretation and next stage
C35-Z **recovers coverage** for previously excluded precision weapons without modifying production, C16/C21, shot command, or pre/post-step causality. But randomized redirection does not beat Observe on TDM; sample size, one-tick interventions, selection into eligibility, and 0.5-second overlapping downstream decisions limit action-value identification. Do **not** promote an action-conditioned neural model. C35-AA should study a stronger, action-specific state representation, precision weapon aim/ADS movement effects, and separate safety-aware holdouts; train only after independent assignment support expands. **C36 remains research-gated.**

## Reproduce
```
python scripts/run-c35z-precision.py
node scripts/verify-c35z-independent.mjs
python scripts/analyze-c35z-precision.py
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/source-main/test/run.js
python scripts/run-c35z-python.py
```
The frozen runner will validate source hashes before reusing already recorded match files; changed code requires a new preregistration, not overwriting the cohort.
