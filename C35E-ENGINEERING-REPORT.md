# FPS Arena v2.9.11 — C35-E: Opportunity-Preserving Forecast Calibration

**Date:** 2026-10-13  
**Stage:** engineering + observational research completed; **NO combat-efficacy claim or motor promotion**  
**Base:** source C35-D2, authentic headless FPS Arena `Game.step()`, unchanged release `page-agent.js`.

## Decision

**Retain the frozen C35-D public-priority forecaster as shadow telemetry; reject its existing 5% threshold as a micro-action veto.** C35-D2 reduced completed micro exposure from 459 to 197 ticks over 18 matched setups, and increased conditional interruption from 31.78% to 37.50%. C35-E tests the more conservative hypothesis that recording public 120-ms priority forecasts *without vetoing any C16-eligible actions* permits opportunity-preserving measurement on the population that would actually act.

C35-E is **not** a new motor policy that dodges bullets better. Its `shadow80` policy directly inherits `legacy80` C21/C16 actuation, under an opt-in research mode, while making a separate predecision forecast and *later* observational labels. The production agent remains untouched.

## Implementation

- `lab/arena/opportunity-preserving-shadow-c35e.mjs`: `OpportunityPreservingShadowC35E` subclasses the C35-C3 integrated controller, internally fixing actuation policy to the historical `legacy80`. The forecast cannot enter `candidateSetC16`, change the original command, move the assigned C21 ordinal, or cancel an offer.
- `lab/arena/train-main.mjs`: opt-in `--c35c-policy shadow80`, requiring an explicitly supplied validated frozen C35-D2 logistic model. All historical flags and paths remain unchanged.
- At **every** attempted preoffer, record public predecision forecast risk and assignment. **After** the opportunity, label any original incumbent priority command and quiet→busy transition within 120 ms from only future *public commands*. Complete windows require the full horizon. Incomplete windows have `futurePriority=null` / `futurePriorityEdge=null`; they are not silently counted as negative examples.
- The raw dataset retains each tick's *original public priority status* for independent reconstruction, not as a feature available before assignment.
- Registration, actual outcome data, frozen model SHA-256 and all source files are hashed. Scripts `run-c35e-shadow.py` and `run-c35e-heldout.py` implement non-overwriting, registered studies; `verify-c35e-shadow.py` and `verify-c35e-heldout.py` independently audit original C21 hash assignments, future-label temporal boundaries and integrity.

## Experiment A — historically matched, gameplay-parity check

- **18/18 real server-loop TDM matches**, 18 map × weapon setups, 90 seconds each = **27 simulated minutes**; same seeds, lag, opponents and maps as historical C35-D2 `legacy80` games.
- Historical source is reused **for parity only**; this is not an independent confirmatory cohort, and no forecast threshold is tuned here.
- **All 18 matched game aggregates, offers, preoffer eligibility timestamps, actual first commands, execution tick counts and observed outcome labels matched historical `legacy80`.**
- 10,258 attempted preoffers; 152 C16-eligible assignments; 107 randomized micro-actions, 34 interruptions, **459 executed ticks**; 1,687 shots and 214 kills, exactly matching historical games.
- 152 complete C16-eligible public-priority windows: **23/152 (15.13%) observed a future public priority command**, predicted average risk **16.05%**, Brier **0.11047**.
- Prediction ≤5% group: 3/46 (6.52%) observed priority vs 4.30% mean predicted; >5% group: 20/106 (18.87%) vs 21.15% mean predicted.
- Conditional micro interruption: ≤5% risk 8/32 (25.00%), >5% risk 26/75 (34.67%); high-minus-low +9.67 pp with exploratory 18-setup bootstrap CI **[−8.43,+26.19] pp**. Cannot establish a useful causal scheduling rule.

## Experiment B — independent seed holdout (new, longer)

A second, **pre-registered** cohort used 18 new seeds (none reused from experiment A), three actual maps × six controlled enemy primary weapons, shuffled snapshot lag and opponent policies. The old frozen predictor was neither refitted nor re-thresholded before this run.

