# FPS Arena v2.9.11-C23 — Pressure-Conditioned Holdout

- Add reproducible 18-match, 6-stratum independent-seed C23 holdout runner, freezing registration and source SHA-256.
- Add predeclared 1.8s damage-balance pressure-subgroup analysis with match-cluster resampling and interval suppression when support is weak.
- Strengthen provenance: validate all registered jobs, reject C22 exploratory seed collisions, rehash match pairs and preserve zero-offer/censored records.
- Add ten tests; complete 898/898 AI regression and 733/733 uploaded-main tests; five-mode smoke passes.
- Observed 48 assigned encounters, 47 complete windows, 16 damage-positive windows and only 2 incoming-damage windows. Q-value training gate remains BLOCKED.
- No changes to production Autopilot, `page-agent.js`, C16 safety gate or randomized C22 command actuator.
