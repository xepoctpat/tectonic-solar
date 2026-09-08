# Checkpoint: volcanoes on the live map

**Date:** 2026-09-08  
**Follows:** GFZ Kp slice 3.

## Sources (keyless)

| Source | Use |
|---|---|
| Smithsonian GVP Holocene WFS | Global catalog, last-eruption year, type, location. Cite VOTW v. 5.4.0 |
| USGS Volcano Notification Service `getElevatedVolcanoes` | US aviation color YELLOW/ORANGE/RED = **unrest** |

## Classes

- **Unrest** — USGS Y/O/R (live activity code, not a forecast)
- **Active** — GVP last eruption year ≥ 1800
- **Dormant** — Holocene, last eruption before 1800 (off by default)

A ring on a triangle means a live M4.5+ earthquake is within **150 km**. Geological summaries are stripped from the proxy payload.

Default map is **unrest + quake-nearby only**. Historically active (≥1800) and dormant Holocene are opt-in and hidden below zoom 5. Analytics (counts, Tonga plate, Hunga) are on the **Correlation** tab — co-location, not causation, not the 27–28 day lag.

`GET /api/volcanoes/global`. Not an eruption forecast.
