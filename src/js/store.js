// ===== SHARED APPLICATION STATE =====
// Central store for mutable runtime state shared across modules.

import { DEFAULT_ALERT_SETTINGS } from './config.js';

// ---- Space weather cache ----
export const spaceWeatherCache = {
  solarWind: null,
  kpIndex: null,
  xrayFlux: null,
  lastUpdate: 0,
};

// ---- Alert settings (loaded from localStorage via settings module) ----
export const alertSettings = { ...DEFAULT_ALERT_SETTINGS };

// ---- Historical data for correlation analysis ----
export let historicalStorms = [];
export let historicalEarthquakes = [];

export function setHistoricalStorms(storms) {
  historicalStorms = storms;
}

export function setHistoricalEarthquakes(earthquakes) {
  historicalEarthquakes = earthquakes;
}

export function addHistoricalStorm(storm) {
  historicalStorms.push(storm);
  // Keep only last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  historicalStorms = historicalStorms.filter(s => s.date >= thirtyDaysAgo);
}
