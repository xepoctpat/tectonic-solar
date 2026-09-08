# Plan: always-on feeds + outbound alerts

**Date:** 2026-09-08  
**Status:** Slices 1–3 done (2026-09-08). Later slices are planned, not started.  
**Compare against:** this file. Do not treat “never offline” as a pass/fail bar.

## Goal

Keep the dashboard **live-degraded** when an upstream dies: ranked public keyless sources, last-good snapshots, honest labels. Do not fabricate calm data. Do not send earthquake forecasts.

“Offline” in this repo means three different things. Only (2) is this plan.

| Sense | Meaning | Policy |
|---|---|---|
| 1. Browser/PWA | Tab or network gone; SW + IndexedDB | Keep as-is |
| 2. Upstream feed | NOAA/USGS/EMSC/Open-Meteo 404/timeout | Ranked fallback + last-good + `degraded` |
| 3. Python sidecar | Optional research compute | Stay optional; not dashboard health |

## Constraints (do not violate)

- Public, **keyless** runtime. Credentials only in gitignored `.env` (same pattern as optional `XAI_API_KEY`).
- No server database, Redis, or silent disk cache. Process-lifetime last-good is allowed if **advertised** (`X-Feed-Freshness`, health payload).
- More catalogs ≠ more independent evidence. Dedup and provenance stay required.
- Outbound alerts copy **measured** events only (M6+, Kp, flare class). Never “quake incoming.”

## Slice 1 — NOAA wind successor + honest health (this change)

NOAA retired `rtsw_plasma_1m.json` (SCN 26-21 / DSCOVR→IMAP). Replacement is already public:

`https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json`

| Old field | New field |
|---|---|
| `speed` | `proton_speed` |
| `density` | `proton_density` |
| `temperature` | `proton_temperature` |

The JSON mixes spacecraft (`SOLAR1` `active:true`, plus `ACE`/`IMAP` inactive). **Prefer `active === true`** for “latest” and history merge. Mag feed has the same flag.

Also:

- Keep `/api/noaa/rtsw-plasma` as the browser path; add `/api/noaa/rtsw-wind` as an alias.
- Proxy maps `proton_*` → `speed`/`density` so existing clients keep working; clients also read both names.
- `/api/health` returns **HTTP 200 while Node is up**. `ok` / `status: "ok"|"degraded"` describe upstreams. Do not 503 the whole box because one NOAA file failed.
- On upstream failure, serve **in-memory last-good** if we have one; else `[]`. Headers: `X-Feed-Freshness: live|last-good|empty`.

**Done when:** Space Weather shows speed/density/`P_dyn`/`E_y` from live wind; health is 200 with per-feed checks; empty plasma 404 is no longer the expected local log line.

## Slice 2 — Ranked seismic (after 1)

USGS + EMSC already merge. **GFZ GEOFON** is wired as rank 3.

Validation that blocked JSON: `format=json` and `format=geojson` return 400. Live path is FDSN **text** (`EventID|Time|Lat|Lon|Depth|…|MagType|Magnitude|…|EventType`). Parametric data is **CC-BY-4.0** (© GFZ (GEOFON)). Magnitudes are mixed **mb/Mw**, not homogenized. Same identity rule as EMSC (time ±120s, 0.5°, mag ±0.4). USGS wins ties. GEOFON-only events stay labeled. Do not treat extra rows as extra independent evidence.

## Slice 3 — Ranked Kp / space-weather seconds

GFZ Potsdam Kp is wired as rank 2.

- Official IAGA Kp, **CC BY 4.0**, 3-hour bins: `https://kp.gfz.de/app/json/?start=&end=&index=Kp`
- NOAA 1-minute estimated Kp stays first for “now.”
- NOAA 3-day history (`noaa-planetary-k-index.json`) is now **objects** `{time_tag, Kp}` (SCN 26-21), not a header+rows table — the old client parser treated that as empty. Both shapes parse.
- If NOAA 3-day is empty, the chart uses GFZ 3-hour points. If NOAA 1-min is empty, current Kp uses GFZ.
- Do not mix 1-minute and 3-hour samples as one unlabeled series.

## Slice 4 — Coupling-chain gap (science, not uptime)

Ionosphere/atmosphere is explicitly unmonitored. A GNSS TEC / GIRO feed is a **research** slice, not a health fix.

## Slice 5–7 — Outbound notifications (horizon)

In-app toasts + browser `Notification` already exist while a tab/PWA is allowed.

| Slice | Channel | Notes |
|---|---|---|
| 5 | Web Push (VAPID) | Tab closed; same thresholds as Settings |
| 6 | Email | SMTP (or similar) in `.env`; digest option |
| 7 | WhatsApp | Meta Cloud API last; private deploy only |

Roadmap already listed server push (Phase 5) and Discord/Slack webhooks (Phase 7). Those sit with 5–6, not instead of feeds.

## Anti-goals

- Do not mark health `ok` by hiding a dead feed behind demo numbers.
- Do not lower Grok/`xhigh` to save tokens; this plan is about **feeds**, not the TUI.
- Do not launch prism-clean workflows from this repo.

## Validation for Slice 1

- `GET /api/noaa/rtsw-plasma` (and `/api/noaa/rtsw-wind`) returns an array with `speed`/`density` (aliases) and `proton_*`.
- `GET /api/health` is 200; `checks` include mag, wind, kp, usgs, emsc, openmeteo; `status` is `ok` or `degraded`.
- `npm run test:solar-metrics` (includes RTSW helpers).
- Tab smoke: local HTTP 200 is enough to run tabs; degraded upstreams must not fail the whole smoke.
- Space Weather card: live speed/density when wind is up; no “plasma retired” copy when the successor is live.
