# FPS Arena TDM v66 — persistent full-natural-match research checkpoint

Verified: 2026-10-23. Canonical Windows codebase:
C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Provenance and frozen boundaries

- Parent Git checkpoint: b9682cc, tag research-v65-full-natural-tdm.
- Simulator research baseline is **C35AJ**, NOT a complete v57–v59 reconstruction. V66 reuses **unchanged, frozen** v64 command runner and v65 match auditor. No gameplay or shipped neural changes.
- Production Classic LibreWolf extension, official server engine, bot source, and Passive/Aggressive weights are unchanged.
- Earlier v60–v65 source/registry hashes verified. Public before-step target/teammate/geometry and WASD-only 150-tick interventions; authoritative prestate/RNG are matching witnesses, not actor inputs.

## Frozen preregistration
- Registry: research/tdm-v66-natural-frozen-registry.json
- Registry SHA-256: cabb7472b86f7ae13dd6c01312264e197afb20fa7c4af1bf0098f91b951f1084
- 16 discovery seed groups (64 real Game.step() full TDM 4v4 matches) and 3 unopened new holdouts. All old holdouts remain sealed.
- Maps: Arena, Foundry, Neon; weapons: MP5SD, UZI, M4A1, AA12; triggers: public aim-lock or post-fire.
- Official simulator bots, 8 total players, 45ms public snapshot lag, natural terminal at 50 team kills, guard at 600 simulated seconds.
- One independent seed group with four arms is the statistical unit. No model fitting or new production controller.

## Full natural-match results

- All **64/64 matches ended naturally** with server result phase after one team reached 50 kills. Zero censored matches, zero engine errors.
- Independent 4-arm audit: **16/16 PASS**. Identical public trigger or no-trigger, command prefix, and server + real PRNG pre-branch witnesses.
- Only **10/16 groups actually triggered**. Six silent groups stay in descriptive reports; they are excluded from treatment-effect estimation.
- Trainee team won 60/64 matches against official bots. This is descriptive incumbent/team performance, NOT evidence an experimental arm improves gameplay.
- No-instrument full-match Keep parity: **105/105 original fields identical** on two seeds (660101 Arena/MP5SD and 660109 Neon/AA12); the extra control runs are not counted among 64 arms.

### Matched treatment effect versus Keep (10 eligible seed groups)

| Arm | Delta net kills (mean and 95% seed bootstrap CI) | Delta deaths | Delta damage taken |
| --- | --- | --- | --- |
| Close | +1.20 [−2.30,+4.90] | 0.00 [−0.60,+0.50] | +35.00 [−44.40,+100.40] |
| Strafe | +2.00 [−1.00,+5.60] | 0.00 [−0.50,+0.50] | +22.60 [−34.20,+84.30] |
| Withdraw | +0.70 [−2.20,+3.80] | −0.50 [−1.10,+0.10] | −68.30 [−161.30,+35.51] |

All net-kills confidence intervals include zero; no arm establishes non-increasing deaths/damage with its upper risk CI. The preregistered threshold of 12 independent triggered full-natural-match groups is not met (only 10). **Statistical gate FAIL; NO PROMOTION.** Natural matches have different durations after interventions, and replayed RNG/bot paths can diverge.

## Important diagnostic: tactical coverage is not yet general

- Trigger coverage: Arena 5/6, Foundry 5/6, Neon 0/4; UZI 5/5, MP5SD 4/5, M4A1 1/3, AA12 0/3.
- Reasons from public-cue diagnostic counters: outside-band dominated Neon M4A1; range-not-engaged dominated Neon AA12 and Arena AA12. One Foundry MP5SD was inhibited by low HP.
- Neon/AA12 seed 660109: Keep shot only **one bullet** and earned one kill over the whole naturally completed match. The priority is path planning and range-aware combat acquisition rather than larger neural networks.
- Reasons are observational diagnostics, not privileged post-step features and not new training targets. Sealed holdouts remain untouched.

## Artifacts and checks

- scripts/tdm_v66_natural.py — immutable preregistration, replay runner, four-arm audit, seed bootstrap and natural-end censor handling.
- scripts/tdm_v66_trigger_coverage.py — public-cue trigger coverage analysis, not a policy.
- tests/tdm-v66-natural-fullmatch.test.mjs — 5 tests: source hash, 64 matched branches, two full-match Keep parity controls and sealed holdouts.
- Focused V64–V66 tests: 12/12 PASS.
- Full tests/*.test.mjs suite: **1361/1362 PASS**, one old Windows path issue C:\C:\Users... and zero new regressions.
- research/tdm-v66-natural-independent-audit.json, research/tdm-v66-natural-evaluation.json, research/tdm-v66-trigger-coverage.json, research/tdm-v66-locked-manifest.json.
- Keep the 64 raw arm matches and two uninstrumented baseline parity JSONs in one persistent Git repo; large logs ignored, no new versioned source ZIP.

## Next v67

Repair legal public map/weapon movement acquisition in Neon and AA12 with independent new seeds and holdouts. Measure rate of engagement, survival, damage and full natural-match results before actor action-value fitting. Avoid any change to production Classic or prematurely promoted weights.
