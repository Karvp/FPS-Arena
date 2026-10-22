# FPS Arena v2.9.11 — C35-T

- Integrated `target-relative-motion-c35t.mjs`, opt-in only in authoritative headless lab.
- Instrumented observable target-relative motor directions, weapon-specific range gap and deterministic static clearance.
- Bounded action redirect: only four WASD movement keys, requires >=0.24 additional closing-speed proxy and >=0.05 continuity with original direction.
- Independent 36-match three-arm preregistered TDM, 54 simulated minutes; 571 actual motor-change ticks; per-setup bootstrap and per-gun attribution.
- 1,190 Node, 733 engine, 82 applicable Python tests passed; 5 historically frozen SHA checks skipped by standard inherited runner.
- **Policy rejected**: kill non-inferiority not proven, deaths and shotgun/SMG performance worse; production agent untouched.
