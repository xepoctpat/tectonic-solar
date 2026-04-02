# Tectonic-Solar Testing Checklist

**Date**: April 1, 2026  
**Environment**: Local Node proxy (`npm run launch`) on port 3000  
**Scope**: Full feature walkthrough + offline + responsive + accessibility + performance

---

## Before You Start

### Recommended startup
```powershell
npm install
npm run launch
```

Expected app URL: `http://localhost:3000`

### Hypothesis sanity check (simulation)
```powershell
npm run test:hypothesis-sim
```

Expected outcome:
- null scenario stays non-supportive
- implanted 27-day signal peaks near 25–30d
- off-target signal does not get mislabeled as 27–28d support

### If you changed hypothesis-related files

| Changed file(s) | Treat as | Minimum validation |
|---|---|---|
| `public/src/js/hypothesis-core.mjs` | Shared analysis math / interpretation | Run `npm run test:hypothesis-sim`, then inspect the Correlation tab verdict states |
| `public/src/js/prediction.js` | Historical loading + analysis orchestration | Run `npm run test:hypothesis-sim`, load the research foundation, and verify corpus counts / lag scan refresh |
| `public/src/js/correlation.js` | Legacy/basic correlation UI | Check the 27–28 day window indicator, timeline, and any legacy Pearson/Fisher outputs |
| `public/src/js/researchCompute.js` | Python sidecar bridge | Start the sidecar, verify `/api/research/status`, then run **Bootstrap Null Test** in the UI |
| `scripts/hypothesis-sim.mjs` | Deterministic validation harness | Confirm null, positive-control, and off-target scenarios still pass and remain honestly labeled |

Do not treat these as one concern. A sidecar-bridge regression, a lag-scan math bug, and a misleading interpretation label need different checks.

### Optional Python null-calibration sidecar
```powershell
solar-env\Scripts\Activate.ps1
python scripts/research_sidecar.py
```

Expected outcome:
- local sidecar listens on `http://127.0.0.1:5051`
- `GET /api/research/status` reports the sidecar as online through the Node proxy
- the Correlation tab can run **Bootstrap Null Test** without exposing Python directly to the browser

### Optional static-only check
```powershell
solar-env\Scripts\Activate.ps1
python -m http.server 8000 --directory public
```

Use the Python static server only for layout/static verification. The Node proxy is the correct environment for live research and API testing.

---

## PART 1: Feature Walkthrough (All Tabs)

### 🗺️ Map Tab
- [ ] **Load**: Map appears with OpenStreetMap tiles
- [ ] **Earthquakes**: Red/orange/yellow markers appear (M4.5+, from USGS live data)
- [ ] **Zoom**: Can zoom in/out (scroll wheel or +/- buttons)
- [ ] **Pan**: Can drag and pan around the globe
- [ ] **Magnitude Filter**: Slider filters earthquakes by magnitude threshold
- [ ] **Tectonic Boundaries**: Plate boundaries overlay visible (if tectonic layer enabled)
- [ ] **Boundary Subtypes**: Hovering visible boundary lines reveals subtype-aware labels (for example subduction, spreading ridge, continental rift, or transform fault)
- [ ] **Tectonic Source Label**: Map info box resolves to `Bird PB2002 (2003)` during normal local runs; `Fallback sample boundaries` only appears if the local artifact fails to load
- [ ] **Plate Distinction**: PB2002 plate polygons read as distinct colored regions with stronger borders rather than a nearly uniform wash
- [ ] **Vector Layer Honesty**: Turning on motion arrows shows a partial local vector artifact (currently 6 plates) without implying full global coverage or authoritative modern motion values
- [ ] **Popup**: Click earthquake marker → popup shows magnitude, location, depth
- [ ] **Layer Toggle**: Can switch between 4 tile layers (OSM, Satellite, Topo, Dark)
- [ ] **Status**: No 404 errors in DevTools Console

### ⚡ Space Weather Tab
- [ ] **Solar Wind Chart**: Line chart appears with speed values (km/s)
- [ ] **Kp Index Chart**: Bar chart appears with 24-hour history, color-coded (teal/yellow/orange/red)
- [ ] **X-Ray Flares**: Flare log shows GOES classification (A/B/C/M/X)
- [ ] **Real Data**: Values are current (from NOAA endpoints)
- [ ] **Chart Hover**: Hover over chart points → tooltip shows exact value
- [ ] **Chart Responsive**: Chart resizes when window resized

