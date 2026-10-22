# C35-G: Firing Opportunity & Motor Cost (Observation-Only)

- Added `firing-opportunity-observer-c35g.mjs`, a completely passive pre/post official `Game.step()` ledger.
- Added opt-in `--c35g-trace`, only when C35-C research policy is `shadow80` or `stagger80`.
- Captures incumbent and applied firing/motion inputs, approximate server weapon-ready state exclusively for post-selection audit, and official shot events.
- Added 5 Node tests for telemetry integrity and priority command preservation.
- Registered new 12-setup, 24-match heldout paired audit with source hashes and an independent Python C21/C16/data validation.
- Recorded 0 direct suppressed/injected fire commands and zero micro/priority overlap. Found 19 option-active-but-nonexecuted motor ticks under bounded staggering.
- Legacy C16/C21 and production `page-agent.js` remain unchanged. No promotion and no C36 action-value release.
