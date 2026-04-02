# Handoff: Vector Artifact Groundwork

## Active goal

Start the plate-motion-vector replacement path without pretending the repo already has an authoritative global motion model.

## What changed

### 1. The vector layer is no longer hardcoded in `config.js`

- Removed the old in-code `PLATE_VECTORS` constant from `public/src/js/config.js`.
- Added `TECTONIC_DATASET.vectorsUrl` so the map can load a local vector artifact in the same pattern as the PB2002 plate/boundary artifacts.

### 2. A local vector artifact now exists

- Added `public/data/tectonics/plate-motion-vectors.json`.
- Current state:
  - coverage is **partial** (`6` vectors)
  - keyed to real PB2002 `plateCode` values (`PA`, `NA`, `EU`, `AU`, `SA`, `NZ`)
  - explicitly marked as **illustrative** and not authoritative
- This is a structural replacement step, not a claim that the repo now has a modern motion model.

### 3. Vector rendering now anchors to actual plate regions when possible

- Updated `public/src/js/map.js` so vector anchors are resolved by `plateCode` against the loaded PB2002 polygon dataset.
- Added representative-point logic for plate polygons so arrows no longer depend only on arbitrary hardcoded lat/lon positions.
- If a representative point cannot be resolved, the artifact's point geometry still acts as a fallback anchor.

### 4. Vector visuals were tightened

- Motion arrows now render with:
  - white casing for contrast
  - plate-colored arrow shafts
  - compact arrowheads
  - compact `plateCode + speed` labels
  - hover tooltip text that states the vector is illustrative
- This makes the layer more readable without overselling its authority.

### 5. The UI got more specific about vector honesty

- Updated map-layer copy in `public/index.html` to say:
  - local partial artifact
  - 6 plates
  - still illustrative until a modern motion model is wired in
- Updated `README.md` and `docs/testing/TESTING-CHECKLIST.md` accordingly.

### 6. Service worker cache bumped again

- Updated `public/sw.js` from `v6` to `v7` and added `plate-motion-vectors.json` to the static asset list so browsers can actually fetch the new local artifact.

## Files changed

- `public/src/js/config.js`
- `public/src/js/map.js`
- `public/src/css/map.css`
- `public/index.html`
- `public/sw.js`
- `public/data/tectonics/plate-motion-vectors.json`
- `README.md`
- `docs/testing/TESTING-CHECKLIST.md`

## Validation run

### Static validation

- File error check on all changed files → no reported errors

### Runtime validation

- `node scripts/tab-smoke-test.mjs`
  - **6/6 tabs passed**
  - **0 console errors**
  - **0 page errors**
  - **1 request failure** on the final run: `Open-Meteo` air-quality request aborted in the browser path

### Focused vector-layer probe

- Enabled `#l-vectors` in a headless browser session and confirmed:
  - `vectorLabelCount` = **6**
  - `vectorArrowHeadCount` = **6**
  - rendered labels: `PA`, `NA`, `EU`, `AU`, `SA`, `NZ`
  - `tectonicSource` remained `Bird PB2002 (2003)`
- Captured screenshot: `test-results/tab-smoke/map-vectors-on.png`

## What is now true

- The vector layer is structurally closer to the PB2002 artifact pattern than before.
- Vector placement is tied more honestly to actual plate regions.
- The UI no longer implies full global vector coverage or authoritative modern motion values.

## What is still not true

- The repo still does **not** have a modern public motion artifact.
- The vector layer still covers only 6 plates.
- The values are still illustrative carry-forward values from the older prototype.
- This is groundwork for replacement, not the final replacement.

## Separate runtime caveat

- The lingering smoke-test request failure remains the intermittent Open-Meteo air-quality `net::ERR_ABORTED` path.
- Health was `200` on the final smoke run, so this still looks like timeout/retry/browser-abort behavior rather than a local app break.

## Best next step

Choose and ingest a **real public motion source** with enough provenance to justify replacing the partial illustrative artifact.

The cleanest next continuation would be:

1. identify a public motion dataset/model worth trusting,
2. fetch/read its source material,
3. generate a reproducible local artifact keyed by `plateCode`, and then
4. replace the current illustrative 6-plate artifact with that broader model.