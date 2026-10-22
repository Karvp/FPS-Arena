# v2.9.11-C35AJ — State-Conditioned Tactical Option Value

- Frozen 36 independent setups x 3 arms x 90 seconds (108 actual `Game.step()` TDM matches).
- Independent SHA-256, deterministic option and C21 assignment audit, authoritative displacement and ballistic checks.
- Reused unchanged safety-guarded C35-AH multi-tick option randomizer and C35-AI post-step physical audit.
- Trained factual-only state Ridge, option-conditioned Ridge, 8- and 16-hidden-unit neural MLP baselines with setup-separated train/validation/holdout.
- Exported portable JSON model weights and independent JavaScript inference with held-out numerical parity tests.
- 12-setup prospective holdout off-policy IPS/SNIPS with setup-cluster bootstrap and exact assignment propensities; did not establish value improvement.
- Preserved zero-offer training setup, censored windows, interruption accounting, and original release/observe/randomized cohorts.
- PASS Node 1324/1324, engine 733/733, Python 172 pass/5 skip, 5-mode smoke, gameplay replay.
- No change to production page-agent.js; neural policy remains OFFLINE_ONLY.
