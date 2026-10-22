# v2.9.11 — Engagement Opportunity Lab

- Introduced bounded `tacticalFirstShotWindow` and path-prefix truncation for earliest reachable weapon-range + 3D LOS opportunities, in opt-in lab only.
- Preserved ordered A* waypoints, route risk vetoes, safety shield, target-change invalidation and immutable shadow behavior.
- Added simulator profiles `director-engagement-lab`, `director-engagement-shadow-lab`, and `director-engagement-trial-lab` (strict, shotgun-only headless ablation).
- Added server-confirmed `firstShotAt` and `firstHitAt` metrics to game simulations.
- Added 13 focused tests and reproducible paired dataset in `reports/v2911/`.
- **No combat improvement demonstrated**: short and natural-end comparisons matched release, experimental trial did not secure control authority. No new behavior enabled in normal LibreWolf.
- See `reports/v2911/RESEARCH-v2.9.11.md` and `reports/v2911/VALIDATION-v2.9.11.json`.