### 🌍 Seismic Tab
- [ ] **Earthquake List**: Earthquakes displayed newest-first
- [ ] **Columns**: Magnitude, Location, Depth, Time shown
- [ ] **Time Format**: "minutes ago" / "hours ago" labels update
- [ ] **Magnitude Distribution**: Histogram chart appears (M4-M5, M5-M6, M6+)
- [ ] **Statistics**: Shows M5+ count, M6+ count, largest magnitude
- [ ] **Real Data**: Multiple earthquakes from USGS

### 🌤️ Environment Tab
- [ ] **Weather**: Current temp, feels-like, humidity, pressure, wind displayed
- [ ] **AQI**: PM2.5, PM10, CO, NO₂ values shown with color coding
- [ ] **AQI Gauge**: Doughnut chart shows overall AQI with center text
- [ ] **Air Quality Scale**: Visual indication of air quality level (Good/Fair/Moderate/Poor/Very Poor)
- [ ] **Real Data**: From Open-Meteo API (free, no key required)

### 📊 Correlation Tab
- [ ] **Foundation Button**: "Load Full Research Foundation" is visible and starts the combined archive workflow
- [ ] **Prediction Card**: Statistical prediction card renders with probability / confidence state
- [ ] **Data Foundation**: Historical-load status and corpus span appear
- [ ] **Research Workflow Panel**: Python sidecar status, null-calibration state, and recommended next step render legibly
- [ ] **Bootstrap Null Test**: Button is visible, handles sidecar-offline state honestly, and shows empirical p-value / null threshold when the sidecar is running
- [ ] **Storm Archive Load**: "Load 2-Year Storm Archive" ingests NOAA/NCEI dayind history and updates the storm status line
- [ ] **Lag Scan Chart**: 0–60 day lag scan appears or shows explicit empty state
- [ ] **Lag Verdict**: Null/signal/insufficient-data messaging is visible and legible
- [ ] **Interpretation State**: UI distinguishes insufficient / null-consistent / off-target / weak bump / candidate signal instead of treating raw percentage alone as evidence
- [ ] **Timeline**: 30-day storm vs M5+ timeline renders without console errors
- [ ] **Historical Load**: "Load 2-Year History" button loads ComCat data without breaking the page

### ⚙️ Settings Tab
- [ ] **Dark Mode Toggle**: 🌙/☀️ button in header works
- [ ] **Dark Mode Applied**: All colors invert correctly (background dark, text light)
- [ ] **Chart Dark Mode**: Charts rerender with dark colors on toggle
- [ ] **Map Dark Mode**: Affects map overlay (if applicable)
- [ ] **Persistence**: Reload page → dark mode persists
- [ ] **localStorage**: Check DevTools Application → localStorage `darkMode` is 'true'/'false'

---

## PART 2: Data Source Validation

### NOAA Live Data (Space Weather)
- [ ] **Solar Wind Endpoint**: `/api/noaa/rtsw-mag` and `/api/noaa/rtsw-plasma` respond via the local proxy
- [ ] **Kp Index**: Real-time Kp values populate chart
- [ ] **Flare Data**: X-ray flux shows current solar activity
- [ ] **Historical Storm Archive Endpoint**: `/api/noaa/dayind?date=2024-05-10` returns a NOAA/NCEI dayind text file through the local proxy
- [ ] **Research Sidecar Status Endpoint**: `/api/research/status` reports online when the Python sidecar is running
- [ ] **Research Bootstrap Endpoint**: `/api/research/bootstrap` rejects malformed payloads and succeeds with a valid archive-backed corpus payload
- [ ] **Retry Logic**: Force offline, wait 10s → should retry (check console)

### Curated Tectonic Layer
- [ ] **PB2002 Artifact**: `GET /data/tectonics/pb2002-boundaries.geojson` returns `200` and a feature collection with 7 features
- [ ] **Source Attribution**: Footer/info panel reports the PB2002 tectonic source after page load
- [ ] **Fallback Honesty**: If the artifact is intentionally removed or renamed for testing, the UI should say `Fallback sample boundaries` rather than still claiming PB2002

### USGS Live Data (Earthquakes)
- [ ] **Recent Earthquakes**: Significant earthquakes M4.5+ from last 30 days appear
- [ ] **Location Accuracy**: Markers placed at correct lat/lon
- [ ] **Magnitude Accuracy**: Color coding matches magnitude scale
- [ ] **Live Updates**: Each page load fetches latest (timestamps differ)
- [ ] **Historical Research Feed**: `/api/usgs/comcat` accepts valid queries and rejects malformed ones

### Open-Meteo Live Data (Weather/AQI)
- [ ] **Current Weather**: Matches desktop weather apps for your location
- [ ] **AQI Data**: PM2.5 values plausible (check local air quality reports)
- [ ] **No API Key**: App works without authentication

