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
| ES Module Architecture | Zero build step, 13 focused JS modules |
| Dark Mode CSS | Automatic via `prefers-color-scheme` |

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

- [ ] **Statistical correlation calculator** — chi-square test, p-value for storm/EQ lag
- [ ] **Configurable lag window** — UI to test 7-day, 14-day, 27-day, 35-day lags
- [ ] **Multi-year historical data** — NOAA Kp archive + USGS ComCat batch API
- [ ] **Machine learning experiment** — simple logistic regression for EQ probability given space weather state
- [ ] **Paper citation panel** — clickable research references with abstracts
- [ ] **Data provenance tracking** — show exactly which API call produced each displayed value
- [ ] **Compare periods** — side-by-side comparison of active vs quiet space weather periods

---

## Phase 7 — Community & Collaboration

- [ ] **GitHub Discussions** — community for researchers studying the correlation
- [ ] **Custom alert webhooks** — POST to Discord/Slack when thresholds are crossed
- [ ] **Embeddable widget** — `<iframe>`-compatible minimal version of each data card
- [ ] **Open API documentation** — document all external APIs used, rate limits, CORS status

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
- **No backend** — all data fetched client-side from public CORS-enabled APIs
- **Modular** — 13 focused JS modules in `src/js/`, 5 CSS modules in `src/css/`
- **Circular dependency prevention** — callback injection pattern (`setEarthquakeAlertCallback`)

---

## Contributing

Start with the issues tagged `good-first-issue` in this repository.
High-impact quick wins: any item in Phase 3 or the UX improvements in Phase 4.
