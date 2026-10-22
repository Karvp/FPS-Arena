# FPS Arena C15 — Adaptive Safety-Probe Scheduling

**Date:** 2026-10-12  
**Source:** FPS Arena v2.9.11 C14, integrated with the user's `fps-arena-main(1).zip` engine snapshot at C7.  
**Status:** Headless-only research. The production browser extension has not changed.

## Research question

Can we observe more naturally safe micro-action opportunities **without relaxing any action gate or modifying baseline commands**? C14 retried every 0.9s even after an ineligible check, missing transient windows.

## Implemented change

The C15 scheduler retries after rejected scans every 0.12s (actual fixed ticks mean a minimum observed ~0.133s), but retains the 0.9s cooldown after a valid offer, C14's original 0.16s maximum lateral action, the 24–100m distance window, own HP ≥75%, fresh delayed client-public snapshot, grounded requirement, symmetric collision clearance and all priority-command vetoes. C14 itself is preserved for exact A/B controls. Neither implementation reads server-private enemy positions, game RNG, or changes the incumbent command in control arm.

`--c15-dataset` is research-only and mutually exclusive with `--c14-dataset`. Explicitly forcing treatment or control is marked `forced-arm-diagnostic`. Randomization remains at **match** level, not offer level.

## Results (main-engine authoritative Game.step())

**Matched control parity:** 12 independent seed/map/loadout scenarios × 32s × 2 control schedulers = 24 matches. C14 finds **6** legal offers; C15 finds **18**, 3× as many (+12). There are 6 scenarios with more offers, 6 ties, and 0 decreases. All ten audited gameplay metrics match exactly in every pair. C15 records 2781 scans, 2763 rejected. This is evidence of improved detection on the fixed scenarios, not evidence of more kills.

**Primary rejection reasons** (only the first detected blocker per rejected scan; others may also apply): stale-or-incomplete-public-state: 45, distance: 2111, incumbent-priority-command: 586, movement-state: 19, low-health: 1, public-static-geometry: 1. The range window and incumbent-priority-action veto account for most invalid scans. These constraints are intentionally unchanged.

**Forced-treatment diagnostics:** 12 further scenarios × 32s. Compared with the matching control runs, 2 scenarios have more kills, 0 have fewer kills, 10 are unchanged; 8 of 12 actually have an offer. Aggregate kills across these deterministic fixed scenarios: 18 control versus 22 treatment, with 161 intervention ticks. The arms were **forced**; these results must not be passed off as randomized population estimates or direct per-offer rewards. Individual outcomes, including changed shot counts and deaths, are in the attached evaluation.

**Independent randomized episodes:** 8 further 32-second matches, 5 assigned control and 3 assigned treatment. Exposed matches: 3 control and 2 treatment. The randomized set fails the predefined minimum independent per-arm (20) and exposed per-arm (10) gates. Thus the treatment effect is **unresolved**, and neural action-value training remains blocked.

## Validation

- AI Node regression: **822/822** tests passed (10 new C15 tests).
- Uploaded main-engine tests: **733/733** passed.
- Production bundle `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`, **exact match** with C14.
- Smoke tests TDM, S&D, Hardpoint, BR, Zombies: 5/5 passed, zero runtime errors.
- `npm run check` on main engine passed; warned about two missing audio assets (`kupiaudio.mp3`, `ggfuggingez.mp3`) inherited from the upstream snapshot.
- No neural policy trained. No release/default Autopilot changes. No GitHub push or live browser/manual playtest.

## Reproduce

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python scripts/run-c15-study.py --workers 3
node scripts/analyze-c15-study.mjs
```

`reports/c15/study/study-index.json` contains the predeclared scenarios and all completed observations; the study scripts will only accept datasets with matching main-engine provenance. Reruns should use a clean `reports/c15/study/` directory rather than mixing trials from different snapshots.

## Remaining risks and C16 recommendation

A higher probing rate increases compute cost and opportunity count, not necessarily combat quality. Even a 0.16s strafe can change an entire game trajectory. Next work should instrument **per-encounter action and threat proximity** and collect substantially more randomized match units with event-based censoring, rather than fitting a policy to low-support offers. Re-evaluate performance of the additional scans on lower-end clients before any consideration of production integration.
