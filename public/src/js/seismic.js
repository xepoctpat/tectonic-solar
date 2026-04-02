// ===== SEISMIC MODULE =====
import { alertSettings } from './store.js';
import { sendNotification, showInAppNotification } from './notifications.js';
import { setText } from './utils.js';
import { drawMagnitudeDistribution } from './charts.js';
import { addEarthquake } from './db.js';

const seenEarthquakeAlertKeys = new Set();
let earthquakeAlertsPrimed = false;

function buildEarthquakeAlertKey(eq) {
  const time = eq?.date instanceof Date ? eq.date.getTime() : new Date(eq?.date || eq?.time || 0).getTime();
  return [
    Number.isFinite(time) ? time : 'unknown-time',
    Number.isFinite(eq?.lat) ? eq.lat.toFixed(3) : '?',
    Number.isFinite(eq?.lon) ? eq.lon.toFixed(3) : '?',
    Number.isFinite(eq?.mag) ? eq.mag.toFixed(1) : '?',
    eq?.place || '',
  ].join('|');
}

/**
 * Check a fresh set of earthquakes against alert thresholds and notify.
 * @param {Array} earthquakes
 */
export function checkEarthquakeAlerts(earthquakes) {
  const threshold = alertSettings.earthquakeMagnitude;
  const qualifying = earthquakes.filter(eq => eq.mag >= threshold);

  if (!earthquakeAlertsPrimed) {
    qualifying.forEach(eq => seenEarthquakeAlertKeys.add(buildEarthquakeAlertKey(eq)));
    earthquakeAlertsPrimed = true;
    return;
  }

  const recentThresholdMs = 2 * 60 * 60 * 1000;
  const freshEvents = [];

  qualifying.forEach(eq => {
    const key = buildEarthquakeAlertKey(eq);
    if (seenEarthquakeAlertKeys.has(key)) {
      return;
    }

    seenEarthquakeAlertKeys.add(key);

    const time = eq?.date instanceof Date ? eq.date.getTime() : new Date(eq?.date || eq?.time || 0).getTime();
    if (Number.isFinite(time) && Date.now() - time <= recentThresholdMs) {
      freshEvents.push(eq);
    }
  });

  if (!freshEvents.length) {
    return;
  }

  freshEvents.sort((a, b) => b.mag - a.mag);

  if (freshEvents.length === 1) {
    const [eq] = freshEvents;
    sendNotification(
      `🌍 Major Earthquake M${eq.mag.toFixed(1)}`,
      `${eq.place} – Depth: ${eq.depth}km`,
    );
    return;
  }

  const strongest = freshEvents[0];
  sendNotification(
    `🌍 ${freshEvents.length} new major earthquakes`,
    `Largest: M${strongest.mag.toFixed(1)} near ${strongest.place}`,
  );
}

/** Allow the current feed to become the non-alerting baseline again. */
export function primeEarthquakeAlertBaseline(earthquakes = []) {
  seenEarthquakeAlertKeys.clear();
  earthquakes
    .filter(eq => eq.mag >= alertSettings.earthquakeMagnitude)
    .forEach(eq => seenEarthquakeAlertKeys.add(buildEarthquakeAlertKey(eq)));
  earthquakeAlertsPrimed = true;
}

/** Reset priming state when the app intentionally needs a fresh alert baseline. */
export function resetEarthquakeAlertBaseline() {
  seenEarthquakeAlertKeys.clear();
  earthquakeAlertsPrimed = false;
}

/**
 * Render the live earthquake list in the Seismic tab and update statistics.
 * Called after each USGS data fetch.
 * @param {Array} earthquakes - Array of earthquake objects with mag, place, depth, date, lat, lon.
 */
export function updateSeismicDisplay(earthquakes) {
  const container = document.getElementById('eq-list-container');
  if (container) {
    // Sort newest first, show up to 25 most recent
    const sorted = [...earthquakes].sort((a, b) => (b.date || 0) - (a.date || 0));
    const recent = sorted.slice(0, 25);

    // Clear existing content
    container.innerHTML = '';

    if (recent.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.color = 'var(--color-text-secondary)';
      emptyMsg.style.fontSize = 'var(--font-size-sm)';
      emptyMsg.textContent = 'No earthquakes in this feed window.';
      container.appendChild(emptyMsg);
    } else {
      recent.forEach(eq => {
        const magClass = eq.mag >= 6 ? 'm6' : 'm5';
        const timeAgo = _timeAgo(eq.date);
        const depth = eq.depth != null ? `${eq.depth.toFixed(0)} km` : '?';

        const item = document.createElement('div');
        item.className = 'eq-item';

        const magSpan = document.createElement('span');
        magSpan.className = `mag ${magClass}`;
        magSpan.textContent = eq.mag.toFixed(1);
        item.appendChild(magSpan);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'eq-info';

        const locationDiv = document.createElement('div');
        locationDiv.className = 'location';
        locationDiv.textContent = eq.place || 'Unknown location';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'time';
        timeDiv.textContent = `${timeAgo} · Depth: ${depth}`;

        infoDiv.appendChild(locationDiv);
        infoDiv.appendChild(timeDiv);
        item.appendChild(infoDiv);
        container.appendChild(item);
      });
    }
  }

  // ---- Update statistics ----
  const m5plus = earthquakes.filter(eq => eq.mag >= 5.0);
  const m6plus = earthquakes.filter(eq => eq.mag >= 6.0);
  const largest = earthquakes.reduce((max, eq) => eq.mag > max ? eq.mag : max, 0);

  setText('stat-m5-count', m5plus.length);
  setText('stat-m6-count', m6plus.length);
  setText('stat-largest', largest > 0 ? `M${largest.toFixed(1)}` : '—');
  setText('stat-total', earthquakes.length);
  setText('seismic-last-update', new Date().toLocaleTimeString());

  // ---- Update magnitude distribution chart ----
  drawMagnitudeDistribution(earthquakes);
}

/** Refresh earthquake data and show an in-app notification. */
export async function refreshEarthquakeData(fetchFn) {
  await fetchFn();
  showInAppNotification('Earthquake Data Updated', 'Latest seismic data loaded', 'info');
}

// ===== HELPERS =====
/** Return a human-readable relative time string ("2h ago", "5m ago"). */
function _timeAgo(date) {
  if (!date) return 'Unknown';
  const ms = Date.now() - date.getTime();
  if (ms < 0) return 'Just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

