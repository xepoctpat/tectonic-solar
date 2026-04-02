---
description: "Use when editing server.js for Space-Earth Monitor. Covers CommonJS-only proxy rules, validated public keyless feeds, local-only Python sidecar proxying, graceful NOAA fallback behavior, and no server-side storage."
name: "Space-Earth Server Proxy Rules"
applyTo: "server.js"
---

# Space-Earth Server Proxy Rules

- Keep `server.js` in CommonJS (`require`, `module.exports` if needed); do not mix in frontend ES module syntax.
- Keep Node/Express as the public entry point and `public/` as the only browser-served web root.
- All upstream feeds must stay public and keyless unless explicitly discussed; do not introduce authenticated APIs or secrets.
- Validate and sanitize incoming query parameters before proxying upstream.
- Do not add server-side databases, ORM layers, Redis, or silent caching layers.
- Keep any Python research service local-only and proxy it through Node rather than exposing Python directly to the browser.
- For unstable non-critical feeds, prefer deliberate graceful degradation consistent with existing repo behavior over brittle proxy failures.
- If a proxy route or response contract changes, update `public/src/js/config.js`, affected feature modules, and relevant testing/docs in the same work session.
