# Live Testing: Troubleshooting Guide

**Primary runtime**: Node proxy on port 3000  
**Recommended command**: `npm run launch`  
**URL**: `http://localhost:3000`

---

## If App Doesn't Load

### Check 1: Server Running?
```powershell
# In terminal, verify output like:
# [launch] App ready at http://localhost:3000
# or: [tectonic-solar] Simulation server running at http://localhost:3000

# If not running, restart:
cd e:\tectonic-solar
npm run launch
```

### Check 2: Network Tab (DevTools F12)
- [ ] All files return 200 status (CSS, JS, fonts)
- [ ] 404 for `favicon.ico` is normal
- [ ] CDN loads (Chart.js, Leaflet from CDN)

### Check 3: Console Errors (DevTools F12 → Console)
- [ ] No red error messages
- [ ] If CORS errors in Node proxy mode: something bypassed `config.js` / proxy conventions
- [ ] If "Uncaught SyntaxError": JS file has bug

### Check 4: Health Endpoint
Open `http://localhost:3000/api/health`

- `200` means the local proxy is healthy and upstreams are currently reachable
- `503` can still mean the local server is fine but one or more upstream feeds are degraded

---

## If Data Doesn't Load

| Tab | Check | Fix |
|-----|-------|-----|
| **Space Weather** | `/api/noaa/*` endpoints load in Network tab | NOAA upstreams are flaky sometimes; the proxy should degrade gracefully |
| **Seismic** | `/api/usgs/eq-*` returns 200 | Check internet and proxy status |
| **Environment** | `/api/openmeteo/*` responds | Check internet and `/api/health` |
| **Correlation** | `/api/usgs/comcat` historical load works | Confirm valid start/end dates and use the Node proxy runtime |
| **All Tabs** | Console shows fetch attempts | Wait 5-10s; some feeds refresh on timers |

Expected quirk:
- NOAA plasma may log a fallback `404` in the local server output. That is expected and should degrade to `[]`, not a broken UI.

---

## If Hypothesis Results Look Wrong

| Symptom | First concern to inspect | First file(s) to inspect | Quick check |
|---|---|---|---|
| Lag peak suddenly moves or interpretation buckets feel wrong | Shared lag-analysis logic | `public/src/js/hypothesis-core.mjs` | Run `npm run test:hypothesis-sim` and compare null / positive-control / off-target outcomes |
| Historical foundation loads inconsistently or corpus counts look odd | Historical loading + orchestration | `public/src/js/prediction.js` | Reload the research foundation and confirm archive flags / counts change coherently |
| 27–28 day banner or old timeline looks wrong but the newer lag scan is fine | Legacy/basic browser correlation UI | `public/src/js/correlation.js` | Check window dates, timeline refresh, and any Pearson/Fisher display separately |
| Bootstrap button fails or sidecar state is misleading | Python sidecar bridge | `public/src/js/researchCompute.js`, `scripts/research_sidecar.py` | Verify `/api/research/status` first, then retry the bootstrap workflow |
| Simulation output is wrong even before opening the app | Deterministic validation harness | `scripts/hypothesis-sim.mjs` | Confirm null, target-lag, and off-target scenarios still classify correctly |

Do not collapse these into “the correlation code is broken.” The hypothesis workflow is split by concern on purpose.

### Force Refresh Data
```javascript
// Open DevTools Console, paste:
location.reload(true);  // Hard refresh
```

---

## If Charts Don't Render

### Check Chart.js CDN
1. DevTools Network tab
2. Search for "chart.js"
3. Should show 200 status

### If 404 for Chart.js
```javascript
// Open console, type:
typeof Chart  // Should print "function"
```

**If `undefined`**: CDN failed, try:
1. Hard refresh (Ctrl+Shift+R)
2. Check internet
3. Try different browser

---

## If Dark Mode Doesn't Work

### Check 1: localStorage
```javascript
// DevTools Console:
localStorage.getItem('darkMode')  // Should print 'true' or 'false'
```

### Check 2: CSS Class
```javascript
// DevTools Console:
document.documentElement.classList.contains('dark')  // true or false
```

### Check 3: Styles Applied
1. DevTools Elements tab
2. Click on any element
3. Styles panel should show `.dark` styles

**Fix**: Open DevTools Console, paste:
```javascript
localStorage.setItem('darkMode', 'false');
document.documentElement.classList.remove('dark');
location.reload();
```

---

## If Offline Mode Doesn't Work

### Check Service Worker Registered
1. DevTools Application tab → Service Workers
2. Should show status: "activated and running"

### If Service Worker Missing
```javascript
// DevTools Console:
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => console.log(regs.length + ' SW'));
}
```

