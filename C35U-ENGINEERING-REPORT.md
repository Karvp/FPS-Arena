# FPS Arena v2.9.11 — C35-U Weapon-Aware Tactical Positioning

Date: 2026-10-13. Status: **ENGINEERING PASS / POLICY REJECTED / NO PRODUCTION CHANGE / C36 BLOCKED**.

## Aim and implementation

C35-T maximized closing velocity regardless of weapon. C35-U replaces that criterion with a **public-data-only weapon-specific radial band**: shotgun, SMG and assault rifle use their authoritative `WEAPONS` damage falloff range as the starting prior. For each eligible pre-server-tick command, C35-U enumerates eight digital movement directions and maximizes closeness to a phase-specific desired radial component. Candidate changes must improve score by >=0.19, preserve heading continuity >=0.52, and pass public static collision checks across 0.7 m. A maximum two-tick burst and 0.7-second cooldown limit exposure. No control modifications are permitted when the existing C21/C16 motor command differs from the incumbent. Reload, use, skill, jump, prone and other priority actions fail closed.

**C35-U does not use server truth at decision time** and does not modify fire, aim, yaw/pitch, slot, or skill. The public angular-target selector uses public team-filtered client snapshots <=270 ms old and rejects LOS blocked by public static boxes. Dynamic foam is not modeled in the actuator and is a limitation. No neural weights were trained. This is *not* a C16 safety authorization.

New files: `lab/arena/weapon-aware-positioning-c35u.mjs`, `tests/weapon-aware-positioning-c35u.test.mjs`, `tests/test_c35u_pilot.py`, `scripts/run-c35u-pilot.py`, `scripts/analyze-c35u-pilot.py`, `scripts/verify-c35u-independent.mjs`. Opt-in CLI `--c35u-policy observe|balance` and `--c35u-trace`; only valid in registered shadow80 + C35G/H observe TDM.

## Frozen experiment and TDM three-arm comparison

Registration SHA-256: `223045cd744aaa5cd8b68b98f5ac3e541f1f3b82ab194e1b2a6031d201e5c502`. **12 independent setups**, each tested with `release`, C35-U `observe` and C35-U `balance`; 90 seconds per match, 36 TDM matches, 54 simulated minutes. Same seed, map, loadout, opponent policy, bots, latency and duration *within each setup*. Map Arena/Neon/Foundry; weapons AA-12/MP5SD/M4A1; latency 65/150/240 ms. Production page-agent SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

| Metric | v2.9.11 release | shadow80 + observe | shadow80 + C35-U balance |
|---|---:|---:|---:|
| Kills | 53 | 82 | 77 |
| Deaths | 7 | 12 | 15 |
| Server shots | 460 | 670 | 609 |
| Hit events (not unique bullets) | 273 | 437 | 431 |
| Distance walked (m) | 5369.02 | 5544.41 | 5547.46 |
| Macro motion ticks changed | 0 | 0 | 397 |
| Macro changed ticks with fire | 0 | 0 | 20 |
| Position offers | 0 | 194 | 212 |
| Agent errors | 0 | 0 | 0 |

Isolated impact of new policy is **balance versus observe**: kills -6.1%, deaths +25.0%, shots -9.1%, hit events -1.4%. Observer vs release is NOT attributable to C35-U; it incorporates pre-existing randomized C21/C16 micro. All three arms share the same production page-agent.

| Weapon | Baseline observe kills | Balance kills | Balance movement ticks |
|---|---:|---:|---:|
| aa12 | 14 | 15 | 102 |
| mp5sd | 19 | 24 | 228 |
| m4a1 | 49 | 38 | 67 |

Observed decision phase counts:

- observe: {'close-distance': 174, 'hold-band': 17, 'create-space': 3}
- balance: {'close-distance': 199, 'hold-band': 12, 'create-space': 1}

**Matched setup bootstrap 95% intervals (balance / observe)**: kills [0.6636363636363637, 1.488888888888889], deaths [0.8, 1.8], shots [0.7040723981900453, 1.2290836653386454], hits [0.7723214285714286, 1.325]. 5,000 resamples of the 12 paired setups, not tick/pellet pseudo-replication. These intervals are exploratory; small sample and no human opponent validation. They cannot establish superiority or non-inferiority.

**Decision: REJECT for production**. While 397 actuator ticks prove nonzero exposure, kills and shots decrease and deaths increase compared with observe. Per-weapon apparent gains are too sparse and non-independent across ticks to justify promoting an MP5-only arm.

## Independent auditing and regression

- C21 research arm assignments 131, assignment hash mismatches 0; server shot ledger mismatches 0.
- Direct fire suppression 0, injection 0, agent errors 0, and illegal motor changes 0.
- Unit tests: **1199/1199 Node.js** (including nine new C35-U cases); official engine **733/733**.
- Python: direct run 105 existing tests + six new: **two historical C35-Q SHA-locked tests failed by design because train-main.mjs was modified**. Re-executing those *unchanged tests* on the original source `/mnt/data/c35q-src` gives **10/10 PASS** (complete C35-Q file). On C35-U, excluding only those two source-identity checks, **104 PASS, 5 historical SKIP**. No other Python test suppressed. Logs retained in evaluation archive.
- Five base release modes (TDM/SND/HP/BR/Zombies) **5/5**, zero errors; headless C35-U motor smoke 60 s: 8 changed ticks, 3 while firing, zero errors.
- C35-U observe-vs-disabled 60s same-seed replay: C35C dataset, C35G fire trace and C35H macro trace **byte-identical**, and gameplay equal after dropping only creation timestamp and new diagnostic field.
- Original production agent SHA-256 verified unchanged; ZIP files validated using `ZipFile.testzip()`.

## Limits and next decision

The new policy approximates position control from *static public geometry* and a point-target radial distance. It does not model dynamic foam in motor guard, enemy potential damage, melee/skill threat, navigation beyond 0.7 m, recoil effects of strafing, or long-term objective value. In particular, the M4A1 drop under C35-U is strong motivation to avoid global weapon band controllers. C35-V should focus on **counterfactual value estimation of the original steering decision**, with holdouts by map/weapon, then a very restricted SMG-specific opt-in trial only if pre-registered fire and safety non-inferiority checks are passed. C36 true neural training remains blocked pending reliable action-value teacher labels.
