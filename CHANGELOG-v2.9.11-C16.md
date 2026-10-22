# FPS Arena v2.9.11 — C16 (2026-10-12)

- Lazy geometry checks on already-rejected safety probes (no loosened safety gates).
- New headless `SafeActionExplorerC16` and optional `--c16-dataset`, `--profile-exploration`.
- Matched C15/C16 controls and treatments: same gameplay and offers, reduced command-time overhead.
- 40 randomized matches analyzed with bootstrap at the match unit, no neural training/promotion.
- Eight new unit/evaluation tests; production `page-agent.js` unchanged.
- Full validation: 830/830 extension AI tests, 733/733 main game tests, five-mode smoke.
