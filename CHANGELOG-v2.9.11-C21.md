# C21 — Encounter-Level Randomized Action-Value Research

Date: 2026-10-12. Research-only follow-up to C20.

- `lab/arena/encounter-randomization-c21.mjs`: 1/3 probability each for baseline, micro-left and micro-right at a *pre-action eligible encounter*. The hash does not consume game RNG. Retains all C16 public safety gates, rejection retry and 0.9s cooldown; a blocked action immediately falls back to the original command.
- `lab/arena/train-main.mjs`: new `--c21-dataset` gate, restricted to single release TDM episodes, and records server labels after the command. Existing game and production extension paths untouched.
- `lab/arena/evaluate-encounters-c21.mjs`: validates source provenance, no overlapping windows, logged propensities and action assignment; descriptive match-cluster bootstrap and hard small-sample rejection.
- `lab/arena/action-value-network-c21.mjs`: deterministic 12→12→1 shadow value-model training implementation that **refuses training on insufficient real trial data**. Never imported by the extension.
- `lab/arena/run-encounters-c21.mjs`: SHA-256-registered 18-match stratified research runner, safe resume, source and plan consistency.
- 12 C21 regression tests. Full suite 878/878 and game engine 733/733, five-mode smoke 5/5.
- Completed 18 fixed-length (65s) TDM matches: 70 eligible offers, 69 complete windows, 1 censored window, 349 lateral intervention ticks. Only 10 complete windows had nonzero combat damage.
- Shadow neural-value training **blocked**. No proven combat improvement. No production changes, no GitHub push.

See `C21-ENGINEERING-REPORT.md` for reproducible evidence and caveats.
