# FPS Arena v2.9.11 — C25 Fixed-Grid Threat Calibration

- Added fixed-grid, no-intervention public threat cue observer with post-window server hit labels.
- Added independent preregistered 24-match study, matched result/dataset provenance verification and match-separated learning.
- Added regularized logistic and MLP 5→7→1 offline diagnostic training and validation-only model selection.
- Added 10 regression tests, 18-field same-seed parity, strict data leakage checks.
- Result: 926 complete windows with 84 hit-positive; selected model does not beat prevalence baseline on holdout; production unchanged.
