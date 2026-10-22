# FPS Arena 2.8.5 — Cover Arrival Stability

## Implemented
- Hard-cover arrival hysteresis uses exact 3D enemy-to-player occlusion to suppress approach/hidden-phase chatter while the bot remains behind cover. Initial arrival radius remains 1.35m; a previously reached location may drift no more than 1.95m for up to 1.1s.
- Reset the arrival state when selecting a different cover anchor or changing target/reload intent.
- Added offline replay motion diagnostics with world-space reversal counts and return-near-prior-position candidate counts.
- Kept v2.8.4 safe raycast broad-phase and negative cover-query caching; no global strafe-heading lock, damage changes, fire suppression, or new physics constraints.

## Verification and limitations
- Headless server TDM paired seeds 472909 (75s) and 345678 (90s), three maps each, five stress opponents. Total kills 31→40, deaths 6→6, world reversals 575→526. Results varied across individual maps.
- Paired 45s CPU sample (seed 817303), three maps, 8,100 AI ticks: >16ms callback events 8→5. Not browser FPS.
- Replay 75s: 3-point sampled direction reversals 167→160, near-return candidate oscillations 144→122, based on 500ms samples.
- 55s Battle Royale smoke run passed, without enough evidence about BR win rate.
- Natural-end full-match candidate testing timed out; **no long-match parity guarantee**.
- The requested 90% genuine dodge success and elimination of all movement oscillations are not established.
