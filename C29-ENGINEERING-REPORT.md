# FPS Arena v2.9.11 — C29: Long-Form Transfer and Falsification Study

**Study date:** 2026-10-13. **Parent:** C28 controlled three-arm micro-encounters. **Status:** RESEARCH-ONLY — **STOP GATE FAILED**. This is a deliberately longer, genuine negative-validation checkpoint. **The C28 neural network is not ready for full-match policy efficacy claims or production.**

## Research question and preregistration

Can the frozen C28 action-value MLP (10→24→12→3) receive **genuine client-observable feature vectors** in full `Game.step()` matches often enough to make controlled neural-vs-simple-vs-original comparisons meaningful?

C28 showed mean capped surrogate damage **80.02** with neural vs **109.10** under original movement on 144 held-out *scripted micro-encounters*. It did **not** prove that neural beat a simple lateral rule (mean 83.25, interval for neural's advantage crossed 0). Crucially, C28 used synthetic lateral offset and velocity in shooter-relative frame. These do not transfer exactly to delayed, client-observable multiplayer snapshots.

C29 preregistered a **transfer-validity gate** and a separate larger efficacy experiment in `reports/c29/long-study/PRE-REGISTERED-PLAN.json` (SHA-256 registration recorded there). Full efficacy evaluation is prohibited until the transfer gate passes. The pilot has 48 independent preassigned seeds across Arena/Neon/Foundry, six primary weapons, three opponent modes and three client snapshot delays. Each pilot game runs **105 seconds**. The unused three-policy full-match protocol has 216 independent seed blocks × three policies × 150 simulated seconds = 648 match episodes. No result-dependent seed substitution is allowed.

Predeclared transfer gate: **at least 16 complete independent pilot matches, at least 50 qualifying offers and at least 80% neural action coverage** among eligible offers, zero runtime errors. The larger study additionally requires evidence over the best simple comparator, independent seed blocks and browser runtime/safety checks before any production consideration.

## What was actually run

The 48/48 headless pilot games completed using the uploaded authoritative `main` engine and its `Game.step` server physics. Every run has a paired result JSON plus a dataset JSON, validated against the fixed seed/map/weapon/opponent/lag/105-second tuple and the C28 frozen neural model SHA-256. This is **84 minutes of simulated game time**, not an assertion of 84 minutes of human play or elapsed CPU time.

| Transfer measurement | Verified value |
|---|---:|
| Independent complete pilot games | **48/48** |
| Total safety-eligible micro-offers | **329** |
| Neural can actually choose and perform left/right | **49** |
| Conditional actuation coverage | **14.894%** |
| 95% bootstrap interval, resampled by match (6,000 draws) | **10.444%–19.643%** |
| Fallback: offset or lateral motion outside C28 support | **270** |
| Fallback: distance outside C28 support | **10** |
| Games with at least one neural intervention | **25/48** |
| Games without safety-eligible micro-offers | **3/48** |
| Neural left / neural right / fallback-to-baseline offers | **39 / 10 / 280** |
| Runtime errors | **0** |
| **Prespecified gate** | **FAIL — required 80%** |

By opponent, eligible-offer coverage was stress 21/110 (19.1%), mixed 13/131 (9.9%), official 15/88 (17.0%). By lag, coverage was 32/128 (25.0%) at 35 ms, 13/128 (10.2%) at 65 ms, and 4/73 (5.5%) at 125 ms. These are descriptive and *not separate superiority hypotheses*. Original C28 feature support included `offset ∈ [-3,+3]`, `|base lateral velocity| ≤ 2.8 m/s`, and distances 8–75 m; C29 intentionally refuses to clamp far-OOD observations into that support.

## Transfer pipeline, fidelity, and failure mechanism

1. `lab/arena/research-policy-c29.mjs` loads the **unmodified frozen C28 weights** with a cryptographic hash. JS inference was cross-tested against the original PyTorch implementation on C28 development vectors with error under 1e-6.
2. The code uses only delayed client-snapshot enemy position/yaw/weapon, own position/velocity, and configured snapshot delay, **before** the server game step. It does **not** access hidden enemy positions, server hits, future tracer rays, future labels or counterfactual outputs.
3. The mapping of C28 `offset` to an enemy's delayed **body yaw** is a *declared imperfect proxy* for the original simulator's scripted shooting direction. This unresolved covariate shift is part of the validation failure.
4. The previously established C14/C16 safety rules remain intact: TDM-only, freshness, range and HP thresholds, grounded and non-priority movement, symmetric public geometry clearance, short intervention (0.16s) and cooldown. When an eligible offer falls outside C28 model support, the controller gives the incumbent command back **without altering production gameplay**. It cannot silently extrapolate or choose a direction based on future knowledge.
5. Even within supported states, this pilot does not prove that neural outputs are *well-calibrated for full combat*. The proposed neural-vs-simple efficacy phase never ran; **no full-match neural victory or benefit is asserted**.

## Verification

- **950/950** Node AI tests pass, including C29 research MLP/PyTorch cross-checks, public-only feature validation and safe fallback tests.
- **733/733** uploaded `main` game engine tests pass; engine static checker passes (pre-existing missing optional audio warnings).
- **5/5** game-mode smoke tests (TDM, SND, Hardpoint, BR, Zombies) pass with zero errors.
- C29 baseline controller versus C16 forced control, same seed, 75 seconds: **16/16 gameplay fields identical**.
- C27 historical preregistration is verified against an immutable, byte-identical *pre-C29* runner snapshot after C29 extends `train-main.mjs`; the original C27 registration/hash is not modified.
- `page-agent.js` remains **SHA-256 `6a0381159e7c726a4ce8c0122618f1e1f299c43c5734d1d07b02ae4bb56d73ed`**, same as C28. No production neural actuation and no GitHub push.
- Entire pilot analysis reproducible with `python scripts/analyze-c29-transfer.py`; this verifies all 48 result/dataset pairs and model provenance. The full experiment command is hard-blocked when the transfer gate fails.

## Decision and longer-checkpoint principle

**C29 is a completed transfer-falsification checkpoint, not a validated neural policy release.** It is scientifically preferable to stop rather than waste 648 additional full-game episodes on a model that can act on only ~15% of eligible cases. The hypothesis that the C28 input representation directly transfers to multiplayer state has failed the preregistered feasibility gate.

The next model revision must be **trained on the actual causal, client-visible observation schema** (time-consistent target position, velocity and shooter-direction uncertainty), with measured feature support across maps/lag/opponents and explicit OOD handling. Reevaluate only on new independent seed sets, against original Autopilot and a simple lateral rule, using paired *whole matches* (not offers) as the inferential unit. Require safe rollout evidence on an actual browser/client as well as server simulation before promotion.

**A checkpoint should now consist of a preregistered hypothesis → reproducible implementation → broad independent tests → uncertainty analysis → explicit pass/fail decision. More small patches are not substitutes for validation.**

## Reproduce / audit

```bash
node --test --test-concurrency=1 tests/*.test.mjs
(cd lab/arena/source-main && node test/run.js && npm run check)
python scripts/analyze-c29-transfer.py
python scripts/run-c29-research.py --stage status
# The following is intentionally refused unless the full pilot transfer gate passes:
python scripts/run-c29-research.py --stage full --limit 1
```

Caution: `--stage full` is *not* a completed study in this release. The gate will reject its execution without a fully passing pilot. Running the same pilot with new thresholds would invalidate the original preregistration; start a separate hypothesis instead.
