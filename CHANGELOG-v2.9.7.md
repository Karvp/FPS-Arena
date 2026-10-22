# FPS Arena Combat Suite v2.9.7 — Evidence-Calibrated Macro Cycles

Release type: **research/observability checkpoint, not a combat policy upgrade**.

## Added

- `classifyOptionCycle(a,b,c)`: pure function that classifies rapid **same-target** `A -> B -> A` macro option sequences within 1.5 seconds by the middle option's measured outcome. The result explicitly distinguishes a safety interruption, combat contact, LOS gain, self-induced range progress, low-yield candidate, too-brief sample, and unresolved sample. No class is asserted to be proven 'useless'.
- Option outcomes now include measured HP and armor loss, `selfRangeGainM`, movement distance, fire-intent ticks and usable firing-opportunity ticks, plus a bounded *diagnostic-only* reward proxy. The proxy is not used by any live movement policy.
- Headless server-event attribution associates authoritative shots, hit events and kills with the executing macro option and exposes per-option server totals. Fire ticks alone do **not** count as shots.
- `macroOptionCycleClasses`, `macroOptionCycles`, `macroOptionServerTotals` and `macroOptionServerEventAttributed` in authoritative training output. Traces are bounded and designed to avoid uncontrolled memory growth.
- Seven regression tests for loop safety/attribution and edge cases.

## Retained

- Default LibreWolf Autopilot is **unchanged**. New diagnostics run only with `macro-options-shadow-lab` and optionally the existing experimental active lab; there is no new popup toggle.
- Legacy active macro option planner remains rejected: v2.9.6 tests found fewer shots and worse kills.
- Independent ADS/hip fire/shot, emergency evasion, BR ring, reload, plating and objectives are never overruled by the diagnostics.

## Known limitations

- `candidate-low-yield` means *no observable short-horizon benefit under the measured proxies*, not a counterfactual assessment of whether holding the action would have been better.
- The 1.5 s loop window and thresholds are diagnostic heuristics; they are not tuned against hold-out maps or human matches.
- Server event attribution in the headless harness describes what happened **while** an option was active, not proof the option caused the shot, hit or kill.
- Tick-based opportunity and fire signals are correlated observations, not unique chances or server-confirmed rounds.

## Reproduction

```bash
node scripts/build.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node lab/arena/train.mjs --modes tdm --episodes 1 --seconds 400 --full-match \
  --seed 963903 --bots 5 --classic-maps foundry --trainee-primary benelli_m4 \
  --opponents stress --lag-ms 65 --profile macro-options-shadow-lab --profile-agent \
  --out reports/v297/reproduction.json
```
