// ===== CORRELATION MODULE =====
import { historicalStorms, historicalEarthquakes, volcanoFeatures } from './store.js';
import { DEMO_STORMS, TECTONIC_DATASET } from './config.js';
import { drawCorrelationTimeline } from './charts.js';
import { setText } from './utils.js';
import { showInAppNotification } from './notifications.js';
import { summarizeVolcanoSeismicity } from './volcanoAnalytics.mjs';

let tongaGeometry = null;
let tongaGeometryPromise = null;

async function loadTongaGeometry() {
  if (tongaGeometry) return tongaGeometry;
  if (tongaGeometryPromise) return tongaGeometryPromise;
  tongaGeometryPromise = fetch(TECTONIC_DATASET.platesUrl)
    .then(response => response.json())
    .then((data) => {
      const plate = (data.features || []).find(feature => feature.properties?.plateCode === 'TO');
      tongaGeometry = plate?.geometry || null;
      return tongaGeometry;
    })
    .catch(() => {
      tongaGeometry = null;
      return null;
    });
  return tongaGeometryPromise;
}

function setMetric(id, value) {
  setText(id, value);
}

export async function updateVolcanoQuakePanel() {
  const summaryEl = document.getElementById('volcano-quake-summary');
  if (!summaryEl) return;

  const geometry = await loadTongaGeometry();
  const summary = summarizeVolcanoSeismicity({
    volcanoes: volcanoFeatures,
    earthquakes: historicalEarthquakes,
    tongaGeometry: geometry,
  });

  setMetric('vq-quakes', summary.quakeCount);
  setMetric('vq-near', summary.quakesNearVolcano);
  setMetric('vq-unrest', summary.unrestCount);
  setMetric('vq-tonga-eq', summary.tonga.quakeCount);
  setMetric('vq-tonga-volc', summary.tonga.volcanoCount);
  setMetric('vq-tonga-near', summary.tonga.quakesNearVolcano);

  const hungaEl = document.getElementById('vq-hunga');
  if (hungaEl) {
    hungaEl.textContent = summary.tonga.hungaName
      ? `${summary.tonga.hungaName} · ${summary.tonga.hungaClass || 'catalogued'}`
      + (summary.tonga.hungaYear ? ` · last eruption ${summary.tonga.hungaYear}` : '')
      : 'Hunga Tonga-Hunga Haʻapai not in this snapshot';
  }

  const list = document.getElementById('vq-pairs');
  if (list) {
    list.replaceChildren();
    if (summary.nearbyPairs.length === 0) {
      list.textContent = 'No live M4.5+ within 150 km of an unrest/active volcano.';
    } else {
      summary.nearbyPairs.forEach((pair) => {
        const row = document.createElement('li');
        row.textContent = `${pair.name} · ${pair.quakeCount} quake(s), max M${pair.maxMag.toFixed(1)}, nearest ${pair.nearestKm} km (${pair.class})`;
        list.appendChild(row);
      });
    }
  }
}

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
    const title = document.createElement('strong');
    title.textContent = 'Active Correlation Window';

    statusEl.replaceChildren(
      '⚠️ ',
      title,
      document.createElement('br'),
      document.createTextNode(
        `${storms.length} geomagnetic storm(s) detected 27–28 days ago. Research suggests increased earthquake probability.`,
      ),
    );
    statusEl.style.color = '#FF9800';
  } else {
    statusEl.textContent = '✓ No correlation window active';
    statusEl.style.color = '#4CAF50';
  }
}

/** Redraw the full correlation timeline and update stats. */
export function refreshCorrelationData({ notify = false } = {}) {
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

  if (notify) {
    showInAppNotification('Correlation Data Updated', 'Timeline refreshed with latest data', 'info');
  }
  updateVolcanoQuakePanel().catch(() => {});
}

// ===== STATISTICAL ENHANCEMENTS =====

/** Calculate Pearson correlation coefficient between storm intensities and EQ magnitudes. */
export function calculatePearsonCorrelation(storms, earthquakes, lagDays = 27.5) {
  if (storms.length < 2 || earthquakes.length < 2) return 0;

  const correlationPairs = [];
  storms.forEach(storm => {
    const lagDate = new Date(storm.date.getTime() + lagDays * 24 * 60 * 60 * 1000);
    earthquakes.forEach(eq => {
      const diff = Math.abs(eq.date - lagDate) / (24 * 60 * 60 * 1000);
      if (diff <= 3) {
        correlationPairs.push({ stormKp: storm.kp, eqMag: eq.mag });
      }
    });
  });

  if (correlationPairs.length < 2) return 0;

  const n = correlationPairs.length;
  const meanKp = correlationPairs.reduce((sum, p) => sum + p.stormKp, 0) / n;
  const meanMag = correlationPairs.reduce((sum, p) => sum + p.eqMag, 0) / n;

  let numerator = 0;
  let denomSq1 = 0;
  let denomSq2 = 0;

  correlationPairs.forEach(p => {
    const kpDiff = p.stormKp - meanKp;
    const magDiff = p.eqMag - meanMag;
    numerator += kpDiff * magDiff;
    denomSq1 += kpDiff * kpDiff;
    denomSq2 += magDiff * magDiff;
  });

  const denominator = Math.sqrt(denomSq1 * denomSq2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/** Estimate p-value using Fisher transform (simplified). */
export function estimatePValue(r, n) {
  if (Math.abs(r) >= 1 || n < 3) return 1;
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const seZ = 1 / Math.sqrt(n - 3);
  // Two-tailed t-test approximation
  const t = z / seZ;
  return 2 * (1 - normalCDF(Math.abs(t)));
}

/** Approximate cumulative normal distribution. */
function normalCDF(x) {
  return (1 + erf(x / Math.sqrt(2))) / 2;
}

/** Error function approximation. */
function erf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/** Get correlation strength label. */
export function getCorrelationStrength(r) {
  const absR = Math.abs(r);
  if (absR < 0.3) return 'None';
  if (absR < 0.5) return 'Weak';
  if (absR < 0.7) return 'Moderate';
  return 'Strong';
}

/** Analyze correlation with configurable lag window. */
export function analyzeCorrelation(lagMinDays = 21, lagMaxDays = 35) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const storms = getGeomagneticStorms(thirtyDaysAgo, now);
  const earthquakes = getMajorEarthquakes(thirtyDaysAgo, now);

  // Calculate mid-point lag
  const lagMid = (lagMinDays + lagMaxDays) / 2;

  const r = calculatePearsonCorrelation(storms, earthquakes, lagMid);
  const p = estimatePValue(r, Math.max(storms.length, earthquakes.length));
  const strength = getCorrelationStrength(r);

  return {
    r,
    p,
    strength,
    stormCount: storms.length,
    eqCount: earthquakes.length,
    lagMinDays,
    lagMaxDays,
    lagMidDays: lagMid
  };
}
