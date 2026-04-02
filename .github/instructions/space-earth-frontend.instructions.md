---
description: "Use when editing browser-side ES modules in public/src/js for Space-Earth Monitor. Covers config.js API routing, fetchWithRetry usage, store.js state flow, graceful degradation, and no-build browser constraints."
name: "Space-Earth Frontend Module Rules"
applyTo: "public/src/js/**"
---

# Space-Earth Frontend Module Rules

- Keep browser code as ES modules only: use `import` / `export`, never `require()` or `module.exports`.
- Route API calls through `config.js`; do not hardcode NOAA, USGS, Open-Meteo, or local proxy URLs inside feature modules.
- For external or proxy-backed network paths, prefer `fetchWithRetry()` or `fetchWithTimeout()` from `utils.js` instead of bare `fetch`.
- Keep shared mutable state in `store.js` and existing publish/subscribe flows rather than adding ad hoc globals.
- Degrade honestly on partial failures: log non-critical issues, render explicit empty/degraded states, and avoid pretending data exists.
- Preserve the current no-build browser runtime: no TypeScript syntax, bundler assumptions, or Node-only APIs in `public/src/js/`.
- Treat `map.js` as the primary 2D research surface; any future 3D rendering should remain optional and isolated.
