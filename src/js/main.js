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
import { drawSpaceCharts } from './charts.js';
import { loadSettings, syncSettingsForm, saveAlertSettings, toggleAlerts, resetSettings } from './settings.js';
import { requestNotificationPermission, initNotificationStatus } from './notifications.js';
import { REFRESH_INTERVALS } from './config.js';
import { setDataModeChangeListener } from './store.js';
import { initDB } from './db.js';

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
