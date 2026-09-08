# Checkpoint: GFZ Kp as ranked second + NOAA 3-day parser

**Date:** 2026-09-08  
**Plan:** [`docs/planning/2026-09-08-always-on-feeds-and-outbound-alerts.md`](../planning/2026-09-08-always-on-feeds-and-outbound-alerts.md) (Slice 3)

## What was checked

| Question | Result |
|---|---|
| Public / keyless | Yes. `https://kp.gfz.de/app/json/` |
| License | **CC BY 4.0**; attribute GFZ German Research Centre for Geosciences |
| Cadence | Official IAGA Kp, **3-hour** bins (`datetime` + `Kp` + `status` pre/def) |
| NOAA 3-day | Live, but **object rows** `{time_tag, Kp}` after SCN 26-21 — old table parser treated it as empty |

## Rank

1. NOAA 1-minute estimated Kp for “now”
2. GFZ 3-hour nowcast if NOAA 1-min is empty; GFZ series if NOAA 3-day history is empty
3. NOAA 3-day last bin

Do not plot 1-minute and 3-hour samples as one unlabeled series.

## Files

`public/src/js/kpIndex.mjs`, `scripts/kp-index-test.mjs`, `GET /api/gfz/kp`, Space Weather + briefing fallbacks.

## Validation

- `npm run test:kp-index`
- `GET /api/gfz/kp` returns `{points, license}`
- Space Weather Kp chart populated from NOAA objects or GFZ