### If 0 Service Workers
1. Hard refresh (Ctrl+Shift+R)
2. Check `public/sw.js` exists in the repo
3. Check `/sw.js` loads in Network tab (status 200)

### Force Service Worker Update
1. DevTools Application → Service Workers
2. Click "Unregister"
3. Hard refresh (Ctrl+Shift+R)

---

## If IndexedDB Doesn't Persist

### Check IndexedDB Created
1. DevTools Application tab → IndexedDB
2. Expand "TectonicSolar" database
3. Should see "storms" and "earthquakes" stores

### If Empty
1. Wait 5-10s for data to fetch
2. Reload page
3. Should now have data

### Manual Check
```javascript
// DevTools Console:
const db = await indexedDB.databases();
console.log(db);  // Show all databases
```

### Clear IndexedDB (Reset for Testing)
```javascript
// DevTools Console:
const req = indexedDB.deleteDatabase('TectonicSolar');
req.onsuccess = () => console.log('Deleted');
location.reload();
```

---

## If Responsive Layout Breaks

### Check Breakpoints
Open DevTools, press Ctrl+Shift+M (toggle device toolbar)

| Viewport | Expected Behavior |
|----------|-------------------|
| **375px** | Single-column, stacked tabs |
| **768px** | 2-column if space, readable fonts |
| **1440px** | Full grid layout, side-by-side |

### If Layout Wrong at 375px
1. DevTools → Toggle device toolbar
2. Select "iPhone SE" (375x667)
3. Check CSS media query: `@media (max-width: 480px)`

---

## If Maps Don't Display

### Check Leaflet Loading
1. DevTools Network tab → search "leaflet"
2. Should show CSS + JS files (200 status)

### If Map Blank
1. Wait 3-5s (tiles loading)
2. Zoom controls should appear (±)
3. Try scroll-wheel zoom

### Force Map Redraw
```javascript
// DevTools Console:
map.invalidateSize();
```

---

## If Charts Don't Update on Dark Mode Toggle

### Expected Behavior
1. Click 🌙/☀️ button
2. All charts redraw with dark colors
3. Should take <1 second

### If Not Updating
1. Check `chartInstances` exist in charts.js
2. Verify Chart.js `.destroy()` called before redraw
3. Check CSS variables exist: `getCSSVar('--color-text-primary')`

```javascript
// DevTools Console (force redraw):
Object.values(chartInstances).forEach(c => c && c.destroy());
// Then click dark mode button
```

---

## Network Throttling Test

### Simulate Slow Network (3G)
1. DevTools Network tab
2. Throttling dropdown: "Slow 3G"
3. Refresh page
4. Should see:
   - Data fetches slowly (10-20s)
   - Retry kicks in after 10s timeout
   - Shows demo data as fallback

### Expected Behavior
```
Load → Fetch attempts → Timeout hits (10s) → Retry 1 (2s delay) → Retry 2 (4s delay) → Success OR Demo Data
```

---

## Performance Baseline

### Before Lighthouse Audit
1. Empty browser cache: DevTools → Application → Clear Storage → [All]
2. Hard refresh (Ctrl+Shift+R)
3. Wait 5s for data to load
4. Open Lighthouse (DevTools → Lighthouse)
5. Select "Mobile" → Run audit

### Expected Results
| Metric | Ideal | Acceptable |
|--------|-------|------------|
| FCP | <1s | <1.8s |
| LCP | <2.5s | <4s |
| CLS | <0.1 | <0.25 |

---

## Quick Fixes Checklist

| Problem | Quick Fix |
|---------|-----------|
| Nothing loads | `npm run launch` |
| Charts blank | `location.reload(true)` (hard refresh) |
| Dark mode stuck | `localStorage.clear(); location.reload()` |
| SW not working | Unregister in DevTools, hard refresh |
| Map blank | `map.invalidateSize()` in console |
| Offline fails | Check DevTools Application → Cache Storage |
| Data stale | `db.clearAll()` to reset IndexedDB |

---

## Still Stuck?

1. **Check console (F12)**: Copy red error messages
2. **Check Network tab**: Look for 404 or 500 status codes
3. **Check localStorage**: `Object.keys(localStorage)` in console
4. **Check DevTools errors**: Application → Service Workers → any errors?
5. **Nuclear option**: Full cache clear + restart
   ```powershell
   # Kill server:
   Ctrl+C in terminal
   
   # Restart:
   npm run launch
   
   # Browser: Ctrl+Shift+Del (clear all)
   # Then: http://localhost:3000
   ```

---

**Last Updated**: April 1, 2026  
**Server Status**: use `npm run launch`  
**App URL**: http://localhost:3000
