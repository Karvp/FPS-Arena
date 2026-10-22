# FPS Arena Combat Suite v2.7.0 — Authoritative Training Arena

- Added `lab/arena/train.mjs`: live headless battle running **actual provided FPS Arena server** `Game.step`, official `BotBrain`, authoritative combat, movement, loot, zombies and ring across all five modes.
- Loaded **compiled extension `page-agent.js`** into a lightweight headless client; action commands are fed through real server input queue. Configurable seed, snapshots latency, episode count and profiles.
- Added optional stronger but legal `mixed` and `stress` opponents; original `official` opponents are completely unmodified.
- Added client-controlled automatic helicopter jump/glide in Battle Royale; this fixes the previously unhandled non-controllable spawn phase without cheating movement state.
- Added opt-in squad crossfire flank positioning for TDM/S&D/Hardpoint/BR; preserves urgent ring, reload, loot and defensive priorities.
- Added independent train/holdout comparison tool and telemetry JSON compatible with Match Replay Lab.
- Documented possible original-server zombie hitbox-history omission in an optional patch, without touching user's game server.
- Regression tests for five-mode integration, squad flank and opponent capabilities; baseline extension features preserved.
- No demonstrated 90% headshot or real-world human performance: authoritative results remain substantially lower than prior synthetic evaluations. Profile results were not stable across train and held-out, so baseline retained.

- Headless client map/raycast parity fixed to public authoritative level geometry.
- Movement anti-reversal hysteresis extended from 140ms to 240ms with emergency overrides and focused tests.
