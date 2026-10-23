# V60 persistent checkpoint

Research baseline: locally recovered C35AJ. This is not the complete v57-v59 tree.

Verified 2026-10-23:
- Preregistered registry: research/tdm-v60-frozen-registry.json
- Four discovery seed groups, sixteen real Game.step() runs
- Independent counterfactual replay group audit: PASS 4/4
- Trigger ticks: 744, 750, 756, 762
- One out of four groups with nonzero hazard/reward inside the 300-tick window.
- Arena/UZI strafe: +1 kill and 24 damage; other three arms no event inside the window.
- Full-match outcomes are not used as same-window causal labels.
- Two holdout seed groups remain unopened.
- No neural model trained or promoted.
- Focused tests: 26/26 passed.
- Historical tests/*.test.mjs: 1331/1332 passed. One Windows-specific malformed path test remains.
- Calibration seeds 441108 and 441109 excluded from discovery.
- No production extension or expert weights modified.

Raw logs: data/v60 (gitignored on this machine).
Per-file SHA256 and group evidence: research/tdm-v60-audit-summary.json
Frozen provenance and immutable file checks: scripts/tdm_v60_protocol.py verify
Git commit is the durable continuation point.
