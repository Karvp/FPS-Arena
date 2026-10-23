# FPS Arena TDM v61 — persistent discovery checkpoint

Date: 2026-10-23. Host path: C:\Users\admin\Codes\FPS-Arena-TDM-Neural

## Scope and provenance
- Source baseline is **C35AJ** (persistent research Git tree). It is not yet the reconstructed full v57-v59 research source.
- V60 frozen runner, trained models, Classic LibreWolf and shipped extension are unchanged.
- V61 uses its own research-only runner, derived from the frozen V60 runner, so V60 source hashes remain stable.
- Trigger cues are strictly pre-step public client state: previously emitted fire command, own HP decrease, or sustained ADS/aim aligned to a fresh public target.
- Arms Keep / Close / Strafe / Withdraw alter only movement. Original fire/ADS/aim and skills are preserved. Private server/RNG state is hashed solely as an independent matching witness.

## Preregistration and results
- Registry: research/tdm-v61-frozen-registry.json
- Registry SHA256: acfb1841939aa36e1e18014cb50ad4bafe6077c2918dcd214e4f12ab194773f4
- All 9 discovery seed groups executed (36 research runs of up to 78 simulated seconds).
- Independent four-arm audit: **9/9 PASS**; triggered: **6/9**; hazard/reward positive in 480-tick future window: **3/9**.
- Trigger tick examples: Arena/UZI aim-lock 1626, Arena/UZI post-fire 3546, Foundry/UZI aim-lock 1290, Foundry/UZI post-fire 1248, Arena/MP5SD aim-lock 1596, Neon/M4A1 post-fire 2286.
- Foundry/UZI aim-lock: Withdraw +1 kill with no damage in window, other arms zero.
- Foundry/UZI post-fire: Strafe +1 kill and 23 damage in window, other arms zero.
- Arena/MP5SD aim-lock: Close +2 kills / 27 damage; Strafe +1 kill / 0 damage; Withdraw +1 kill / 0 damage; Keep 0 kills / 50 damage.
- The other triggered and untriggered groups remain in the dataset, including their null/zero labels. No cherry-picking.
- **Two holdout groups have not been opened.**
- Training gate **NOT PASSED**: at least 16 independent triggered groups with 8 reward/hazard-positive groups are required before proposing an action-conditioned model. No model trained, no promotion.
- K/D at 78-second cap is NOT the outcome of a naturally completed full TDM match, and does not replace registered 480-tick branch reward labels.

## Verification
- V60 old frozen registry independently verified.
- V61 Python protocol independently verifies pre-branch command-prefix, trigger public feature, server witness and genuine PRNG state for each four-arm case; it also verifies outcome counter deltas and source hashes.
- The V61 Keep arm matches the no-instrument baseline on 105/105 fields at Foundry/UZI seed 610103.
- Focused V60/V61 tests: 15/15.
- Full repository tests under tests/*.test.mjs: 1337/1338 passed; one preexisting malformed Windows path test remained. The unrelated old source-main/test/run.js may have a Windows EPERM temp cleanup error if running unqualified node --test.
- Raw telemetry and full test logs: data/v61/ (ignored by Git). Persisted summarized audit: research/tdm-v61-audit-summary.json.
- One persistent working Git codebase, not multiple ZIP project copies.

## Next
Do not tune v61 on existing discovery outcomes. Preregister additional *new* discovery seeds as a new research cohort and keep holdout untouched until stronger model quality and survival checks. Original Passive/Aggressive neural weights remain protected.
