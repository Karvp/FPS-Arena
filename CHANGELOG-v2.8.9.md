# FPS Arena 2.8.9 — Tactical Macro Routing Research

## Approved default (TDM only)
- Separate the target used for occluded **navigation** from the target used for aiming and shooting. A new visible opponent wins instantly; do not freeze aim or fire commands.
- Keep an observed, alive hidden opponent for up to 2.3 seconds while valid; switch sooner if the previous target is dead, unavailable, much worse in distance, outside engagement distance, or progress has stalled.
- Resolve retained target positions from the latest *public* remote snapshot every tick, not cached authoritative positions.
- Expose `macroTargetCommitment` toggle in popup (default enabled, active only in TDM Autopilot).

## Experimental, disabled by default
- `macro-goal-controller.mjs` also implements opponent-cover vs safe-pursuit macro arbitration, behind the headless `--profile macro-actuation-lab` or `--profile macro-routing-lab` only. It must NOT replace ordinary cover/peek routing in the shipped extension: paired Foundry matches showed fewer reversals but worse survival/kills.
- New headless profiles: `macro-target-lab`, `macro-actuation-lab`, `macro-routing-lab` for attribution tests. `baseline` explicitly disables the new target commitment for true A/B comparison.

## Validation
- 562/562 Node regression tests pass.
- Four independently seeded/map-matched TDM stress pairs (75 seconds each): 16 vs 21 kills, 3 vs 2 deaths, 296 vs 280 world-space reversals. Small, selected sample; cannot establish general superiority or a statistical confidence interval.
- No browser frame-time or full-match validation for the new default in this pass.
- Earlier v2.8.8 233-second Foundry geometry trace found strong reversals even with unchanged action labels, prompting a target-selection rather than global heading-lock approach.
