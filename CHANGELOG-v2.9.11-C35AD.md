# C35-AD changelog

- Opt-in C35-AD prefire/ADS retention 50/50 randomizer, public-only gating, max 0.28s impulse and 0.7s factual post-step window.
- New trace flags `--c35ad-trace` and `--c35ad-policy observe|randomized`. Cannot run with other active action controllers.
- New regression tests, preregistered 72-match TDM runner, independent SHA/C21/shot audit, setup-cluster bootstrap, passive replay checks.
- Production page-agent.js and core engine combat code unchanged. No policy promotion.
