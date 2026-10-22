# FPS Arena v2.9.11 — C35-C3 Authoritative Engine Integration & Prospective Arbitration Pilot

**Checkpoint:** 2026-10-13. **Disposition:** Engineering integration demonstrated; conditional interruption improvement not conclusive, overall delivered exposure declines. **NO C36, NO production promotion, NO GitHub push.**

## Source provenance and integration

- User-supplied parent `FPS-Arena-Combat-Suite-v2.9.11-C35B-Micro-Action-Reliability(1).zip` validated SHA-256 **`50039be4efca0e4d081600675d50abfb0dde7e44a48db2bb26af361fc782a6de`**, ZIP CRC PASS, 3,702 entries.
- New opt-in `--c35c-dataset`, `--c35c-policy legacy80|hierarchical80`, `--c35c-setup-id`, `--c35c-enemy-primary`, `--c35c-registration-sha` switches in authentic `lab/arena/train-main.mjs`.
- Research adapter `lab/arena/macro-micro-integration-c35c.mjs` subclasses untouched C35-B. Preserves C21 hash three-way randomization, C16 preassignment symmetric eligibility and per-tick safety, actual `page-agent.js` original commands and authoritative server `Game.step()` hit labels.
- `hierarchical80` only refuses selected prospective C16-eligible offers when public quiet-time heuristics indicate an imminent macro priority. Such refused offers never advance C21 ordinal, and receive the original C21 rejection-retry backoff. Every prospective probe is logged even when blocked.
- This version's macro forecast is an explicitly noncalibrated **past-incumbent-command quiet-time heuristic**: after 200 ms quiet it returns a 250 ms confidence horizon; otherwise 0 ms. It is **not** ground-truth future fire prediction and may filter too much. Unknown/stale data fail closed. No private state or postassignment diagnostics are used before assignment.
- No reliable public C34 risk probability estimator is actually available. All samples have risk stratum `unknown`; **no false public-c34 score is fabricated**. It is a known next-step deficiency.
- Source-integrated runtime calls the original C21 via C35B `super.command()` and original C16 for each actuation; the earlier standalone C35-C2 coordinator remains a contract/test fixture, not a replacement for these authentic controllers.

## Locked exploratory technical pilot (not a combat efficacy trial)

The research scripts froze `reports/c35c3/exploratory-18-pair/PRE-REGISTERED-PLAN.json` **before** collecting outcomes. Registration SHA-256:

`0ce8ace19ec466dea3d90012103815317e25ca9ce88cb68c0ee728b798f5278d`

18 matched setups, each played with **both** `legacy80` and `hierarchical80`: 3 actual maps × 6 enemy primaries, varied fixed 35/65/125 ms lag and official/mixed/stress opponent profiles, 5 bots. Each match simulated 90 seconds on authoritative headless `Game.step()` for **36/36 completed matches and 54 simulated match minutes**, 27 minutes per policy. Randomization is sequential C21 at eligible offers. Trajectories diverge once interventions differ: this is a randomized-arm *within-policy* experimental design but only **descriptive matched setup comparison of arbitration policies**. This sample is not powered for hostile damage or kill effects.

| Metric | `legacy80` | `hierarchical80` |
|---|---:|---:|
| Full TDM matches | 18 | 18 |
| Prospective opportunity probes | 10,258 | 10,636 |
| Eligible / assigned offers | 152 | 122 |
| Micro-assigned offers | 107 | 85 |
| Interrupted micro actions | 34 | 20 |
| **Interruption / micro** | **31.78%** | **23.53%** |
| Delivered micro ticks | 459 | 371 |
| Delivered ticks per attempt | 0.04475 | 0.03488 |
| Completed 1.8s outcome windows | 151 | 121 |
| Server-confirmed hit-positive windows | 6 | 4 |
| Full-match shots / hits | 1,687 / 1,125 | 1,748 / 1,177 |
| Full-match kills / deaths | 214 / 12 | 215 / 12 |

**Paired setup-bootstrap**, 2,000 resamples over 18 setups, `hierarchical80 − legacy80` (95% exploratory intervals):

