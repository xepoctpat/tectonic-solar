// ===== SEISMIC MODULE =====
import { alertSettings, historicalEarthquakes } from './store.js';
import { sendNotification, showInAppNotification } from './notifications.js';
import { setText } from './utils.js';
import { drawMagnitudeDistribution } from './charts.js';
import { addEarthquake } from './db.js';

/**
 * Check a fresh set of earthquakes against alert thresholds and notify.
 * @param {Array} earthquakes
 */
export function checkEarthquakeAlerts(earthquakes) {
  earthquakes.forEach(eq => {
    if (eq.mag >= alertSettings.earthquakeMagnitude) {
      // Avoid duplicate alerts for the same event
      const alreadyAlerted = historicalEarthquakes.some(
        h => h.lat === eq.lat && h.lon === eq.lon && h.mag === eq.mag,
      );
      if (!alreadyAlerted) {
        sendNotification(
          `🌍 Major Earthquake M${eq.mag.toFixed(1)}`,
          `${eq.place} – Depth: ${eq.depth}km`,
        );
      }
    }
  });
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

