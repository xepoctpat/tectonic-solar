# Developer Quick Reference Guide

## Project: Tectonic-Solar Space-Earth Monitor

**Stack**: Vanilla JavaScript ES modules, Chart.js (CDN), Leaflet 1.9.4 (CDN), IndexedDB  
**Status**: Sprint 1-4 Complete (MVP redesign), ready for feature expansion  
**Dev Server**: `python -m http.server 8000` from project root  

---

## Key Modules & Responsibilities

### Frontend Core (`src/js/`)

| Module | Purpose | Exports |
|--------|---------|---------|
| `main.js` | App bootstrap: SW register, IndexedDB init, event listeners | — |
| `store.js` | Global mutable state (storms, EQs, settings) | store, subscribe, publish, getActiveStorms, getRecentEarthquakes |
| `utils.js` | Helpers: fetch retry, DOM utils, CSS vars | fetchWithRetry, fetchWithTimeout, mapDateToX, getCSSVar, setText |
| `charts.js` | Chart.js visualization (5 charts) | drawRealSolarWindChart, drawRealKpChart, drawMagnitudeDistribution, drawAqiChart, drawCorrelationTimeline |
| `correlation.js` | 27.5-day lag analysis + statistics | analyzeCorrelation, calculatePearsonCorrelation, estimatePValue, getCorrelationStrength |
| `spaceWeather.js` | NOAA API: solar wind, Kp index | refreshSpaceWeatherData, getGeomagneticStorms |
| `map.js` | Leaflet + USGS earthquakes | refreshSeismicData, getMajorEarthquakes |
| `environment.js` | Open-Meteo: weather + AQI | refreshEnvironmentData |
| `db.js` | IndexedDB: 90-day rolling storage | initDB, addStorm, addEarthquake, getStorms, getEarthquakes, pruneOldRecords, clearAll |
| `settings.js` | Settings UI (dark mode, tabs) | — |
| `tabs.js` | Tab navigation logic | — |
| `notifications.js` | Toast UI system | showSuccess, showError, showInfo, showWarning |
| `config.js` | API keys, constants | DEMO_MODE, API endpoints |
| `seismic.js` | EQ data parsing | — |

### Service Worker & PWA

| File | Purpose |
|------|---------|
| `sw.js` | Cache-first assets, network-first APIs, offline support |
| `manifest.json` | PWA metadata, icons, shortcuts, display mode |

### Styling System (`src/css/`)

| File | Scope |
|------|-------|
| `variables.css` | Design tokens: spacing, colors, shadows, glass-morphism, dark mode |
| `base.css` | Reset, layout skeleton, responsive breakpoints (480/768/1024px) |
| `components.css` | Cards, buttons, forms, alerts, EQ list, correlation UI |
| `map.css` | Leaflet customization (markers, popups) |
| `notifications.css` | Toast styling + progress bar animation |

---

## Critical Paths (Data Flow)

### Real-Time Space Weather Update
```
spaceWeather.js:refreshSpaceWeatherData()
  → fetchWithRetry(NOAA endpoints)
  → store.spaceWeatherData = { solarWind, kpIndex, ... }
  → addStorm(store) [IndexedDB]
  → charts.js:drawRealSolarWindChart() + drawRealKpChart()
  → publish('spaceWeather', data) [reactive subscribers]
```

### Real-Time Seismic Update
```
map.js:refreshSeismicData()
  → fetchWithRetry(USGS endpoint)
  → store.earthquakes += [newEQs...] 
  → addEarthquake(store) [IndexedDB, for each]
  → Leaflet marker layer updated
  → charts.js:drawMagnitudeDistribution()
```

### 27-Day Correlation Analysis
```
correlation.js:refreshCorrelationData()
  → getGeomagneticStorms() [from store, last 35 days]
  → getMajorEarthquakes() [from store, last 35 days]
  → analyzeCorrelation(lagMinDays=21, lagMaxDays=35)
    → calculatePearsonCorrelation(storms vs EQ magnitude at lag)
    → estimatePValue(r, n)
    → getCorrelationStrength(r) → "Weak" | "Moderate" | "Strong"
  → charts.js:drawCorrelationTimeline()
```

### Dark Mode Toggle
```
HTML button click → addEventListener in main.js
  → store.darkMode = !store.darkMode
  → localStorage.setItem('darkMode', dark Mode)
  → document.documentElement.classList.toggle('dark')
  → Charts re-render with new CSS color vars
```

### Offline Service Worker
```
Browser offline → SW fetch handler
  → Check cache first (static assets)
  → Try network (APIs) with timeout
  → Return stale cached response if available
  → Fallback to offline page if no cache
  → On reconnect: background sync → refreshAll()
```

---

## Data Persistence Strategy

### IndexedDB Structure
```
Database: "TectonicSolar"
├─ ObjectStore: "storms" (keyPath: "id", autoIncrement)
│  └─ Index: "date" (for range queries)
│  └─ Fields: { id, kp, date, timestamp }
│
└─ ObjectStore: "earthquakes" (keyPath: "id", autoIncrement)
   └─ Index: "date" (for range queries)
   └─ Fields: { id, mag, lat, lon, depth, place, time, date, timestamp }
```

