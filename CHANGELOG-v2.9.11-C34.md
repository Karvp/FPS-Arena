# C34 — Real-Match Observations and Factual Threat Predictor

- Added research-only `RealEncounterObserverC34`, with delayed-client world-frame position/body yaw/weapon, public static-map geometry, safety gate flag, and separate **server-after-decision** coordinate/outcome audit.
- Added headless `train-main` flags `--c34-dataset` and `--c34-enemy-primary`, enforcing isolated TDM research-only capture and controlled opponent weapon diversity.
- Locked source fingerprints and executed 54 original independent 90-second matches across 3 maps × 6 weapons × 3 opponent policies, with synthetic snapshot lag 35/65/125 ms.
- Recorded an **adaptive training-only addendum** of 18 new matches after the initial original train count (31 hit windows) fell below its registered minimum 40. Test and validation seeds remained unchanged.
- Trained three regularized logistic predictors and three single-hidden-layer neural MLPs (12 hidden units) on **factual** next-1.8-second weapon-hit labels, selected logistic C=0.3 using validation, and evaluated on the sealed 18-match test once.
- Held-out Brier 0.042082 versus constant baseline 0.048766, clustered improvement 95% CI [0.001864,0.012422]. **Predictive result only — no action-value causal inference.**
- Replay/parity: 18/18 same-seed control indicators equal, 90s match raw telemetry byte-identical, 1000 AI tests, 733 upstream engine tests and 5-mode smoke all pass.
- Production `page-agent.js` unchanged. No production release, model promotion, or GitHub push.
