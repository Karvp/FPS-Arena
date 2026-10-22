# FPS Arena v2.9.11 — C35-O: Adaptive Snapshot Freshness & Public Target Tracking

**Checkpoint:** 2026-10-13. **Status:** Engineering PASS; measurement-only, no motor/aim policy promotion; C36 neural promotion remains BLOCKED.

## Motivation and scope

C35-N identified 26.70% public target candidate coverage at 215 ms simulated lag, but prior lag strata were confounded by different weapon/map/seed setups. C35-O addresses that problem with a **paired initial-condition lag factorial**: 12 setups (Arena, Neon, Foundry × MP5SD, M4A1, AA-12, L115A3) × four lag levels (30, 85, 150, 215 ms), 60 seconds each = **48 authoritative TDM matches / 48 simulated match-minutes**. Every arm uses original `page-agent.js` and the same C21/C16 `shadow80` research policy. No new control action is produced.

- `lab/arena/public-track-freshness-c35o.mjs` uses ONLY public `client` state before `Game.step()` and computes aim-ID/nearest-ID candidates under thresholds 150, 200, 275, 350 ms. It optionally estimates target motion from two public-buffer frames with an explicit velocity plausibility cap (12.5 m/s) and **125 ms maximum extrapolation**. This motion projection is diagnostic, not a calibrated probability or new aim policy.
- `train-main.mjs` enables the new observer exclusively with `--c35o-trace` and the complete C35-L passive observer stack; no other path is changed. C21 assignment and C16 safety remain authoritative.
- `scripts/c35o_freshness_analysis.py` joins shot-time public candidate records with post-step server firing truth, checks timestamp and shot-count identity, scores only shots with confirmed player hits for target ID, and keeps misses in coverage denominators. Shotgun pellets are aggregated within shots, not treated as independent trials.
- `scripts/run-c35o-paired-latency.py` preregisters a source-hashed study and resumable cases; `scripts/verify-c35o-independent.py` separately verifies source hashes, C21, fire-command immutability, dataset SHA256 and hit/pellet counts. `scripts/verify-c35o-replay-parity.py` checks old trace parity with observer disabled.

## Results — 48 TDM matches

Total authoritative shots **1,365**, pellet rays **3,389**, player-hit shots **1,002**, shots without player hit **363**, C21 randomized offers **175**, C21 assignment mismatches **0**, modified fire commands **0**.

### Candidate coverage by simulated lag

| Lag | Shots | Max 150ms | Max 200ms (C35-K) | Max 275ms | Max 350ms |
|---|---:|---:|---:|---:|---:|
| 30 ms | 283 | 100.0% | 100.0% | 100.0% | 100.0% |
| 85 ms | 390 | 100.0% | 100.0% | 100.0% | 100.0% |
| 150 ms | 370 | 51.9% | 99.5% | 100.0% | 100.0% |
| 215 ms | 322 | 0.0% | 34.2% (110/322) | **98.8% (318/322)** | 100.0% (322/322) |

Primary pre-registered contrast: 215-ms lag, coverage gain of max350-ms over max200-ms **+65.84 percentage points**; **95% setup-cluster bootstrap CI [56.60, 71.78] percentage points** (12 matched initial setups, 2,000 resamples). Max275-ms instead of max200-ms recovers **208 additional shot-time candidates** in this lag group.

Of these 208 marginal recovered shots, 137 contain a player hit; conditional aim-candidate target-ID agreement is **90.62%**. This is a descriptive identity metric on a selected subset, not counterfactual aiming quality. At lag215, the overall eligible/hit-conditional ID agreement is **85.54%** at 200ms, **88.84%** at 275ms, and **88.94%** at 350ms, but these involve DIFFERENT eligibility subsets and must not be interpreted as a comparable improvement in accuracy. The bounded constant-velocity projection has **lower hit-conditional target-ID agreement** than raw public angular candidate in this cohort and is **rejected as a live policy**.

## Foam status

Natural pilot recorded **0 foam-blocked pellets and 0 shots with dynamic cover**. A separate authoritative Game/`fireWeapon` fixture injected a valid dynamic foam wall into `Game.worldBoxes()` and confirmed the real server ballistic collision was tagged `worldKind=dynamic-foam`. This demonstrates instrument classification, **not prevalence or effectiveness during natural play**. A gameplay scenario generator that naturally triggers foam remains a future task.

## Validation and replay

- Node.js AI: **1,157/1,157 PASS** (new C35O observer, adversarial public/team/time/speed tests and authoritative foam fixture).
- Authoritative engine suite: **733/733 PASS**.
- Python: **74 PASS, 5 historical SKIP, 0 FAIL**; a historical C35-L locked-`train-main.mjs` hash check is skipped because C35-O intentionally extended this file. Its historical preregistration checksum is still verified, and this study's new source hashes were frozen before the cohort.
- Five-mode Release smoke (TDM, SND, HP, BR, ZM): **5/5 PASS**, 0 agent errors.
- Independent 48-case audit: **PASS**, 0 C21 assignment mismatches, 0 modified fire commands, full shot/pellet ledger reconciled.
- Replay of one frozen 60-sec match with/without C35O observer: original C35C/G/H/I/J/K/L sidecars **byte-identical**, `result.json` matches after excluding observer counters and timestamp.
- `page-agent.js` production SHA256 remains `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`.

## Limitations and decision

These headless 60Hz simulations are deterministic initial-condition comparisons, but changing lag changes the ensuing trajectory; equal seeds do not imply per-shot or per-contact equivalence. The 12 setups provide limited generalization, and no human-network or asynchronous browser effects are represented. The identity target of a complete miss is unknown. Lowering abstention at 215ms **does not establish safe engagement or superior gameplay**. Neither movement nor aiming policy was promoted; original v2.9.11 Release is unmodified; C36 remains blocked.

**C35-P follow-on:** prospective tracking-confidence calibration and genuine dynamic-foam encounter generation with setup-paired controlled scenarios; holdout evaluate miss/ID-disagreement and eventual actor impact under strict C16, before any activation.

## Reproduction

```bash
cd FPS-Arena-Combat-Suite-v2.9.11-C35O
python scripts/run-c35o-paired-latency.py
python scripts/verify-c35o-independent.py
python scripts/verify-c35o-replay-parity.py
python -m unittest discover -s tests -p 'test_*.py'
node --test --test-concurrency=4 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js)
```

Frozen registration SHA256: `beecba556913b8d38f03647eaefe65f4f3e0db4e3521ac88c37a97a6c85617c0`.
