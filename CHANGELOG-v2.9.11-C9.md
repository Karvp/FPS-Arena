# FPS Arena v2.9.11 C9 — Main-Engine Ballistic Engagement Envelope

Research-only extension of C8; upstream game-main snapshot is preserved under `lab/arena/source-main/`.

- `engagement-ballistics.mjs`: deterministic, bounded low-discrepancy spread-ray test using current main hitscan geometry conventions; body/head hitboxes, stance, ground state, ADS vs hip, multiple pellets and distance falloff. Explicit uncalibrated/static model.
- `tactical-director.mjs`: opt-in ballistic-aware cheap endpoint screening and small utility adjustment; no new A* calls and no safety veto removed. Adds diagnostic per-endpoint quality in candidate audit and plan selection.
- `aim-core.mjs` and `agent-entry.js`: `tacticalDirectorBallisticLab`, defaults false; requires `tacticalDirectorMainWeaponStatsLab` and `__FPSARENA_HEADLESS_LAB__` for integration.
- `scripts/build.mjs`: inline ballistic module into `page-agent.js` before Tactical Director (critical for the data-URI headless simulator and browser bundle). No runtime import from the server/private state.
- `lab/arena/train-main.mjs`: `director-ballistic-shadow-lab` and `director-ballistic-recovery-lab`, main-engine-only research profiles.
- `tests/tactical-director-ballistic-c9.test.mjs`: 11 focused tests of engine geometry, attachments, sniper, shotgun, malformed inputs, safety, bundling, routing limits and CPU bounds.
- `scripts/evaluate-c9-geometry.mjs`: comparison to source-main shared geometry using 1,536 reference triggers per static test case.
- `scripts/evaluate-c9-main.py`: reproducible 3-seed, 5-profile authoritative headless paired match evaluation.
- `scripts/export-c9-atlas.mjs`: 38 selectable ranged weapons, 584 weapon/attachment/distance rows; knife excluded.

Verification: 760/760 AI regressions, 733/733 main-engine tests, full main consistency checks and 5-mode headless smoke. Paired 15 55-second TDM episodes (3 seeds x 5 profiles) showed 9 kills and 35 shots in every profile, zero runtime errors, 8 C9 shadow plans vs 6 C8 shadow plans, and no active actuator override. This is NOT a demonstrated combat performance improvement. Browser/LibreWolf not tested. Neural policy not trained. Default production settings unchanged.