- **18/18 actual TDM games**, 120 seconds each = **36 simulated minutes**.
- 13,857 attempted preoffers; 187 C16-eligible assignments; 124 randomized micro-actions; 31 interruptions; 540 delivered micro ticks; 2,383 shots; 314 kills; 0 agent errors.
- 186 C16-eligible windows completed the full 120-ms observation horizon; the remaining eligible window is correctly censored.
- Eligible: **27/186 (14.52%) future priority**, average forecast **13.88%**, Brier **0.11225**, setup bootstrap 95% **[0.07797, 0.14700]**.
- Forecast ≤5%: **5/75 (6.67%) priority observed**, average model risk 4.26%; forecast >5%: 22/111 (19.82%), average model risk 20.38%.
- Micro interruption by forecast cohort: ≤5% **9/47 (19.15%)**; >5% **22/77 (28.57%)**; high-minus-low +9.42 percentage points with setup bootstrap 95% **[−1.14, +19.65] pp**. Zero remains plausible.
- This cohort is **seed-disjoint, not map-disjoint**, and observational labels are correlated within matches. Holdout metrics do not establish improved combat ability or the safety of rejecting actions using risk.

**Combined descriptive volume:** 36 completed matches, **63 minutes of server simulation**, 24,115 prospective attempted preoffers, 339 C16-eligible assignments, 231 micro-actions, 999 executed ticks. Of 121 *completed, C16-eligible* forecasts at ≤5% risk, **8 future priority events occurred (6.61%; unclustered Wilson 95% ≈3.39–12.51%)**. The confidence interval is broad; a ≤5% predicted value is **not** a guarantee that an actual priority event happens ≤5% of the time. Pooling both cohorts is descriptive, not a sealed train/holdout estimate.

## Tests and safety

| Check | Result |
|---|---:|
| Complete AI Node test suite | **1,083/1,083 PASS** |
| Official server/engine test suite | **733/733 PASS** |
| Python regression tests, including 6 new C35-E tests | **28/28 PASS** |
| Release smoke across TDM, SND, Hardpoint, BR, Zombies | **5/5, 0 agent errors** |
| Experiment A historical gameplay/offer parity | **18/18 exact relevant field/aggregate parity** |
| C21 assignment audit both cohorts | **0 mismatches** |
| C35-B historical 120s replay | **byte-identical SHA-256** `14ea0cca4b335e167511b407abee260f286d0e3f2bff915b2e38470f72f1bddc` |
| Production agent SHA-256 | **unchanged:** `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` |
| Game weapons/bot accuracy/damage | **unchanged** |

## Interpretation and next decisions

1. **Correct primary result is exposure parity**, not an apparent gain from selecting easier, quiet encounters. Forecasting can be run passively without deleting the intervention population. In matched games, this restores all 459 original `legacy80` delivered ticks versus the 197 ticks observed under C35-D2's heavily-filtering `predictive80`. Do not attribute an improvement against baseline to this: `shadow80` intentionally behaves identically to baseline.
2. The frozen predictor has **useful descriptive ranking** at C16-eligible events but the priority event rate in the ≤5% bin is above 5% in both cohorts and the motor-interruption association is statistically inconclusive at the setup level.
3. Forecasting **future public macro command** is only a proxy for actual micro interruption. A firing command may benefit combat and should not automatically be suppressed. The controller cannot be trained on unobserved outcomes of rejected arms.
4. **C35-F recommendation:** collect priority-*edge* and micro-interruption labels within the exact C16-eligible offer population; compare an exposure-constrained non-veto scheduler using a separate, pre-registered, adequately powered *motor intervention* experiment. Require co-primary gates (executed ticks/preoffer noninferiority, firing opportunity preservation, and no C16 safety failures), plus hostile weapon-hit outcomes before claiming dodge efficacy.
5. Keep C36 action-value training **blocked**; there are still too few hostile-hit-positive randomized windows for reliable causal action-value learning.

## Reproduction

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/verify-c35e-shadow.py
python scripts/verify-c35e-heldout.py
# No automatic overwrite of registered studies; source/model SHA locks are enforced.
python scripts/run-c35e-shadow.py
python scripts/run-c35e-heldout.py
```

**Final gate:** engineering integration and observation **PASS**. Motor policy promotion **NO**. Production **UNCHANGED**. Neural C36 **BLOCKED**. Research output only; no GitHub push.
