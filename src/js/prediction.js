// ===== PREDICTION ENGINE =====
// Statistical hypothesis testing and Bayesian probability estimation
// for the space-weather ↔ seismic 27–28 day lag correlation.
// See RESEARCH.md for methodology notes and literature references.

import { fetchWithRetry } from './utils.js';
import { addEarthquake, addStorm, getEarthquakes, getStorms } from './db.js';

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

// ===== HISTORICAL DATA LOADER =====

/**
 * One-time fetch of M5+ earthquakes from USGS ComCat for the past 2 years.
 * Stores all events in IndexedDB. Idempotent — skips if already loaded
 * (controlled via localStorage flag).
 *
 * USGS ComCat API is CORS-accessible directly; no proxy required.
 *
 * @returns {Promise<{loaded: boolean, count?: number, reason?: string}>}
 */
export async function loadHistoricalUSGS() {
  if (localStorage.getItem(HISTORICAL_LOADED_KEY)) {
    return { loaded: false, reason: 'already-loaded' };
  }

  const endDate   = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 86_400_000).toISOString().split('T')[0];

  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
    `&minmagnitude=5.0&starttime=${startDate}&endtime=${endDate}` +
    `&limit=5000&orderby=time-asc`;

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

// ===== CROSS-LAG SCAN =====

/**
 * Scan the event-rate ratio at every integer lag from 0 to maxLag days.
 *
 * For each lag L:
 *   window  = earthquakes within ±3 days of (storm_date + L)
 *   control = earthquakes within ±3 days of (storm_date + L + 14)
 *   ratio   = window / control
 *
 * A ratio significantly > 1 at a specific lag is the hypothesis signal.
 * This event-rate approach avoids the selection bias inherent in
 * Pearson r on matched pairs (documented in RESEARCH.md §7).
 *
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @param {number} maxLag
 * @returns {Array<{lag:number, eventRatio:number, windowCount:number, controlCount:number}>}
 */
export function scanAllLags(storms, earthquakes, maxLag = 60) {
  const results = [];

  for (let lag = 0; lag <= maxLag; lag++) {
    let windowCount  = 0;
    let controlCount = 0;

    storms.forEach(storm => {
      const lagCenter  = storm.date.getTime() + lag * 86_400_000;
      const ctrlCenter = storm.date.getTime() + (lag + 14) * 86_400_000;
      earthquakes.forEach(eq => {
        const t = eq.date.getTime();
        if (Math.abs(t - lagCenter)  <= 3 * 86_400_000) windowCount++;
        if (Math.abs(t - ctrlCenter) <= 3 * 86_400_000) controlCount++;
      });
    });

    results.push({
      lag,
      windowCount,
      controlCount,
      // Ratio >1 = more earthquakes in window than control; =1 = null result
      eventRatio: controlCount > 0
        ? windowCount / controlCount
        : (windowCount > 0 ? 2.0 : 1.0),
    });
  }

  return results;
}

/**
 * Find the peak lag(s) and assess whether the 27–28 day region is special.
 * @param {Array} scanResults - from scanAllLags()
 * @returns {{ peakLag: number, peakRatio: number, lag27ratio: number, isHypothesisSupported: boolean }}
 */
export function assessLagScan(scanResults) {
  if (!scanResults.length) return null;

  const peak = scanResults.reduce((a, b) => (b.eventRatio > a.eventRatio ? b : a));
  const lag27 = scanResults.find(r => r.lag === 27) || scanResults.find(r => r.lag === 28);
  const lag27ratio = lag27 ? lag27.eventRatio : 1.0;

  // Simple signal criterion: 27–28d ratio is the global or near-global peak,
  // AND is meaningfully above 1.0 (>1.15 = >15% elevation)
  const isHypothesisSupported = (peak.lag >= 25 && peak.lag <= 30) && peak.eventRatio > 1.15;

  return {
    peakLag:    peak.lag,
    peakRatio:  peak.eventRatio,
    lag27ratio,
    isHypothesisSupported,
  };
}

