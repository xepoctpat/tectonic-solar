# GitHub Copilot Instructions — tectonic-solar

## Project Overview

**Space-Earth Monitor** — a real-time browser dashboard that monitors space weather (solar wind, Kp index, solar flares) and global seismic activity. It models and visualizes the scientifically-debated **27–28 day lag correlation** between geomagnetic storms and earthquake probability.

- No build step. Pure ES6 modules loaded directly in the browser.
- No backend database or server-side storage of any kind.
- All data is **live**, fetched at runtime from public external APIs.
- Client-side persistence only: `localStorage` (settings/preferences) and `IndexedDB` (90-day rolling windows for storms and earthquakes — client-only, auto-pruned).

---

## Runtime Environments

### Primary — Node.js proxy server

```powershell
npm start          # starts node server.js on port 3000
```

- Requires **Node ≥ 18** (uses native `fetch`).
- Express serves the static root (`__dirname`) and proxies all external APIs to sidestep CORS.
- Port is configurable: `PORT=3001 npm start`
- Health endpoint: `GET /api/health` → `{ ok: true }`
- Only runtime dependency: `express ^4.21.2`

### Secondary — Python static server (no proxy)

```powershell
solar-env\Scripts\Activate.ps1    # activate venv first
python -m http.server 8000
```

- Serves static files only. NOAA/USGS CORS restrictions will block some endpoints.
- Use this mode for quick static checks only, not full feature validation.

---

## Python Virtual Environment

| Property | Value |
|---|---|
| Location | `e:\tectonic-solar\solar-env\` |
| Python version | 3.13 |
| Activate (PowerShell) | `solar-env\Scripts\Activate.ps1` |
| Activate (bash/sh) | `solar-env\Scripts\activate` |

**Always activate the venv before running any Python command in this project.**

Key packages installed: Flask 3.1.3, flask-cors 6.0.2, gunicorn 25.1.0, gevent 25.9.1, pandas 3.0.1, numpy 2.4.3, pytest 9.0.2, pytest-cov 7.1.0, python-dotenv 1.2.2, requests 2.32.5.

> Note: No Python server (`app.py`, `wsgi.py`, Flask routes) exists yet. The venv is scaffolded for a planned future Python compute service (e.g. Dst/correlation analytics, CME API integration). All current serving is done by Node.js.

---

## No Database — Live Data Only

There is **no backend database**, no ORM, no SQL, no Redis, no file-based storage.

The app works entirely with live data:
- Data is fetched from external APIs on page load and on a polling interval.
- Relevant events (Kp≥5 storms, earthquakes) are stored **client-side only** in IndexedDB with a 90-day rolling window.
- `localStorage` holds user preferences (alert thresholds, dark mode).

Do not suggest adding a database unless it is explicitly requested. Do not add server-side caching layers without discussion.

---

## External Data Sources

All APIs are public, require no authentication, and have no API key.

| Feed | External URL | Proxy path |
|---|---|---|
| DSCOVR magnetometer (Bt/Bz) | `https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json` | `/api/noaa/rtsw-mag` |
| DSCOVR plasma (speed/density) | `https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json` | `/api/noaa/rtsw-plasma` |
| Kp index 1-min | `https://services.swpc.noaa.gov/json/planetary_k_index_1m.json` | `/api/noaa/kp-1m` |
| Kp 3-day history | `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | `/api/noaa/kp-history` |
| GOES X-ray flux 7-day | `https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json` | `/api/noaa/xrays` |
| GOES proton flux 6-hr | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-6-hour.json` | `/api/noaa/protons` |
| Kyoto Dst index | `https://services.swpc.noaa.gov/products/kyoto-dst.json` | `/api/noaa/dst` |
| USGS M4.5+ past day | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` | `/api/usgs/eq-4.5-day` |
| USGS M2.5+ past week | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson` | `/api/usgs/eq-2.5-week` |
| USGS M4.5+ past week | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson` | `/api/usgs/eq-4.5-week` |
| Open-Meteo weather | `https://api.open-meteo.com/v1/forecast?...` | `/api/openmeteo/weather?lat=&lon=` |
| Open-Meteo air quality | `https://air-quality-api.open-meteo.com/v1/air-quality?...` | `/api/openmeteo/air-quality?lat=&lon=` |

NOAA endpoints have known instability (upstream 5xx). `server.js` applies retry logic and falls back to `200 []` for non-critical feeds (e.g. plasma) so the client never sees a `502`.

---

## Source Layout

```
server.js               Express proxy server (Node.js entry point)
index.html              Single-page app shell
sw.js                   Service worker (offline caching)
manifest.json           PWA manifest
src/
  css/                  Modular CSS (variables, base, components, map, notifications)
  js/
    config.js           All API URLs, refresh intervals, map config, alert defaults
    store.js            Shared mutable state + pub/sub
    main.js             Bootstrap: SW registration, DB init, tab/map/chart init, timers
    spaceWeather.js     Fetches all NOAA feeds, updates cache, triggers charts/alerts
    seismic.js          USGS earthquake list rendering + M5+/M6+ stats
    map.js              Leaflet map, USGS markers, tectonic overlays, plate vectors
    correlation.js      27-28d lag analysis, Pearson r, Fisher p-value
    charts.js           Chart.js wrappers (solar wind, Kp history, magnitude, AQI, correlation)
    environment.js      Open-Meteo weather + air quality cards
    db.js               IndexedDB wrapper (storms + earthquakes, 90-day window)
    utils.js            fetchWithTimeout, fetchWithRetry, getKpStatus, detectFlares
    settings.js         Alert threshold persistence (localStorage)
    notifications.js    Browser Notification API + in-app toasts
    tabs.js             Tab switching + ARIA + Leaflet invalidateSize
    error-logger.js     Non-blocking error classification + telemetry POST
scripts/
  tab-smoke-test.mjs    Playwright smoke test (6 tabs, HTTP errors, console errors)
```

---

## Development Conventions

- **No build toolchain** — no webpack, Vite, Babel, or TypeScript. Keep it that way unless explicitly asked.
- **ES6 modules** — always use `import`/`export`. No CommonJS (`require`) in `src/js/`.
- **`server.js` is CommonJS** — uses `require()`. Do not mix in ES module syntax there.
- **API URL resolution** — all frontend API calls route through `config.js`. Hardcoding URLs in components is wrong; add or use constants from `config.js`.
- **Fetch pattern** — use `utils.js` `fetchWithRetry` / `fetchWithTimeout` for all external calls, not bare `fetch`.
- **Error handling** — non-critical failures (space weather feeds) should log via `error-logger.js` and degrade gracefully. Critical failures (app can't start) may throw.
- **State** — shared state lives in `store.js`. Do not scatter mutable globals across modules.

---

## Environment Variables

Only one variable is in use:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Express listen port in `server.js` |

No `.env` file. No API keys anywhere in the codebase. Do not add secrets to source files.

---

## Testing

```powershell
# Smoke test (requires server running on APP_URL)
$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs

# Verify visuals
node verify-visuals.js
```

Expected results: 6/6 tabs pass, 0 console errors, 0 HTTP errors.

---

## Key Constraints (do not violate)

1. **No server-side storage** — the app has no database and must not grow one without explicit discussion.
2. **No API keys** — all data sources are public/keyless. Do not introduce authenticated APIs.
3. **No build step** — the browser loads `index.html` directly. Do not add a bundler.
4. **Prediction is correlation-based** — the 27–28d lag model is computed in `correlation.js` from live data windows. It is not ML, not a trained model, not persisted state.
5. **Python venv must be active** for any `python` or `pip` command. The venv is at `solar-env/`.
