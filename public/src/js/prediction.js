// ===== PREDICTION ENGINE =====
// Statistical hypothesis testing and Bayesian probability estimation
// for the space-weather ↔ seismic 27–28 day lag correlation.
// See RESEARCH.md for methodology notes and literature references.

import { fetchWithRetry } from './utils.js';
import { NOAA_APIS, USGS_APIS } from './config.js';
import { addEarthquake, addStorm, getEarthquakes, getStorms } from './db.js';
import {
  scanAllLags,
  assessLagScan,
  computePrediction,
  interpretHypothesisEvidence,
  normalizeStormCatalog,
  normalizeEarthquakeCatalog,
} from './hypothesis-core.mjs';
import { enumerateUtcDateRange, parseDayindStorms, toIsoDateOnly } from './stormArchive.mjs';

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
const STORM_ARCHIVE_LOOKBACK_DAYS = 730;
const STORM_ARCHIVE_THRESHOLD = 5.0;

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

// Shared pure lag-analysis logic lives in `hypothesis-core.mjs` so the browser
// path and deterministic simulation path use the same implementation.

// ===== FULL ANALYSIS RUNNER =====

/**
 * Load all available data from IndexedDB (up to 2 years),
 * run the cross-lag scan, and compute the current prediction.
 *
 * Called when the Correlation tab is first opened or refreshed.
 *
 * @returns {Promise<{scanResults, assessment, prediction, meta}>}
 */
export async function runFullAnalysis() {
  const [rawStorms, rawEarthquakes] = await Promise.all([
    getStorms(730),
    getEarthquakes(730),
  ]);

  const storms = normalizeStormCatalog(rawStorms);
  const earthquakes = normalizeEarthquakeCatalog(rawEarthquakes);

  const scanResults = scanAllLags(storms, earthquakes, 60);
  const assessment  = assessLagScan(scanResults);
  const prediction  = computePrediction(storms, earthquakes);
  const stormArchiveStatus = getStormArchiveStatus();
  const meta = {
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
  const interpretation = interpretHypothesisEvidence(scanResults, prediction, meta);

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
