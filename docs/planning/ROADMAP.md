# 🗺️ Space-Earth Monitor — Roadmap

> **Purpose**: A research-grade, open-source web dashboard that monitors real-time space weather
> (solar wind, geomagnetic activity, solar flares) alongside global seismic activity,
> and visualizes the scientifically-debated **27–28 day correlation lag** between
> geomagnetic storms and earthquake probability.
>
> This project is **accelerated-prototype** quality — functional, real-data connected,
> and actively evolving. It is not a finished product.

---

## Current State — v0.2.0

### ✅ Implemented

| Feature | Details |
|---|---|
| Live USGS Earthquakes | M4.5+ past day, auto-refresh every 60 s |
| Live NOAA Solar Wind | Speed, density, Bt/Bz from DSCOVR/ACE 1-min feed |
| Live NOAA Kp Index | Real-time + 3-day history chart with storm threshold line |
| Solar Flare Detection | GOES X-ray flux 7-day window, class detection |
| Real Weather | Open-Meteo free API — temp, humidity, pressure, wind, condition |
| Real Air Quality | Open-Meteo AQ API — PM2.5, PM10, CO, NO₂, European AQI |
| Interactive Map | Leaflet, 4 tile layers, tectonic boundaries, plate motion vectors |
| Depth Encoding | Earthquake marker border thickness = depth zone |
| Magnitude Filter | Slider on map sidebar to filter displayed earthquakes |
| Dynamic Seismic List | Live USGS list with time-ago labels and depth info |
| Seismic Statistics | M5+ count, M6+ count, largest, total — all computed from live data |
| Magnitude Distribution | Real bar chart from USGS data |
| Correlation Timeline | 30-day canvas showing storm ↔ earthquake lag pairs |
| Correlation Window | Detects active 27–28 day post-storm windows |
| Browser Notifications | Push notifications for M6+, Kp≥threshold, solar flares |
| In-App Toasts | Slide-in notification system for all events |
| Alert Settings | Configurable thresholds, persisted in localStorage |
| Status Indicator | Live/Demo/Loading dot in header |
| ES Module Architecture | Zero build step, modular browser code in `public/src/js/` |
| Dark Mode CSS | Automatic via `prefers-color-scheme` |
| Historical ComCat Research Loader | 2-year M5+ ingestion path via validated `/api/usgs/comcat` proxy |
| Statistical Prediction Engine | Lag scan + empirical conditional probability for M5+ post-storm windows |
| Friendly Local Launch | `npm run launch` auto-starts or reuses local server and opens the app |

---

## Immediate Focus — Launch UX + Research Execution (next)

> This is the near-term operating plan for what the app is actually trying to achieve: safe, repeatable hypothesis testing with live + historical public data.

### 1. Researcher-friendly local launch
- [x] One-command startup via `npm run launch`
- [ ] Keep smoke/visual validation easy enough to run before and after research changes
- [ ] Prefer Node proxy mode for all real research sessions

### 2. Reproduce the null before claiming signal
- [ ] Use the current 90-day / short-window view to verify that the app can still produce a null-like outcome
- [x] Add a deterministic simulation harness so the lag engine can be checked against null, positive-control, and off-target scenarios
- [ ] Keep UI language explicit about null, uncertainty, and insufficient evidence
- [ ] Avoid fabricated placeholder data in research charts

### 3. Securely deepen historical evidence
- [ ] Expand multi-year USGS ComCat usage through the validated proxy
- [x] Add an official NOAA/NCEI 2-year storm archive path via daily `dayind` products
- [x] Add a one-click research foundation loader so storms + earthquakes can be backfilled together
- [ ] Add Dst-driven comparative storm thresholds
- [ ] Add provenance so researchers can see which feed produced each plotted value

### 4. Add heavier statistics only when warranted
- [x] Standardize the optional Python research environment on `statsmodels` + `scikit-learn` for interpretable modeling, calibration, and scorecard work
- [x] Bootstrap / permutation null distribution (1000×+) via optional local Python sidecar + Node proxy
- [ ] Regional stratification (Ring of Fire, Mediterranean-Himalayan, Cratons)
- [ ] Bonferroni-aware lag scanning and significance calibration

