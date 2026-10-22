# FPS Arena 2.9.11-C5 — Safety-Constrained Tactical Exploration

- Deterministic, seed-controlled Bernoulli action gate after safety checks; p=0.5 headless, p=1 diagnostic.
- Per-offer action/control propensities; independently seeded without consuming the game RNG.
- Export selected and unselected exploration opportunities, selected-command provenance and five-second outcome windows.
- 8 new tests; 728/728 final regression passing.
- 12 new fixed match seeds × 3 profiles: zero eligible offers, all profiles 14K/9D/132 shots.
- Development seeds show both favorable and adverse outcomes, no claim of general improvement.
- Autopilot default and production client actuation unchanged.
