# v2.9.9 — Tactical Director 3.x major research implementation

- New `tactical-director.mjs`: hierarchical intent, hard priority shield, weapon-aware engagement bands, bounded short-horizon target forecast, LOS-filtered firing perches, bounded A* and arrival-time exposure integration, scoring/switch penalty, plan reuse, interrupted outcome tracking and weak executed-action-only EMA.
- Integrate final movement director after legacy goal arbiter. Shadow mode keeps original movement object; only simulator headless TDM profile may actuate. Prioritization of objective/ring/evade/recovery and independent ADS/fire retained.
- Add four reproducible training profiles: release, director-shadow-lab, director-safe-lab, director-active-lab; `director-safe-lab` requires same-target low-yield cover evidence before actuation.
- New 22 targeted unit/property tests; bundled page-agent integration; `scripts/evaluate-director.py` paired seed A/B; authoritative full-match records and five-mode smoke.
- Default extension feature flags OFF; no claim of combat-policy improvement due to real regressions in aggressive active lab.
