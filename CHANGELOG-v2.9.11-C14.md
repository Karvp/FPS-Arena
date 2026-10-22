# FPS Arena v2.9.11 — Research Continuation C14

**C14: Safety-Gated Match-Level Micro-Action Exploration (2026-10-12)**

- Added `lab/arena/safe-action-explorer-c14.mjs`: match-level seeded treatment/control assignment (default 0.5), bounded micro-strafe candidate set, conservative public AABB corridor clearance, 0.9s offer cooldown / 0.16s maximum exploration duration, priority interruption on changed combat inputs; no game RNG usage.
- Added `--c14-dataset` and optional `--c14-force-arm control|treatment` to **main-engine headless simulator only**. Forced arms are always marked diagnostic and cannot masquerade as randomized assignment; only `--profile release` supports C14 recording.
- Added `lab/arena/evaluate-exploration-c14.mjs` and `scripts/analyze-c14-exploration.mjs`: validate per-match provenance/unique seed, intervention and probability records, reject low sample/overlap experiments, and compare controlled forced-arm pairs with honest observational labeling.
- Added 13 C14 unit/regression checks.
- C14 operates exclusively on an isolated queued movement command; preserves incumbent fire, aim, skill, move priorities, camera yaw/pitch, production Autopilot and shipped `page-agent.js`.
- **Known failure:** in a 28s MP5SD diagnostic pair (`Arena / 140404`), treatment recorded one lateral action and saw kills drop from 2 to 0. This is one exploratory paired condition and is not generalizable.
- **Not promoted:** extremely few independent eligible opportunities; action-value training and deployment blocked.
