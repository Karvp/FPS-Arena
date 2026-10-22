# FPS Arena v2.9.11 C32 — Controlled Cover / Movement Encounter Research

- Research-only C32 `stepMove` + `fireWeapon` controlled three-action server counterfactuals, covering seven static AABB cover configurations and six enemy primary guns.
- Public-style 14-feature model with hidden aim/tracking strictly omitted; two independently frozen datasets of 1,080 and 1,440 scenarios.
- MLP 14→32→24→3 with four registered initialization seeds and a deterministic validation-based selection contest against non-neural controls.
- Locked validation selected **always-left** in C32-A and **cover-visibility heuristic** in C32-B; neural failed promotion gate in both.
- Added independent all-arm replay verifier, 12 dedicated tests and scenario-block bootstrap evaluation.
- **974/974 AI tests; 733/733 main engine; five-mode smoke 5/5; 7,560/7,560 arms independently replayed.**
- Production page-agent.js byte-identical to C31; **no production model deployment**.
