# v2.9.11 C35-L — Authoritative Firing-Time Ballistic Ground Truth

- Opt-in server-side post-fire WeakMap sink, records true spread rays, collision classes, rewind offsets and pellet identity; zero client/server-truth leakage into agent decisions.
- Research-only `BallisticTruthObserverC35L` joins immutable pre-step public LOS to firing-time truth after `Game.step()`.
- Locked 18-match, 3-map, 6-weapon observational study. Distinguishes **656 shots** from **1,151 pellets** and **422 hit events**.
- Added per-match SHA-256 audit, independent analyzer, matched replay parity and adversarial tests.
- 1,147 Node PASS / 733 engine PASS / 45 Python PASS and 4 documented historical skips / 5 game-mode smoke PASS.
- Production unchanged. C36 BLOCKED. Motor policy promotion REJECTED.
