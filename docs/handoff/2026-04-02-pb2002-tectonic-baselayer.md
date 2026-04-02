# Handoff — PB2002 Tectonic Baselayer (2026-04-02)

## Summary

This checkpoint replaces the old hardcoded sample tectonic-boundary lines as the **preferred** browser map layer with a cited local GeoJSON artifact derived from **Peter Bird PB2002**. The app now loads that artifact at runtime, reports the active tectonic source in the UI, and falls back honestly to the old sample lines only if the local artifact fails to load.

## What changed

1. **Reproducible tectonic artifact pipeline**
   - Added `scripts/build-pb2002-boundaries.mjs`.
   - Added npm script: `npm run build:tectonics`.
   - Generated `public/data/tectonics/pb2002-boundaries.geojson` from Bird's public PB2002 step file.

2. **Map runtime now prefers cited PB2002 geometry**
   - Updated `public/src/js/config.js` with `TECTONIC_DATASET` metadata and local artifact path.
   - Updated `public/src/js/map.js` to:
     - load `public/data/tectonics/pb2002-boundaries.geojson` via `fetchWithRetry()`
     - render PB2002 MultiLineString boundaries by category
     - retain the built-in sample lines only as degraded fallback behavior
     - show explicit source status in the UI instead of silently pretending the cited layer loaded

3. **User-visible attribution became more honest**
   - Updated `public/index.html` map info/footer labels to show the active tectonic source.
   - Added a short note that PB2002 is preferred and the sketch lines are fallback-only.
   - Updated the Settings/About copy to reflect the Node proxy and the curated PB2002 layer.

4. **Offline/cache wiring updated**
   - Updated `public/sw.js` to cache `./data/tectonics/pb2002-boundaries.geojson`.
   - Bumped cache names from `v3` to `v4`.

5. **Docs synced**
   - Updated `README.md`.
   - Updated `docs/development/DEV-QUICK-REFERENCE.md`.
   - Updated `docs/testing/TESTING-CHECKLIST.md`.
   - Updated `docs/handoff/HANDOFF.md` index.

## Validation completed

### Local runtime
- `npm run launch:headless`
  - reused the existing local app instance at `http://localhost:3000`

### Browser smoke
- `$env:APP_URL="http://localhost:3000"; node scripts/tab-smoke-test.mjs`
  - **6/6 tabs passed**
  - **0 console errors**
  - **0 page errors**
  - **0 request failures**

### Targeted tectonic checks
- Headless browser DOM probe confirmed:
  - `tectonic-source` → `Bird PB2002 (2003)`
  - `tectonic-attribution` → `Tectonics: Bird PB2002 plate-boundary model (local GeoJSON artifact)`
- Node fetch confirmed:
  - `GET /data/tectonics/pb2002-boundaries.geojson` → `200`
  - feature count = `7`
  - metadata name = `Peter Bird PB2002 present-day plate boundaries`

### Static error checks
- Edited frontend/runtime files reported no file errors after patching.

## Remaining risks / next checks

1. **PB2002 is present-day geometry, not a live tectonic service**
   - This improves map citation quality, but it does not provide time-varying reconstructions, slab geometry, or deformation-zone richness.

2. **Fallback lines still exist by design**
   - That is intentional for graceful degradation, but future testing should verify the UI keeps reporting fallback status honestly whenever the artifact is unavailable.

3. **Artifact regeneration is manual**
   - If the PB2002 conversion rules change, rerun `npm run build:tectonics` and keep the cached asset/version in `public/sw.js` in sync.

4. **This does not settle broader tectonic-source questions**
   - EarthByte/GPlates, Slab2, GEM/OpenQuake, volcanic overlays, and fault datasets are still future candidates for additional optional layers. This checkpoint only upgrades the first global tectonic baselayer.