---

## PART 3: UX Responsiveness & Polish

### Mobile Experience (375px - iPhone SE)
- [ ] **Layout**: Single-column stacking (no side-by-side)
- [ ] **Charts**: Readable on small screen (font size appropriate)
- [ ] **Map**: Touches, zoom gestures work smoothly
- [ ] **Header**: Dark mode button visible without scroll
- [ ] **Tabs**: Horizontal scroll or tab switching works
- [ ] **Spacing**: No text cutoff, appropriate padding
- [ ] **Touch Targets**: Buttons ≥48px tall (easy to tap)

### Tablet Experience (768px - iPad)
- [ ] **2-Column**: Charts/lists side-by-side if space permits
- [ ] **Map**: Full width, readable labels
- [ ] **Touch**: Works smoothly without mouse/trackpad
- [ ] **Landscape**: Rotate device → layout adapts

### Desktop Experience (1440px)
- [ ] **Full Layout**: Grid-based layout visible (multiple columns)
- [ ] **Charts**: Large, readable, good use of screen real estate
- [ ] **Map**: Full-width interactive map
- [ ] **Performance**: No lag when scrolling or switching tabs

### Visual Consistency
- [ ] **Spacing**: Uniform 8px grid (buttons, margins, padding)
- [ ] **Shadows**: Consistent elevation (cards have `box-shadow`)
- [ ] **Borders**: Consistent rounded corners (8px)
- [ ] **Colors**: Accent colors match across tabs (teal, orange, yellow)
- [ ] **Typography**: Font sizes consistent (headers, body, labels)
- [ ] **Dark Mode**: All components have dark-mode styles

### Interaction Smoothness
- [ ] **Hover Effects**: Cards lift on hover (CSS transform)
- [ ] **Button Ripple**: Clicking buttons shows ripple animation
- [ ] **Tab Switch**: Smooth transition between tabs
- [ ] **Chart Render**: Charts animate in 800ms (not instant)
- [ ] **Loading State**: If data takes time, skeleton loaders appear
- [ ] **Transitions**: Color changes smooth (300ms) not instant

### Data Display Clarity
- [ ] **Charts**:
  - [ ] Legend visible and readable
  - [ ] Axis labels present (km/s for wind, Kp index, magnitude)
  - [ ] Grid lines help read values
  - [ ] Colors distinct and accessible for colorblind users
- [ ] **Tables**:
  - [ ] Headers bold/distinct from rows
  - [ ] Rows have alternating background (light/dark) for readability
  - [ ] Right-aligned numbers (magnitude, depth)
- [ ] **Numbers**:
  - [ ] Decimals shown (1.5, 2.3, not 2)
  - [ ] Units visible (km, m/s, µT)
  - [ ] No `NaN` or `undefined` values

---

## PART 4: Error Handling & Resilience

### Network Failure Scenarios
- [ ] **API Timeout**: Open app, immediate DevTools Network tab → Slow 3G
  - [ ] Request attempts 3 times
  - [ ] Delays: 2s, 4s, 8s (exponential backoff)
  - [ ] After fail, shows demo data instead
- [ ] **API 500 Error**: Simulate API failure
  - [ ] Still retries 3x
  - [ ] Graceful fallback message
- [ ] **No Internet**: Disconnect network completely
  - [ ] Service Worker kicks in
  - [ ] Cached data loads
  - [ ] No blank page

### Offline Mode (Service Worker)
- [ ] **Initial Load**: Page loads and fetches data normally
- [ ] **DevTools Network → Offline**: Enable offline mode
- [ ] **Reload Page**: Page loads from cache
- [ ] **Navigate Tabs**: All cached data accessible
- [ ] **Reconnect**: Re-enable network → app refreshes with new data

### Data Persistence (IndexedDB)
- [ ] **Initial Load**: App fetches and stores data
- [ ] **DevTools Application → IndexedDB → TectonicSolar**:
  - [ ] `storms` object store visible
  - [ ] `earthquakes` object store visible
  - [ ] Records have dates, values
- [ ] **Reload Page**: Same data visible (from IndexedDB, not new fetch)
- [ ] **90-Day Pruning**: Records older than 90 days should be deleted
  - [ ] (Test with mock data: advance time in db.js)

---

## PART 5: Accessibility (WCAG AA)

### Keyboard Navigation
- [ ] **Tab Key**: Can navigate through all interactive elements (buttons, links, form inputs)
- [ ] **Tab Order**: Logical progression (left → right, top → bottom)
- [ ] **Focus Indicator**: Focused elements have visible outline (blue ring)
- [ ] **Enter/Space**: Buttons activate with Enter, checkboxes with Space
- [ ] **Escape**: Any modals/dialogs close with Escape key

