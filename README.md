# 🌍 Space-Earth Monitor

A real-time browser dashboard that monitors **space weather**, **global seismic activity**,
and visualizes the scientifically-studied **27–28 day correlation lag** between geomagnetic
storms and earthquake probability.

**No build step. No API key. No database.** Pure ES modules + public APIs.  
All data is fetched live from NOAA, USGS, and Open-Meteo at runtime.  
Client-side IndexedDB provides a 90-day rolling event window for correlation analysis.  
A Node.js Express server proxies external APIs to eliminate CORS issues in deployment and enforce query validation/security headers.

> Recommended local launch: `npm run launch`  
> See [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md) for the full development plan.  
> See [.github/copilot-instructions.md](.github/copilot-instructions.md) for contributor/AI coding context.

---

## Live Data Sources

| Data | Source | Feed |
|---|---|---|
| Earthquakes M4.5+ | USGS Earthquake Hazards | GeoJSON real-time (1-min lag) |
| Solar Wind speed/density | NOAA DSCOVR/ACE Plasma | 1-min JSON feed |
| Solar Wind Bt/Bz | NOAA DSCOVR/ACE Mag | 1-min JSON feed |
| Kp Geomagnetic Index | NOAA SWPC | Real-time + 3-day history |
| X-ray Flux / Solar Flares | NOAA GOES-Primary | 7-day JSON |
| Dst Index | NOAA / Kyoto WDC | Live via `/api/noaa/dst` |
| Proton Flux | NOAA GOES-Primary | 6-hour JSON |
| Historical earthquake search | USGS ComCat | Validated proxy via `/api/usgs/comcat` |
| Historical geomagnetic indices | NOAA/NCEI SWPC `dayind` archive | Validated proxy via `/api/noaa/dayind?date=YYYY-MM-DD` |
| Weather | Open-Meteo | Free API, no key |
| Air Quality (PM2.5, AQI) | Open-Meteo Air Quality | Free API, no key |
| Map Tiles | OpenStreetMap / Esri / CARTO | CDN |

---

## Features ✨

| Tab | What it does |
|---|---|
| **Map** | Interactive Leaflet map — the primary 2D research view for live USGS earthquakes, tectonic boundaries, plate motion vectors, magnitude filter slider, and multiple basemaps; any future 3D globe should remain optional and isolated from the default map path |
| **Space Weather** | Live NOAA solar wind (Chart.js animated line chart), Kp index (colour-coded bar chart), 3-day history with storm threshold, GOES X-ray flare log |
| **Seismic** | Dynamic USGS earthquake list (newest first, time-ago), statistics (M5+/M6+ counts, largest), magnitude distribution chart (Chart.js horizontal bars with magnitude color-coding) |
| **Environment** | Real-time weather (temp, feels-like, humidity, pressure, wind, condition) and air quality (PM2.5, PM10, CO, NO₂, European AQI) via Open-Meteo free API, AQI gauge doughnut chart |
| **Correlation** | 0–60 day lag scan, conditional `P(M5+ | storm 25–30d ago)`, historical USGS ComCat loading, NOAA storm-archive foundation loading, deterministic bootstrap null calibration through a local Python sidecar, correlation timeline, null-hypothesis framing, and a research-workflow status panel that exposes archive readiness, current browser-engine scope, and the boundary to optional Python compute |
| **Settings** | Configurable alert thresholds, dark mode toggle (☀️/🌙), notifications, localStorage persistence |

### Sprint 1-4 Enhancements (MVP Redesign)

**Visual Polish** 🎨
- ✅ 8-point spacing grid + elevation shadow tokens
- ✅ Glass-morphism surfaces (footer, cards)
- ✅ Fluid responsive grids (320px → 1440px+)
- ✅ Chart.js upgrade: All 5 charts now interactive, dark-mode aware, animated
- ✅ Dark mode toggle: Class-based CSS, localStorage persistence, smooth 300ms transitions

**Robustness & Error Handling** 🛡️
- ✅ Fetch timeout + exponential backoff retry (10s timeout, 2s/4s/8s delays)
- ✅ Applied to all APIs: NOAA, USGS, Open-Meteo
- ✅ Connection status indicator (online/degraded/offline)
- ✅ Graceful fallback to demo data on API failure

**Data Persistence** 💾
- ✅ IndexedDB storage: 90-day rolling window for storms and earthquakes
- ✅ Automatic data pruning: older records cleaned up daily
- ✅ Data persists across page reloads and browser sessions
- ✅ Reactive store with pub/sub pattern for UI updates

**Statistical Enhancements** 📊
- ✅ Pearson correlation coefficient (r) calculation
- ✅ Fisher transform p-value estimation (two-tailed)
- ✅ Correlation strength labels: None/Weak/Moderate/Strong
- ✅ Configurable lag window analysis (default 21–35 days, mid-point 27–28)

---

## Progressive Web App (PWA) 📱

Installable on mobile, tablet, and desktop. Works offline with cached data.

