# FPS Arena Combat Suite v2.7.8 — Predictive Evasion Lab

**Status: target 90% NOT achieved.** This is a testable, opt-in engineering iteration on v2.7.7, **not** a validated 90% dodge release. Benchmark generated 2026-10-10 with actual authoritative server `Game.step()`, stock weapon damage, unmodified original `BotBrain` for official opponents, and original map physics. All matches are TDM, 90 seconds, 9 bot opponents, 65 ms delayed snapshots, no server-side invulnerability or opponent handicaps, 3 map episodes per seed/profile/opponent combination.

## Delivered changes

1. `evasion-core.mjs` — reusable, short-horizon hitscan heading avoidance based on **observed** opponent yaw, ADS, recent gunfire and visible collision-free corridors. Movement does not access authoritative enemy state or change damage/hitboxes.
2. Risk-aware cover pressure on recently firing rivals; selected only through `combatCoverPressure`. Previous TDM route/pursuit logic untouched without opt-in.
3. `threat-intel.mjs` now propagates short-lived observable `recentFire`, and the headless trainer delivers actual server `shot` packets with the same synthetic network latency as snapshots.
4. Corrected empty-box/map evasion corridor behavior; fixed defensive sprint intent overwrite (sprint candidate itself did **not** improve benchmark, so remains opt-in).
5. The extension popup has two new **off-by-default** checkboxes in AUTO EVADE: **Predictive Evasion** and **Combat Cover Pressure**, both restricted to autopilot TDM. Enable standard Dodge, Smart Cover and these options to reproduce `cover-evasion-lab`; choose 75 m dodge range. No version-2.7.7 settings are reset.
6. Independent shot telemetry in `lab/arena/train.mjs`, unit tests, 3-seed comparator samples and reproducible scripts.

## Proxy definition and limitations

Let **N** be the union of server-observed hostile bot firing events where the shooter's nearest selected target was the trainee, plus authoritative weapon hits actually landed on trainee; let **H** be actual hostile bot weapon-hit firing events against trainee. `observed-threat-shot miss rate = 100 × (1 − H/N)`.

This is **not** proof that every non-hit was actively dodged: weapon spread, cover occlusion, missed tracking, target changes and teammates affect N and H. Unlike shooting accuracy, this metric measures a defender-side outcome. A true isolated dodge attribution would require counterfactual paired replays with identical enemy actions and weapon RNG.

### Per-seed 3-map results (candidate compared with unchanged v2.7.7 route-lab)

| Trial seed | Rival policy | v2.7.7 avoid proxy (N/H) | v2.7.8 opt-in (N/H) | Change | Baseline kills/deaths → candidate kills/deaths |
|---|---|---:|---:|---:|---:|
| 345678 | stress | 79.40% (398/82) | 81.60% (337/62) | +2.20 pp | 41/11 → 32/10 |
| 345678 | official | 71.84% (103/29) | 78.79% (99/21) | +6.95 pp | 70/3 → 78/3 |
| 999901 | stress | 70.81% (161/47) | 76.38% (271/64) | +5.57 pp | 26/7 → 32/9 |
| 999901 | official | 79.08% (153/32) | 84.07% (113/18) | +4.99 pp | 57/5 → 70/2 |
| 830114 | stress | 80.28% (213/42) | 74.21% (159/41) | -6.07 pp | 34/8 → 36/8 |
| 830114 | official | 86.97% (261/34) | 69.12% (68/21) | -17.85 pp | 73/4 → 79/3 |

### Combined exposure-weighted results over all 3 seeds

| Rival policy | Baseline avoid proxy | Candidate avoid proxy | Delta | Baseline K/D → Candidate K/D |
|---|---:|---:|---:|---:|
| stress | 77.85% (772/171) | 78.23% (767/167) | +0.38 pp | 101/26 → 100/27 |
| official | 81.62% (517/95) | 78.57% (280/60) | -3.05 pp | 200/12 → 227/8 |

The candidate increased avoid proxy on the first two seed groups but **lost on fresh seed 830114**. Pooled results show **no reliable global 90% attainment** and no unambiguous improvement over original v2.7.7 across all enemy types. There are trade-offs in kill/death counts and exposure count N, so comparing only percentages is insufficient. This is why both new popup options remain off by default. Benchmark configurations were evaluated in a tuning process: seeds 345678/999901 are not claimed as pristine blind test data. 830114 was a fresh unseen seed for the current candidate.

## Reproduce

```bash
node scripts/build.mjs
node --test tests/*.test.mjs
node lab/arena/train.mjs --modes tdm --seconds 90 --episodes 3 --bots 9 --classic-maps neon,arena,foundry --opponents stress --seed 830114 --profile route-lab --out reports/route-control.json
node lab/arena/train.mjs --modes tdm --seconds 90 --episodes 3 --bots 9 --classic-maps neon,arena,foundry --opponents stress --seed 830114 --profile cover-evasion-lab --out reports/predictive-test.json
```

`node --test tests/*.test.mjs`: **479/479 passing** in this release environment. Reproduction requires a compatible Node runtime (tested with Node 22). Browser/graphics QA and real human opponent testing have not been performed here.

## Next validation gate for a genuine 90% claim

A production default should only change after the miss-rate metric clears 90% on genuinely unseen random seeds, across all three maps and both rival policies, with confidence intervals and **no unacceptable decline** in time alive, kills/deaths or shots taken; a separate controlled trajectory-paired test should isolate actual evasion from natural aim errors. Do not reach 90% by lowering opponent accuracy, shrinking target hitboxes or avoiding all engagements.
