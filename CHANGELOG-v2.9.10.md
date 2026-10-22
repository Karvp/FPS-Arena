# FPS Arena 2.9.10 — Opportunity-Guarded Tactical Director Research

**Status: experimental / headless-only; release autopilot unchanged.**

- Fixed A* budget starvation: inspect all bounded candidate firing sites for legal stance, 3D line of sight and endpoint exposure; choose two best screened sites for actual route search, rather than blindly attempting the first two fixed angles.
- Add `tacticalOpportunityVeto` and `tacticalObservePursuit`: keep productive baseline pursuit and near-future shotgun/SMG firing windows; calculate the bot's closing contribution with previous observed enemy position, not target motion.
- Add shot-preserving controls: reject very long time-to-fire plans and directions that sharply oppose an existing pursuit.
- Add **two distinct same-target low-yield cover cycles** requirement inside six seconds; multiple reads of one event never satisfy the guard.
- Fix director telemetry deduplication: distinguish veto reasons and throttle each category independently, bounded to 32 cached keys.
- Add `director-opportunity-lab` to headless benchmark profiles and 12 new tests. Default options remain false; no new checkbox exposes active actuation.
- All `release` five-mode smoke tests completed without errors. Guarded mode restored shots in Arena shotgun and SMG short scenarios where unconstrained active suppressed them. Two natural-end TDM pairs matched release *after* the independent-evidence fix.
- Transparent regression: an earlier one-evidence guarded build reduced Foundry full-match shots **7→1**, even with the same kill count. It was rejected and tightened before packaging.
- Known limitations: guarded actuation may rarely be eligible; no evidence yet of statistically significant K/D gains or real-browser performance improvement. Do not promote based on no-regression alone.
