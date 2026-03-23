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

// ---- Historical time-series for charting ----
/** Array of {speed, density, bz, time} – last 60 minutes of solar wind plasma readings. */
export let solarWindHistory = [];
/** Array of {kp, time} – last 72 readings from 3-day Kp product (~72 entries). */
export let kpHistory = [];

export function setSolarWindHistory(data) { solarWindHistory = data; }
export function setKpHistory(data)        { kpHistory = data; }

// ---- Alert settings (loaded from localStorage via settings module) ----
export const alertSettings = { ...DEFAULT_ALERT_SETTINGS };

// ---- Magnitude filter for map ----
/** Minimum magnitude to show on the map (4.0 = show all). */
export let magnitudeFilter = 4.0;
export function setMagnitudeFilter(val) { magnitudeFilter = val; }

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

// ---- Connection / data-source state ----
/** 'live' | 'demo' | 'loading' – displayed in header status indicator. */
export let dataMode = 'loading';

/**
 * Optional listener invoked whenever dataMode changes.
 * Register via setDataModeChangeListener() from a UI module.
 */
export let dataModeChangeListener = null;

export function setDataModeChangeListener(listener) {
  dataModeChangeListener = listener;
}

export function setDataMode(mode) {
  dataMode = mode;
  if (typeof dataModeChangeListener === 'function') {
    dataModeChangeListener(mode);
  }
}
