# FPS Arena v2.9.11 — C35-K: Public Target Identity & LOS Calibration

**Checkpoint:** C35-K — measurement-only extension of C35-J. **Status:** ENGINEERING PASS / NO MOTOR PROMOTION / C36 BLOCKED.  **Date:** 2026-10-13.

## 1. Problem / change

Historic C12 public feature selection uses `v.team !== client.local.team`; the headless client's local team may be a `red`/`blue` string while remote snapshot teams are numeric `0`/`1`. Therefore a teammate can be selected as the nearest purported enemy, contaminating target identity, aiming-alignment and firing corridor statistics in C12-derived C13/C35-I historical measurement. This is a **measurement fault**; it does not establish a production-agent bug.

C35-K creates a new *parallel research observer* (`lab/arena/public-target-los-c35k.mjs`) rather than changing C12/C13/C35-I history or the runtime agent. The sidecar canonicalizes team codes, rejects unknown/conflicting teams, requires recent public remote snapshots and finite 3D poses, and returns a corrected C12-compatible feature dictionary alongside the original historical selected ID. The public 3D static LOS ray uses shared game geometry from *eyes* to *approximate target body center*. Footprint obstruction is classified by first intersected static box height as `below-ray`, `above-ray`, or `intersects-ray-height`. Multiple boxes may obstruct the ray, so these first-box classes are **not** exact optical truth.

This is an **opt-in observer only**: `--c35k-trace` requires an existing `--c35j-trace` pipeline, itself gated behind original C35-I/G/H, `shadow80`, C21 randomization and C16 safety. It captures public information **before** `Game.step()` and appends server shot/hit count deltas **after** the step, with no path to policy inputs. All original controller files, `page-agent.js`, `C16`, `C21`, `C12`, and `C35I` were verified byte-identical to the parent C35-J source archive.

## 2. Preregistered new-seed observational pilot

`reports/c35k/pilot-18-fresh/FROZEN-DESIGN.json` contains a content-hash-locked cohort of **18 independent TDM games**: 3 maps (`arena`, `neon`, `foundry`) × 6 weapons (`mp5sd`, `m4a1`, `aa12`, `hk_sl8`, `uzi`, `l115a3`), 60 simulated seconds per match = **18 simulated minutes**. Headless engine uses real authoritative `Game.step()` calls. Original bot opponents and world rules unchanged. `--c35h-policy observe --c35c-policy shadow80`; no new acting policy tested.

| Pre-step fire-tick outcome | Count |
|---|---:|
| Fire ticks / observed server shots | 679 / 679 |
| Corrected public target eligible | 679 |
| Original C12 selected ID differs from corrected nearest currently eligible hostile | **536 / 679 (78.94%)** |
| Valid static body-center 3D geometry | 679 |
| Static 3D eye-to-body-center LOS clear | 229 |
| Static 3D eye-to-body-center LOS blocked | 450 |
| First intersected footprint box: below-ray | 274 |
| First intersected footprint box: above-ray | 52 |
| First intersected footprint box: intersects-ray-height | 268 |
| Direct fire command changes | **0** |
| Post-step hit counter deltas | 403 |

The `below-ray`/`above-ray`/`intersects-ray-height` categories only apply when an obstacle intersects the 2D footprint; the remaining **85** observations have no first covering footprint box. They cannot be added directly to counts of clear/blocked 3D rays as mutually exclusive predictions. One may have low cover first and taller cover farther ahead.

Across the 18 independent match clusters, descriptive bootstrap (3,000 replicates) 95% percentile interval for old/new selected-ID disagreement is **56.78%–95.93%**. It measures target-selection *disagreement*, not causal shooting error or gameplay advantage. In particular, a legacy selection mismatch combines allies, no-longer-eligible contacts and other excluded contacts; **it does not mean 536 confirmed teammates**. Corrected nearest target is also only a proxy, not necessarily the enemy actually being aimed at.

## 3. Verification and reproducibility

- Node.js suite: **1,137 / 1,137 passed**, including **14 C35-K tests** covering numeric/string teams, conflicts, stale observations, low/high/overhead geometry, no server leakage, row budgets and fire integrity.
- Authoritative engine suite: **733 / 733 passed on re-run**. Earlier run recorded one intermittent failure in *AI glides down and lands* (732 / 733); original engine files were byte-identical to C35-J, so this is a test instability, not proof of a newly introduced deterministic engine regression. Both run logs are retained.
- Python suite: **40 passed, 3 skipped**, of which historical C35-I and C35-J frozen-source checksum regressions are intentionally inapplicable to an extended C35-K train-main. New C35-K source freeze, trace hashes, observer boundaries and C21/C16 integrity are verified independently.
- Full cohort: **18 / 18 cases pass** `scripts/analyze-c35k-target-los.py` and independent original C35-H C21 integer-hash ledger audit.
- Replay parity: 25-second engine replay with observer **enabled vs disabled**, original C35C/C35G/C35H/C35I/C35J trace files **byte-identical**, gameplay equal after removing only new C35-K fields and report-generation timestamp.
- Five game-mode smokes (TDM, SND, HP, BR, Zombies): **5 / 5**, no agent errors. C35-K observation itself is restricted to the registered TDM research pipeline.
- Production `page-agent.js` SHA-256: `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed` (unchanged).

## 4. Scope, limitations and next checkpoint

`C35K` clears the **measurement-integrity** gate only. Corrected static eye/body LOS is NOT the actual bullet ray, firearm spread, pellet physics, rewind, latency-compensated position, skill hit or counterfactual utility. The experiment is observational, not a randomized intervention in movement or shooting. Historical C35-I labels remain tainted; C35-K outputs are separate and do not rewrite historical datasets.

C35-L should obtain **firing-time ray geometry inside the server combat event** in an isolated post-shot logging stream, with immutable pre-action snapshots and real target identity where available, distinguish dynamic cover from static cover, and separately calibrate aim-target versus nearest-target proximity. Only after held-out calibration and reliable shot outcome density should motor policy tests be reconsidered. **No motor promotion, no C36 neural action-value training.**

### Reproduction

```bash
node --test tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
python -m unittest discover -s tests -p 'test_*.py'
python scripts/analyze-c35k-target-los.py
python scripts/verify-c35k-parity.py
# Re-run pilot exactly (will verify existing artifacts against frozen source).
python scripts/run-c35k-target-los.py
```
