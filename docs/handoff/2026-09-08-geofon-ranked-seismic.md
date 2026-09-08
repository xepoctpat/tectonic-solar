# Checkpoint: GFZ GEOFON ranked seismic partner

**Date:** 2026-09-08  
**Plan:** [`docs/planning/2026-09-08-always-on-feeds-and-outbound-alerts.md`](../planning/2026-09-08-always-on-feeds-and-outbound-alerts.md) (Slice 2)

## What was checked before wiring

| Question | Result |
|---|---|
| Public / keyless | Yes. `https://geofon.gfz.de/fdsnws/event/1/query` |
| JSON / GeoJSON | **400** `invalid value in parameter: format` |
| Usable format | FDSN **text** (`format=text`), pipe-separated |
| License | Parametric data **CC-BY-4.0**; attribute © GFZ (GEOFON) |
| Magnitudes | Mixed **mb** / **Mw**; not homogenized with USGS |
| Identity | Same rule as EMSC: ±120s, 0.5°, mag ±0.4 |

## What changed

| Surface | Change |
|---|---|
| `lib/seismic-merge.cjs` | FDSN text parser, ranked merge (USGS > EMSC > GFZ GEOFON) |
| `server.js` | Third provider in `loadGlobalSeismic`; health check `geofon`; last-good for empty merge |
| `scripts/seismic-merge-test.mjs` | Parser + rank/dedup checks |

GEOFON-only events stay in the collection with `properties.source = "GFZ GEOFON"`. Matching USGS/EMSC events are **not** double-counted.

## Validation

- `npm run test:seismic-merge`
- `GET /api/seismic/global` metadata.providers includes GFZ GEOFON
- `GET /api/health` includes `checks.geofon`

## Not in this slice

GFZ Kp, ionosphere, outbound alerts.
