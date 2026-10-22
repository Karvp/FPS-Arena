# FPS Arena 2.9.1 — Macro Combat Controller 2.0 (experimental)

- Adds `macro-combat-v2.mjs`, a four-phase close-range weapon planner: `approach`, `engage`, `reposition`, `recover`.
- Resolves a specific conflict: when an out-of-range shotgun's safe pursuit direction is replaced by a camera-cover hide/peek instruction, the controller may restore the pursuit direction. Requires geometry-safe travel, positive range progress, adequate health/armor, and no exposed short firing lane. Neither aim nor authoritative shots are forged.
- Priorities: explosive evasion, BR ring rotation, pickups, S&D/HP objectives, reload/plating, active dodge and ordinary engagement are never overridden. Stalled pursuit is suspended after 1.35 s without distance improvement.
- SMGs retain reactive movement up to 60 m after earlier aggressive-push experiments worsened some matches. Generic rifles/DMRs/snipers are unaffected.
- New popup toggle `Macro Combat 2.0 (thử nghiệm)`, **disabled by default**; requires Autopilot. `--profile macro-combat-lab` activates it in the authoritative simulator; `--profile release` retains the v2.9.0 release behavior.
- Headless tests: 579/579 pass; five-mode smoke no errors; paired TDM/BR trials and a naturally finished Foundry TDM full match. No tests on live LibreWolf render FPS/human opponents. Full-match sample and other seeds are too few to establish a robust competitive advantage.
- In particular, BR Oil Rig 125 s contained no shooting in either variant and therefore demonstrates only runtime/routing equivalence, not BR gunplay improvement. Some shotgun Foundry trials increased deaths; safety and survival must be improved before enabling the macro by default.
