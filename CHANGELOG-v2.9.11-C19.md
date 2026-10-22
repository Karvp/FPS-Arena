# C19 — Natural-End Match Evaluation

- Added explicitly gated natural-ended match research mode to `train-main.mjs`; blocks accidental full-match activation in C17 dataset workflows.
- Added preregistered, balanced six-stratum TDM natural-end experiment runner and strict event/provenance validation with 600s censoring.
- Added matching analysis reporting stratified ITT, bootstrap confidence interval and paired sign-flip p-value; prevents degenerate bootstrap intervals for one block per stratum.
- Added eight new regressions, 24 verified full matches, five-mode smoke testing, CPU profile instrumentation reuse.
- Preserved C16 policy; no production page-agent change or promotion.

Full engineering details: `C19-ENGINEERING-REPORT.md`.
