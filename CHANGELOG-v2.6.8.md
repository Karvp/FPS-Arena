# FPS Arena Combat Suite v2.6.8 — Lean-hitbox targeting

- Fixed primary/head torso aimpoint mismatch against authoritative `server/combat.js`: head 1× lean displacement, torso 0.5×.
- Added bounded snapshot lean tracking and temporary torso preference on rapid Q/E changes.
- Added server-hitbox surface LOS and visible-body fallback when head is obstructed.
- Adjusted ESP head markers for lean.
- Added dedicated `lean-hitbox-v268.test.mjs` regression suite with 5 scenario families.
- Existing gameplay logic and LibreWolf permissions unchanged.
