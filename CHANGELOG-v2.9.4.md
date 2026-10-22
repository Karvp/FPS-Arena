# FPS Arena v2.9.4 — Temporal Vantage Diagnostics (Research)

- New bounded target-position forecast from two public remote snapshots (`macroTargetForecast`): velocity clamped, stale/teleport samples refused, prediction under 0.9 s and half-weighted to reflect direction uncertainty.
- Research profile `macro-temporal-lab` checks firing LOS at both predicted and present target positions for sizable displacements, then uses original A* and cover-risk budgets.
- Planner now emits throttled, structured action diagnostics: ineligible reasons, plan reuse, negative-cache, planned route, and no safe route. Headless runner reports counts alongside match outcomes.
- Macro Combat 3.0/temporal mode **not enabled by default**; gameplay remains on previous release policy. No changes to hit detection, server game mechanics, or ADS policy.
