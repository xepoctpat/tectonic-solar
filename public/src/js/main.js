// ===== MAIN APPLICATION ENTRY POINT =====
import { errorLogger } from './error-logger.js';
import { initTabs, registerMap } from './tabs.js';
import {
  initializeMap,
  getMap,
  fetchRealEarthquakeData,
  addTectonicOverlays,
  addPlateMotionVectors,
  updateMapLayers,
  switchMapType,
  zoomToRegion,
  setEarthquakeAlertCallback,
  setEarthquakeDisplayCallback,
  applyMagnitudeFilter,
} from './map.js';
import { fetchNOAASpaceWeather, refreshSpaceData } from './spaceWeather.js';
import { checkEarthquakeAlerts, refreshEarthquakeData, updateSeismicDisplay } from './seismic.js';
import { initLocationSelector, fetchEnvironmentData } from './environment.js';
import { refreshCorrelationData, updateCorrelationWindow } from './correlation.js';
import { drawSpaceCharts, drawLagScanChart } from './charts.js';
import { loadSettings, syncSettingsForm, saveAlertSettings, toggleAlerts, resetSettings } from './settings.js';
import { requestNotificationPermission, initNotificationStatus } from './notifications.js';
import { REFRESH_INTERVALS } from './config.js';
import { setDataModeChangeListener } from './store.js';
import { initDB } from './db.js';
import {
  seedHistoricalStorms,
  loadHistoricalUSGS,
  runFullAnalysis,
} from './prediction.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ---- Register Service Worker (PWA) ----
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered:', reg);
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  }

  // ---- Initialize IndexedDB ----
  try {
    await initDB();
    console.log('IndexedDB initialized');
  } catch (err) {
    console.warn('IndexedDB init failed:', err);
  }

  // ---- Load persisted settings ----
  loadSettings();
  syncSettingsForm();

  // ---- Register data-mode listener (keeps store free of DOM dependencies) ----
  setDataModeChangeListener(mode => {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot)  dot.className = `status-dot status-${mode}`;
    if (text) text.textContent = mode === 'live' ? 'Live' : mode === 'demo' ? 'Demo' : 'Loading…';
  });

  // ---- Initialise tabs ----
  initTabs();

  // ---- Initialise map ----
  const map = initializeMap();
  registerMap(map);

  // Wire earthquake callbacks to avoid circular imports
  setEarthquakeAlertCallback(checkEarthquakeAlerts);
  setEarthquakeDisplayCallback(updateSeismicDisplay);

  fetchRealEarthquakeData();
  addTectonicOverlays();
  addPlateMotionVectors();

  // Enable all layer checkboxes by default
  ['l-convergent', 'l-divergent', 'l-transform', 'l-earthquakes', 'l-vectors'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = true;
  });

  // Layer checkbox listeners
  document.querySelectorAll('.map-sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateMapLayers);
  });

  // Map type button listeners
  document.querySelectorAll('[data-map-type]').forEach(btn => {
    btn.addEventListener('click', () => switchMapType(btn.getAttribute('data-map-type')));
  });

  // Region zoom button listeners
  document.querySelectorAll('[data-region]').forEach(btn => {
    btn.addEventListener('click', () => zoomToRegion(btn.getAttribute('data-region')));
  });

  // Dark mode toggle
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.classList.toggle('dark');
      darkModeToggle.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('darkMode', isDark ? 'true' : 'false');
      // Re-render charts for dark mode colors
      import('./charts.js').then(({ drawSpaceCharts }) => drawSpaceCharts());
    });
  }

  // Initialize dark mode from localStorage
  const savedDarkMode = localStorage.getItem('darkMode');
  if (savedDarkMode === 'true') {
    document.documentElement.classList.add('dark');
    if (darkModeToggle) darkModeToggle.textContent = '☀️';
  }

  // Refresh earthquake button
  document.getElementById('btn-refresh-eq')?.addEventListener('click', () => refreshEarthquakeData(fetchRealEarthquakeData));
  document.getElementById('btn-refresh-seismic')?.addEventListener('click', () => refreshEarthquakeData(fetchRealEarthquakeData));

  // ---- Space weather ----
  drawSpaceCharts();
  fetchNOAASpaceWeather();
  initNotificationStatus();

  document.getElementById('btn-refresh-space')?.addEventListener('click', refreshSpaceData);
  document.getElementById('btn-enable-notifications')?.addEventListener('click', requestNotificationPermission);

  // ---- Environment ----
  initLocationSelector();

  document.getElementById('btn-refresh-env')?.addEventListener('click', () => {
    const select = document.getElementById('location-select');
    if (select) fetchEnvironmentData(select.value);
  });

  // ---- Correlation ----
  updateCorrelationWindow();
  document.getElementById('btn-refresh-correlation')?.addEventListener('click', refreshCorrelationData);

  // ---- Prediction Engine ----

  /** Render prediction results into the Correlation tab UI. */
  async function updatePredictionUI() {
    const statusEl = document.getElementById('data-load-status');
    if (statusEl) statusEl.textContent = 'Running analysis…';
    try {
      const { scanResults, assessment, prediction, meta } = await runFullAnalysis();

      // Data foundation status
      const eqStatusEl = document.getElementById('data-eq-status');
      const stormStatusEl = document.getElementById('data-storm-status');
      const spanEl = document.getElementById('data-span');
      if (eqStatusEl) eqStatusEl.textContent = meta.historicalLoaded
        ? `✓ ${meta.eqCount.toLocaleString()} events`
        : `${meta.eqCount} events (session only)`;
      if (stormStatusEl) stormStatusEl.textContent = meta.stormSeedLoaded
        ? `✓ Seeded (SC25 + live)`
        : `${meta.stormCount} storms (live only)`;
      if (spanEl) spanEl.textContent = prediction.dataPoints.dataSpanDays > 0
        ? `${prediction.dataPoints.dataSpanDays} days`
        : '—';

      // Lag scan chart
      drawLagScanChart(scanResults);

      // Lag scan verdict
      const verdictEl = document.getElementById('lag-scan-verdict');
      if (verdictEl && assessment) {
        const { peakLag, peakRatio, lag27ratio, isHypothesisSupported } = assessment;
        const dataOk = meta.stormCount >= 5 && meta.eqCount >= 20;
        if (!dataOk) {
          verdictEl.style.color = 'var(--color-text-secondary)';
          verdictEl.textContent = `⏳ Insufficient data (${meta.stormCount} storms, ${meta.eqCount} earthquakes). Load 2-year history for a valid test.`;
        } else if (isHypothesisSupported) {
          verdictEl.style.color = '#FF9800';
          verdictEl.textContent =
            `⚠️ Signal detected: peak ratio ${peakRatio.toFixed(2)}× at lag ${peakLag}d. ` +
            `27d ratio: ${lag27ratio.toFixed(2)}×. ` +
            `This pattern warrants further investigation — it does NOT confirm causation.`;
        } else {
          verdictEl.style.color = '#4CAF50';
          verdictEl.textContent =
            `✓ No significant 27–28d signal. Peak ratio ${peakRatio.toFixed(2)}× at lag ${peakLag}d. ` +
            `27d ratio: ${lag27ratio.toFixed(2)}×. ` +
            `Result is consistent with the null hypothesis (no correlation).`;
        }
      }

      // Prediction card
      const probEl = document.getElementById('pred-probability');
      const labelEl = document.getElementById('pred-label');
      const confEl = document.getElementById('pred-confidence');
      const detailEl = document.getElementById('pred-detail');

      if (probEl && prediction.probability !== null) {
        const pct = Math.round(prediction.probability * 100);
        probEl.textContent = `${pct}%`;
        probEl.style.color = pct >= 60 ? '#F44336' : pct >= 40 ? '#FF9800' : '#4CAF50';
      }
      if (labelEl) {
        labelEl.textContent = prediction.windowActive
          ? `🔴 Active: ${prediction.triggeringStorms} storm(s) 25–30 days ago`
          : '🟢 Background rate — no triggering storm in window';
      }
      if (confEl) {
        const confColors = { high: '#4CAF50', medium: '#FFC107', low: '#FF9800', insufficient: '#9E9E9E' };
        confEl.textContent = prediction.confidence;
        confEl.style.color = confColors[prediction.confidence] || '#9E9E9E';
      }
      if (detailEl) {
        detailEl.textContent =
          `Based on ${prediction.stormTrials} historical post-storm windows: ` +
          `${prediction.stormHits} had ≥1 M5+ event in the lag zone. ` +
          `Background P(M5+ / 5d) = ${Math.round(prediction.baseProbability * 100)}%. ` +
          `Corpus: ${prediction.dataPoints.storms} storms, ${prediction.dataPoints.earthquakes} earthquakes, ` +
          `${prediction.dataPoints.dataSpanDays} days.`;
      }

      if (statusEl) statusEl.textContent = `Last run: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.warn('Prediction analysis failed:', err);
      if (statusEl) statusEl.textContent = `Analysis error: ${err.message}`;
    }
  }

  // Seed storm data and run initial analysis silently on first load
  seedHistoricalStorms().then(() => updatePredictionUI()).catch(() => {});

  // "Load 2-Year History" button
  document.getElementById('btn-load-historical')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-load-historical');
    const statusEl = document.getElementById('data-load-status');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Fetching USGS ComCat M5+ data (up to 2 years)…';
    try {
      const result = await loadHistoricalUSGS();
      if (result.loaded) {
        if (statusEl) statusEl.textContent = `✓ Loaded ${result.count.toLocaleString()} earthquakes. Running analysis…`;
        await updatePredictionUI();
      } else {
        if (statusEl) statusEl.textContent = '✓ Already loaded. Running analysis…';
        await updatePredictionUI();
      }
    } catch (err) {
      console.warn('Historical USGS load failed:', err);
      if (statusEl) statusEl.textContent = `⚠ Load failed: ${err.message}. Check network connection.`;
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // "Run Analysis" button
  document.getElementById('btn-run-analysis')?.addEventListener('click', updatePredictionUI);

  // ---- Settings ----
  document.getElementById('btn-save-settings')?.addEventListener('click', saveAlertSettings);
  document.getElementById('btn-reset-settings')?.addEventListener('click', resetSettings);
  document.getElementById('alert-enabled')?.addEventListener('change', toggleAlerts);

  // ---- Auto-refresh intervals ----
  setInterval(fetchRealEarthquakeData, REFRESH_INTERVALS.earthquakes);
  setInterval(fetchNOAASpaceWeather, REFRESH_INTERVALS.spaceWeather);
  setInterval(() => {
    const select = document.getElementById('location-select');
    if (select) fetchEnvironmentData(select.value);
  }, REFRESH_INTERVALS.environment);

  // ---- Resize handler: invalidate Leaflet map size ----
  window.addEventListener('resize', () => {
    if (getMap() && document.getElementById('map-tab')?.classList.contains('active')) {
      getMap().invalidateSize();
    }
  });
});