### 5. Keep optional factor models subordinate to the baseline
- [ ] Freeze and preserve a storm-only benchmark before adding extra factors
- [ ] Add factor provenance fields such as tectonic region, boundary family, storm strength, and solar-cycle phase
- [ ] Treat sidereal/synodic phase experiments as optional research-only sidequests, not replacements for the main hypothesis
- [ ] Require factor-conditioned models to beat the simpler baseline on calibration and forward/holdout checks before promoting them

### 6. Use Python only as an optional compute sidecar
- [ ] Reserve Python for heavy research workloads (bootstrap, b-values, archive joins)
- [ ] Use `statsmodels` first for interpretable GLMs / count models before reaching for black-box predictors
- [ ] Use `scikit-learn` primarily for calibration, baselines, holdout comparison, and scorecards rather than as an excuse for premature complexity
- [ ] Keep Node/Express as the primary user-facing server
- [x] If Python endpoints are added, bind locally and proxy them through `server.js`
- [ ] Do not add server-side storage or authenticated services as part of research expansion

### Current hypothesis workflow ownership (keep planning separated by concern)

| Concern | Primary file(s) | Planning note |
|---|---|---|
| Shared lag-analysis logic | `public/src/js/hypothesis-core.mjs` | Core math/interpretation changes should be validated against deterministic controls first |
| Historical loading + orchestration | `public/src/js/prediction.js` | Archive depth, provenance, and orchestration changes belong here |
| Legacy/basic browser correlation UI | `public/src/js/correlation.js` | Keep older Pearson/timeline behavior distinct from the newer lag-scan engine |
| Optional Python compute bridge | `public/src/js/researchCompute.js`, `scripts/research_sidecar.py` | Reserve for heavier null calibration / future research compute only |
| Deterministic validation | `scripts/hypothesis-sim.mjs` | Treat this as the first regression gate before interpreting live-data changes |

---

## Phase 3 — Enhanced Analytics

> Target: deeper scientific value, better visualizations

- [ ] **Historical USGS feed** — fetch M4.5+ past 7 days for richer seismic history
- [ ] **NOAA Dst historical chart** — plot storm time index alongside Kp
- [ ] **Kp forecast** — integrate NOAA 3-day forecast JSON
- [ ] **Solar wind Bt/Bz time-series chart** — second canvas in space weather card
- [ ] **Earthquake depth histogram** — separate chart showing depth distribution
- [ ] **Regional activity heatmap** — canvas overlay on map using grid density
- [ ] **Improved correlation engine** — configurable lag window (14–35 days), stats table
- [ ] **CME tracking** — DONKI CME API integration for coronal mass ejection events
- [ ] **Proton flux display** — radiation storm indicator from GOES proton data
- [ ] **Solar cycle gauge** — current solar cycle phase (SC25), sunspot number

---

## Phase 4 — User Experience & Performance

> Target: smoother, more useful for researchers

### Map direction (decided)

- [x] Keep the current **2D Leaflet map** as the primary research surface
- [x] Treat any future **3D globe** as an optional, isolated experience rather than the default map
- [x] Keep 3D out of the default boot path unless it is lazy-loaded on demand
- [x] Share normalized earthquake / tectonic data across renderers rather than mixing renderer internals

- [ ] **URL hash routing** — deep-link to specific tab (`#map`, `#correlation`)
- [ ] **Map clustering** — group dense earthquake markers at low zoom levels (Leaflet.markercluster)
- [ ] **Earthquake detail panel** — side drawer with full USGS ComCat data on click
- [ ] **Animation playback** — replay last 7 days of seismicity as time-lapse on map
- [ ] **CSV/JSON export** — download current earthquake data or correlation results
- [ ] **Keyboard navigation** — tab keyboard shortcut, accessible focus management
- [ ] **Responsive mobile layout** — better tab/map layout on small screens
- [ ] **Chart tooltips** — hover values on canvas charts (requires pointer-event handling)
- [ ] **Loading skeleton** — better empty state for cards before data arrives

---

## Phase 5 — Progressive Web App

> Target: offline-capable, installable, persistent

- [ ] **Service Worker** — cache USGS/NOAA responses for offline viewing
- [ ] **Web App Manifest** — installable PWA with home screen icon
- [ ] **Background sync** — fetch updates even when tab is not focused
- [ ] **IndexedDB storage** — persist 30+ days of historical data client-side
- [ ] **Push Notification Service** — server-side worker to send alerts independent of browser tab

---

