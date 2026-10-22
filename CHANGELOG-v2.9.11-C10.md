# v2.9.11-C10 — Motion & Latency Sensitivity (headless lab only)

- Bounded target-position perturbation in static C9 envelope, exact compatibility with zero-offset C9.
- Public sample-based velocity validation and three deterministic motion sensitivity scenarios.
- Late ranking preference capped; safe route gating unchanged.
- New 9 regression tests and 2 main-engine lab profiles.
- Passed 769 AI tests, 733 main tests, 8 paired TDM + 5-mode smoke without runtime errors.
- No new live actuation; production unchanged, no trained neural policy.