- **Manifest**: Standalone app mode (no address bar), custom icons, shortcuts
- **Service Worker**: Cache-first strategy for assets (CSS, JS, Leaflet, Chart.js), network-first for APIs with stale-while-revalidate
- **Offline Support**: Cached earthquake/storm data available without network
- **Background Sync**: Refreshes data automatically when reconnected
- **Add to Home Screen**: Pinnable on iOS/Android with custom icon

**Install**: Click the "Install" button when visiting the site (in supported browsers), or use browser menu "Add to Home Screen".

---

## Quick Start

Requires **Node ≥ 18** for the recommended launch flow. ES modules cannot run on `file://`, so use a local server.

### One-command launch (recommended)

```powershell
npm install
npm run launch
```

What `npm run launch` does:

- reuses an already-running local app server if one exists
- otherwise starts `server.js`
- opens your default browser to `http://localhost:3000`

Optional headless launch:

```powershell
npm run launch:headless
```

### Manual Node.js proxy server (recommended for scripts/CI)

```powershell
npm start
# then open http://localhost:3000
```

The Node proxy is the **primary** runtime because it:

- serves `public/` as the isolated web root
- proxies NOAA / USGS / Open-Meteo to avoid browser CORS issues
- applies rate limiting, CSP, `X-Frame-Options`, `nosniff`, and query validation

Port is configurable. PowerShell example:

```powershell
$env:PORT = "3001"
npm run launch
```

### Python static server (limited — some APIs CORS-blocked)

```powershell
# Activate the workspace venv first
solar-env\Scripts\Activate.ps1

python -m http.server 8000 --directory public
# open http://localhost:8000
```

Use this mode only for quick static rendering checks. It is **not** the recommended way to run the full app because some live data streams will be blocked or degraded without the Node proxy.

### Optional Python research sidecar (deterministic null tests)

The browser app can now call an **optional local Python sidecar** for deterministic bootstrap / permutation-style null calibration.

```powershell
solar-env\Scripts\Activate.ps1
python scripts/research_sidecar.py
```

What it does:

- binds to `127.0.0.1:5051` only
- stays **local-only** and is never exposed directly to the browser
- is reached through the Node proxy at `/api/research/status` and `/api/research/bootstrap`
- powers the Correlation tab's **Run Bootstrap Null Test** workflow

This is optional research compute, not normal app startup. If the sidecar is not running, the rest of the dashboard still works.

### Python venv (research mode)

The venv at `solar-env/` is reserved for future research/compute work such as:

- bootstrap or permutation testing for the null distribution
- regional stratification and long-window archive analysis
- Gutenberg–Richter / b-value calculations
- optional sidecar analytics services

An optional local Python research sidecar now exists at `scripts/research_sidecar.py`, but the venv is still **not required** for normal dashboard usage.

When Python is used in this repo, the rule is strict:

- always activate `solar-env\Scripts\Activate.ps1` first
- never use system Python
- keep Node/Express as the main user-facing server
- proxy any Python sidecar through `server.js` rather than exposing it directly to the browser