### 90-Day Rolling Window
```
On startup: pruneOldRecords(90) → deletes records with date < today - 90 days
On fetch success: addStorm() or addEarthquake() → inserts new record
On query: getStorms(days) uses index range query [today - N days, today]
```

---

## Extension Points

### Add New Chart Type
```javascript
// In charts.js:
export function drawCustomChart(containerId, data) {
  const ctx = document.getElementById(containerId)?.getContext('2d');
  if (!ctx) return;
  
  // Store reference for dark mode re-render
  if (chartInstances[containerId]) {
    chartInstances[containerId].destroy();
  }
  
  chartInstances[containerId] = new Chart(ctx, {
    type: 'scatter', // or 'line', 'bar', 'doughnut'
    data: { labels: [...], datasets: [...] },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { labels: { color: getCSSVar('--color-text-secondary') } }
      }
    }
  });
}
```

### Add New API Endpoint (with resilience)
```javascript
// In spaceWeather.js (or new module):
async function fetchCustomData() {
  const url = 'https://api.example.com/data';
  const data = await fetchWithRetry(url, 3, 2000);
  
  if (data) {
    store.customData = data;
    // Optional: persist to IndexedDB
    // await db.addRecord('customStore', data);
    publish('customData', data);
  }
}
```

### Add New Settings Toggle
```javascript
// In index.html, add to settings tab:
<label class="setting-item">
  <input type="checkbox" id="setting-new-feature" />
  <span>Enable New Feature</span>
</label>

// In main.js:
document.getElementById('setting-new-feature').addEventListener('change', (e) => {
  store.newFeature = e.target.checked;
  localStorage.setItem('newFeature', e.target.checked);
  // trigger re-render if needed
});
```

### Add Lag Window UI Slider
```javascript
// In correlation.js or settings.js:
document.getElementById('lag-window-slider').addEventListener('input', (e) => {
  const lagDays = parseInt(e.target.value);
  store.lagWindow = lagDays;
  // Re-run correlation analysis with new lag
  refreshCorrelationData();
});

// Update analyzeCorrelation call:
analyzeCorrelation(lagDays - 3, lagDays + 3);
```

---

## Common Tasks

### Debug Service Worker
```
Chrome DevTools → Application → Service Workers
→ Click "Skip waiting" to activate immediately
→ Reload page
→ Check "Cache Storage" for stored assets
```

### Clear IndexedDB (for testing)
```javascript
// In browser console:
await db.clearAll();
location.reload();
```

### Check Dark Mode State
```javascript
// In browser console:
store.darkMode // boolean
localStorage.getItem('darkMode') // 'true' or 'false'
document.documentElement.classList.contains('dark') // boolean
```

### Monitor Fetch Retries
```javascript
// Add logging to utils.js fetchWithRetry():
console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms: ${url}`);
```

### Test Offline Mode
```
Chrome DevTools → Network → Offline (checkbox)
→ Reload page
→ Should show cached data from Service Worker
→ Resume online, should fetch fresh
```

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| First Paint | <1s | CSS in `<head>`, minimal JS blocking |
| Largest Contentful Paint | <2.5s | Chart.js can take 1.5-2s at 1M queries |
| Interaction to Paint | <100ms | Chart hover tooltips, tab switches |
| Cumulative Layout Shift | <0.1 | Sticky headers, reserved space for ads |
| Service Worker Cache | <500KB | Gzip: JS 45KB, CSS 8KB, Leaflet 160KB, Chart.js 180KB |
| IndexedDB Query (100K records) | <50ms | Per-cell 3D KD-tree (potential future optimization) |

---

## Deployment Checklist

- [ ] Run `npm run build` (if build step added)
- [ ] `npm run lighthouse` (PWA ≥90, Performance ≥85)
- [ ] Test offline mode in all 3 tabs
- [ ] Verify IndexedDB persists data across reload
- [ ] Dark mode toggle persists on refresh
- [ ] All API calls use `fetchWithRetry()` (no bare `fetch()`)
- [ ] Service Worker cache list updated (if new CDN libs added)
- [ ] Manifest icons verified (192px + 512px SVG)
- [ ] Tested on mobile: iOS Safari, Android Chrome
- [ ] Check `console.log`s removed (or behind DEBUG flag)

---

## Useful Commands

```bash
# Start dev server
python -m http.server 8000

# Check for JavaScript errors
# (Chrome DevTools → Console)

# Profile chart rendering
# Chrome DevTools → Performance → Record → Draw charts → Stop

# Inspect IndexedDB
# Chrome DevTools → Application → IndexedDB → TectonicSolar

# Test PWA installability
# Chrome DevTools → Lighthouse → PWA

# Update service worker (bypass cache)
# Ctrl+Shift+R (hard refresh) or DevTools → Network → Disable cache
```

---

## Documentation

- **README.md** — Project overview, features, install  
- **ROADMAP.md** — Future features, known issues  
- **SPRINT-1-DELIVERY.md** — This sprint's changes (you are here)  
- **docs/guides/** — Detailed guides (if added)  

---

**Last Updated**: March 24, 2026  
**Maintainer**: GitHub Copilot / Tectonic-Solar Team  
**Contact**: GitHub Issues
