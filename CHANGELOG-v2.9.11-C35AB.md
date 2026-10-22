# v2.9.11 — C35-AB (research-only)

- Added a public-only pre-step 50/50 randomized aim/motor one-tick controller with independent deterministic assignment and explicit opt-in CLI flags.
- Preserved C16/C21 priority, original firing decisions, official headless `Game.step()` input validation, and untouched production `page-agent.js`.
- Added after-step authoritative shot/pellet label matching and per-offer factual-only audit.
- Ran and preregistered 72 TDM headless games, 306 independently rechecked assignments, 24 setup-cluster bootstrap confidence intervals.
- Negative result: total kills 273 (observe) vs 237 (randomized), deaths 15 vs 18; reject controller. Six ADS assignments are insufficient for ADS conclusions.
- New files: `lab/arena/aim-movement-randomization-c35ab.mjs`, `tests/aim-movement-randomization-c35ab.test.mjs`, `scripts/run-c35ab-controlled-aim.py`, `scripts/verify-c35ab-independent.py`, `scripts/analyze-c35ab-randomization.py`, `scripts/run-c35ab-python.py`.
