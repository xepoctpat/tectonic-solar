# Developer Quick Reference Guide

## Project: Tectonic-Solar Space-Earth Monitor

**Stack**: Vanilla JavaScript ES modules, Chart.js (CDN), Leaflet 1.9.4 (CDN), IndexedDB  
**Status**: Active research dashboard with hardened Node proxy and no-build frontend  
**Recommended launch**: `npm run launch`  
**App URL**: `http://localhost:3000`  
**Health endpoint**: `http://localhost:3000/api/health`  

---

## Runtime Modes

### Recommended — Node proxy (full functionality)

```powershell
npm install
npm run launch
```

- Reuses an existing local instance when possible.
- Opens the app automatically.
- Preserves the app's security model and proxy validation.

### Headless / automation

```powershell
npm run launch:headless
```

### Secondary — Python static server (limited)

```powershell
solar-env\Scripts\Activate.ps1
python -m http.server 8000 --directory public
```

Use the Python static server only for quick static rendering checks. It is not the recommended path for live data validation because the Node proxy handles CORS, rate limiting, and request validation.

### Optional — Python research sidecar (deterministic null calibration)

```powershell
solar-env\Scripts\Activate.ps1
python scripts/research_sidecar.py
```

- Binds to `127.0.0.1:5051` only.
- Never talks to the browser directly; Node proxies it through `/api/research/status` and `/api/research/bootstrap`.
- Used by the Correlation tab's **Run Bootstrap Null Test** button.
- Current scope: shuffled-storm null calibration for the 25–30 day target window.

## Workspace Custom Agent

- `.github/agents/space-earth-lab.agent.md` — a workspace-scoped Copilot agent tuned for the project’s scientific lab workflow.
- Use it for conservative hypothesis analysis, NOAA/USGS research tasks, validation planning, optional Python data science / modeling / permutation-testing work, `hypothesis-core.mjs` / `prediction.js` / `correlation.js` work, and research-method documentation.
- It inherits the repo guardrails: no build step, no database, no API keys, public/keyless data only, Node/Express as the public runtime, and Python reserved for heavier research compute after activating `solar-env`.

## Workspace Skills

- `.github/skills/space-earth-safe-change/SKILL.md` — repo-safe workflow for general feature work, bug fixes, validation, and doc sync.
- `.github/skills/space-earth-feed-change/SKILL.md` — focused workflow for NOAA/USGS/Open-Meteo/research-sidecar endpoint and proxy changes.
- `.github/skills/space-earth-hypothesis-check/SKILL.md` — conservative lag-hypothesis workflow for `hypothesis-core.mjs`, `correlation.js`, `prediction.js`, simulation, and null-check interpretation.

These skills are workspace-scoped and meant to be invoked on demand when a task fits their trigger phrases.

## Workspace Instructions

- `.github/instructions/space-earth-frontend.instructions.md` — auto-attached rules for edits under `public/src/js/**`.
- `.github/instructions/space-earth-server-proxy.instructions.md` — auto-attached rules for `server.js` proxy and runtime changes.

These are file-scoped guardrails, not general-purpose prompts: they attach when matching files are edited.

## Workspace Prompts

- `.github/prompts/docs-sync.prompt.md` — focused slash prompt for updating the right existing docs after a code, runtime, or research change.
- `.github/prompts/hypothesis-evidence-summary.prompt.md` — focused slash prompt for conservative evidence summaries around the 27–28 day lag workflow.

Use prompts for single reusable tasks, skills for multi-step workflows, and file instructions for auto-applied rules on matching files.

---

## Documentation Workflow

Keep docs current as part of the implementation process, not as an afterthought.

### Which document to update

| Change type | Update this first |
|---|---|
| Startup / local run flow | `README.md`, `.github/copilot-instructions.md` |
| User-visible UX or feature behavior | `README.md`, optionally `docs/testing/TESTING-CHECKLIST.md` |
| Research direction / next steps | `docs/planning/ROADMAP.md` |
| Runtime / developer workflow | `docs/development/DEV-QUICK-REFERENCE.md` |
| Test procedure / smoke / troubleshooting | `docs/testing/TESTING-CHECKLIST.md`, `docs/testing/TESTING-TROUBLESHOOT.md` |
| Meaningful session recap | `docs/handoff/` (create a new `YYYY-MM-DD-short-title.md` handoff and keep `docs/handoff/HANDOFF.md` updated as the lineage/index) |
| Historical status docs | annotate as superseded instead of rewriting the original context |

### What to record

- what changed
- why it changed
- what was validated
- what still looks weak, risky, misleading, or incomplete

### Rule of thumb

If a change would confuse a future developer unless they saw it written down, update the doc in the same stretch of work.

For handoffs specifically, prefer a **new dated file in `docs/handoff/`** over appending the one historical monolith forever.

---

## Key Modules & Responsibilities

### Frontend Core (`public/src/js/`)

