# Solar-Terrestrial Coupling Pipeline + UX Overhaul — 2026-08-16

## What changed

The app now ingests and monitors the full hypothesized coupling chain —
solar wind → magnetosphere → (unmonitored ionosphere/atmosphere) → lithosphere —
and the research engine can run the lag scan against **multiple storm
definitions**, not just Kp. Plus a bounded UX overhaul.

## Data pipeline

- **`public/src/js/solarMetrics.mjs`** (new, pure, node-runnable): dynamic
  pressure `P_dyn = ρv²` (nPa), merging electric field `E_y = −v·Bz` (mV/m),
  standard band classifiers (Pdyn 5/10 nPa, Dst −20/−50/−100 nT, protons NOAA
  S-scale ≥10 pfu ≥10 MeV, E_y ≥3 mV/m), and event detectors for Dst storms,
  pressure pulses, and proton events. Tested by `npm run test:solar-metrics`
  (deterministic unit checks; caught two real unit bugs during development).
- **`db.js` bumped to v2**: new `dst` (hourly samples) and `driverEvents`
  (`type ∈ dst-storm | pressure-pulse | proton-event | x-flare`) stores,
  date-indexed, pruned with everything else. Existing stores untouched.
- **`spaceWeather.js`** now fetches the two previously-dead feeds —
  **Dst** (`/api/noaa/dst`, hourly `{time_tag, dst}` rows) and **GOES integral
  protons** (≥10 MeV channel) — with full per-feed status handling, cache
  snapshot, and live ingestion into the new stores with localStorage
  high-water-mark dedupe (`space-earth-driver-ingest-v1`).
  Solar-wind history keeps `{time,speed,density,bt,bz,pdyn,ey}` (240 samples)
  instead of speed-only.
- **Upstream reality check (2026-08-16): NOAA retired `rtsw_plasma_1m.json`**
  during the DSCOVR→IMAP transition; the magnetometer feed still works (now
  IMAP-sourced, `rtsw_mag_1m.json`). Speed/density/P_dyn/E_y therefore render
  "—" with an explicit "plasma unavailable upstream" status until NOAA
  republishes a public plasma JSON. Everything else (Bt/Bz, Kp, Dst, protons,
  X-ray) is live. **Do not fabricate plasma values.**

## Research engine

- `hypothesis-core.mjs` `normalizeStormCatalog` is now intensity-aware
  (backward compatible: Kp storms as before; driver events carry `intensity`),
  no scan/assess/prediction math changed — `test:hypothesis-sim` stays green.
- `prediction.js` exposes `STORM_DEFINITIONS` (`kp` baseline, `dst` ≤ −50 nT,
  `pressure` pulses) and `runFullAnalysis({stormDefinition})`.
- Research Lab: storm-definition selector reruns the scan per definition;
  "Current drivers" readout shows the live regime; bootstrap null honestly
  refuses non-Kp corpora (sidecar contract is Kp-only for now).
- Dst/pressure corpora are **live-accumulated only** (dayind Dst backfill is a
  separate follow-up) — the UI says so via the corpus note.

## Coupling Chain Monitor

New Space Weather card (and Research Lab compact readout) rendering the four
stages with live metrics and honest gaps: the ionosphere/atmosphere stage is
explicitly "Not monitored — no public real-time feed wired in".

## UX batch

- Defined missing tokens (`--space-10`, `--font-size-xs`, `--color-accent`,
  `--font-weight-semibold`); `prefers-reduced-motion`; dark mode follows
  `prefers-color-scheme` when nothing is stored.
- Chart.js CDN pinned to 4.4.9 (was unpinned).
- Correlation timeline populates on first load + empty-state message.
- All refresh/run buttons disable with busy state (`withButtonBusy`).
- Tab keyboard navigation (WAI-ARIA arrows/Home/End), URL hash deep links
  (`#research`), `aria-labelledby` panel wiring.
- Archive backfill gets a real `<progress>` bar; sidecar-offline copy is
  user-facing (dev launch steps moved out of the panel).
- Notification thresholds mirrored on the Space Weather card; blocking
  `alert()` replaced with a toast; env "Demo data" false label fixed;
  map placeholder "Just now" → "Loading…"; seismic list uses the previously
  dead skeleton styles; per-click "updated" info toasts removed (warnings kept).
- Solar-wind chart: multi-series with toggleable density/P_dyn datasets.

## Verification

`test:solar-metrics` ✓, `test:hypothesis-sim` 3/3 ✓, `test:tabs` 7/7 with
0 console/page errors ✓, plus a Playwright functional pass: live Dst/protons
render, coupling chain populated, Dst definition rerun works, keyboard/hash
routing works. Screenshots: `test-results/space-weather-upgraded.png`,
`test-results/research-lab-upgraded.png`.
