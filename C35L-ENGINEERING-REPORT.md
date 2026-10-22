# FPS Arena v2.9.11 — C35-L: Firing-Time Ballistic Ground Truth

**Date:** 2026-10-13  
**Status:** Measurement engineering PASS / No motor-policy promotion / C36 blocked.  
**Parent:** C35-K (verified SHA-256 `a0b04e00ddcde466df396e3cc38b83393b1317ed834984a4b1fc0e933f8e3c2f`).

## 1. Problem and solution

C35-K correctly canonicalized public team identities but could only compute a **public nearest-target eye/body-center LOS proxy**. That geometric proxy does not describe the actual bullet spread, server muzzle/eye transform, target rewinding, multiple pellets, or dynamic cover. It is therefore **not valid ground truth** for training a movement policy.

C35-L instruments the **authoritative firing-time** path in `lab/arena/source-main/server/combat.js` with an opt-in `WeakMap` server-only shot sink. For hitscan weapons, the server records the actual deterministic spread ray, first world intersection, server-resolved target/region, and target-rewind offset. It distinguishes static map boxes from ability-created dynamic foam boxes. Only after authoritative fire/damage resolution is the row transferred to a separate research ledger. This does **not** alter a projectile trajectory, physics, damage, skill, player input, enemy behavior, agent or gameplay policy. The research sink is never attached to the client/network snapshot or page-agent.

C35-L's `lab/arena/ballistic-truth-c35l.mjs` separately freezes the C35-K **public-before-step** observation and joins the server result **after `Game.step()`**. The ledger enforces one-to-one shot-event parity, shot-vs-pellet denominators, no altered fire command and complete pellet classification. It fails rather than silently counting unobserved shots as misses.

## 2. Preregistered, observational study

`reports/c35l/pilot-18-fresh/FROZEN-DESIGN.json` locks the study's 18 setups, seeds, weapons, maps, opponent policies, source hashes, hypotheses and analysis outcomes. One independent game per **3 maps × 6 weapons**, each 60 simulated seconds. No new motor intervention: `shadow80` + `observe`, original C16/C21, C35-K sidecar and frozen C35-D predictor. Total **18 simulated minutes / 64,800 ticks**.

| Metric | Measured |
|---|---:|
| Complete matches | 18 / 18 |
| Fire input ticks | 656 |
| Confirmed authoritative shots | **656** |
| Confirmed pellet rays | **1,151** |
| Pellets hitting hostile player hitbox | **654** |
| Pellets first stopped by static world | **319** |
| Pellets first stopped by dynamic foam | **0 observed** |
| Pellets reaching weapon max range | **178** |
| Server hit events (not individual pellets) | **422** |
| Shots with target rewind >0 | **656** |
| Public nearest target ID differs from actual pellet-hit target | 244 / 654 comparable hit pellets |
| Firing commands changed by research observer | **0** |
| Agent errors | **0** |

Counts are **different units**: 654 pellet hitbox intersections do not imply 654 distinct shots or server hit events. In a shotgun blast, many pellets hitting one target aggregate into one server hit/damage event. The 244 identity differences are **not confirmed target-selection mistakes**: public nearest target may not be the target the shooter aimed at, and the server rewinds positions. The study did not observe foam-impact events and **cannot validate foam classification empirically** in this cohort, although the distinct class is covered by unit tests. All six weapons are standard hitscan guns; knives, special lasers, scorestreak shots and other modes require a separate audit schema.

Weapon shot counts: MP5SD 112, M4A1 102, AA-12 45, HK SL8 219, Uzi 139, L115A3 39. The AA-12 contributes 540 pellets from 45 shots; the five other guns each emit one pellet per shot.

A descriptive match-cluster bootstrap (2,000 samples over independent 18 matches) yields a **95% percentile interval of 46.22%–74.20%** for the fraction of pellets that intersect a player hitbox. The interval is *not* a causal policy advantage, and pellet labels within a blast must not be treated as independent trials.

