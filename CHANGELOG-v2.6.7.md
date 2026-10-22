# FPS Arena Combat Suite v2.6.7 — Reliability, Ring Safety & Match Recorder

## Fixes

1. **Zombies Autopilot silently turns OFF.** The v2.6.6 bundler referenced `preferredZombieSlot()` but omitted `zombie-weapon-choice.mjs`. Bundling now includes all its definitions. Game/session changes invalidate stale navigation state; unexpected per-tick failures return the original input, report an error and retry with backoff instead of changing the saved `enabled` option.
2. **BR barrier loses to dodge.** Recomputed next-ring travel time at a conservative 3.8 m/s plus 7 s early margin; shrink/closing phases immediately take priority. Barrier navigation is always exempt from tactical direction smoothing, peek, loot and ordinary dodge arbitration. Geometry can still prevent reaching a ring.
3. **Match Recorder enabled but produces no samples.** The generated `page-agent.js` omitted `match-recorder.mjs`, causing a swallowed `matchSample is not defined` exception. The build now bundles it. The content bridge serializes `start/sample/event/end` messages. Page snapshots begin recording even when input controls are not active. Ring telemetry now captures `phase`, countdown and `nxt` circle.
4. **Multiple consecutive matches.** Retains the latest 30 matches with up to 1,800 samples and 800 events per match. Autosaves to LibreWolf extension storage every 8 seconds and at match end/tab close; survives browser/background restarts. Popup can export the latest or all matches in one JSON. The retention cap is intentional; export periodically for longer archives. Match telemetry remains opt-in and local only. Clearing the history no longer disables recording.
5. **Forward/backward input jitter.** A small vector direction filter and 140 ms opposite-direction hysteresis reduce rapid direction flip-flops from short-lived tactical proposals. Stationary commands actively clear movement keys. Emergencies and ring ingress bypass smoothing. No modification to game physics.

## Verification

- `node scripts/build.mjs`
- `node --test tests/*.test.mjs` (409/409)
- `node tools/check-game-compat.mjs <game root>` (41/41)
- `python tests/browser-popup-smoke.py` (Chromium only)
- `python scripts/package.py`, extract and rerun tests against the packaged build

**Not proven:** actual win rate, end-to-end live LibreWolf match gameplay, network lag resilience or pathfinding around every multilevel obstacle.
