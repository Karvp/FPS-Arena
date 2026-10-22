# FPS Arena v2.9.11 — C13 Encounter-Level Neural Policy Learning

- Added optional 0.5-second public-snapshot tactical command collector and server-side observational outcome windows.
- Added offline 9→16→5 trainable neural behavioral policy, grouped match splits, majority and past-command persistence baselines, clustered bootstrap.
- Collected 26 TDM match episodes: 1,688 decisions, 1,617 eligible, 5 held-out match groups.
- Neural 30.30% holdout accuracy vs 34.34% past-action persistence baseline; no deployment.
- 799/799 AI and 733/733 main game tests pass; smoke all five modes, capture parity confirmed; extension bit-for-bit unchanged.