## 3. Why the C35-K LOS proxy cannot serve as a shot label

The C35-L side-by-side measurements stratify fire events by whether the **pre-step ray to the nearest public hostile's approximate body center** is unobstructed:

| Pre-step public static LOS to nearest hostile | Fired shots | Pellet rays | Actual player-hit pellets | Actual world-stopped pellets |
|---|---:|---:|---:|---:|
| Proxy LOS clear | 199 | 474 | 234 | 163 |
| Proxy LOS blocked | 457 | 677 | 420 | 156 |

Both strata contain successful player-pellet intersections and actual world collisions. This is **not** a confusion matrix of a shared binary target: actual pellet direction (spread), hitbox, actual hit target, and rewind differ from the nearest-target body-center ray. The observed association is also confounded by weapon, map and range. C35-L supplies the richer server truth necessary to design properly aligned calibration in the next stage. Do not use these rows as reward labels for a neural policy without stricter action/target alignment and independent holdouts.

## 4. Reproducibility, integrity and regression

- Node/AI: **1,147 / 1,147 PASS** including 10 new C35-L tests.
- Original engine suite: **733 / 733 PASS**.
- Python: **45 PASS, 4 SKIP**. One historical C35-K test validates an exact C35-K `train-main.mjs` hash and is explicitly skipped because the C35-L branch extends that file; the other three previously documented frozen-hash skips remain. New C35-L frozen-source and per-case hashes all pass.
- All five base gameplay-mode smokes complete with zero agent errors. C35-L instrumentation itself is intentionally restricted to registered TDM observations.
- Observer-on vs observer-off matched-seed replay: **six historical logs byte-for-byte identical** (C35C dataset, C35G, C35H, C35I, C35J and C35K). Gameplay results are identical when only creation timestamp and the newly added C35-L diagnostic field are removed.
- 18/18 per-match logs have frozen SHA-256 entries and per-pellet invariant audits. The pilot runner's *first* automatic analysis failed because C35-K timestamps round to five decimals whereas C35-L rounds to six; corrected comparison uses <=0.00001 seconds and the original 18 match files were **not changed or rerun**. The failed initial run remains in `/mnt/data/c35l-pilot-execution.log` on the construction runtime; the final analyzer passes.
- Parent C35-K source was checked against 5,179 original ZIP entries; intentional changes are `server/combat.js`, `train-main.mjs`, and a historical frozen-SHA regression skip in `tests/test_c35k_reliability.py`. Generated test fixture files were restored before packaging.
- Production `page-agent.js` is byte-identical: SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## 5. Design limitations and decision

This provides **authoritative first-collision truth** for fired hitscan projectiles, but not a causal estimate of movement quality. Current logging associates pellets with server target hitboxes and first static/dynamic world obstruction, not total damage after armor, multi-target effective utility or actual *intended* aim target. Dynamic foam was not present in the observed positive collision data. The 18 matches are observational and too few for action-value promotion. **Do not promote a macro/micro controller. Do not unlock C36 neural training.**

Suggested C35-M: align the **same server shot ray** with a public *aim-target candidate*, reconstruct delayed target tracks at shot time, estimate calibration by weapon/map/lag stratum with held-out seed clusters and measure explicit mismatches for foam, multiple pellets and hitbox changes. Only then consider an appropriately randomized motor intervention.

## 6. Reproduction

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35l-ballistics.py
python scripts/run-c35l-ballistics.py  # refuses altered preregistered source
```

Files: `lab/arena/ballistic-truth-c35l.mjs`, optional `--c35l-trace`, `scripts/run-c35l-ballistics.py`, `scripts/analyze-c35l-ballistics.py`, `tests/c35l-ballistic-truth.test.mjs`, `tests/test_c35l_reliability.py`, `reports/c35l/pilot-18-fresh/`.
