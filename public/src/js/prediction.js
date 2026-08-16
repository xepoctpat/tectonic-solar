// ===== PREDICTION ENGINE =====
// Statistical hypothesis testing and Bayesian probability estimation
// for the space-weather ↔ seismic 27–28 day lag correlation.
// See RESEARCH.md for methodology notes and literature references.

import { fetchWithRetry } from './utils.js';
import { NOAA_APIS, USGS_APIS } from './config.js';
import { addEarthquake, addStorm, addDstSample, addDriverEvent, getDriverEvents, getEarthquakes, getStorms, getDstSamples } from './db.js';
import {
  scanAllLags,
  assessLagScan,
  computePrediction,
  interpretHypothesisEvidence,
  normalizeStormCatalog,
  normalizeEarthquakeCatalog,
} from './hypothesis-core.mjs';
import { enumerateUtcDateRange, parseDayindStorms, toIsoDateOnly } from './stormArchive.mjs';
import { detectDstStorms } from './solarMetrics.mjs';
import { ensurePlateIndex, filterEarthquakesByRegion, REGION_GROUPS } from './regionTag.mjs';

export {
  scanAllLags,
  assessLagScan,
  computePrediction,
  interpretHypothesisEvidence,
  normalizeStormCatalog,
  normalizeEarthquakeCatalog,
} from './hypothesis-core.mjs';

// ===== HISTORICAL STORM SEED =====
// Known Kp≥5 geomagnetic storms from SC25 peak period (2024).
// Source: NOAA SWPC published storm event lists.
// This seed primes the lag scan from first load; the app accumulates
// live storm data going forward from its IndexedDB.
export const STORM_SEED = [
  // May 2024 G5 superstorm — most powerful in ~20 years, globally reported
  { kp: 9.0, date: new Date('2024-05-10T18:00:00Z') },
  { kp: 8.7, date: new Date('2024-05-11T06:00:00Z') },
  { kp: 7.3, date: new Date('2024-05-12T00:00:00Z') },
  // August 2024 G3
  { kp: 7.0, date: new Date('2024-08-12T10:00:00Z') },
  // September 2024 G4 (following X9.0 flare)
  { kp: 8.0, date: new Date('2024-09-10T14:00:00Z') },
  // October 2024 G2
  { kp: 6.0, date: new Date('2024-10-10T22:00:00Z') },
  // November 2024 G3
  { kp: 7.0, date: new Date('2024-11-17T16:00:00Z') },
];

const HISTORICAL_LOADED_KEY = 'historical-usgs-loaded-v1';
const STORM_SEED_LOADED_KEY  = 'storm-seed-loaded-v1';
const STORM_ARCHIVE_LOADED_KEY = 'historical-storm-archive-loaded-v1';
const DST_ARCHIVE_LOADED_KEY = 'historical-dst-archive-loaded-v1';
const STORM_ARCHIVE_LOOKBACK_DAYS = 730;
const STORM_ARCHIVE_THRESHOLD = 5.0;
const DST_ARCHIVE_LOOKBACK_MONTHS = 24;

function getStormArchiveStatus() {
  const raw = localStorage.getItem(STORM_ARCHIVE_LOADED_KEY);
  if (!raw) {
    return { complete: false, partial: false };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      complete: parsed.complete === true,
      partial: parsed.partial === true,
    };
  } catch {
    return { complete: true, partial: false };
  }
}

async function fetchHistoricalStormsForDate(dateOnly, minKp = STORM_ARCHIVE_THRESHOLD) {
  const response = await fetchWithRetry(NOAA_APIS.historicalDayIndex(dateOnly), 1, 750);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseDayindStorms(text, dateOnly, minKp);
}

async function runConcurrent(items, concurrency, worker) {
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(runners);
}

// ===== HISTORICAL DATA LOADER =====

/**
 * One-time fetch of M5+ earthquakes from USGS ComCat for the past 2 years.
 * Stores all events in IndexedDB. Idempotent — skips if already loaded
 * (controlled via localStorage flag).
 *
 * Uses the validated local `/api/usgs/comcat` proxy path from config.js.
 *
 * @returns {Promise<{loaded: boolean, count?: number, reason?: string}>}
 */
