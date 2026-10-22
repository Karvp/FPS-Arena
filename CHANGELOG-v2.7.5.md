# FPS Arena Combat Suite v2.7.5 — Full-Match TDM Aim Training

- **Fix:** TDM Autopilot no longer adds the old unconditional 65 ms linear lead to hitscan targets. The server already evaluates hits against a rewound authoritative pose; the extra lead reduced actual hit rate. This only applies to TDM autonomous targeting; assist mode and other game modes remain unchanged.
- **Regression protection:** configurable internal `lagCompensatedAim` boolean (on by default), and `legacy-aim` training profile for old behavior.
- **Controlled measurement:** paired, full-length TDM matches until natural server termination, across Neon, Arena, Foundry, official and stress opponents; independent seeds and multiple network-lag scenarios.
- **No gameplay modifications:** no server hitbox, spread, damage or opponent restrictions were changed.
- **Caveat:** this is a code/heuristic improvement, not learned weights. The training-room improvement is not a claim of 90% accuracy or human multiplayer performance.

To reproduce a paired full match comparison:

```bash
node lab/arena/compare-tdm-aim.mjs --episodes 3 --seed 991245 --opponents stress --lag-ms 65 --out reports/my-tdm-comparison.json
```
