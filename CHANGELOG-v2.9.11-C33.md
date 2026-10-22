# FPS Arena v2.9.11 — C33 Long Research Checkpoint

- Added `lab/arena/map-encounter-c33.mjs`: real Arena/Foundry/Neon static world geometry with authoritative `stepMove()` and `fireWeapon()` paired counterfactual evaluations.
- Added `lab/arena/map-encounter-refined-c33.mjs`: separately registered adaptive public-map/heading refinement with 19 non-future features.
- Added `scripts/generate-c33-map-encounters.mjs` and `scripts/generate-c33-refined.mjs`: 6,480 preregistered encounter seeds (19,440 arm outcomes), immutable source and dataset fingerprints, disjoint split/seed checks.
- Added `scripts/train-c33-map.py` and `scripts/train-c33-refined.py`: six seeded actual neural trainings per study; candidate selection exclusively from validation.
- Added `scripts/evaluate-c33-sealed.py` and `scripts/verify-c33-map-data.mjs`: frozen-policy sealed holdout, paired bootstrap, independent full-label replay.
- Added `tests/map-collision-c33.test.mjs`: 13 new regressions; 987/987 entire AI suite, 733/733 game tests, 5/5 mode smoke.
- **Both neural promotion gates FAIL** despite 77% collision coverage; do not deploy experimental neural policies.
- **Production unchanged**. This is controlled synthetic 1v1 on real static game map geometry, *not* a replay of actual logged world-coordinate encounters or evidence of multiplayer improvement.
