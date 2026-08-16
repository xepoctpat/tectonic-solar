// ===== ANALYSIS EXPORT (reproducible run artifacts) =====
// Builds self-describing JSON run artifacts and CSV serializations of the
// research catalogs and scan results, downloaded as browser blobs. No server
// round-trip, no storage: exports describe exactly what the UI computed.

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns) {
  const header = columns.map(column => csvEscape(column.label ?? column.key)).join(',');
  const body = rows
    .map(row => columns.map(column => csvEscape(
      typeof column.format === 'function' ? column.format(row) : row[column.key],
    )).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

export function stormsCsv(storms = []) {
  return toCsv(storms, [
    { key: 'date', label: 'date_iso', format: s => s.date?.toISOString() },
    { key: 'kp', label: 'kp' },
    { key: 'intensity', label: 'intensity' },
    { key: 'metric', label: 'metric' },
    { key: 'source', label: 'source' },
  ]);
}

export function earthquakesCsv(earthquakes = []) {
  return toCsv(earthquakes, [
    { key: 'date', label: 'date_iso', format: e => e.date?.toISOString() },
    { key: 'mag', label: 'magnitude' },
    { key: 'lat', label: 'latitude' },
    { key: 'lon', label: 'longitude' },
    { key: 'depth', label: 'depth_km' },
    { key: 'place', label: 'place' },
  ]);
}

export function lagScanCsv(scanResults = []) {
  return toCsv(scanResults, [
    { key: 'lag', label: 'lag_days' },
    { key: 'windowCount', label: 'window_count' },
    { key: 'controlCount', label: 'control_count_averaged' },
    { key: 'eventRatio', label: 'event_ratio' },
  ]);
}

/**
 * Build the complete run artifact: catalogs, scan, interpretation, bootstrap
 * result, data provenance flags, and app metadata — everything needed to
 * reproduce or cite the numbers shown on screen.
 */
export function buildAnalysisRunArtifact(analysisResult, bootstrapResult, extraMeta = {}) {
  if (!analysisResult?.meta) return null;

  const { meta, catalogs, scanResults, assessment, prediction, interpretation } = analysisResult;

  return {
    artifactType: 'tectonic-solar-analysis-run',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hypothesis: '27-28 day geomagnetic-storm to earthquake lag correlation (exploratory; no established mechanism)',
    analysis: {
      stormDefinition: meta.stormDefinition,
      stormDefinitionLabel: meta.stormDefinitionLabel,
      region: meta.region,
      regionLabel: meta.regionLabel,
      maxLagDays: 60,
      controlWindows: 'mirrored at lag ±14 days, averaged (see hypothesis-core.mjs scanAllLags)',
    },
    corpora: {
      storms: catalogs?.storms ?? [],
      earthquakes: catalogs?.earthquakes ?? [],
    },
    results: {
      scan: scanResults ?? [],
      assessment,
      prediction,
      interpretation,
      bootstrapNull: bootstrapResult?.summary ?? null,
    },
    provenance: {
      stormSources: countBy(catalogs?.storms, storm => storm.source || (storm.kp != null ? 'live/seed Kp' : 'driver event')),
      stormArchiveLoaded: meta.stormArchiveLoaded,
      stormArchivePartial: meta.stormArchivePartial,
      stormSeedLoaded: meta.stormSeedLoaded,
      historicalEarthquakesLoaded: meta.historicalEarthquakesLoaded,
      earthquakeSources: {
        usgsComcatArchive: meta.historicalEarthquakesLoaded,
        usgsLiveFeed: !meta.historicalEarthquakesLoaded || true,
      },
      feeds: {
        solarWind: 'NOAA SWPC DSCOVR/ACE/IMAP rtsw (mag live; plasma retired upstream 2026-08)',
        kp: 'NOAA SWPC planetary Kp (live + dayind archive)',
        dst: 'NOAA SWPC/Kyoto WDC hourly Dst (live + Kyoto monthly archive)',
        protons: 'NOAA SWPC GOES integral protons >=10 MeV',
        earthquakes: 'USGS ComCat M5+ (2-year) + USGS live M4.5+ feed',
        tectonics: 'Bird (2003) PB2002 local GeoJSON artifacts (doi:10.1029/2001GC000252)',
      },
    },
    extra: extraMeta,
  };
}

function countBy(items, keyFn) {
  const counts = {};
  (items || []).forEach(item => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

export function downloadJson(payload, filename) {
  downloadBlob(JSON.stringify(payload, null, 2), filename, 'application/json');
}

export function downloadCsvString(csv, filename) {
  downloadBlob(csv, filename, 'text/csv');
}
