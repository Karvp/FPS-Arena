# FPS Arena v2.9.11 — C35-R: Combat Decision & Shot-Loss Analysis

**Status:** ENGINEERING PASS / POLICY NOT PROMOTED / C36 BLOCKED  
**Parent:** C35-Q full integrated source (local `c35q-src`).  
**New output:** `combat-decision-shadow-c35r.mjs`, paired-release runner, independent shot-loss analysis and replay audit.

## Objective

Previous C35-N/P/Q cohorts showed differences between shots, hit events, kills and deaths but no defensible way to identify *why*. C35-R introduces a public-only shadow observer and an authoritative *after-step* shot loss decomposition. It does **not** actuate firing, aiming or motion and does **not** claim a causal benefit.

## Data boundary

- All candidate target, motion and confidence features are calculated from delayed public client snapshots **before** `Game.step()`; only samples with a client firing command or periodic nonfire samples are retained.
- The immutable production `page-agent.js` remains identical to C35-Q.
- Original C16 safety and C21 seeded micro randomization are not modified.
- Poststep data includes authoritative shot count and pellets (hit player, static geometry, dynamic foam, out of range), but is never fed back into a live policy.
- `noFireSamples` are observational and not a measurement of missed or available shots. `candidateEligible` is an optical/recency diagnostic, not engine fire readiness.

## Frozen pilot

`reports/c35r/paired-24-v1/FROZEN-DESIGN.json` was written before the simulation, locking the source hashes, 12 independent setup clusters, two policies, and identical per-pair map/weapon/seed/lag/opponents/duration. Original baseline: **release v2.9.11**, no C35 controller. Research: **shadow80** with C21/C16 micro control, plus passive C35-R and previous observers. Each match runs 90 seconds on actual `Game.step()`; 24 matches = 36 simulated minutes. The control trajectories can diverge after intervention; this is not a within-trajectory counterfactual.

| Metric | Original release | C35-R research shadow80 |
|---|---:|---:|
| Kills | 100 | 108 |
| Deaths | 5 | 8 |
| Server-confirmed shots | 674 | 657 |
| Hit events | 384 | 418 |
| Distance moved (m) | 4,869.95 | 4,842.73 |
| Agent errors | 0 | 0 |

Cluster bootstrap (10,000 draws, 12 setup clusters): **kill ratio 1.08, exploratory 95% interval [0.849, 1.460]**; shot ratio interval [0.712, 1.396]. These intervals do **not** confirm an improvement. Deaths also increase in the research arm.

## Authoritative shot / pellet decomposition

The research arm fired 657 shots yielding **1,185 pellets**, of which **586 hit player**, **339 hit static world geometry**, **260 expired at range** and **0 hit dynamic foam**. There are **464 shots** with at least one player-hit pellet (shot is the correct unit for shotgun aggregation). Pellet outcomes are not independent observations.

| Gun | Shots | Player-hit shots | Player pellets | Static cover pellets | Range pellets |
|---|---:|---:|---:|---:|---:|
| MP5SD | 167 | 115 | 115 | 44 | 8 |
| M4A1 | 223 | 146 | 146 | 75 | 2 |
| AA-12 | 48 | 37 | 159 | 169 | 248 |
| HK SL8 | 165 | 127 | 127 | 36 | 2 |
| Uzi | 26 | 17 | 17 | 9 | 0 |
| L115A3 | 28 | 22 | 22 | 6 | 0 |

The above does **not** identify the counterfactual value of moving, suppressing fire or aiming elsewhere. `damageDealt` includes ability and other interactions; the observed kills are not causally attributable to specific shots. Some map/gun setup combinations are very sparse, so an apparently impressive aggregate may not generalize.

### Public decision diagnosis

- **11,327 pre-step samples**, of which **3,492** satisfy the configured public candidate filter.
- A public candidate need not be fire-ready, unobstructed at the actual pellet direction or even the correct server-rewound player.
- A naive attempt to optimize `eligibleSamples → fire` would introduce false positives and interfere with reload/skills; **not recommended**.

## Verification

- `node --test tests/*.test.mjs`: **1,175/1,175 pass**.
- `npm --prefix lab/arena/source-main test`: **733/733 pass**.
- `python scripts/run-c35r-python-regressions.py`: **87 run, 82 pass, 5 historical skips**. Two C35-Q tests specifically demand a SHA-256 match with the frozen C35-Q source, which a modified C35-R checkout cannot satisfy; both were separately rerun and **passed on the intact C35-Q source**. The *initial unfiltered test run* on C35-R therefore recorded 2 expected source-fingerprint failures, not quietly hidden.
- Five-mode smoke TDM, SND, HP, BR, Zombies: no agent errors.
- New Node C35-R tests: **7 pass**; new Python C35-R tests: **4 pass**.
- Independent C21 hash recomputation on all 12 research datasets: **34 offers checked, 0 mismatches**.
- Independent shot ledger: **657 shots, 1,185 pellets, no dropped or modified fire commands**.
- Replay control with C35-R observer disabled: nine historical C35C/G/H/I/J/K/L/O/P sidecars **byte-identical** over a full 90-second match.
- C21 source module, C16 source module and production `page-agent.js`: identical hashes to C35-Q.

## Conclusion and next direction

**C35-R is a successful audit/instrumentation pass, not a gameplay optimization.** Technical gates pass; winrate/kills non-inferiority and improvement are **not established**. Avoid changing production or unlocking C36.

**C35-S recommendation:** build shot-level *prospective candidate movement* in shadow mode using weapon category and exact public aim target, then preregister a very conservative limited actuation A/B on long TDM matches and jointly gate kills, deaths, shots, target visibility and executed movement. Use a disjoint holdout and more than 12 setups before any promotion.

## Reproduction

```bash
python scripts/run-c35r-combat-pilot.py   # respects preregistration, reuses complete files
python scripts/analyze-c35r-combat.py
node scripts/verify-c35r-independent.mjs
node --test tests/combat-decision-shadow-c35r.test.mjs
python scripts/run-c35r-python-regressions.py
```

The source/runner is research-only. Do not use server truth as a policy feature.
