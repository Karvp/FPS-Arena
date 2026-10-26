# FPS Arena

A browser game and AI research sandbox developed as a personal programming project. The repository contains a Node.js game, a browser extension, simulation experiments, and automated tests.

## Project layout

The game server is under `lab/arena/source-main`, with its own `package.json`. The repository root contains the browser-extension manifest, source modules, tests, research notes and scripts.

Run the engine from `lab/arena/source-main` using `npm ci` and `npm start`, then open the local game in a browser. The project also provides `npm run check`, `npm test` and `npm run smoke`. On October 26, 2026 the game passed 733 engine checks, the client/server smoke suite and 13 targeted AI acquisition tests. A production-dependency audit reported zero current findings after updating the lockfile.

This is an experimental project. Some research branches failed their evaluation criteria and were not adopted. See [project continuity](PROJECT_CONTINUITY.md) and [research log](docs/RESEARCH_LOG.md).

The public version includes two original synthesized WAV sound cues to replace missing historical sound files. The game mechanics and source for neural-agent experiments remain included.

## License

GPL-3.0-only. See [LICENSE](LICENSE). Third-party dependencies and materials remain under their respective licenses.
