# 🌍 Space-Earth Monitor

A real-time browser dashboard that monitors **space weather**, **global seismic activity**,
and visualizes the scientifically-studied **27–28 day correlation lag** between geomagnetic
storms and earthquake probability.

No build step. No API key. No backend. Pure ES modules + public CORS APIs.

> See [ROADMAP.md](ROADMAP.md) for the full development plan.

---

## Live Data Sources

| Data | Source | Feed |
|---|---|---|
| Earthquakes M4.5+ | USGS Earthquake Hazards | GeoJSON real-time (1-min lag) |
| Solar Wind speed/density | NOAA DSCOVR/ACE Plasma | 1-min JSON feed |
| Solar Wind Bt/Bz | NOAA DSCOVR/ACE Mag | 1-min JSON feed |
| Kp Geomagnetic Index | NOAA SWPC | Real-time + 3-day history |
| X-ray Flux / Solar Flares | NOAA GOES-Primary | 7-day JSON |
| Dst Index | NOAA / Kyoto WDC | JSON |
| Weather | Open-Meteo | Free API, no key |
| Air Quality (PM2.5, AQI) | Open-Meteo Air Quality | Free API, no key |
| Map Tiles | OpenStreetMap / Esri / CARTO | CDN |

---

## Features

| Tab | What it does |
|---|---|
| **Map** | Interactive Leaflet map — live USGS earthquakes (coloured by magnitude band, depth-encoded border), tectonic boundaries, plate motion vectors, magnitude filter slider, 4 tile layers |
| **Space Weather** | Live NOAA solar wind (speed, density, Bt, Bz), Kp index with colour-coded status, 3-day Kp bar chart with storm threshold line, solar wind speed history chart, GOES X-ray flare log |
| **Seismic** | Dynamic USGS earthquake list (newest first, time-ago), real statistics (M5+/M6+ counts, largest), real magnitude distribution chart |
| **Environment** | Real-time weather (temp, feels-like, humidity, pressure, wind, condition) and air quality (PM2.5, PM10, CO, NO₂, European AQI) via Open-Meteo free API |
| **Correlation** | 30-day timeline visualizing the 27–28 day lag hypothesis, active window detection, correlation pair counting |
| **Settings** | Configurable alert thresholds (EQ magnitude, Kp level, flare class), notifications, localStorage persistence |

---

## Quick Start

No dependencies to install. Requires a local HTTP server (ES modules cannot run on `file://`).

```bash
# Python 3
python3 -m http.server 8080
# open http://localhost:8080

# Node.js
npx serve .

# VS Code: click Go Live in status bar
```

---

## Project Structure

```
tectonic-solar/
├── index.html              # Markup — no inline JS, semantic HTML, ARIA
├── ROADMAP.md              # Development roadmap
├── README.md
└── src/
    ├── css/
    │   ├── variables.css   # Design tokens + dark-mode (CSS custom properties)
    │   ├── base.css        # Reset, layout, status dot, animations
    │   ├── components.css  # Tabs, cards, metrics, forms, flare log, correlation
    │   ├── map.css         # Leaflet layout, controls, magnitude slider
    │   └── notifications.css # Toast styles + variants
    └── js/
        ├── config.js       # All API URLs, constants, WMO codes, AQI levels, location coords
        ├── store.js        # Shared mutable state (caches, filter, mode, history)
        ├── utils.js        # Pure functions (mapDateToX, getKpStatus, detectFlares, setText)
        ├── tabs.js         # Tab switching + Leaflet invalidateSize
        ├── map.js          # Leaflet init, overlays, earthquake markers, magnitude filter
        ├── spaceWeather.js # NOAA plasma + mag + Kp history + flare fetch & display
        ├── seismic.js      # Earthquake alerts + dynamic seismic tab rendering
        ├── environment.js  # Open-Meteo weather + air quality fetch & display
        ├── correlation.js  # 27–28 day correlation window analysis
        ├── charts.js       # Canvas charts: solar wind, Kp, magnitude, AQI, correlation
        ├── notifications.js # Browser push + in-app toast system
        ├── settings.js     # Alert settings with localStorage persistence
        └── main.js         # App init, event binding, auto-refresh intervals
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

Chrome ≥89 · Firefox ≥78 · Safari ≥14 · Edge ≥89 (ES2020 + Fetch + Notifications)

