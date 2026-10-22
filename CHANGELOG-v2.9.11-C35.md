# C35 — Randomized Safe Action Technical Pilot (research-only)

- Reused C21 deterministic 3-arm per-offer assignment and C16 safety gates; did not introduce a duplicate RNG/safety policy.
- Added `randomized-safe-action-c35.mjs` with C34-quality public pre-decision snapshot, immutable ITT arm, delivered/overridden action and authoritative hostile-weapon outcomes over 0.3/0.9/1.8 s.
- Opt-in `train-main.mjs` flags `--c35-dataset`, `--c35-enemy-primary`, `--c35-registration-sha`; production unchanged.
- Added locked 90-match pilot with 3 maps × 6 enemy guns × 5 repetitions, opponent-policy/lag balancing, independent read-only replay audit, and 5,000-match-cluster nuisance bootstrap.
- 90/90 registered matches; 1,193 offers, 1,179 complete; only 19 hit-positive windows; 395 interrupted offers. **C35 full causal trial NOT approved; C36 neural learning NOT attempted.**
- Regressions: 1,012/1,012 AI, 733/733 engine, 5/5 modes, same-seed C34 byte-parity and C35 replay, production SHA unchanged.
