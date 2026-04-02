# Handoff — Frontend Honesty + Plate-Study UX + Lineage Shift (2026-04-02)

This is the first standalone handoff created after shifting the repo away from one endlessly appended `HANDOFF.md`. `docs/handoff/HANDOFF.md` now acts as the handoff index / lineage root, while this file captures the current operational checkpoint.

## What changed

### 1. Space-weather UI now degrades honestly instead of faking calm data

- Updated `public/src/js/spaceWeather.js` so solar wind, Kp, and X-ray feeds fail independently.
- Added per-feed status tracking (`live` / `degraded` / `stale` / `unavailable`) and a summary banner in the Space Weather tab.
- Added client-side last-good caching for solar wind, Kp, and X-ray data.
- Removed fake calm defaults from `public/index.html` so missing NOAA data no longer looks like a quiet day.
- Cached or unavailable space-weather data no longer behaves like fresh alert input.

### 2. Map reading now supports plate interpretation first

- Added a neutral `plates` basemap in `public/src/js/config.js`.
- Made `Plate Study` the default map mode in `public/src/js/map.js`.
- Updated the plate-guide behavior so it hides earthquake dots, keeps boundaries emphasized, and frames plate interactions independently of the solar-weather hypothesis.
- Clarified the earthquake marker slider so it starts at `M4.5+` to match the live USGS map feed and explicitly affects only earthquake dots.

### 3. Notification noise was reduced

- Added browser/in-app alert dedupe and toast capping in `public/src/js/notifications.js`.
- Updated `public/src/js/seismic.js` so the current feed becomes a silent baseline and multiple fresh qualifying earthquakes can be batched instead of spamming duplicate alerts.

### 4. Optional sidecar offline state is quieter and more honest

- Updated `server.js` so `GET /api/research/status` returns `200` with `online:false` when the sidecar is offline, instead of routine `503` browser noise.
- Expanded `connect-src` to reduce harmless browser/source-map noise from frontend library origins.

### 5. Handoff workflow now uses standalone dated files

- `docs/handoff/HANDOFF.md` now acts as a lineage/index instead of the only place session outcomes accumulate.
- Future meaningful recaps should be created as `docs/handoff/YYYY-MM-DD-short-title.md`.
- Historical monolithic sections remain in `HANDOFF.md` for provenance, but newer standalone handoffs now take precedence.

## Validation completed

- `$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs` → **6/6 tabs pass**, **0 console errors**, **0 page errors**, **0 request failures**
- `npm run test:hypothesis-sim` → passes
- `pytest tests/test_research_stats.py -q` in `solar-env` → **3 passed**
- `GET /api/research/status` through Node proxy → returns the offline JSON contract (`online:false`) when the sidecar is not running
- Refreshed browser screenshots confirm the Space Weather tab now surfaces degraded NOAA states explicitly instead of showing fake calm defaults

## Current operational state

- Current HEAD during this checkpoint: `b7d27b7cbd56a60357871f1486f20bb9e5368311`
- Working tree is **not clean** in this checkpoint; documentation, UI, runtime, and generated smoke artifacts are currently present in the workspace and not yet committed
- The Python sidecar is still optional and currently offline in this session unless started after activating `solar-env`
- NOAA plasma instability remains an expected upstream weakness; the app now degrades honestly instead of masking it with fake calm values

## What remains open / not yet fully closed

- Space Weather charts could still use stronger empty/degraded visual treatment when plasma or Kp history are missing
- The wider doc surface beyond the handoff system should still be synced for the latest runtime/UI honesty pass when practical
- Sidecar startup is still manual for research sessions

## Suggested next checks

1. Sync the latest Space Weather honesty behavior into the broader user/developer docs when convenient.
2. Improve degraded chart messaging so missing history reads clearly at a glance.
3. Decide whether research sessions should get a sidecar helper/launch flow or keep the current manual startup model.