## Phase 6 — Advanced Research Features

> Target: scientific value beyond dashboarding

- [x] **Bootstrap null distribution** — permutation-based empirical p-values for lag peaks via the local Python sidecar
- [ ] **Configurable lag window** — UI to test 7-day, 14-day, 27-day, 35-day lags
- [ ] **Multi-year historical data** — NOAA Kp archive + USGS ComCat batch API
- [ ] **Regional stratification** — analyze Ring of Fire / Mediterranean-Himalayan / stable craton regions separately
- [ ] **Dst-based storm thresholds** — compare Kp and Dst as the triggering classifier
- [ ] **Factor-model bakeoff** — compare storm-only baseline with storm+factor variants (region, boundary family, storm strength, solar-cycle phase)
- [ ] **Optional sidereal/synodic sidequest** — preregistered periodic-factor experiment kept research-only until it beats null and simpler models
- [ ] **Out-of-sample scorecard** — Brier score, log loss, calibration, and holdout hit-rate comparison across model variants
- [ ] **Paper citation panel** — clickable research references with abstracts
- [ ] **Data provenance tracking** — show exactly which API call produced each displayed value
- [ ] **Compare periods** — side-by-side comparison of active vs quiet space weather periods
- [x] **Optional Python compute sidecar** — local Flask bootstrap sidecar behind the Node proxy, never as the public entry point

---

## Phase 7 — Community & Collaboration

- [ ] **GitHub Discussions** — community for researchers studying the correlation
- [ ] **Custom alert webhooks** — POST to Discord/Slack when thresholds are crossed
- [ ] **Embeddable widget** — `<iframe>`-compatible minimal version of each data card
- [ ] **Open API documentation** — document all external APIs used, rate limits, CORS status

---

## Phase 8 — Operations & Reproducibility

> Target: keep the stack reproducible without letting packaging redefine the architecture

- [ ] **Optional Docker packaging** — add container support only after the Node + Python lanes stabilize
- [ ] **Optional Docker Compose workflow** — support Node proxy + optional Python sidecar without making containers mandatory for contributors
- [ ] **Preserve runtime boundaries** — if Docker is added, keep Node as the public entry point and keep the Python research layer optional/local-facing

---

## Data Sources Reference

| Source | API | CORS | Rate Limit | Auth |
|---|---|---|---|---|
| USGS Earthquakes | `earthquake.usgs.gov` | ✅ | None | None |
| NOAA Solar Wind (mag) | `services.swpc.noaa.gov` | ✅ | None | None |
| NOAA Solar Wind (plasma) | `services.swpc.noaa.gov` | ✅ | None | None |
| NOAA Kp Index (1-min) | `services.swpc.noaa.gov` | ✅ | None | None |
| NOAA Kp 3-day history | `services.swpc.noaa.gov` | ✅ | None | None |
| NOAA GOES X-ray flux | `services.swpc.noaa.gov` | ✅ | None | None |
| NOAA Dst Index | `services.swpc.noaa.gov` | ✅ | None | None |
| Open-Meteo Weather | `api.open-meteo.com` | ✅ | 10 k/day free | None |
| Open-Meteo Air Quality | `air-quality-api.open-meteo.com` | ✅ | 10 k/day free | None |
| OpenStreetMap Tiles | `tile.openstreetmap.org` | ✅ | Fair use | None |
| Esri Satellite Tiles | `arcgisonline.com` | ✅ | Fair use | None |

---

## Architecture Notes

- **No build step** — pure ES modules, served as static files
- **No framework** — vanilla JS + Leaflet + Canvas API
- **2D map is primary** — keep Leaflet as the default operational map for clarity, performance, and low complexity
- **3D is optional and isolated** — if added later, load it separately and keep it out of the primary map lifecycle
- **Node proxy is the primary runtime** — browser clients should prefer proxied feeds for reliability/security
- **No backend database** — all data is live or client-side only
- **Python is optional and future-facing** — use it only for heavy research compute, never as a replacement for the Node entry point without discussion
- **Modular** — focused browser modules in `public/src/js/` and CSS modules in `public/src/css/`
- **Circular dependency prevention** — callback injection pattern (`setEarthquakeAlertCallback`)

---

## Contributing

Start with the issues tagged `good-first-issue` in this repository.
High-impact quick wins: any item in Phase 3 or the UX improvements in Phase 4.
