# FPS Arena Combat Suite v2.9.8 — Goal-Aware Arbitration Lab

- New `goal-aware-arbiter.mjs` gives subsystem-level movement provenance, conflict evidence and conservative shadow counterfactuals.
- Evidence gate only examines low-yield same-target A→TAKE_COVER→A sequences; priority actions are never blocked.
- At most one active intervention per qualifying evidence event; active intervention is restricted to headless simulator explicit profile.
- `macroOptionReconcile()` ensures option outcomes reflect executed movement, not just a planned action.
- Headless training profiles `goal-aware-shadow-lab` and `goal-aware-active-lab` plus detailed goal event logs.
- 631/631 Node regression tests pass, five-mode smoke zero errors, one natural-end Foundry pair identical; **no proven combat improvement**.
- Normal LibreWolf Autopilot defaults and existing user-facing features are unchanged.

See `reports/v298/REPORT-v2.9.8.md` and `reports/v298/Validation-v2.9.8.json`.
