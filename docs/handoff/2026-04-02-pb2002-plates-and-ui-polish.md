# Handoff — PB2002 Plate Regions + No-Build UI Polish (2026-04-02)

## Summary

This checkpoint advances the map from a **boundary-only cited tectonic baselayer** to a more honest **plate-model baseline** by adding PB2002 plate polygons, then follows with a targeted no-build UI polish pass for clarity and visual quality.

It also records the framework decision: after reviewing no-build-friendly candidates, the repo **did not adopt a new CSS/JS framework**. The best fit was to improve the existing tokenized CSS system instead of forcing a framework into a Leaflet-heavy ES-module app.

## What changed

### 1. PB2002 plate polygons now exist as a first-class local artifact

- Extended `scripts/build-pb2002-boundaries.mjs` to also parse `PB2002_plates.dig.txt`.
- Added `public/data/tectonics/pb2002-plates.geojson`.
- The generator now emits both:
  - `pb2002-plates.geojson`
  - `pb2002-boundaries.geojson`

Important source finding: Bird's PB2002 distribution already includes **52 closed plate outlines**, so manual polygonization from linework was unnecessary.

### 2. The browser map now renders plate regions beneath boundary classes

- Added a default-on **Plate regions (PB2002 polygons)** layer toggle.
- `map.js` now loads plate polygons and boundaries together and renders polygons first.
- Plate-guide mode explicitly turns on plate regions plus all boundary classes.
- Attribution and source copy were updated so the UI no longer implies that only boundaries are being shown.

### 3. Service-worker/static asset coverage was updated

- Added the new PB2002 plates artifact to static caching.
- Bumped cache versioning to ensure clients can pick up the new tectonic assets.

### 4. UI polish was applied without adding a framework

The user clarified that the framework ask was really about **visual quality and ease of use**. After due diligence on official docs:

- **Pico CSS** looked easy to drop in, but its own usage guidance skews toward simpler pages and smaller sites rather than a data-heavy research dashboard.
- **Material Web** supports CDN prototyping, but its official guidance recommends install/build steps for production, which conflicts with this repo's no-build posture.
- **Alpine.js** and **htmx** are valuable for behavior, but they do not solve the actual problem here, which was UI polish rather than DOM orchestration.

Decision:

- keep the existing custom design-token system
- improve hierarchy, card surfaces, tab headers, control affordance, and map chrome in-place
- avoid framework churn that would complicate the no-build runtime for limited payoff

## Files changed in this checkpoint

- `public/index.html`
  - added plate-region layer control text and improved per-tab header copy
- `public/src/css/base.css`
  - refreshed header/footer, viewport/flex stability, focus states, and overall app polish
- `public/src/css/components.css`
  - improved tabs, section headers, cards, buttons, and shared surfaces
- `public/src/css/map.css`
  - improved sidebar cards, map controls, legend/footer layout, and Leaflet control styling
- `public/src/css/variables.css`
  - added a few extra radius/shadow tokens for the polish pass
- `public/src/js/config.js`
  - plate artifact URL + updated tectonic attribution states
- `public/src/js/main.js`
  - default-on plate-region layer and refreshed plate-guide messaging
- `public/src/js/map.js`
  - plate dataset loading/rendering + dateline-safe polygon handling
- `public/sw.js`
  - new tectonic asset cache entry + cache version bump
- `scripts/build-pb2002-boundaries.mjs`
  - now builds both PB2002 artifacts from Bird source data
- `README.md`
  - updated from boundary-only wording to plate-model wording
- `docs/development/DEV-QUICK-REFERENCE.md`
  - updated tectonic-artifact notes and recorded the no-framework UI decision

## Validation completed

### Tectonic artifact / runtime validation

- `npm run build:tectonics`
  - wrote `public/data/tectonics/pb2002-boundaries.geojson`
  - wrote `public/data/tectonics/pb2002-plates.geojson`
  - plate artifact summary: **52 features**, **15 major-plate labels**

- Focused runtime probe confirmed:
  - `plateArtifactStatus=200`
  - `plateFeatureCount=52`
  - `majorPlateCount=15`
  - plate toggle present in the UI

- Playwright overlay probe confirmed the new layer materially affects rendered geometry:
  - with plate regions on: `overlayPathCount = 120`
  - after toggling plate regions off: `overlayPathCount = 62`

### UI polish validation

- Static file error check on edited HTML/CSS files → no reported errors
- Live DOM probe after the polish fix confirmed:
  - `mapDisplayHeight = 777`
  - `overlayPathCount = 120`
  - zoom controls and map attribution still present
- Updated screenshot capture confirmed the map still renders and the revised UI hierarchy is visible

### Smoke check

- `node scripts/tab-smoke-test.mjs`
  - **6/6 tabs passed**
  - **0 console errors**
  - **0 page errors**
  - **0 request failures**
  - note: the local health endpoint reported `503` during this run, so the command exited non-zero even though the tab-level UI smoke checks passed. Treat that as a runtime health/degradation condition to inspect separately, not evidence that the visual changes broke tab rendering.

## What remains open

- The health endpoint degraded during the final smoke pass. That appears unrelated to the CSS/HTML changes, but it is worth checking if a future session is already touching runtime health.
- The current plate baseline is much better than the old sketch lines, but it is still a **present-day PB2002 model**, not a time-varying tectonic reconstruction.
- If future UI work is needed, keep it inside the current token/CSS system unless a framework clearly beats the no-build constraint rather than merely sounding fashionable.

## Practical next step

If a future session continues this thread, treat the correct baseline as:

1. **PB2002 plate regions + PB2002 boundaries** as the default tectonic study layer
2. **custom no-build CSS polish**, not a new frontend framework, unless the repo constraints themselves change