export async function loadHistoricalUSGS() {
  if (localStorage.getItem(HISTORICAL_LOADED_KEY)) {
    return { loaded: false, reason: 'already-loaded' };
  }

  const endDate   = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 86_400_000).toISOString().split('T')[0];

  const url = USGS_APIS.comcatSearch({
    startTime: startDate,
    endTime: endDate,
    minMagnitude: 5.0,
    limit: 5000,
    orderBy: 'time-asc',
  });

  const response = await fetchWithRetry(url);
  const data = await response.json();

  let count = 0;
  for (const f of (data.features || [])) {
    try {
      await addEarthquake({
        mag:   f.properties.mag,
        place: f.properties.place || 'Unknown',
        lat:   f.geometry.coordinates[1],
        lon:   f.geometry.coordinates[0],
        depth: f.geometry.coordinates[2],
        date:  new Date(f.properties.time),
        time:  f.properties.time,
      });
      count++;
    } catch (_) { /* duplicate or constraint error — skip */ }
  }

  localStorage.setItem(HISTORICAL_LOADED_KEY, Date.now().toString());
  return { loaded: true, count };
}

/**
 * Seed IndexedDB with the embedded STORM_SEED list (once only).
 * This gives the engine historical storm data from first load.
 * @returns {Promise<void>}
 */
export async function seedHistoricalStorms() {
  if (localStorage.getItem(STORM_SEED_LOADED_KEY)) return;
  for (const s of STORM_SEED) {
    try { await addStorm(s); } catch (_) {}
  }
  localStorage.setItem(STORM_SEED_LOADED_KEY, '1');
}

/**
 * One-time fetch of the official NOAA/NCEI daily `dayind` archive for the past
 * two years. Extracts planetary 3-hour Kp intervals >= threshold and stores
 * them as storm observations in IndexedDB.
 *
 * @param {{ days?: number, minKp?: number, concurrency?: number, onProgress?: Function }} [options]
 * @returns {Promise<{loaded: boolean, count?: number, failedDays?: number, processedDays?: number, reason?: string}>}
 */
export async function loadHistoricalStormArchive(options = {}) {
  const {
    days = STORM_ARCHIVE_LOOKBACK_DAYS,
    minKp = STORM_ARCHIVE_THRESHOLD,
    concurrency = 8,
    onProgress,
  } = options;

  const archiveStatus = getStormArchiveStatus();
  if (archiveStatus.complete) {
    return { loaded: false, reason: 'already-loaded' };
  }

  const archiveEndDate = new Date();
  archiveEndDate.setUTCDate(archiveEndDate.getUTCDate() - 1);
  archiveEndDate.setUTCHours(0, 0, 0, 0);

  const archiveStartDate = new Date(archiveEndDate.getTime() - (days - 1) * 86_400_000);
  const dateKeys = enumerateUtcDateRange(archiveStartDate, archiveEndDate);
  const existingStorms = normalizeStormCatalog(await getStorms(5000));
  const existingStormKeys = new Set(existingStorms.map(storm => storm.date.getTime()));
  const collectedStorms = [];
  let processedDays = 0;
  let failedDays = 0;

  await runConcurrent(dateKeys, concurrency, async dateOnly => {
    try {
      const storms = await fetchHistoricalStormsForDate(dateOnly, minKp);
      collectedStorms.push(...storms);
    } catch (_error) {
      failedDays += 1;
    } finally {
      processedDays += 1;
      if (typeof onProgress === 'function' && (
        processedDays === 1
        || processedDays === dateKeys.length
        || processedDays % 14 === 0
      )) {
        onProgress({
          processedDays,
          totalDays: dateKeys.length,
          percent: Math.round((processedDays / dateKeys.length) * 100),
          foundStorms: collectedStorms.length,
          failedDays,
          currentDate: dateOnly,
        });
      }
    }
  });

  if (collectedStorms.length === 0 && failedDays > 0) {
    throw new Error('NOAA storm archive fetch failed for every requested day');
  }

  const normalizedCollected = normalizeStormCatalog(collectedStorms);
  const newStorms = normalizedCollected.filter(storm => !existingStormKeys.has(storm.date.getTime()));

  for (const storm of newStorms) {
    try {
      await addStorm(storm);
    } catch (_) {
      // Ignore duplicate/constraint failures; the analysis path normalizes anyway.
    }
  }

  localStorage.setItem(STORM_ARCHIVE_LOADED_KEY, JSON.stringify({
    complete: failedDays === 0,
    partial: failedDays > 0,
    loadedAt: Date.now(),
    count: newStorms.length,
    processedDays,
    failedDays,
    startDate: toIsoDateOnly(archiveStartDate),
    endDate: toIsoDateOnly(archiveEndDate),
  }));

  return {
    loaded: true,
    partial: failedDays > 0,
    count: newStorms.length,
    processedDays,
    failedDays,
  };
}

// ===== HISTORICAL DST ARCHIVE (Kyoto WDC provisional) =====

