# Checkpoint: NOAA RTSW wind successor + honest health

**Date:** 2026-09-08  
**Plan:** [`docs/planning/2026-09-08-always-on-feeds-and-outbound-alerts.md`](../planning/2026-09-08-always-on-feeds-and-outbound-alerts.md) (Slice 1)

## What changed

NOAA retired `rtsw_plasma_1m.json`. The public successor is `rtsw_wind_1m.json` (`proton_speed` / `proton_density` / `proton_temperature`). The JSON mixes spacecraft; **`active: true`** is the operational stream.

| Surface | Change |
|---|---|
| `server.js` | Wind URL; `/api/noaa/rtsw-wind` alias; `proton_*` → `speed`/`density`; in-memory last-good with `X-Feed-Freshness`; `/api/health` HTTP 200 + `status: ok\|degraded` |
| `public/src/js/rtswWind.mjs` | Operational-row + field alias helpers |
| `spaceWeather.js`, `ai-briefing.js`, `config.js` | Consume successor; drop “plasma retired” as the live story |
| `scripts/tab-smoke-test.mjs` | Local HTTP 200 is enough; degraded upstreams do not fail the smoke |
| `public/sw.js` | Cache `v13` |

This is **not** a database. Last-good dies with the Node process. Empty fallback is still not a quiet Sun.

## Validation

- `npm run test:solar-metrics` — RTSW helper checks included
- Live: `GET /api/noaa/rtsw-plasma` and `/api/noaa/rtsw-wind` should return aliased speed/density
- Live: `GET /api/health` should be 200 with `checks.noaa_wind`

## Not in this slice

GFZ GEOFON, GFZ Kp, ionosphere, Web Push / email / WhatsApp — listed in the plan, not started.
