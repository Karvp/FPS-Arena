# FPS Arena v2.9.11 — C24 Threat Cue and Authoritative Hit Audit

**Date:** 2026-10-12 · **Base:** C23 · **Branch status:** RESEARCH ONLY / no production actuation changes.

## Executive conclusion

C24 adds a **strict temporal separation** between (a) shot cues already delivered to the headless client before a randomized encounter decision and (b) authoritative hostile shot/tracer proximity/weapon-hit labels emitted **after** that decision. This is not a trained predictive system. FPS Arena uses **hitscan** for firearms: the shot resolves server-side before an event packet reaches the client, therefore the client cannot dodge that completed shot by reacting to its tracer. The new cues could only inform predictions about future exposure, and they have **not been validated** as reliable precursors.

- 18/18 newly seeded 75-second TDM matches completed, 6 map×weapon strata × 3 seeds; 5 stress bots, 65-ms snapshot lag.
- **82 assigned eligible encounters**, 79 complete non-overlapping 1.8-second windows, 3 censored.
- **6/79 windows with confirmed hostile weapon hits**, **15/79** with at least one displayed hostile tracer within 2.5m of server trainee position (not a confirmed near miss).
- Entire 18-match sample: **5,442 hostile server shot events**, **611 near displayed-tracer events**, **126 server-confirmed hostile weapon-hit events** and **3284.5962 HP+armor damage**. Events outside eligible windows remain counted.
- AI regression **908/908**, main game tests **733/733**, five-mode smoke **5/5**; runtime errors 0. Same-seed C22-vs-C24 instrumentation parity covers **18/18 game metrics** and identical encounter assignments/tick counts.
- Neural action-value model training gate: **BLOCKED**; no source-level production agent changes.

## Code changes

1. `lab/arena/threat-trace-observer-c24.mjs`: geometry guard for finite, clipped tracer segments; public shot packet arrival log limited to 65m and a 1.5-second **past-only** history; server hit/near-tracer labels attached to the current non-overlapping C22 encounter window after random assignment. Enemy team is only used for **offline server labels**, never in the pre-action public cue.
2. `lab/arena/train-main.mjs`: `--c24-dataset` research-only switch; copies observable packet arrivals before client tick and authoritative event data after the official server firing/damage pipeline; C22 randomized safety-gated command kept byte-for-byte in use, with no production modifications.
3. `lab/arena/evaluate-threat-cues-c24.mjs`: reuses strict C22 dataset validation, enforces additional temporal provenance, registration SHA and source hash, map×weapon/seed accounting, and refuses sparse-data training. Every match is counted even with zero offers.
4. `lab/arena/run-threat-study-c24.mjs`: preregistration locked to SHA-256, fixed seed plan, resumable result+dataset pair validation. Files are checked independently by `scripts/verify-c24-provenance.py`.
5. `tests/threat-trace-c24.test.mjs`: 10 tests for tracer geometry, future-leak prevention, hostility labeling, optional zero-signal findings, data tamper and registration checks.

## Important definition limits

- A *server hostile shot* is a hostile-trigger event, **not necessarily a shot aimed at the trainee**.
- A *near tracer* is geometric proximity between the server trainee torso center and one of **at most three displayed tracer segments**, not a confirmed physical near miss; weapon spread and pellet paths not exported as tracers remain unobserved.
- A *hostile weapon hit* requires a server-positive HP/armor delta with a hostile weapon source. This is stronger evidence than tracer proximity but is very sparse inside eligible encounters.
- A *public shot cue* is recorded only **when a delayed shot packet arrives** in the client event queue; it might come from a friendly. It cannot include future hidden shooter state or bullets not emitted to the client.
- The experiment is against stress bots in a headless game, not a real browser/human opponent study; do not infer mouse/visual FPS latency or production dodge improvement.

## Primary results — predeclared 1.8-second windows

| Assigned action | Complete windows | Matches represented | Server hostile shots in windows | Windows with near tracer | Windows with hostile weapon hit | Hostile weapon damage |
|---|---:|---:|---:|---:|---:|---:|
| Keep baseline | 21 | 12 | 210 | 5 | 1 | 27.3000 |
| Micro left | 31 | 14 | 220 | 7 | 4 | 225.7241 |
| Micro right | 27 | 11 | 150 | 3 | 1 | 27.3000 |

No per-arm odds ratio or treatment effect is reported. Even with action randomization, the windows are few and correlated within matches; future eligibility, firing rate and exposure may change as a consequence of assignment.

### Do earlier visible shot cues forecast future hits?

| Historical pre-action shot cue (1.5s) | Complete windows | Later windows with hostile weapon hit | Descriptive incidence |
|---|---:|---:|---:|
| At least one received shot | 49 | 3 | 6.12% |
| No received shot | 30 | 3 | 10.00% |

This simple, uncalibrated cue **does not demonstrate predictive value** on this cohort. The observed rates are especially unstable because there are only six positive windows in total; the cue is not an action trigger.

## Reproducibility and statistical decision

- Registered plan: `reports/c24/study18/PRE-REGISTERED-PLAN.json`.
- Main raw results: 18 `*.result.json` + 18 `*.dataset.json`, `COMBINED-DATASET.json`, `EVALUATION.json`, `PROVENANCE-VERIFICATION.json` and deterministic `RECHECK.json`.
- Registration SHA-256: `bf5c372a8fce91c579dd8da0a4dba027c906a11795e9724e9d099c9fda7cf3b8`.
- Source fingerprint SHA-256: `e6246dd10b383b0b355012e5408cdf4caec4eb9c91588e6c922e705897b24f3d`.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (matches C23).
- Zero reused seeds across C22 and C23 source cohorts.

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && node tools/check.js)
node lab/arena/run-threat-study-c24.mjs --repetitions 3 --seconds 75 --workers 4 --out-dir reports/c24/study18
node lab/arena/evaluate-threat-cues-c24.mjs reports/c24/study18/COMBINED-DATASET.json reports/c24/study18/PRE-REGISTERED-PLAN.json reports/c24/study18/RECHECK.json
python scripts/verify-c24-provenance.py
```

**Safety and research decision:** Keep unchanged C16 safety gate and C22 three-arm randomized research controller. No neural Q/action-value policy trained on these labels and **no production enablement**. Future work must obtain more independent defensive incidents, validate cue calibration and guard against within-match dependence. This is an informative failure of data adequacy, not a demonstration of tactical advantage.
