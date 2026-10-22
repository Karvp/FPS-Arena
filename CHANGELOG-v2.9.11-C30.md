# C30 — State Representation Transfer / Full Match Falsification

- Added physically-normalised public kinematic representation, new three-arm server `fireWeapon()` micro-lab and 1,080 frozen scenarios from public-only C29 covariate calibration.
- Trained 10→24→12→3 PyTorch neural model, exported frozen JS weights, 20-vector 1e-6 parity fixture. **Development validation selected always-left, not neural**.
- Completed 24-match 105-second preregistered transfer pilot: 234/234 feature-compatible and 234/234 actuations; **PASS** transfer gate.
- Completed 36×3 same-seed 105-second full-game experiment: 108 games, no runtime errors; neural chose 243/243 left, perfectly matched simple left, no significant gain over incumbent.
- Added audit scripts for registration, match-level bootstrap/sign flip, independent prediction replay, sealed micro-holdout and production parity.
- Discovered all public decision snapshots sampled enemy M4A1, limiting adversarial weapon generalization claims.
- 958/958 AI regression; 733/733 main engine; 5/5 smoke; baseline 18/18 parity. Unchanged production `page-agent.js`, no GitHub push.
- **RESEARCH ONLY — neural model not promoted.**