| Module | Purpose | Exports |
|--------|---------|---------|
| `main.js` | App bootstrap: SW register, IndexedDB init, event listeners | — |
| `store.js` | Global mutable state (storms, EQs, settings) | store, subscribe, publish, getActiveStorms, getRecentEarthquakes |
| `utils.js` | Helpers: fetch retry, DOM utils, CSS vars | fetchWithRetry, fetchWithTimeout, mapDateToX, getCSSVar, setText |
| `charts.js` | Chart.js visualization (5 charts) | drawRealSolarWindChart, drawRealKpChart, drawMagnitudeDistribution, drawAqiChart, drawCorrelationTimeline |
| `correlation.js` | 27.5-day lag analysis + statistics | analyzeCorrelation, calculatePearsonCorrelation, estimatePValue, getCorrelationStrength |
| `spaceWeather.js` | NOAA API: solar wind, Kp index | refreshSpaceWeatherData, getGeomagneticStorms |
| `map.js` | Leaflet + USGS earthquakes | refreshSeismicData, getMajorEarthquakes |
| `mapViewport.js` | Renderer-agnostic active map viewport contract | registerMapViewport, resizeMapViewport |
| `hypothesis-core.mjs` | Pure lag-analysis + evidence interpretation core | scanAllLags, computePrediction, interpretHypothesisEvidence |
| `researchCompute.js` | Browser-side adapter for the optional Python research sidecar | checkResearchSidecarStatus, runBootstrapNullTest |
| `stormArchive.mjs` | Pure NOAA dayind parsing/date-range helpers | parseDayindStorms, enumerateUtcDateRange |
| `environment.js` | Open-Meteo: weather + AQI | refreshEnvironmentData |
| `db.js` | IndexedDB: 90-day rolling storage | initDB, addStorm, addEarthquake, getStorms, getEarthquakes, pruneOldRecords, clearAll |
| `settings.js` | Settings UI (dark mode, tabs) | — |
| `tabs.js` | Tab navigation logic | — |
| `notifications.js` | Toast UI system | showSuccess, showError, showInfo, showWarning |
| `config.js` | API keys, constants | DEMO_MODE, API endpoints |
| `seismic.js` | EQ data parsing | — |

### Hypothesis workflow surfaces (separated by concern)

| Concern | Primary file(s) | Why it matters |
|---|---|---|
| Research narrative / claim discipline | `docs/research/RESEARCH.md` | Canonical explanation of the contested hypothesis, falsification criteria, and methodological cautions |
| Pure lag-analysis logic | `public/src/js/hypothesis-core.mjs` | Shared normalization, lag scan, conditional-probability, and conservative interpretation logic used by both live UI and simulation |
| Legacy/basic correlation UI | `public/src/js/correlation.js` | Window indicator, timeline refresh, and older Pearson/Fisher helpers still present in the browser path |
| Historical loading + prediction orchestration | `public/src/js/prediction.js` | Storm seed/archive loading, full analysis runner, lag scan orchestration, and UI-facing prediction outputs |
| Optional Python null-calibration bridge | `public/src/js/researchCompute.js` | Browser adapter for the local Python sidecar behind the Node proxy |
| Deterministic validation harness | `scripts/hypothesis-sim.mjs` | Positive-control, null, and off-target simulation checks for the same core lag-analysis logic |
| Research execution priorities | `docs/planning/ROADMAP.md` | Tracks what still needs to be built or tightened for stronger evidence |

If a change touches the 27–28 day workflow, inspect these files by concern before editing docs so method, runtime, testing, and planning stay distinct.

### Service Worker & PWA

| File | Purpose |
|------|---------|
| `public/sw.js` | Cache-first assets, network-first APIs, offline support |
| `public/manifest.json` | PWA metadata, icons, shortcuts, display mode |

### Styling System (`public/src/css/`)

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

### Map architecture direction

- `map.js` is the **primary 2D renderer** and should remain the default researcher-facing map.
- `mapViewport.js` exists so tab/window layout code does **not** depend directly on Leaflet.
- If a 3D globe is added later, keep it in a **separate module and container**, and register it through the viewport contract rather than mixing Cesium/Three/Leaflet assumptions together.
- Lazy-load any future 3D code on explicit user action so the default app boot stays light.

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
// 1. Add a validated proxy route in server.js when needed.
// 2. Add the URL helper in public/src/js/config.js.
// 3. Fetch through fetchWithRetry() from the feature module.

import { fetchWithRetry } from './utils.js';
import { SOME_APIS } from './config.js';

async function fetchCustomData() {
  const response = await fetchWithRetry(SOME_APIS.customEndpoint);
  const data = await response.json();
  store.customData = data;
  publish('customData', data);
}
```

For text archives like NOAA/NCEI `dayind`, parse them in a small pure helper module (for example `stormArchive.mjs`) so the same logic can be validated outside the browser path.

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

### Start the app locally
```powershell
# Recommended
npm run launch

# Automation / CI
npm run launch:headless

# Direct server control
npm start
```

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

- [ ] Start app with `npm run launch:headless`
- [ ] `node scripts/lighthouse-automation.js` (or run Lighthouse in Chrome DevTools)
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
# Recommended local launch
npm run launch

# Headless launch for scripts/CI
npm run launch:headless

# Manual server start
npm start

# Smoke test (server running at localhost:3000)
$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs

# Optional static-only check
solar-env\Scripts\Activate.ps1
python -m http.server 8000 --directory public

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

- **README.md** — Project overview, startup, research context  
- **docs/planning/ROADMAP.md** — Current plan and roadmap  
- **docs/development/DEV-QUICK-REFERENCE.md** — This quick reference  
- **docs/testing/** — Smoke/manual testing guidance  

---

**Last Updated**: April 1, 2026  
**Maintainer**: GitHub Copilot / Tectonic-Solar Team  
**Contact**: GitHub Issues
