# C26 Temporal Threat Representation Learning (Research Only)

- Added a frozen public-cue temporal feature encoder using present and up to two consecutive past observations with missing-data masks and map/loadout context (24 features).
- Added deterministic regularized logistic and genuine nonlinear 24→9→1 MLP threat prediction on C25's **training** matches; validation-only candidate selection; previous C25 reported test is excluded.
- Added prospective C26 18-match test registered before execution: six map/weapon strata, 35/65/125ms snapshot lag, never-before-used game seeds.
- Added whole-match bootstrap, latency disaggregation, source-data SHA-256 registration, independent raw-pair provenance verification and nine regression tests.
- Holdout risk predictor improvement **NOT established**: selected temporal logistic Brier 0.074291 vs constant baseline 0.073846; match-bootstrap interval overlaps zero. Neural MLP diagnostic Brier 0.074703.
- Production extension and Autopilot unchanged. No causal policy learning or browser real-time benchmark claimed.
