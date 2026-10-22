# FPS Arena 2.9.5 — Macro Action Ownership Research

- Prototype `macro-action-ownership.mjs`, bundled in page-agent, OFF by default.
- Experimental profile `macro-ownership-lab` enables shotgun-only route/cover command arbitration with short-horizon waypoints, progress checks and immediate preemption.
- Added structured `owner-applied`, `owner-preempt` and `owner-suspended` diagnostics to server simulation.
- Added seven targeted regression tests for action conflicts, recovery, emergency, unsafe routes, expiration, target switches, and SMG non-interference.
- Critical qualification: held-out natural-end matches LOST 4 kills (11 -> 7) vs v2.9.4 `macro-combat-lab`; the feature is NOT enabled in normal autoplay.
- No change to weapon physics, aiming, ADS, gameplay server, or default movement policy.
