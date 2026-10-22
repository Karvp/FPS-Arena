# FPS Arena v2.8.7 — Cover Anchor Stability / Occluded Pursuit Lab

- Preserve the original cover waypoint when a newly searched point is within 1.05 m, *only* if the previous point still passes collision geometry and blocks a visible opponent's 3D eye-to-body ray. Prevent small cover-coordinate drift causing unnecessary steering corrections.
- Add an experimental occluded-pursuit helper that retains forward pursuit instead of reversing to a redundant cover waypoint. Requires occluded current/future positions, adequate health/armor/ammo and no recent damage. Exposed as `occludedPursuitLab`, **off by default**. This option is not validated in full-length PvP matches.
- Version consistency updates and targeted integration tests.
- Headless 45-second TDM comparisons against v2.8.6: 6 matched map/seed pairs across Neon, Arena and Foundry, official game simulation with stress opponents. Kills 13→19; deaths 3→3. Small sample, not proof of superiority in longer matches. See FPS-Arena-v2.8.7-Report.md.
- Full test suite reached 543/543 after repeat; an earlier parallel test run exposed an intermittent keybind test failure that did not reproduce in isolation.