function getDstArchiveStatus() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DST_ARCHIVE_LOADED_KEY) || 'null');
    return {
      monthsDone: Array.isArray(parsed?.monthsDone) ? parsed.monthsDone : [],
      complete: parsed?.complete === true,
    };
  } catch {
    return { monthsDone: [], complete: false };
  }
}

function enumerateBackfillMonths(count) {
  const months = [];
  const now = new Date();
  // Start with the last full month; the current month is covered live by the
  // hourly Dst feed.
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let index = 0; index < count; index += 1) {
    cursor = new Date(cursor.getTime() - 1);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months.reverse();
}

/**
 * One-time backfill of monthly hourly Dst from Kyoto WDC (proxied and parsed
 * server-side). Stores hourly samples plus derived dst-storm driver events so
 * the Dst storm definition gets a multi-year corpus like the Kp baseline.
 *
 * @param {{ months?: number, onProgress?: Function }} [options]
 */
export async function loadHistoricalDstArchive(options = {}) {
  const { months = DST_ARCHIVE_LOOKBACK_MONTHS, onProgress } = options;

  if (!NOAA_APIS.historicalDstArchive) {
    throw new Error('Dst archive backfill requires the local Node proxy (proxy mode)');
  }

  const status = getDstArchiveStatus();
  const allMonths = enumerateBackfillMonths(months);
  const remaining = allMonths.filter(month => !status.monthsDone.includes(month));

  if (remaining.length === 0) {
    return { loaded: false, reason: 'already-loaded', monthsDone: status.monthsDone.length };
  }

  const existingDstStormKeys = new Set(
    (await getDriverEvents(3000, 'dst-storm'))
      .map(event => Math.floor(event.date.getTime() / (3 * 3600 * 1000))),
  );

  let processed = 0;
  let failedMonths = 0;
  let sampleCount = 0;
  let stormCount = 0;
  const completedMonths = [...status.monthsDone];

  for (const month of remaining) {
    try {
      const response = await fetchWithRetry(NOAA_APIS.historicalDstArchive(month), 1, 500);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const records = Array.isArray(payload?.records) ? payload.records : [];

      for (const record of records) {
        const time = Date.parse(record.time);
        if (!Number.isFinite(time) || !Number.isFinite(Number(record.dst))) continue;
        try {
          await addDstSample({ date: new Date(time), dst: Number(record.dst) });
          sampleCount += 1;
        } catch (_) { /* duplicate — skip */ }
      }

      // Derive Dst storm events from this month's samples (hourly records).
      const monthRecords = records
        .map(record => ({ time: Date.parse(record.time), dst: Number(record.dst) }))
        .filter(record => Number.isFinite(record.time) && Number.isFinite(record.dst))
        .sort((a, b) => a.time - b.time);
      const storms = detectDstStorms(monthRecords);
      for (const storm of storms) {
        const bucket = Math.floor(storm.date.getTime() / (3 * 3600 * 1000));
        if (existingDstStormKeys.has(bucket)) continue;
        try {
          await addDriverEvent({
            type: 'dst-storm',
            date: storm.date,
            value: storm.minDst,
            unit: 'nT',
            source: 'Kyoto WDC provisional Dst (archive)',
            metric: 'dst',
          });
          existingDstStormKeys.add(bucket);
          stormCount += 1;
        } catch (_) { /* duplicate — skip */ }
      }

      completedMonths.push(month);
    } catch (_error) {
      failedMonths += 1;
    } finally {
      processed += 1;
      if (typeof onProgress === 'function') {
        onProgress({
          processedMonths: processed,
          totalMonths: remaining.length,
          percent: Math.round((processed / remaining.length) * 100),
          currentMonth: month,
          samples: sampleCount,
          storms: stormCount,
          failedMonths,
        });
      }
    }
  }

  localStorage.setItem(DST_ARCHIVE_LOADED_KEY, JSON.stringify({
    complete: failedMonths === 0,
    monthsDone: completedMonths,
    loadedAt: Date.now(),
  }));

  return {
    loaded: true,
    partial: failedMonths > 0,
    months: processed,
    failedMonths,
    samples: sampleCount,
    storms: stormCount,
  };
}

// Shared pure lag-analysis logic lives in `hypothesis-core.mjs` so the browser
// path and deterministic simulation path use the same implementation.

