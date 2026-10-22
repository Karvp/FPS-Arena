# v2.9.11-C22 — Risk-Aware Encounter Coverage (2026-10-12)

- Added research-only risk audit derived exclusively from pre-action public observations; **no safety gate relaxation**.
- Added randomized 3-arm nested 0.9 s and 1.8 s outcomes with a 1.8 s no-other-offer lockout; 0.16 s intervention remains unchanged.
- Added strict C22 dataset validator, match-clustered descriptive analysis, and explicit neural training gate.
- Added pre-registered six-stratum 18-match simulator runner with resume and SHA-256 source verification.
- Added 10 focused tests. 888/888 AI tests, 733/733 main-engine tests, and 5-mode smoke PASS.
- 18 games, 48 opportunities, 7→14 nonzero outcome windows on identical offers by extending measurement horizon.
- No real-data action-value training, no production code changes, no GitHub push.

See `C22-ENGINEERING-REPORT.md` and `reports/c22/study18` for analysis and raw results.
