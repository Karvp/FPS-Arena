# FPS Arena 2.8.8 — Cover State Correctness & Long-Match Diagnostics

- Fix an invalid cover anchor inheriting the old peek/exposure cycle when a new nearby waypoint is selected but the previous point is not valid. Only keep cycle state when the exact old cover anchor was retained.
- Add short-lived peek lane caching behind `peekCacheLab`, **off by default**. It is an experimental A/B mode, not an approved performance improvement.
- Add replay analyzer with map geometry, open-ground reversal candidates and reason transitions.
- Baseline 2.8.7, experimental blind-goal hold and peek cache were compared on authoritative server matches. Both experiments showed mixed outcomes; do not promote either as a new default.
- No changes to weapon damage, accuracy, physics, server bot limits, or default combat movement.
