# 🌍 Space-Earth Monitor

A real-time web application that monitors space weather events, global seismic activity, and analyzes their potential correlation — all in the browser with no build step required.

## Features

| Tab | Description |
|---|---|
| **Map** | Interactive Leaflet map showing live USGS earthquakes, tectonic plate boundaries (convergent / divergent / transform), plate motion vectors, and multiple tile layers |
| **Space Weather** | Live NOAA data: solar wind speed/density/Bz, Kp geomagnetic index, X-ray flux solar flares |
| **Seismic** | USGS earthquake list, magnitude distribution chart, regional probability bars |
| **Environment** | Local weather conditions, air quality index, and nearby sensor readings |
| **Correlation** | 30-day timeline visualizing the 27–28 day lag hypothesis between geomagnetic storms and earthquake activity |
| **Settings** | Configurable alert thresholds for earthquakes, Kp index, and solar flares; persisted via `localStorage` |

## Quick Start

No build tools or dependencies required. Just serve the project directory with any static HTTP server.

### Option A — Python

```bash
cd tectonic-solar
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option B — Node.js (npx)

```bash
npx serve .
```

### Option C — VS Code Live Server

Open the project folder in VS Code and click **Go Live** in the status bar.

> **Note:** The app uses ES modules (`type="module"`) which require an HTTP server. Opening `index.html` directly with the `file://` protocol will not work.

## Project Structure

```
tectonic-solar/
├── index.html              # Main HTML — clean markup, no inline scripts
├── README.md
└── src/
    ├── css/
    │   ├── variables.css   # Design tokens & dark-mode overrides
    │   ├── base.css        # Reset, layout, animations
    │   ├── components.css  # Tabs, cards, metrics, forms, correlation UI
    │   ├── map.css         # Leaflet map layout & controls
    │   └── notifications.css # Toast notification styles
    └── js/
        ├── config.js       # API URLs, tile layers, constants, demo data
        ├── store.js        # Shared mutable state (cache, settings, history)
        ├── utils.js        # Pure utility functions
        ├── tabs.js         # Tab switching logic
        ├── map.js          # Leaflet map, tectonic overlays, earthquake markers
        ├── spaceWeather.js # NOAA API fetching & display
        ├── seismic.js      # Earthquake alert logic
        ├── environment.js  # Location selector & weather display
        ├── correlation.js  # 27-28 day correlation analysis
        ├── charts.js       # Canvas chart rendering
        ├── notifications.js # Browser & in-app toast notifications
        ├── settings.js     # Alert settings with localStorage persistence
        └── main.js         # App initialization & event binding
```

## Data Sources

- **Earthquakes**: [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) — M4.5+ past day feed
- **Space Weather**: [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/) — real-time solar wind, Kp index, X-ray flux
- **Map Tiles**: OpenStreetMap, Esri World Imagery, OpenTopoMap, CARTO

## Correlation Disclaimer

The 27–28 day correlation hypothesis between geomagnetic storms and earthquakes is based on published research (Nature 2020, AGU 2025, p<0.0001). **USGS states no proven causal relationship exists.** The correlation tab is provided for research and educational purposes only.

## Browser Support

Modern browsers with ES2020+ support (Chrome ≥89, Firefox ≥78, Safari ≥14, Edge ≥89).