### Screen Reader (NVDA / JAWS / VoiceOver)
- [ ] **Page Title**: Screen reader announces "Space-Earth Monitor" or similar
- [ ] **Headings**: `<h1>`, `<h2>` tags create outline (navigate with ← | →)
- [ ] **Buttons**: Screen reader says "Button: [name]" (e.g., "Button: Dark Mode Toggle")
- [ ] **Charts**: Alt text or ARIA labels describe chart content
- [ ] **Forms**: Labels associated with inputs (`<label for="inputId">`)
- [ ] **Images**: All decorative images have `alt=""`, data images have descriptive alt text

### Color Contrast
- [ ] **Text**: Text color on background ≥4.5:1 ratio (WCAG AA)
  - [ ] Use DevTools: Inspect element → Accessibility panel → check contrast
- [ ] **UI Components**: Unfocused: ≥3:1, Focused: ≥4.5:1
- [ ] **Dark Mode**: Contrast ratios maintained in dark mode
- [ ] **Color Alone**: Don't rely on color to convey info (e.g., red-only error)
  - [ ] Use text labels: "Error:" in red + bold text

### Focus Management
- [ ] **Dark Mode Toggle**: After click, focus moves to button (visible outline)
- [ ] **Modal/Dialog**: Focus trapped within modal (can't tab outside)
- [ ] **Close Modal**: Returning focus to element that opened it

---

## PART 6: Performance (Lighthouse)

### Run Lighthouse Audit
1. Launch app: `npm run launch`
2. Open app in Chrome: `http://localhost:3000`
3. DevTools (F12) → Lighthouse tab
4. Mobile device → Run audit
5. Record scores:

| Metric | Score | Target | Pass? |
|--------|-------|--------|-------|
| Performance | ___ | ≥85 | ☐ |
| PWA | ___ | ≥90 | ☐ |
| Best Practices | ___ | ≥90 | ☐ |
| Accessibility | ___ | ≥90 | ☐ |
| SEO | ___ | ≥90 | ☐ |

### Key Metrics
- [ ] **First Contentful Paint (FCP)**: <1.8s (good)
- [ ] **Largest Contentful Paint (LCP)**: <2.5s (good)
- [ ] **Cumulative Layout Shift (CLS)**: <0.1 (excellent)
- [ ] **Time to Interactive (TTI)**: <3.8s (good)
- [ ] **Speed Index**: <3.4s (good)

### Optimization Notes
- [ ] CSS in `<head>` (render-blocking)
- [ ] JS `defer` (non-blocking)
- [ ] Chart.js lazy-loaded? (check Network tab)
- [ ] Service Worker cache working?

---

## PART 7: Browser Compatibility

### Chrome/Edge 120+
- [ ] All features work
- [ ] Charts render
- [ ] Dark mode works

### Firefox 115+
- [ ] All features work
- [ ] IndexedDB accessible
- [ ] Dark mode works

### Safari 16+ (macOS/iOS)
- [ ] All features work
- [ ] Service Worker supported
- [ ] IndexedDB works (may be limited storage)

### Mobile Safari (iOS 16+)
- [ ] Responsive layout works
- [ ] Touch events smooth
- [ ] Can install as PWA ("Add to Home Screen")

---

## PART 8: API Rate Limiting Check

| API | Rate Limit | Check |
|-----|------------|-------|
| NOAA | Unlimited | ☐ |
| USGS | Generous | ☐ |
| Open-Meteo | 1,000/day (free) | ☐ |

- [ ] **No throttling**: Page loads data without delays under normal manual use
- [ ] **Retry doesn't hammer**: 3 retries with backoff (not instant spam)
- [ ] **Client-side persistence**: Same data remains available from IndexedDB on reload

---

## PART 9: Bug Report Template

If you find issues during testing, use this format:

```
### Bug: [Short Title]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Device/Browser:**
[Chrome 120 / Firefox 115 / Safari 16 / etc]
[Desktop 1440x900 / Mobile 375x667 / etc]

**Screenshots/Console Errors:**
[Paste console errors if any]
```

---

## Sign-Off

**Tester**: ___________  
**Date**: ___________  
**Total Issues Found**: ___________  
**Blockers**: ☐ None ☐ Minor ☐ Major  

**All tests passed?** ☐ Yes ☐ No (see Notes below)

**Notes**:
```
[Add any observations, UI improvements, UX suggestions]
```
