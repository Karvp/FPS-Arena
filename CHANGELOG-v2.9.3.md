# FPS Arena 2.9.3 — Macro Vantage Research

- New bounded **attack vantage planner**, `macro-vantage.mjs`, samples 16 potential shooting positions around a hidden opponent. Unlike the v2.9.2 cover-only corridor, a candidate must have a clear 3D firing ray and be inside the weapon's useful range.
- At most two candidates are passed to geometry-aware `gridRoute` (450-expansion limit). Route length and accumulated camera threat exposure are checked; a path blocked by map geometry or with too much exposure is rejected.
- Caches both successful and failed plans; a held route is checked for collision, target movement, progress and immediate pressure before every use.
- Integration keeps priority of explosives, emergency dodge, critical reload/armor, BR ring, loot and objectives. The system never changes authoritative gun behavior or ADS policy.
- **Not enabled by default**: short matched TDM trials did not improve results compared to the original 2.9.1 Macro Combat 2.0. The planner is accessible only with `--profile macro-vantage-lab` in headless training.
- Added dedicated deterministic tests and saved the unsuccessful experimental outcomes explicitly, with no claim of improved kill rate or 90% dodge.
