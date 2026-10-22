# FPS Arena v2.9.11 — C35-AH Bounded Multi-Step Tactical Options

**2026-10-14 · Engineering PASS · Randomized multi-tick motor options PASS · Combat policy NOT PROMOTED**

## Changes and experimental identification

- Added `lab/arena/tactical-option-randomizer-c35ah.mjs`, integrated **only** behind CLI `--c35ah-trace` and `--c35ah-policy observe|randomized` in `lab/arena/train-main.mjs`.
- Pre-assignment public-state eligibility uses C35-V's static geometry, delayed hostile public LOS/freshness, C35-Z precision weapon support, incumbent movement continuity, healthy grounded player state, and refusal of priority interactions/upstream command changes. Precision rifles do not receive overrides on a firing tick. Each candidate is re-evaluated from public data **every tick**; unsafe or target-changing sequences cancel immediately.
- 3 randomized **option-level** arms: `incumbent` (50%), `option-a` (25%—highest heuristic safe alternative each tick), `option-b` (25%—second highest). Assigned option lasts at most **1.25 seconds (75 ticks)** but can be interrupted; re-planning among safe alternatives is allowed within the *assigned option class*. Fire, ADS, reload, aim yaw/pitch, skills and non-motor fields remain unchanged by C35-AH.
- Every assignment has a **six-second factual server** net-damage/kills/deaths/shots/hits and survival window with **7.5-second minimum assignment spacing**. Non-assigned outcomes are *unknown*, never generated. Assignment intention is the treatment (ITT); conditioning on realized duration or compliance would break randomization and is not done for primary causal analysis. No entire six-second combat strategy or subsequent firing sequence is randomized.
- Research guard is **not** C16 production authorization. `page-agent.js` remains untouched, SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Frozen, real engine TDM cohort

Design `reports/c35ah/frozen-54/FROZEN-DESIGN.json` SHA-256 **`6f987fc819222aad9eebe658e52e5674358a9428ca31a7f9106139d3f34a3864`** was written before matches. Matched **18 setups × 3 arms × 90 seconds = 54 games = 81 simulated minutes**, with 6 guns (HK SL8, L115A3, M4A1, MP5SD, AA-12, Uzi), 3 maps and 3 lag configurations. `release` is original production behavior; `observe` uses C35C shadow80 but no C35AH motor changes; `randomized` uses the same shadow80 and opt-in C35AH. Opponent seeds are matched per setup, but once an intervention occurs, game trajectories may diverge.

| Measure | Release | Observe | Randomized option |
|---|---:|---:|---:|
| Kills | 144 | 137 | 144 |
| Deaths | 9 | 9 | 9 |
| Shots | 704 | 918 | 799 |
| Hit events | 411 | 519 | 495 |
| Agent errors | 0 | 0 | 0 |

Paired **setup-bootstrap 95% CI**: randomized/observe kills ratio **[0.83978, 1.37755]**, deaths ratio **[0.54545, 1.71429]**. Both include 1; *no demonstrated gameplay improvement*. The fact that release and randomized both had 144 kills in this cohort is not a neural result.

## Independent SHA, randomization, compliance and truth audit

`scripts/verify-c35ah-independent.mjs` independently re-implements the C35AH hash assignment and C21's separate hash assignment, checks frozen source digests, all 54 match artifact SHA-256 hashes, original assignment probabilities, source fields, completed/censored server counters and no fabricated counterfactual labels.

- **104/104 C35AH assignments verified**: 54 incumbent, 20 option A, 30 option B. Note that exact assignment counts need not follow expected proportions in small finite samples.
- **93 factual six-second windows complete**, **11 right-censored** and never zero-filled. Cooldown > horizon ensures no C35AH measurement-window overlaps.
- **573 motor command ticks modified** across 50 assigned alternative options; 49 safety-triggered interruptions. Average among modified offers **11.46 changed command ticks**, maximum **61 ticks**. These are motor commands, not proven physical displacement; quiescence, collision and momentum can attenuate the actual position change.
- Changed command ticks by gun: HK SL8 **45**, L115A3 **150**, M4A1 **144**, MP5SD **51**, AA-12 **45**, Uzi **138**. This addresses prior precision-gun non-exposure.
- **170/170 C21 assignments independently reproduced**. Authoritative C35AA ballistic logs reconcile **1,717 shots / 3,653 pellets** across 36 research-arm matches. **No changed fire commands or agent errors.**
- Experiment setup is randomized, but multiple assignments within a match are correlated, have possible treatment carryover, and censored end-of-match offers must not be interpreted as zero reward. Setup-level bootstrap quantifies limited uncertainty; it does not justify broad policy generalization.

### Exploratory, complete-window ITT (no promotions)

Bounded reward (diagnostic only): `(min(damageDealt,300) - min(damageTaken,300) + 100*(kills-deaths))/100`. Raw damage remains retained. Clipping prevents anomalous L115A3 headshot ×100 from dominating a cross-weapon regression.

| Assigned comparison vs incumbent | HT/IPS reward difference | Setup-bootstrap 95% CI |
|---|---:|---:|
| Option A | −0.1523 | [−1.1632, +1.1254] |
| Option B | +0.0740 | [−1.2417, +1.6457] |

Both intervals contain zero and are **exploratory complete-case estimates**; censoring and within-match interactions can bias them. Neither option is reliably superior. No model was trained or allowed to select a motor action. This phase establishes valid randomized multi-tick data collection and a strict policy promotion rejection.

## Tests and source parity

| Gate | Outcome |
|---|---|
| Node full suite | **1,308 / 1,308 PASS** (8 C35AH controller tests added) |
| Official engine | **733 / 733 PASS** |
| Applicable Python | **159 PASS, 5 historical SKIP**; **8 historical source-lock tests** preserved unchanged and excluded from current-source execution |
| Research branch disabled / observe mode | **Four prior trace files byte-identical** (`aim`, `dataset`, `fire`, `macro`); normalized gameplay results equal |
| Release smoke | **TDM / SND / HP / BR / Zombies all 5 PASS, zero agent errors** |
| Source/ZIP integrity | Frozen source + 54 match hashes audited; release ZIP CRC and external SHA manifest |

## Known limitations and next research

1. **Not all assigned alternatives actually move**: collision, inertia, target changes and safety interruption can reduce exposure; fixed option rank and per-tick re-planning could lead to directional oscillation. A future study should log authoritative physical displacement post-step separately, without using it for eligibility.
2. Larger distinct setup clusters are needed to identify policy-level effects, not just 104 within-match assignments. Stronger close-range and cover-heavy opponents may expose tactical weaknesses.
3. Randomization assigns option *families*, not every ADS/shot/strafe within a six-second engagement. Only the option assignment supports causal analysis; downstream trajectory components do not.
4. Neural policy for C36 remains gated: require demonstrably better held-out matched TDM outcomes and safe timing/geometry invariants, rather than proxy reward or optimistic in-sample value predictions.

**Final: C35-AH ENGINEERING PASS / RANDOMIZED MULTI-STEP EXPOSURE PASS / COMBAT POLICY NOT PROMOTED.**
