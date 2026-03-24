# 🌍 Space-Earth Monitor

A real-time browser dashboard that monitors **space weather**, **global seismic activity**,
and visualizes the scientifically-studied **27–28 day correlation lag** between geomagnetic
storms and earthquake probability.

**No build step. No API key. No database.** Pure ES modules + public APIs.  
All data is fetched live from NOAA, USGS, and Open-Meteo at runtime.  
Client-side IndexedDB provides a 90-day rolling event window for correlation analysis.  
A Node.js Express server proxies external APIs to eliminate CORS issues in deployment.

> See [ROADMAP.md](ROADMAP.md) for the full development plan.  
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
| Weather | Open-Meteo | Free API, no key |
| Air Quality (PM2.5, AQI) | Open-Meteo Air Quality | Free API, no key |
| Map Tiles | OpenStreetMap / Esri / CARTO | CDN |

---

## Features ✨

| Tab | What it does |
|---|---|
| **Map** | Interactive Leaflet map — live USGS earthquakes (coloured by magnitude band, depth-encoded border), tectonic boundaries, plate motion vectors, magnitude filter slider, 4 tile layers |
| **Space Weather** | Live NOAA solar wind (Chart.js animated line chart), Kp index (colour-coded bar chart), 3-day history with storm threshold, GOES X-ray flare log |
| **Seismic** | Dynamic USGS earthquake list (newest first, time-ago), statistics (M5+/M6+ counts, largest), magnitude distribution chart (Chart.js horizontal bars with magnitude color-coding) |
| **Environment** | Real-time weather (temp, feels-like, humidity, pressure, wind, condition) and air quality (PM2.5, PM10, CO, NO₂, European AQI) via Open-Meteo free API, AQI gauge doughnut chart |
| **Correlation** | 27–28 day lag analysis with Pearson correlation coefficient (r), p-value, statistical strength (Weak/Moderate/Strong), correlation timeline scatter plot showing storm/earthquake pairs |
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

No dependencies to install for the frontend. Requires a local HTTP server (ES modules cannot run on `file://`).

### Node.js proxy server (recommended — full functionality)

```powershell
npm install
npm start
# open http://localhost:3000
```

Requires **Node ≥ 18**. Proxies all NOAA/USGS/Open-Meteo APIs to avoid CORS restrictions.  
Port is configurable: `PORT=3001 npm start`

### Python static server (limited — some APIs CORS-blocked)

```powershell
# Activate the workspace venv first
solar-env\Scripts\Activate.ps1

python -m http.server 8000
# open http://localhost:8000
```

# VS Code: click Go Live in status bar
```

### Python venv (workspace)

The venv at `solar-env/` is scaffolded for a planned Python compute service (Dst analytics, CME integration).  
**No Python server currently exists** — the venv is not required for normal app operation.

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
├── index.html              # Markup — semantic HTML, ARIA, PWA meta tags
├── manifest.json           # PWA manifest — app metadata, icons, shortcuts
├── sw.js                   # Service worker — caching, offline support
├── server.js               # Node deployment simulation server + API proxy
├── requirements.txt        # Python dependencies for workspace venv
├── package.json            # Node runtime config for simulation server
├── ROADMAP.md              # Development roadmap
├── README.md
├── SPRINT-1-DELIVERY.md    # Sprint 1-4 delivery summary
├── DEV-QUICK-REFERENCE.md  # Developer guide for extension/maintenance
└── src/
    ├── css/
    │   ├── variables.css   # Design tokens (spacing, shadows, glass-morphism, dark mode)
    │   ├── base.css        # Reset, layout, responsive breakpoints (480/768/1024px), dark mode class-based
    │   ├── components.css  # Tabs, cards, buttons (ripple), skeletons (shimmer), EQ list borders
    │   ├── map.css         # Leaflet layout, controls, magnitude slider
    │   └── notifications.css # Toast styles, progress bar animation
    └── js/
        ├── config.js       # API URLs, constants, WMO codes, AQI levels
        ├── store.js        # Mutable state with getters, pub/sub pattern, pruning functions
        ├── utils.js        # Fetch resilience (timeout + retry), DOM helpers, CSS utilities
        ├── db.js           # IndexedDB wrapper — 90-day rolling storage for storms/earthquakes
        ├── tabs.js         # Tab switching + Leaflet invalidateSize
        ├── map.js          # Leaflet init, overlays, EQ markers, magnitude filter
        ├── spaceWeather.js # NOAA APIs (solar wind, Kp, flares) + IndexedDB persistence
        ├── seismic.js      # Earthquake alerts + dynamic list rendering
        ├── environment.js  # Open-Meteo weather + air quality
        ├── correlation.js  # Pearson r, p-value, strength labels, configurable lag analysis
        ├── charts.js       # Chart.js: Solar Wind, Kp, Magnitude, AQI, Correlation Timeline
        ├── notifications.js # Browser push + in-app toasts with progress bar
        ├── settings.js     # Settings UI, alert thresholds, dark mode
        └── main.js         # App init, SW registration, IndexedDB init, event listeners
```

---

## Correlation Research

The **27–28 day lag hypothesis** posits that geomagnetic storms trigger increased seismic
probability approximately one solar rotation later via electromagnetic or tidal stress loading.

Key references:
- Odintsov et al. (2006) — Geomagnetic activity and seismicity
- Han et al. (2004) — Statistical correlation study
- Varga & Grafarend (2018) — Earth rotation and seismicity

**⚠️ Disclaimer**: USGS and most seismologists state no proven causal relationship exists.
This tool is for pattern research and exploration, **not** earthquake prediction.

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
- [SPRINT-1-DELIVERY.md](SPRINT-1-DELIVERY.md) — Complete list of Sprint 1-4 changes
- [HANDOFF.md](HANDOFF.md) — NOAA proxy resilience + frontend error telemetry stabilization notes
- [DEV-QUICK-REFERENCE.md](DEV-QUICK-REFERENCE.md) — Developer guide for extensions and maintenance
- [ROADMAP.md](ROADMAP.md) — Future features and long-term vision

---

## License

[LICENSE.md](LICENSE.md)

