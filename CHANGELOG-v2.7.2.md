# Combat Suite v2.7.2 — Long-TDM Adaptive Combat Training

- Compared true v2.7.1 against candidate on 12 long training TDM matches and 6 held-out TDM matches, three Classic maps, both official and stress opponents.
- Added risk-aware `shouldUseCombatPeek`: engage exposed, loaded targets without unnecessary hide/peek loops; retain cover when hurt, surrounded, occluded, or reloading. No unconditional disabling of Auto Peek.
- Preserve short-term directional memory across neutral planner ticks; 380 ms bounded reversal rejection, emergency and blocked-direction bypass.
- Added `--trace-decisions` in simulator: record actual sampled Autopilot reasons and replay, excluding snapshot-only samples. This diagnostic is opt-in.
- Added focused regressions for peek decisions, route-noop transitions, emergency priority. Full comparison and raw server metrics in `reports/training-v272/`.
- No server combat changes, weakened enemies, seed-specific behaviour, or neural model weight updates. Headless results are not human match claims.
