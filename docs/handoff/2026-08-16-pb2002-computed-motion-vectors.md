# PB2002 Computed Plate Motion Vectors — 2026-08-16

## What changed

Replaced the 6-plate illustrative `plate-motion-vectors.json` artifact with
`plate-motion-vectors.geojson`: **computed linear velocities for all 52 PB2002
plates**, derived from the Euler poles of Bird (2003) Table 1, in the
**Pacific-plate reference frame**. Plates, boundaries, and motions now all come
from the same PB2002 model, so the layers are internally consistent.

## Data provenance

- There is no machine-readable rotations file in the PB2002 FTP set (the readme
  lists only `boundaries.dig`, `plates.dig`, `orogens.dig`, `steps.dat`). The
  Euler poles are published only as **Table 1, page 6** of the paper PDF.
- Table 1 was transcribed programmatically (`pdftotext -raw`) into
  `scripts/pb2002-euler-poles.json` with full metadata. The PDF's minus sign is
  an unmapped glyph (extraction yields U+FFFD); it is interpreted as negative.
- Validation anchors recorded in the JSON metadata:
  - Pacific (PA) pole is 0/0/0 — the identity of the Pacific reference frame.
  - Nazca 55.578/−90.096/1.3599 and North America 48.709/−78.167/0.7486 match
    NUVEL-1A (DeMets et al. 1994) verbatim; Cocos 36.823/−108.629/1.9975 likewise.
  - Beware: `pdftotext -layout` interleaves the table's two physical text
    columns and mis-assigns values; only the `-raw` page-6 output is faithful.

## Build pipeline (`npm run build:tectonics`)

`scripts/build-pb2002-boundaries.mjs` now also:

1. Cross-checks that the 52 pole codes and 52 plate polygon codes match exactly.
2. Samples interior points per plate (unwrapped-antimeridian ray casting;
   shoelace centroid when interior; grid points otherwise; majors up to 8
   points, minors fewer) so velocity gradients across large plates are visible.
3. Computes `v = ω × r` on a sphere (R = 6371.0088 km; km/Myr ≡ mm/yr) at each
   sample point, plus compass azimuth.
4. Asserts geological sanity anchors before writing anything:
   NA @ (37, −122) ∈ [35, 60] (San Andreas relative motion),
   NZ @ (−20, −70) ∈ [110, 160] (ultrafast southern EPR),
   CO @ (8, −95) ∈ [90, 140], AU @ (−25, 135) ∈ [65, 100] mm/yr.
5. If `peterbird.name` is unreachable, regenerates vectors from the committed
   plate artifact instead of failing (boundary/plate refresh is skipped with a
   warning; the vector artifact is always reproducible offline).

## Renderer (`public/src/js/map.js`)

- Vectors anchor at their own computed sample-point geometry (centroid is only
  a fallback).
- Arrow length scales with √speed (clamp 2.2–8°); label chips render once per
  plate (`isPrimary`), not per sample point.
- Click popups show velocity, reference frame, the Euler pole (lat/lon/ω), pole
  source reference, and the model citation/DOI.
- The Pacific plate renders as a "reference frame" chip instead of an arrow
  (zero velocity by definition) — the frame choice is explicit in the UI.
- Service worker precache bumped to v8 with the new `.geojson` path.

## Honest limitations

- **Pacific reference frame**: PB2002 Table 1 expresses every pole relative to
  the Pacific plate, so absolute (hotspot-frame) motions are not derivable from
  this source alone. Any future absolute-frame toggle needs an additional cited
  source for Pacific's absolute pole; do not fabricate one.
- Bird's footnote a: poles are stated at high precision to avoid round-off in
  differencing, but their true accuracy is lower, especially for small plates.
- Sample points are a display aid, not a dataset: the authoritative quantities
  are the Euler poles in `scripts/pb2002-euler-poles.json`.
