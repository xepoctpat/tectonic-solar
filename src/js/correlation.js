// ===== CORRELATION MODULE =====
import { historicalStorms, historicalEarthquakes } from './store.js';
import { DEMO_STORMS } from './config.js';
import { drawCorrelationTimeline } from './charts.js';
import { setText } from './utils.js';
import { showInAppNotification } from './notifications.js';

/** Return geomagnetic storms within a date range (merges real + demo data). */
export function getGeomagneticStorms(startDate, endDate) {
  const real = historicalStorms.filter(s => s.date >= startDate && s.date <= endDate);
  const demo = DEMO_STORMS.filter(s => s.date >= startDate && s.date <= endDate);
  return [...real, ...demo];
}

/** Return major earthquakes (M5+) within a date range. */
export function getMajorEarthquakes(startDate, endDate) {
  return historicalEarthquakes.filter(eq =>
    eq.date >= startDate && eq.date <= endDate && eq.mag >= 5.0,
  );
}

/** Update the 27–28-day correlation window indicators. */
export function updateCorrelationWindow() {
  const now = new Date();
  const windowStart = new Date(now - 28 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 27 * 24 * 60 * 60 * 1000);

  setText('window-start', windowStart.toLocaleDateString());
  setText('window-end', windowEnd.toLocaleDateString());

  const storms = getGeomagneticStorms(windowStart, windowEnd);
  const statusEl = document.getElementById('window-status');
  if (!statusEl) return;

  if (storms.length > 0) {
    statusEl.innerHTML = `⚠️ <strong>Active Correlation Window</strong><br>
      ${storms.length} geomagnetic storm(s) detected 27–28 days ago.
      Research suggests increased earthquake probability.`;
    statusEl.style.color = '#FF9800';
  } else {
    statusEl.textContent = '✓ No correlation window active';
    statusEl.style.color = '#4CAF50';
  }
}

/** Redraw the full correlation timeline and update stats. */
export function refreshCorrelationData() {
  updateCorrelationWindow();

  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const storms = getGeomagneticStorms(thirtyDaysAgo, now);
  const earthquakes = getMajorEarthquakes(thirtyDaysAgo, now);

  const result = drawCorrelationTimeline(storms, earthquakes);
  if (result) {
    setText('storm-count', result.stormCount);
    setText('major-eq-count', result.eqCount);
    setText('correlation-strength', result.correlationCount);
  }

  showInAppNotification('Correlation Data Updated', 'Timeline refreshed with latest data', 'info');
}
