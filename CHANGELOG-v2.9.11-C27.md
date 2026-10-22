# C27 — Temporal Threat Generalization

- Added actual offline `GRU(5,8)` training for 3-step causal client history; no server labels in features.
- Added deterministic PyTorch training and frozen development/validation candidate selection before test exposure.
- Added factorial 6 map/weapon strata × 3 simulated opponent types × 2 snapshot lags, 36 new unique-seed research trials (40 seconds each), all completed.
- Added preregistration, raw opponent-policy provenance, exact source/model hashes, safe resume, fixed evaluation, match-cluster bootstrap, and additional domain diagnostics.
- Validation-selected temporal logistic improved raw new-seed Brier (0.0446517→0.0429469) and log loss (0.2058931→0.1879219), **but the match-bootstrap interval includes zero**; GRU failed development validation selection.
- Passed 935/935 AI tests, 733/733 game engine tests, 5/5 smoke, 9/9 Python unit tests, 36/36 raw result/dataset checks.
- Production `page-agent.js` remains byte-identical to C26. No action-value policy, no live neural inference, no GitHub push.
