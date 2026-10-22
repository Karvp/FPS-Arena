# v2.8.3 — Weapon-Aware Routing and Evasion

Based on FPS Arena 2.8.2. **Game server files and hit/damage formulas have not been modified.**

1. **Far-range defense**: `threat-intel.mjs` now includes each opponent's observed catalog gun stats; `agent-entry.js` checks current aimed/recent-shot lanes up to published `maxRange`, raycasts between *actual 3-D eye/body heights*, and activates protective routes even beyond the short 65–85 m dodge radius. `tactical-nav.mjs` no longer suppresses valid long-range camera threats at 70 m, with capped six-contact risk planning for CPU.
2. **Gun-specific duel planning**: `weapon-duel.mjs` computes damage-after-falloff, ADS spread, pellet count, cadence, reload, max hitscan reach, possible sniper headshot and estimated positional advantage; `combat-core.mjs` uses the result to prefer hard cover, advance obliquely under a hostile sniper lane, or maintain a superior firing range. Existing collision/ring checks still authorize every movement. Steering changes are intentionally gated to mismatched threats rather than overriding ordinary movement every 100 ms.
3. **Long-range engagement**: `aim-core.mjs` Autopilot target scan adapts to currently held gun reach while manual Assist keeps chosen range. `combat-core.mjs` accepts an aim-aligned visible hitbox up to official `maxRange`, even beyond weapon's tactical preference. Melee, reload, plating, occluded aim and server hit detection are unchanged.
4. **Model and validation**: `tools/simulate-weapon-duels.mjs` evaluates 75 ordinary firearms at 10 distances with 192 deterministic shots per distance per ADS, hip-fire and imperfect-tracking situation, using the exact server `spreadDir` and hitbox math; 6,000 modeled gun-versus-gun distance decisions; five new targeted tests. Memoized threat scale per 6 m band prevents computing the same heavy threat stats repeatedly across tactical-grid cells; geometry is not discretized.

## Validation and limitations

- 523/523 automated JS tests pass after packaging.
- Four independent 26-second seeded headless matches, 2 TDM + 2 BR, compared directly with 2.8.2 under unmodified `Game.step()` engine and stress opponent policy. TDM kills 3 → 4 and deaths 2 → 0 for this *small* set; reversals improved on Neon but worsened on Foundry. Two BR episodes had no gunfight, so BR sniper-evasion skill is **not** proven in end-to-end PvP.
- AI CPU p99 and rare spikes were mixed between runs. Do not mistake this for a guaranteed FPS improvement on LibreWolf. Long-range gun-vs-gun outputs are *fixed-pose hitbox simulations*, not live networked 1v1 win rates or guarantees of optimal navigation.
- Server maps have finite bounds; a 400 m sniper max range does not mean a 400 m line can be realized on every map.