// ===== BAYESIAN PROBABILITY ESTIMATOR =====

/**
 * Compute P(≥1 M5+ earthquake in current 27–28d post-storm window) from
 * empirical conditional frequency in the historical IndexedDB corpus.
 *
 * If triggering storms exist (Kp≥5 storms 25–30 days ago):
 *   P = (past storms where ≥1 M5+ occurred in T+25..T+30) / total past storms
 * Else:
 *   P = base rate (background M5+ frequency in any 5-day window)
 *
 * This is a frequentist conditional probability, not a model prediction.
 * It becomes more meaningful with more historical data (see RESEARCH.md §7).
 *
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @returns {Object} prediction result
 */
export function computePrediction(storms, earthquakes) {
  const now = Date.now();

  // --- Base rate: P(≥1 M5+ in any 5-day window) ---
  const dataSpanDays = earthquakes.length > 0
    ? (now - Math.min(...earthquakes.map(e => e.date.getTime()))) / 86_400_000
    : 1;
  const dailyRate      = earthquakes.length / Math.max(dataSpanDays, 1);
  const baseProbability = 1 - Math.pow(1 - dailyRate, 5);

  // --- Conditional rate: P(hit | storm, lag T+25..T+30) ---
  let stormTrials = 0;
  let stormHits   = 0;

  storms.forEach(storm => {
    const winStart = storm.date.getTime() + 25 * 86_400_000;
    const winEnd   = storm.date.getTime() + 30 * 86_400_000;
    // Only use past storms where the lag window has already closed
    if (winEnd < now) {
      stormTrials++;
      if (earthquakes.some(eq => eq.date.getTime() >= winStart && eq.date.getTime() <= winEnd)) {
        stormHits++;
      }
    }
  });

  const conditionalProbability = stormTrials >= 3
    ? stormHits / stormTrials
    : baseProbability;

  // --- Is there an active triggering storm right now? ---
  const triggeringStorms = storms.filter(s => {
    const ageDays = (now - s.date.getTime()) / 86_400_000;
    return ageDays >= 25 && ageDays <= 30;
  });

  const windowActive    = triggeringStorms.length > 0;
  const displayProb     = windowActive ? conditionalProbability : baseProbability;

  const confidence =
    stormTrials >= 30 ? 'high'    :
    stormTrials >= 10 ? 'medium'  :
    stormTrials >= 3  ? 'low'     : 'insufficient';

  return {
    windowActive,
    probability:           Math.min(Math.max(displayProb, 0), 1),
    conditionalProbability: Math.min(Math.max(conditionalProbability, 0), 1),
    baseProbability:        Math.min(Math.max(baseProbability, 0), 1),
    stormTrials,
    stormHits,
    triggeringStorms:  triggeringStorms.length,
    triggeringDetails: triggeringStorms.map(s => ({
      kp:      s.kp,
      agedays: Math.round((now - s.date.getTime()) / 86_400_000),
    })),
    confidence,
    dataPoints: {
      storms:       storms.length,
      earthquakes:  earthquakes.length,
      dataSpanDays: Math.round(dataSpanDays),
    },
  };
}

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
  const [storms, earthquakes] = await Promise.all([
    getStorms(730),
    getEarthquakes(730),
  ]);

  const scanResults = scanAllLags(storms, earthquakes, 60);
  const assessment  = assessLagScan(scanResults);
  const prediction  = computePrediction(storms, earthquakes);

  return {
    scanResults,
    assessment,
    prediction,
    meta: {
      stormCount: storms.length,
      eqCount:    earthquakes.length,
      historicalLoaded: Boolean(localStorage.getItem(HISTORICAL_LOADED_KEY)),
      stormSeedLoaded:  Boolean(localStorage.getItem(STORM_SEED_LOADED_KEY)),
    },
  };
}
