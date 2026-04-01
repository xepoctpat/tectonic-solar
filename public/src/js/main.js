// ===== MAIN APPLICATION ENTRY POINT =====
import { errorLogger } from './error-logger.js';
import { initTabs } from './tabs.js';
import { registerMapViewport, resizeMapViewport } from './mapViewport.js';
import {
  initializeMap,
  fetchRealEarthquakeData,
  updateMapLayers,
  activatePlateGuideView,
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
import { drawSpaceCharts, drawLagScanChart, redrawCachedCharts } from './charts.js';
import { loadSettings, syncSettingsForm, saveAlertSettings, toggleAlerts, resetSettings } from './settings.js';
import { requestNotificationPermission, initNotificationStatus, showInAppNotification } from './notifications.js';
import { REFRESH_INTERVALS } from './config.js';
import { setDataModeChangeListener } from './store.js';
import { initDB } from './db.js';
import {
  seedHistoricalStorms,
  loadHistoricalUSGS,
  loadHistoricalStormArchive,
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
  registerMapViewport({
    resize: () => map.invalidateSize(),
  });

  // Wire earthquake callbacks to avoid circular imports
  setEarthquakeAlertCallback(checkEarthquakeAlerts);
  setEarthquakeDisplayCallback(updateSeismicDisplay);

  // Default map layers: keep boundaries on, but leave motion arrows off for a clearer first view.
  const defaultLayerState = {
    'l-convergent': true,
    'l-divergent': true,
    'l-transform': true,
    'l-earthquakes': true,
    'l-vectors': false,
  };
  Object.entries(defaultLayerState).forEach(([id, checked]) => {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  });
  updateMapLayers();
  fetchRealEarthquakeData();

  // Layer checkbox listeners
  document.querySelectorAll('.map-sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateMapLayers);
  });

  document.getElementById('mag-filter')?.addEventListener('input', event => {
    applyMagnitudeFilter(Number(event.target.value));
  });

  // Map type button listeners
  document.querySelectorAll('[data-map-type]').forEach(btn => {
    btn.addEventListener('click', () => switchMapType(btn.getAttribute('data-map-type')));
  });

  // Region zoom button listeners
  document.querySelectorAll('[data-region]').forEach(btn => {
    btn.addEventListener('click', () => zoomToRegion(btn.getAttribute('data-region')));
  });

  document.getElementById('btn-plate-guide')?.addEventListener('click', () => {
    activatePlateGuideView();
    showInAppNotification(
      'Plate guide view',
      'Switched to the crust/relief basemap, emphasized plate boundaries, and zoomed to the Ring of Fire.',
      'info',
    );
  });

  // Dark mode toggle
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.classList.toggle('dark');
      darkModeToggle.textContent = isDark ? '☀️' : '🌙';
      localStorage.setItem('darkMode', isDark ? 'true' : 'false');
      // Re-render charts from cached data for updated theme colors
      redrawCachedCharts();
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

  const TONE_CLASS_NAMES = ['tone-muted', 'tone-good', 'tone-warn', 'tone-alert'];

  function applyToneClass(element, tone = 'muted') {
    if (!element) return;
    TONE_CLASS_NAMES.forEach(className => element.classList.remove(className));
    element.classList.add(`tone-${tone}`);
  }

  function toneColor(tone = 'muted') {
    if (tone === 'good') return '#4CAF50';
    if (tone === 'warn') return '#FF9800';
    if (tone === 'alert') return '#F44336';
    return 'var(--color-text-secondary)';
  }

  function setArchiveButtonsDisabled(disabled) {
    ['btn-load-foundation', 'btn-load-historical', 'btn-load-storm-archive'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
  }

  function describeFoundationState(meta) {
    if (meta.historicalEarthquakesLoaded && meta.stormArchiveLoaded) {
      return {
        label: '✓ Full archive foundation loaded',
        note: 'Both archives are present. Remaining caution should come from the lag scan shape and corpus behavior, not from missing history.',
        tone: 'good',
      };
    }

    if (meta.stormArchivePartial && meta.historicalEarthquakesLoaded) {
      return {
        label: '⚠ Partial foundation (storm archive incomplete)',
        note: 'Earthquake history is loaded, but the NOAA storm archive had day-fetch failures. Interpret results conservatively until the storm archive is complete.',
        tone: 'warn',
      };
    }

    if (meta.historicalEarthquakesLoaded || meta.stormArchiveLoaded || meta.stormArchivePartial) {
      return {
        label: '⚠ Partial archive foundation',
        note: 'One archive is present but the other is still missing or incomplete. Useful for exploration, not a strong real-data read.',
        tone: 'warn',
      };
    }

    return {
      label: '⏳ Seed/live only',
      note: 'You are still on seed/live data. Good for setup and null reproduction, but not for a powered historical interpretation.',
      tone: 'muted',
    };
  }

  function buildPredictionLabel(interpretation, prediction) {
    const windowActive = Boolean(prediction?.windowActive);

    switch (interpretation?.state) {
      case 'insufficient-data':
        return windowActive
          ? '🟡 Active 25–30d window, but the corpus is underpowered'
          : '⚪ Background-rate only — corpus is underpowered';
      case 'null-consistent':
        return windowActive
          ? '🟢 Active window on a null-like corpus'
          : '🟢 Background rate on a null-like corpus';
      case 'off-target-peak':
        return windowActive
          ? '🟠 Active window, but strongest lag is elsewhere'
          : '🟠 Strongest lag is elsewhere, not 27–28d';
      case 'weak-27-signal':
        return windowActive
          ? '🟠 Active window with only a weak 25–30d bump'
          : '🟠 Weak 25–30d bump in the current corpus';
      case 'candidate-27-signal':
        return windowActive
          ? '🔴 Candidate 25–30d window is active'
          : '🔴 Candidate 25–30d pattern in the corpus';
      default:
        return windowActive
          ? `🔴 Active: ${prediction?.triggeringStorms ?? 0} storm(s) 25–30 days ago`
          : '🟢 Background rate — no triggering storm in window';
    }
  }

  /** Render prediction results into the Correlation tab UI. */
  async function updatePredictionUI() {
    const statusEl = document.getElementById('data-load-status');
    if (statusEl) statusEl.textContent = 'Running analysis…';
    try {
      const { scanResults, prediction, interpretation, meta } = await runFullAnalysis();

      // Data foundation status
      const eqStatusEl = document.getElementById('data-eq-status');
      const stormArchiveStatusEl = document.getElementById('data-storm-archive-status');
      const stormStatusEl = document.getElementById('data-storm-status');
      const spanEl = document.getElementById('data-span');
      const foundationStateEl = document.getElementById('data-foundation-state');
      const foundationNoteEl = document.getElementById('data-foundation-note');
      if (eqStatusEl) eqStatusEl.textContent = meta.historicalLoaded
        ? `✓ ${meta.eqCount.toLocaleString()} events`
        : `${meta.eqCount} events (session only)`;
      if (stormArchiveStatusEl) {
        if (meta.stormArchiveLoaded) {
          stormArchiveStatusEl.textContent = `✓ ${meta.stormCount.toLocaleString()} normalized intervals`;
        } else if (meta.stormArchivePartial) {
          stormArchiveStatusEl.textContent = `~ ${meta.stormCount.toLocaleString()} intervals (partial NOAA archive)`;
        } else {
          stormArchiveStatusEl.textContent = `${meta.stormCount} intervals (seed/live only)`;
        }
      }
      if (stormStatusEl) stormStatusEl.textContent = meta.stormSeedLoaded
        ? `✓ Seeded fallback available`
        : 'Not seeded';
      if (spanEl) spanEl.textContent = prediction.dataPoints.dataSpanDays > 0
        ? `${prediction.dataPoints.dataSpanDays} days`
        : '—';
      const foundationState = describeFoundationState(meta);
      if (foundationStateEl) {
        foundationStateEl.textContent = foundationState.label;
        foundationStateEl.style.color = toneColor(foundationState.tone);
      }
      if (foundationNoteEl) {
        foundationNoteEl.textContent = foundationState.note;
        applyToneClass(foundationNoteEl, foundationState.tone);
      }

      // Lag scan chart
      drawLagScanChart(scanResults);

      // Lag scan verdict + interpretation details
      const verdictEl = document.getElementById('lag-scan-verdict');
      const evidenceStateEl = document.getElementById('lag-evidence-state');
      const evidenceTargetEl = document.getElementById('lag-evidence-target');
      const evidencePeakEl = document.getElementById('lag-evidence-peak');
      const evidenceCorpusEl = document.getElementById('lag-evidence-corpus');
      const evidenceWhyEl = document.getElementById('lag-evidence-why');
      const evidenceNoteEl = document.getElementById('lag-evidence-note');
      if (interpretation) {
        if (verdictEl) {
          verdictEl.textContent = interpretation.verdict;
          applyToneClass(verdictEl, interpretation.tone);
        }
        if (evidenceStateEl) {
          evidenceStateEl.textContent = interpretation.stateLabel;
          applyToneClass(evidenceStateEl, interpretation.tone);
        }
        if (evidenceTargetEl) {
          evidenceTargetEl.textContent =
            `${interpretation.targetPeak.lag}d at ${interpretation.targetPeak.eventRatio.toFixed(2)}× ` +
            `(rank #${interpretation.targetRank})`;
        }
        if (evidencePeakEl) {
          evidencePeakEl.textContent =
            `${interpretation.globalPeak.lag}d at ${interpretation.globalPeak.eventRatio.toFixed(2)}×`;
        }
        if (evidenceCorpusEl) {
          evidenceCorpusEl.textContent = interpretation.corpusText;
        }
        if (evidenceWhyEl) {
          evidenceWhyEl.textContent = `${interpretation.whyText} ${interpretation.powerText}`;
        }
        if (evidenceNoteEl) {
          evidenceNoteEl.textContent = interpretation.probabilityNote;
          applyToneClass(evidenceNoteEl, interpretation.tone);
        }
      }

      // Prediction card
      const probEl = document.getElementById('pred-probability');
      const labelEl = document.getElementById('pred-label');
      const confEl = document.getElementById('pred-confidence');
      const detailEl = document.getElementById('pred-detail');
      const probNoteEl = document.getElementById('pred-probability-note');

      if (probEl && prediction.probability !== null) {
        const pct = Math.round(prediction.probability * 100);
        probEl.textContent = `${pct}%`;
        probEl.style.color = toneColor(interpretation?.tone);
      }
      if (labelEl) {
        labelEl.textContent = buildPredictionLabel(interpretation, prediction);
      }
      if (confEl) {
        const confColors = { high: '#4CAF50', medium: '#FFC107', low: '#FF9800', insufficient: '#9E9E9E' };
        if (interpretation?.powerLevel === 'thin') {
          confEl.textContent = `${prediction.confidence} (underpowered)`;
          confEl.style.color = '#9E9E9E';
        } else if (interpretation?.powerLevel === 'basic') {
          confEl.textContent = `${prediction.confidence} (exploratory)`;
          confEl.style.color = '#FF9800';
        } else {
          confEl.textContent = prediction.confidence;
          confEl.style.color = confColors[prediction.confidence] || '#9E9E9E';
        }
      }
      if (detailEl) {
        detailEl.textContent =
          `Based on ${prediction.stormTrials} historical post-storm windows: ` +
          `${prediction.stormHits} had ≥1 M5+ event in the lag zone. ` +
          `Background P(M5+ / 5d) = ${Math.round(prediction.baseProbability * 100)}%. ` +
          `Corpus: ${prediction.dataPoints.storms} storms, ${prediction.dataPoints.earthquakes} earthquakes, ` +
          `${prediction.dataPoints.dataSpanDays} days. ${interpretation?.powerText ?? ''}`;
      }
      if (probNoteEl) {
        probNoteEl.textContent = interpretation?.probabilityNote
          ?? 'The percentage card is descriptive only until the lag scan and corpus quality say otherwise.';
        applyToneClass(probNoteEl, interpretation?.tone ?? 'muted');
      }

      if (statusEl) statusEl.textContent = `Last run: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.warn('Prediction analysis failed:', err);
      if (statusEl) statusEl.textContent = `Analysis error: ${err.message}`;
    }
  }

  // Seed storm data and run initial analysis silently on first load
  seedHistoricalStorms().then(() => updatePredictionUI()).catch(() => {});

  // "Load Full Research Foundation" button
  document.getElementById('btn-load-foundation')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('data-load-status');
    setArchiveButtonsDisabled(true);

    try {
      if (statusEl) {
        statusEl.textContent = 'Building the full research foundation: NOAA storm archive first, then USGS earthquake history…';
      }

      const stormResult = await loadHistoricalStormArchive({
        onProgress(progress) {
          if (!statusEl) return;
          statusEl.textContent =
            `Foundation step 1/2 — NOAA storm archive ${progress.percent}% ` +
            `(${progress.processedDays}/${progress.totalDays} days, ${progress.foundStorms} storm intervals found` +
            `${progress.failedDays ? `, ${progress.failedDays} day failures` : ''}).`;
        },
      });

      if (statusEl) {
        statusEl.textContent = stormResult.loaded
          ? 'Foundation step 2/2 — loading USGS earthquake history…'
          : 'NOAA storm archive already present. Loading USGS earthquake history…';
      }

      const earthquakeResult = await loadHistoricalUSGS();
      const summaryParts = [];

      if (stormResult.loaded) {
        summaryParts.push(stormResult.partial
          ? `storm archive partial: ${stormResult.count.toLocaleString()} intervals, ${stormResult.failedDays} day failures`
          : `storm archive: ${stormResult.count.toLocaleString()} intervals`);
      } else {
        summaryParts.push('storm archive already loaded');
      }

      if (earthquakeResult.loaded) {
        summaryParts.push(`earthquake history: ${earthquakeResult.count.toLocaleString()} events`);
      } else {
        summaryParts.push('earthquake history already loaded');
      }

      if (statusEl) {
        statusEl.textContent = `${stormResult.partial ? '⚠' : '✓'} Foundation load finished — ${summaryParts.join(' • ')}. Running analysis…`;
      }

      await updatePredictionUI();

      showInAppNotification(
        'Research foundation updated',
        stormResult.partial
          ? 'Foundation loaded with a partial NOAA storm archive. The app will stay conservative until the storm archive is complete.'
          : 'Historical storm and earthquake archives are now available for a stronger real-data lag scan.',
        stormResult.partial ? 'warning' : 'success',
      );
    } catch (err) {
      console.warn('Full foundation load failed:', err);
      if (statusEl) {
        statusEl.textContent = `⚠ Foundation load failed: ${err.message}.`;
      }
    } finally {
      setArchiveButtonsDisabled(false);
    }
  });

  // "Load 2-Year History" button
  document.getElementById('btn-load-historical')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-load-historical');
    const statusEl = document.getElementById('data-load-status');
    setArchiveButtonsDisabled(true);
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
      setArchiveButtonsDisabled(false);
    }
  });

  // "Load 2-Year Storm Archive" button
  document.getElementById('btn-load-storm-archive')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-load-storm-archive');
    const statusEl = document.getElementById('data-load-status');
    setArchiveButtonsDisabled(true);
    if (statusEl) statusEl.textContent = 'Fetching NOAA/NCEI daily geomagnetic indices (dayind) for the past 2 years…';

    try {
      const result = await loadHistoricalStormArchive({
        onProgress(progress) {
          if (!statusEl) return;
          statusEl.textContent =
            `Loading NOAA storm archive… ${progress.percent}% ` +
            `(${progress.processedDays}/${progress.totalDays} days, ${progress.foundStorms} storm intervals found` +
            `${progress.failedDays ? `, ${progress.failedDays} day failures` : ''}).`;
        },
      });

      if (result.loaded) {
        if (statusEl) {
          statusEl.textContent = result.partial
            ? `⚠ Partially loaded ${result.count.toLocaleString()} historical storm intervals from NOAA (${result.failedDays} day fetches failed). Running analysis conservatively…`
            : `✓ Loaded ${result.count.toLocaleString()} historical storm intervals from NOAA. Running analysis…`;
        }
        await updatePredictionUI();
      } else {
        if (statusEl) statusEl.textContent = '✓ Historical NOAA storm archive already loaded. Running analysis…';
        await updatePredictionUI();
      }
    } catch (err) {
      console.warn('Historical storm archive load failed:', err);
      if (statusEl) statusEl.textContent = `⚠ Storm archive load failed: ${err.message}.`;
    } finally {
      setArchiveButtonsDisabled(false);
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

  // ---- Resize handler: invalidate the active map viewport ----
  window.addEventListener('resize', () => {
    if (document.getElementById('map-tab')?.classList.contains('active')) {
      resizeMapViewport();
    }
  });
});
