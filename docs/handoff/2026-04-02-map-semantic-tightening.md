# Handoff: Tectonic Map Semantic Tightening

## Active goal

Tighten the PB2002-based tectonic map so plate regions read more distinctly, boundary interactions are less flattened, and the UI is more honest about what the current vector layer can and cannot claim.

## What changed

### 1. Plate regions now read as actual regions instead of a faint wash

- Updated `public/src/js/map.js` to replace hash-only plate styling with a curated palette for major plates plus stronger fallback border/fill styling for the rest.
- Major and smaller plate regions now render with clearer border contrast and stronger fill opacity.
- Plate-region hover states now increase separation without overwhelming the boundary layer.

### 2. PB2002 boundary subtypes now render more honestly

- The runtime now styles PB2002 boundary **subtypes** by `sourceType` instead of flattening everything down to only three visually similar category lines.
- Distinctions now include:
  - `SUB` → explicit subduction styling with trench-like teeth markers
  - `OCB` / `CCB` → different convergent subtypes
  - `OSR` / `CRB` → different divergent subtypes
  - `OTF` / `CTF` → different transform subtypes
- Category toggles remain at the family level (`convergent`, `divergent`, `transform`) so the UI stays manageable, but the rendered geometry is more specific.

### 3. The UI got more honest about the remaining vector limitation

- Updated `public/index.html` map copy and layer notes to describe the motion-arrow layer as **illustrative only**.
- This avoids overselling the current hardcoded vectors while the real motion-artifact upgrade is still pending.

### 4. Supporting docs were synced

- Updated `README.md` to describe the stricter map semantics and to note that motion vectors remain illustrative.
- Updated `docs/testing/TESTING-CHECKLIST.md` with map checks for subtype-aware boundary hover states and clearer plate-region distinction.

### 5. Service worker cache version bumped

- Updated `public/sw.js` from `v5` to `v6` so browsers can pick up the changed map JS/CSS/HTML assets instead of staying stuck on stale cached files.

## Files changed

- `public/src/js/map.js`
- `public/src/css/map.css`
- `public/index.html`
- `public/sw.js`
- `README.md`
- `docs/testing/TESTING-CHECKLIST.md`

## Validation run

### Static validation

- File error check on all changed files → no reported errors

### Runtime validation

- `node scripts/tab-smoke-test.mjs` against `http://localhost:3000`
  - all **6/6 tabs passed**
  - **0 console errors**
  - **0 page errors**
  - **0 request failures** on the final run

### Focused map probe

- `tectonic-source` resolved to `Bird PB2002 (2003)`
- `tectonic-attribution` resolved to `Tectonics: Bird PB2002 plate model (local GeoJSON artifacts)`
- rendered `subductionToothCount` = **48**
- rendered `overlayPathCount` = **72**
- map UI copy confirmed the new layer notes and legend text were present in the DOM

### Visual result

- The map now shows substantially clearer plate-region separation
- subtype-aware boundary styling is visibly stronger than the previous family-only read
- the vector layer is still the weakest tectonic surface, but the UI now says so instead of implying it is already authoritative

## Remaining risks / caveats

### Still not solved

- The motion-arrow layer is still hardcoded and illustrative, not generated from a modern local motion dataset.
- PB2002 remains a cited present-day baseline, not a time-varying or latest-global reconstruction.
- Subduction teeth are schematic runtime symbology; they are a real improvement over the old endpoint triangle, but not yet a full authoritative trench-polarity solution.

### Mixed runtime caveat (separate from the map change)

- `/api/health` remained a mixed-signal endpoint during validation.
- Some runs returned `200`; one smoke run returned `503` because upstream checks failed transiently.
- This did **not** coincide with tab failures or frontend breakage, so it still looks separate from the tectonic map work.

## Best next step

The most natural continuation is:

1. replace the illustrative vector layer with a real local motion artifact, and then
2. decide whether PB2002 should remain the geometry baseline or be supplemented by a newer global plate/motion model

If continuing visually first, the next safe slice is a more rigorous major/minor plate labeling strategy and possibly a cleaner legend treatment for subtype-level interaction families.