```powershell
# To set up the venv from scratch:
python -m venv solar-env
solar-env\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## Project Structure

```
tectonic-solar/
├── server.js                 # Node proxy server + security headers + research feed validation
├── package.json              # Runtime scripts (`launch`, `start`, `test:tabs`)
├── requirements.txt          # Python research environment dependencies
├── public/                   # Browser-served web root
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   └── src/
│       ├── css/
│       └── js/
├── scripts/
│   ├── launch.js             # Friendly launcher: start/reuse server + open browser
│   ├── research_sidecar.py   # Local-only Flask sidecar for bootstrap null calibration
│   ├── research_stats.py     # Pure NumPy research helpers used by the sidecar
│   ├── tab-smoke-test.mjs    # 6-tab Playwright smoke test
│   ├── verify-visuals.js
│   ├── lighthouse-automation.js
│   ├── restart-server.js
│   └── test-automation.js
├── tests/
│   └── test_research_stats.py # Pytest checks for bootstrap/null helper behavior
├── docs/
│   ├── planning/
│   ├── research/
│   ├── operations/
│   ├── testing/
│   ├── development/
│   └── handoff/
└── solar-env/                # Local Python venv for future research compute tasks
```

---

## Correlation Research

The **27–28 day lag hypothesis** posits that geomagnetic storms trigger increased seismic
probability approximately one solar rotation later via electromagnetic or tidal stress loading.

Key references:
- Odintsov et al. (2006) — Geomagnetic activity and seismicity
- Han et al. (2004) — Statistical correlation study
- Varga & Grafarend (2018) — Earth rotation and seismicity

Current research workflow in the app:

- live storm and earthquake monitoring
- 0–60 day lag scan with explicit null-result framing
- empirical conditional probability of M5+ activity in the 25–30 day post-storm window
- optional bootstrap null calibration through the local Python sidecar
- optional historical USGS ComCat load through a validated proxy route

### Current plan

The near-term plan is intentionally conservative and research-first:

1. **Make the app easy to run** so testing and exploration happen routinely (`npm run launch`)
2. **Reproduce the null first** on short live windows and in deterministic simulation before making any signal claims
3. **Expand historical depth securely** via public, keyless, validated proxy feeds
4. **Use Python only for heavy statistical work** once the browser/Node path is saturated

### Stepwise hypothesis validation

Use the same lag-analysis core in two modes:

- **Live / historical mode** inside the app for real NOAA + USGS data and validated ComCat backfill
- **Official storm-history mode** inside the app for NOAA/NCEI `dayind` daily geomagnetic indices (3-hour planetary Kp archive)
- **Deterministic simulation mode** to verify that the engine stays near-null under independence, detects an implanted 27-day signal, and does not mislabel an off-target lag

The live app now distinguishes between **insufficient data**, **null-consistent**, **off-target peak**, **weak 25–30d bump**, and **candidate 25–30d signal** so a high percentage alone is not mistaken for evidence.

When moving from setup to real-data analysis, the preferred path is now:

1. run `npm run test:hypothesis-sim`
2. launch the app
3. click **Load Full Research Foundation** in the Correlation tab
4. optionally start the Python research sidecar and click **Run Bootstrap Null Test**
5. rerun the lag scan on the combined NOAA + USGS historical corpus

```powershell
npm run test:hypothesis-sim
```

This simulation script is a **sanity check for the analysis engine**, not evidence that the real-world hypothesis is true.

**⚠️ Disclaimer**: USGS and most seismologists state no proven causal relationship exists.
This tool is for pattern research and exploration, **not** earthquake prediction.

For the fuller execution plan, see [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md).

---

## Security Posture

This project intentionally keeps the research surface area wide **without** loosening the security model:

- `public/` is the only served web root
- no API keys or authenticated feeds
- no server-side database or caching layer
- Node proxy applies rate limiting to the **API surface** and security headers to the whole app
- historical research queries are validated before proxying upstream
- historical NOAA storm archive requests are date-validated before proxying upstream
- new external feeds should be added through `server.js` + `public/src/js/config.js`
- live-data UI should prefer safe DOM APIs over `innerHTML`

---

## Browser Support

**Minimum**: Chrome ≥89 · Firefox ≥78 · Safari ≥14 · Edge ≥89  
**Features**: ES2020, Fetch API, IndexedDB, Service Workers, Notifications, CSS custom properties

**Tested**:
- ✅ Chrome 120+ (desktop, mobile)
- ✅ Firefox 115+ (desktop)
- ✅ Safari 16+ (macOS, iOS 16+)
- ✅ Edge 120+ (desktop)

---

## Performance & Testing

| Metric | Target | Notes |
|--------|--------|-------|
| First Paint | <1s | CSS in `<head>`, no render-blocking JS |
| Largest Contentful Paint | <2.5s | Chart.js takes 1.5–2s for complex data |
| Interaction to Paint | <100ms | Chart hover tooltips, tab switches |
| Service Worker Cache | <500KB | Gzipped: 45KB JS + 8KB CSS + 160KB Leaflet + 180KB Chart.js |
| IndexedDB Query (100K records) | <50ms | Date-indexed range queries |
| Lighthouse PWA Score | ≥90 | Manifest, SW, HTTPS (if deployed) |

**Testing Checklist**:
- [ ] Launch via `npm run launch`
- [ ] Run `npm run test:hypothesis-sim` and confirm null / positive-control / off-target scenarios behave as expected
- [ ] Load the 2-year NOAA storm archive and confirm the storm catalog moves beyond seed/live-only mode
- [ ] Responsive layout at 375px, 768px, 1440px
- [ ] Dark mode toggle persists across reload
- [ ] Offline mode: disable network in DevTools, verify cached data loads
- [ ] All charts render and respond to hover
- [ ] IndexedDB persists storms/earthquakes after page reload
- [ ] Service Worker cache inspected in DevTools Application tab
- [ ] Correlation analysis calculates Pearson r and p-value
- [ ] Fetch retry: simulate API timeout, verify exponential backoff

---

## Known Limitations

- **Service Worker**: Static asset list is manual (update `sw.js` if new CDN libs added)
- **Dark Mode & Leaflet**: Leaflet map tiles don't respond to dark mode toggle (Leaflet layer limitation)
- **IndexedDB Data Volume**: Pruning uses synchronous cursor traversal (acceptable up to ~1M records)
- **Correlation**: Default lag window 21–35 days (27–28 day mid-point) — adjustable via JavaScript but no UI slider yet
- **Chart.js**: No native line drawing between correlation pairs (workaround: scatter points only)

---

## Documentation

- [.github/copilot-instructions.md](.github/copilot-instructions.md) — Contributor/AI coding context (server setup, venv, data sources, conventions)
- [docs/planning/SPRINT-1-DELIVERY.md](docs/planning/SPRINT-1-DELIVERY.md) — Complete list of Sprint 1-4 changes
- [docs/handoff/HANDOFF.md](docs/handoff/HANDOFF.md) — Security/restructure + research handoff notes
- [docs/development/DEV-QUICK-REFERENCE.md](docs/development/DEV-QUICK-REFERENCE.md) — Developer guide for extensions and maintenance
- [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md) — Future features and the current research execution plan
- [docs/research/RESEARCH.md](docs/research/RESEARCH.md) — Hypothesis analysis and falsification criteria

---

## License

[LICENSE.md](LICENSE.md)

