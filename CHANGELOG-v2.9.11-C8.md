# FPS Arena C8 — Effective Weapon Engagement Bands (headless research)

- Reads the effective `curWeapon` range, damage falloff, physical maxRange, and mobility multiplier already supplied by the uploaded game main engine. Never imports private server game state into the live extension.
- Preserves the legacy category-band default and all C6/C7 profiles. Enables only under `tacticalDirectorMainWeaponStatsLab` AND `__FPSARENA_HEADLESS_LAB__`.
- Uses **physical shot max** solely for protecting visible firing opportunities and a separate heuristic **useful tactical band** to score prospective route endpoints. Range weighting is not a calibrated hit model.
- Adds two explicit main-engine-only ablation profiles: `director-main-stats-shadow-lab` and `director-main-stats-recovery-lab`.
- Validates malformed weapon fields with fallback; disallows unexpected numeric values from changing planner bounds.
- No live movement changes, no policy trained, no GitHub push.

Verification: 749/749 AI tests, 733/733 main tests, 5-mode smoke, four paired-seed triples with no reported combat differences.
