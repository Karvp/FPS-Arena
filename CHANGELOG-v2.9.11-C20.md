# FPS Arena v2.9.11 — C20 Common-Seed Tactical Value Study

- Added a preregistered **same-game-seed two-fork** experiment: unchanged Release baseline versus opt-in C16 safe micro-strafe, both simulated from the same seed, map, weapon and lag.
- Added explicit `--c20-matched-seed` gate in the authoritative headless `train-main.mjs`; cannot be used without `--c19-natural`, `--full-match`, and a C17 preassigned dataset. Original production `page-agent.js` is byte-for-byte unchanged.
- Added C20 runner, 600-second administrative censoring, strict input/result provenance, 12 paired seeds from six strata, deterministic stratified descriptive bootstrap, leave-one-stratum-out analysis and no-actuation identity assertion.
- Added a **research-only neural match-contrast diagnostic** (pre-treatment map and weapon one-hots -> 8 tanh neurons -> 1 output) with leave-one-stratum-out and zero/mean baselines. This is NOT an action-value/Q-learning policy and must never control the player.
- Executed 24 naturally concluded full-length TDM episodes. Paired mean kill-differential contrast +1.083, descriptively bootstrapped interval [0, 2.167], exact sign count 7 positive / 5 negative. No proof of generalizable gain; leave-one-stratum-out ranges below zero.
- Neural diagnostic **underperformed** the zero-effect baseline (RMSE 6.776 vs 5.795); promotion and individual-action value claims are prohibited.
- 13 new focused tests; 866/866 total AI tests; 733/733 main game tests; 5/5 short smoke game modes, no runtime errors. Research-only, no GitHub push.

See `C20-ENGINEERING-REPORT.md` and `reports/c20/study24/`.
