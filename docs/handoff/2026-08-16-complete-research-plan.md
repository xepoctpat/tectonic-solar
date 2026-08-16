# Complete Research Plan Implemented — 2026-08-16

## What changed

The full four-pillar plan landed: statistics core hardening, Dst archive
backfill, regional stratification, provenance & export, and the remaining
science views (depth histogram, b-value). All gates green: `test:solar-metrics`,
`test:hypothesis-sim` (3/3 scenarios + 9-seed sweeps + live sidecar scenarios),
pytest (3/3), `test:tabs` (7/7, 0 errors).

## Statistics core

- **Two-sided averaged control windows** in `scanAllLags` (JS + Python parity):
  controls are now mirrored at lag ±14 days and averaged. The old one-sided
  lag+14 control sat on the next solar-rotation window for ~27-day-recurrent
  storms, systematically absorbing the next storm's seismicity. Averaging keeps
  the control-density scale (a naive union halves all ratios — caught by the
  sim gate during development).
- **Max-statistic permutation null** in `research_stats.py`: the null now also
  records the best ratio anywhere in 0..maxLag per permutation. `correctedGlobalPValue`
  compares the observed global peak against that distribution — the
  multiple-comparison-aware test (sharper than Bonferroni; `bonferroniAlpha`
  also reported). **candidate-signal now REQUIRES the corrected test**; a
  target-slice p-value alone can no longer earn the label.
- **Sim gate expansion**: each scenario also runs across 9 additional seeds
  (tolerance 1 outlier), and — when the Node server + Python sidecar are up —
  live end-to-end scenarios assert the permutation null returns p>0.1 on null
  data and p≤0.1 on the positive control through the whole proxy stack
  (verified: p=0.970 / p=0.003).

## Dst archive backfill (Kyoto WDC)

- Discovery: **dayind contains no Dst** (K-indices only) — the planned source
  was wrong. The working source is Kyoto WDC monthly pages, which embed the
  full month of hourly Dst in a `<pre class="data">` table.
- `GET /api/noaa/dst-archive?month=YYYY-MM` proxies + parses that server-side
  (fixed-width rows; negative values can glue: "-313-390"). Parser verified
  offline against the real May-2024 page: 744 records, min −406 nT at
  2024-05-11T02:00Z (the G5 superstorm, provisional value) ✓.
- **Kyoto quirk, documented**: the server 404s HTTP/1.1 requests (h2-only) and
  its TLS ALPN extension is malformed enough that Node's OpenSSL rejects the
  handshake. The proxy tries node:http2 first, then falls back to curl.
  Kyoto is also intermittently unavailable by node — the loader treats month
  failures as partial (retryable) and says so in the UI. Do not fabricate.
- `loadHistoricalDstArchive` backfills 24 months of hourly samples + derived
  `dst-storm` driver events (3-hour-bucket dedupe against live-detected
  events), behind the "Load 2-Year Dst Archive" button with progress bar.

## Regional stratification

- `public/src/js/regionTag.mjs`: point-in-polygon tagging of earthquakes
  against PB2002 polygons via **stereographic projection centered on the probe
  + signed planar winding number**. This formulation is immune to antimeridian
  and polar degeneracies; the sign discriminates pole-encircling band rings
  (PB2002's Antarctica ring is a band whose both caps wind ±1). Verified
  against 21 geographic anchors (Kansas→NA, Nazca→NZ, both poles correct,
  20/21 strict; the one "miss" was a wrong expectation — the north pole IS in
  PB2002 North America).
- Region selector in Research Lab (`global` / `ring-of-fire` PB2002 membership);
  filtering happens at analysis time on the earthquake catalog (driver storms
  stay global — they are planetary). If the plate artifact fails to load the
  app reports "stratification unavailable" instead of silently running global.
  Verified live: "Circum-Pacific — 16 of 25 earthquakes".

## Provenance & export

- `public/src/js/export.mjs`: "Export Run (JSON)" downloads a self-describing
  artifact (catalogs, scan, interpretation, bootstrap summary, per-feed
  provenance, storm-source counts); "Export CSV" downloads storms, earthquakes,
  and the lag scan as CSVs.

## Science views

- Depth distribution histogram on the Seismic tab (standard shallow /
  intermediate / deep zonation, same card pattern as magnitude distribution).
- **b-value** (Gutenberg–Richter, Aki 1965 MLE) via a new sidecar endpoint
  (`POST /bvalue`, proxied and validated like the bootstrap endpoint) with a
  Research Lab panel using the same region/definition-filtered corpus as the
  lag scan. Development caught a real formula bug — the MLE is
  `b = N/(ln10·Σ(m−Mc))`, not `N·ln10/Σ` (the wrong form inflates by
  (ln10)² ≈ 5.3×); verified against synthetic catalogs (true 1.0 → 0.993±0.044,
  true 0.8 → 0.751±0.034). Underpowered corpora (<20 events ≥ Mc) report
  honestly instead of guessing.

## Honest limitations

- Kyoto Dst archive depends on an upstream that is intermittently flaky;
  partial months are retryable, never fabricated.
- Region filtering reduces corpus size — the interpretation states (thin /
  basic / powered) gate claims exactly as for the global corpus.
- The Dst storm definition's bootstrap null is still Kp-baseline-only (sidecar
  contract); the UI refuses non-Kp corpora explicitly.