// ===== STORM DEFINITIONS =====
// The hypothesis must survive every reasonable definition of the solar driver,
// so the same lag engine can be pointed at different event catalogs.
// 'kp' is the frozen baseline; the alternatives are exploratory comparisons.
export const STORM_DEFINITIONS = {
  kp: {
    key: 'kp',
    label: 'Kp ≥ 5 (baseline)',
    description: 'Planetary 3-hour Kp index at or above 5 (NOAA G1 storm threshold). Frozen baseline definition.',
    metric: 'Kp',
  },
  dst: {
    key: 'dst',
    label: 'Dst ≤ −50 nT',
    description: 'Ring-current storm onsets at Dst ≤ −50 nT (moderate-storm threshold, Kyoto WDC via SWPC). Live-accumulated; multi-year corpus via the Kyoto Dst archive backfill button (Kyoto WDC is intermittently unavailable — retry if months fail).',
    metric: 'Dst',
    driverType: 'dst-storm',
  },
  pressure: {
    key: 'pressure',
    label: 'Pressure pulse (P_dyn)',
    description: 'Solar-wind dynamic pressure compressions: P_dyn ≥ 8 nPa or a ≥4 nPa jump within an hour (derived from DSCOVR/ACE plasma). Accumulates live — short history on first install.',
    metric: 'P_dyn',
    driverType: 'pressure-pulse',
  },
};

async function loadStormCatalogForDefinition(definitionKey) {
  const definition = STORM_DEFINITIONS[definitionKey] || STORM_DEFINITIONS.kp;
  if (!definition.driverType) {
    return getStorms(730);
  }

  const events = await getDriverEvents(730, definition.driverType);
  // Map typed driver events onto the storm-record shape the engine consumes.
  // Intensity sign is normalized so stronger events sort higher within a bucket.
  return events.map(event => ({
    date: event.date,
    intensity: definition.driverType === 'dst-storm'
      ? -Math.abs(Number(event.value) || 0)
      : Math.abs(Number(event.value) || 0),
    metric: event.metric,
    source: event.source,
  }));
}

// ===== FULL ANALYSIS RUNNER =====

/**
 * Load all available data from IndexedDB (up to 2 years),
 * run the cross-lag scan, and compute the current prediction.
 *
 * @param {{stormDefinition?: 'kp'|'dst'|'pressure', region?: string}} [options]
 * @returns {Promise<{scanResults, assessment, prediction, meta}>}
 */
export async function runFullAnalysis(options = {}) {
  const { stormDefinition = 'kp', region = 'global' } = options;
  const definition = STORM_DEFINITIONS[stormDefinition] || STORM_DEFINITIONS.kp;
  const regionGroup = REGION_GROUPS[region] || REGION_GROUPS.global;

  const [rawStorms, rawEarthquakes] = await Promise.all([
    loadStormCatalogForDefinition(definition.key),
    getEarthquakes(730),
  ]);

  // Regional stratification tags each quake against PB2002 polygons at
  // analysis time. null means the plate index could not be loaded — report
  // 'unavailable' rather than silently running the global corpus.
  const plateIndex = regionGroup.plates ? await ensurePlateIndex() : null;
  const regionAvailable = regionGroup.plates ? plateIndex !== null : true;
  const scopedEarthquakes = regionAvailable
    ? filterEarthquakesByRegion(plateIndex, rawEarthquakes, regionGroup.key)
    : rawEarthquakes;

  const storms = normalizeStormCatalog(rawStorms);
  const earthquakes = regionAvailable
    ? normalizeEarthquakeCatalog(scopedEarthquakes)
    : [];

  const scanResults = regionAvailable ? scanAllLags(storms, earthquakes, 60) : [];
  const assessment  = regionAvailable ? assessLagScan(scanResults) : null;
  const prediction  = regionAvailable ? computePrediction(storms, earthquakes) : null;
  const stormArchiveStatus = getStormArchiveStatus();
  const meta = {
    stormDefinition: definition.key,
    stormDefinitionLabel: definition.label,
    stormDefinitionMetric: definition.metric,
    region: regionGroup.key,
    regionLabel: regionGroup.label,
    regionAvailable,
    regionNote: regionGroup.note,
    stormCount: storms.length,
    eqCount: earthquakes.length,
    rawStormCount: rawStorms.length,
    rawEqCount: rawEarthquakes.length,
    historicalLoaded: Boolean(localStorage.getItem(HISTORICAL_LOADED_KEY)),
    historicalEarthquakesLoaded: Boolean(localStorage.getItem(HISTORICAL_LOADED_KEY)),
    stormArchiveLoaded: stormArchiveStatus.complete,
    stormArchivePartial: stormArchiveStatus.partial,
    stormSeedLoaded: Boolean(localStorage.getItem(STORM_SEED_LOADED_KEY)),
  };
  const interpretation = regionAvailable
    ? interpretHypothesisEvidence(scanResults, prediction, meta)
    : null;

  return {
    scanResults,
    assessment,
    prediction,
    interpretation,
    meta,
    catalogs: {
      storms,
      earthquakes,
    },
  };
}
