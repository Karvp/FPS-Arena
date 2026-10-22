# v2.9.6 — Macro Options 3.0: outcome telemetry research checkpoint

- Added `macro-options-v3.mjs` and eight focused tests.
- Added paired baseline/shadow/active simulator profiles. Active mode is blocked outside the explicitly marked headless lab.
- Explicit option transition, veto, proposed/executed, outcome and 10 Hz snapshots, including self-induced range progress and preliminary A-B-A candidate counter.
- Shadow repeated exactly the baseline gameplay results in four short scenarios and one naturally finished TDM.
- Active option controller is rejected (shot/kills suppression in held-out Arena trial).
- 614/614 tests, 5/5 default-mode smoke, zero errors.
- Default autopilot unchanged; not yet validated against humans or real LibreWolf FPS.
