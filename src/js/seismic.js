// ===== SEISMIC MODULE =====
import { alertSettings, historicalEarthquakes } from './store.js';
import { sendNotification, showInAppNotification } from './notifications.js';

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
          '🔴',
        );
      }
    }
  });
}

/** Refresh earthquake data and show an in-app notification. */
export async function refreshEarthquakeData(fetchFn) {
  await fetchFn();
  showInAppNotification('Earthquake Data Updated', 'Latest seismic data loaded', 'info');
}