- Conditional interruption rate: **−8.25 percentage points**; **[−15.68, +0.07] pp**. Includes zero: not a demonstrated reliability improvement.
- Micro assignments per attempted preoffer: **−0.002439**; [−0.004958, −0.000581]. Lower opportunity coverage.
- Delivered ticks per attempted preoffer: **−0.009864**; [−0.020421, −0.001384]. Reduced actuation exposure.
- Eligibility rate per preoffer: **−0.003347**; [−0.006427, −0.000957].

The hierarchical branch retrospectively tallied **65 prospective C16-eligible offers blocked by its macro timing heuristic**. The `predecisionReason` first-failure breakdown overlaps potential C16 failures (e.g. priority command at the same time); do not interpret counts for `macro-transition-imminent` across *all* probes as 1,868 independently avoidable interruptions.

There were just **10** hit-positive complete windows across the 36 simulated matches. We cannot infer that either policy improves damage avoidance, DPS, win rate or bot competence. The similar whole-match kills and small differences in shots are not causal efficacy evidence at this sample size. Window-level outcomes are selectively exposed after C16 gate; censored labels stay null.

## Technical verification

- **1,067/1,067** AI Node.js tests, including **6 newly integrated** C35C unit tests; zero failures.
- **733/733** official engine tests; zero failures.
- **16/16** Python analyzer/validator tests; zero failures.
- **5/5** headless-mode smoke tests (TDM, SND, Hardpoint, Battle Royale, Zombies); no agent error.
- Source-integrated `legacy80` 45-second replay compared to C35B 80-ms trial under identical conditions: identical offer assignments, executed ticks, interruptions, outcomes and whole-game aggregate (only experimental metadata differs).
- Historical **C35B `match-00-80` exact byte replay** with integrated source, 120 seconds: datasets **byte-identical** to frozen C35B report, SHA-256 `14ea0cca4b335e167511b407abee260f286d0e3f2bff915b2e38470f72f1bddc`.
- Independent `scripts/verify-c35c3-pilot.py`: **36/36** files, locked source hashes, dataset & result SHA, 0 reconstructed C21 assignment mismatches, offer/preoffer 1:1 prospective join, C16 all-three-arm eligibility, original server audit information-boundary checks, no unintended change to production agent.
- Production `page-agent.js` remains SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Decision and next research

**Reject promotion of `hierarchical80`.** It lowers conditional interruptions in this sample but loses opportunities and absolute executed ticks. The 5% interruption gate remains missed and the sparse-hit causal training gate is unmet. Do not train C36 on the present intervention dataset; the current policy remains research-only and inactive by default.

Recommended C35-D direction:

1. Develop a **causal public-only firing-transition predictor** with independently calibrated probability/ETA and explicit abstention; compare against the simple quiet-time heuristic before introducing actuation.
2. Pre-specify an **opportunity-preservation constraint** or jointly optimize delivered ticks per unit time with interruptions, not interruption fraction conditional on survivors.
3. Acquire richer combat signal **without changing enemy accuracy, damage or gameplay**; C34 passive observation and C16 safe populations require reporting as distinct observational domains.
4. Validate across independent sealed maps/seeds/loadouts, multiple horizon classes and opponent profiles. Retain nonoverlapping windows, complete/censored distinctions, source locking and intention-to-treat assignment.

## Reproduction commands

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/verify-c35c3-pilot.py
python scripts/analyze_c35c.py reports/c35c3/exploratory-18-pair/C35C3-OFFERS.jsonl \
  --preoffers reports/c35c3/exploratory-18-pair/C35C3-PREOFFERS.jsonl \
  --require-linked-preoffers --out reports/c35c3/exploratory-18-pair/C35C3-ANALYSIS.json
node lab/arena/train-main.mjs --profile release --modes tdm,snd,hp,br,zm \
  --seconds 20 --seed 5836001 --out smoke-c35c3.json
```

Note: `scripts/run-c35c3-pilot.py` deliberately refuses to re-register if the locked source differs. The registration is stored alongside the full raw data. Do not rerun after modifying source and describe it as the original study.
