# Combat Suite v2.7.7 — TDM combat routing & skill training

- Added risk-gated route commitment for unseen TDM enemies, using actual server map obstacles and public remote ADS state. Defers to reload, low health/armor, recent damage, nearby foes and exposure spikes. Popup opt-out.
- Retained existing lag-compensated TDM aiming; no hitbox, shot spread or opponent constraints modified.
- Added independent experimental profiles for sightline pursuit, ADS-aware lateral dodge/strafe, shooting-vs-escape arbitration and steering hold, all off by default except the validated route commitment option.
- Added authoritative full-match benchmark, independent seeds, simulation report, headless mode regression, and unit coverage.
- Important measured tradeoff: more kills and fewer reversals, but some increase in deaths and lower overall accuracy; not a guaranteed upgrade against humans.
