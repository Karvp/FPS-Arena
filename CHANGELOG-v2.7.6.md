# FPS Arena Combat Suite v2.7.6 — Situational Skill Autopilot

- New isolated `skill-tactics.mjs` policy uses the skill **already selected by the user in the game lobby**; it never changes or equips a skill without consent.
- Server-valid one-tick T-key edges with release and retry cooldown, checking energy, match phase, respawn, BR helicopter/airborne states, stun, interactions, and active effects.
- Skill-specific tactics:
  - **Kinetic Armor:** armor deficit and pressure / zombie contact.
  - **Exoskeleton:** preparatory buff before engagement (1-second firing lock), avoids emergency melee range.
  - **Poltergeist:** break line of sight / disengage while vulnerable; never start by shooting or opening a crate.
  - **Scout Pulse:** find nearby hidden opponents within the server's 24-m scan radius.
  - **Annihilator:** emergency finisher only; avoid groups, Zombies, and BR ring emergencies because shooting leaves the wielder unarmed for 3 seconds.
  - **Pneumatic Auxiliary Device:** corridor-checked emergency forward leap; respects ring safety.
  - **Grappling Hook:** needs reachable real geometry and a destination permitted by the ring.
- Skill decisions run after shooting, reload/weapon arbitration, cover and ring priorities. Active only in **Autopilot**, with an `autoSkills` popup toggle; manual skill input remains supported.
- Match Recorder adds skill ID, energy, active-effect duration, T input, and automated cast-decision events.
- Training room supports `--trainee-skill ID`, `--no-auto-skills` and reports both command counts and **server-confirmed** activations. Original game server remains unmodified, and official/stress bot opponents retain all their capabilities.
- Regression suite checks every skill, invalid energy, key edge, prohibited states, world geometry, and the real server's input validator.

**Known limit:** Skill use remains a heuristic. No promise of higher win rates or real multiplayer performance; skills recharge through the game server and a short trial may contain no eligible activation. Zombies gain passive energy but zombie kills in the supplied server code do not grant the ordinary player-kill skill bonus.
