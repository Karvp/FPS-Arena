# v2.9.11 C35-R — Research-only Combat Decision & Shot-Loss Audit

- Added `--c35r-trace` gated behind the complete passive C35P chain.
- New `CombatDecisionShadowC35R` implements immutable public pre-decision candidate features, periodic no-fire sampling and strict after-step shot accounting.
- Fixed candidate-angle selection: prefer angular offset to the public aimed target, NOT the closest hostile.
- Added reproducible 12 matched setup × 2 policy TDM pilot, 90 seconds each, and independent shot/pellet audit.
- Added by-weapon causal-limit reporting and deterministic cluster bootstrap intervals.
- Added seven Node tests, four Python tests and source-locked historical regression routing.
- No production agent, C16/C21 assignment, live weapon or movement changes.
- No promotion; C36 remains locked.
