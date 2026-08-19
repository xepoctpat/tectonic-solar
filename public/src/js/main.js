// ===== MAIN APPLICATION ENTRY POINT =====
import { errorLogger } from './error-logger.js';
import { initLayoutControls } from './layout.js';
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
import {
  checkEarthquakeAlerts,
  refreshEarthquakeData,
  updateSeismicDisplay,
} from './seismic.js';
import { initLocationSelector, fetchEnvironmentData } from './environment.js';
import { refreshCorrelationData, updateCorrelationWindow } from './correlation.js';
import { drawSpaceCharts, drawLagScanChart, redrawCachedCharts } from './charts.js';
import { loadSettings, syncSettingsForm, saveAlertSettings, toggleAlerts, resetSettings } from './settings.js';
import { requestNotificationPermission, initNotificationStatus, showInAppNotification } from './notifications.js';
import { REFRESH_INTERVALS } from './config.js';
import { setText } from './utils.js';
import { setDataModeChangeListener } from './store.js';
import { initDB } from './db.js';
import {
  seedHistoricalStorms,
  loadHistoricalUSGS,
  loadHistoricalStormArchive,
  loadHistoricalDstArchive,
  runFullAnalysis,
  STORM_DEFINITIONS,
} from './prediction.js';
import { checkResearchSidecarStatus, runBootstrapNullTest, runBValueTest } from './researchCompute.js';
import {
  buildAnalysisRunArtifact,
  downloadJson,
  downloadCsvString,
  stormsCsv,
  earthquakesCsv,
  lagScanCsv,
} from './export.mjs';

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

  let layoutRefreshTimer = null;
  function scheduleLayoutRefresh(delay = 100) {
    window.clearTimeout(layoutRefreshTimer);
    layoutRefreshTimer = window.setTimeout(() => {
      redrawCachedCharts();
      if (document.getElementById('map-tab')?.classList.contains('active')) {
        resizeMapViewport();
      }
    }, delay);
  }

  initLayoutControls({
    onLayoutChange: () => scheduleLayoutRefresh(130),
  });

  window.addEventListener('space-earth:tabchange', () => {
    scheduleLayoutRefresh(150);
  });

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
    'l-plate-regions': true,
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

  // Keep the precise map controls available without permanently consuming map width.
  const mapSidebarToggle = document.getElementById('map-sidebar-toggle');
  const mapSidebar = document.getElementById('map-sidebar');
  mapSidebarToggle?.addEventListener('click', () => {
    const collapsed = mapSidebar?.classList.toggle('is-collapsed') ?? false;
    mapSidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    mapSidebarToggle.textContent = collapsed ? '▶ Controls' : '◀ Controls';
    window.setTimeout(() => resizeMapViewport(), 180);
  });

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
      'Plate study view',
      'Switched to the neutral plate-study basemap, turned on plate regions plus boundaries, hid earthquake dots, and zoomed to the Ring of Fire.',
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

  // Initialize dark mode: stored preference wins; otherwise follow the system.
  const savedDarkMode = localStorage.getItem('darkMode');
  if (savedDarkMode === 'true') {
    document.documentElement.classList.add('dark');
    if (darkModeToggle) darkModeToggle.textContent = '☀️';
  } else if (savedDarkMode === 'false') {
    document.documentElement.classList.remove('dark');
    if (darkModeToggle) darkModeToggle.textContent = '🌙';
  } else if (savedDarkMode === null && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
    if (darkModeToggle) darkModeToggle.textContent = '☀️';
  }

  // ---- Async button busy states ----
  // Every manual refresh button disables + flags while its request runs, so
  // double-clicks cannot stack concurrent fetches.
  function withButtonBusy(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = '⏳ Working…';
      try {
        await handler();
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  }

  withButtonBusy('btn-refresh-eq', () => refreshEarthquakeData(fetchRealEarthquakeData));
  withButtonBusy('btn-refresh-seismic', () => refreshEarthquakeData(fetchRealEarthquakeData));
  withButtonBusy('btn-refresh-space', refreshSpaceData);
  withButtonBusy('btn-refresh-correlation', refreshCorrelationData);
  withButtonBusy('btn-refresh-env', () => {
    const select = document.getElementById('location-select');
    if (select) return fetchEnvironmentData(select.value);
  });

  // ---- Space weather ----
  drawSpaceCharts();
  fetchNOAASpaceWeather();
  initNotificationStatus();

  document.getElementById('btn-enable-notifications')?.addEventListener('click', requestNotificationPermission);

  // ---- Environment ----
  initLocationSelector();

  // ---- Correlation ----
  updateCorrelationWindow();
  // Populate the correlation timeline + stats on first load instead of leaving
  // a blank canvas until the user clicks Refresh. (Synchronous by design.)
  try { refreshCorrelationData(); } catch (_) {}

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
    ['btn-load-foundation', 'btn-load-historical', 'btn-load-storm-archive', 'btn-load-dst-archive'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
    const progress = document.getElementById('archive-progress');
    if (progress && !disabled) {
      progress.style.display = 'none';
      progress.value = 0;
    }
  }

  function setArchiveProgress(percent) {
    const progress = document.getElementById('archive-progress');
    if (!progress) return;
    progress.style.display = 'block';
    progress.value = Number.isFinite(percent) ? percent : 0;
  }

  let latestAnalysisResult = null;
  let latestBootstrapResult = null;
  let latestResearchSidecarStatus = {
    ok: false,
    online: false,
    reason: 'unknown',
    message: 'Python sidecar status not checked yet.',
  };

  function formatSidecarStatus(status) {
    if (status?.online) {
      return `Online at ${status.host || '127.0.0.1'}:${status.port || 5051}`;
    }

    if (status?.reason === 'proxy-required') {
      return 'Unavailable in static mode — use the Node proxy';
    }

    return 'Offline — activate solar-env and start scripts/research_sidecar.py';
  }

  function sidecarTone(status) {
    if (status?.online) return 'good';
    if (status?.reason === 'proxy-required') return 'muted';
    return 'warn';
  }

  function clearBootstrapResultUI(reasonText = 'Run the null test to compare the target-window bump against a shuffled-storm null distribution.') {
    const fields = {
      'bootstrap-permutations': '—',
      'bootstrap-observed': '—',
      'bootstrap-null95': '—',
      'bootstrap-pvalue': '—',
      'bootstrap-corpus': '—',
    };

    Object.entries(fields).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const verdictEl = document.getElementById('bootstrap-verdict');
    if (verdictEl) {
      verdictEl.textContent = 'Awaiting run…';
      applyToneClass(verdictEl, 'muted');
    }

    const detailEl = document.getElementById('bootstrap-detail');
    if (detailEl) detailEl.textContent = reasonText;

    const noteEl = document.getElementById('bootstrap-note');
    if (noteEl) {
      noteEl.textContent = 'This is deterministic statistical compute, not model-generated opinion. It uses the same lag-scan corpus currently in your browser and tests it against shuffled storm timings.';
      applyToneClass(noteEl, 'muted');
    }
  }

  async function refreshResearchSidecarStatus() {
    latestResearchSidecarStatus = await checkResearchSidecarStatus();

    const statusEl = document.getElementById('bootstrap-status');
    if (statusEl) {
      statusEl.textContent = latestResearchSidecarStatus.online
        ? 'Python sidecar online'
        : 'Python sidecar offline';
      applyToneClass(statusEl, sidecarTone(latestResearchSidecarStatus));
    }

    return latestResearchSidecarStatus;
  }

  function updateBootstrapResultUI(result) {
    const summary = result?.summary;
    if (!summary) {
      clearBootstrapResultUI();
      return;
    }

    const permutationsEl = document.getElementById('bootstrap-permutations');
    const observedEl = document.getElementById('bootstrap-observed');
    const null95El = document.getElementById('bootstrap-null95');
    const pValueEl = document.getElementById('bootstrap-pvalue');
    const corpusEl = document.getElementById('bootstrap-corpus');
    const verdictEl = document.getElementById('bootstrap-verdict');
    const detailEl = document.getElementById('bootstrap-detail');
    const noteEl = document.getElementById('bootstrap-note');

    if (permutationsEl) permutationsEl.textContent = summary.permutations.toLocaleString();
    if (observedEl) {
      observedEl.textContent = `${summary.observedTargetPeakLag}d at ${summary.observedTargetPeakRatio.toFixed(2)}× (rank #${summary.observedTargetRank})`;
    }
    if (null95El) null95El.textContent = `${summary.null95Percentile.toFixed(2)}×`;
    if (pValueEl) pValueEl.textContent = summary.empiricalPValue.toFixed(3);
    if (corpusEl) {
      corpusEl.textContent = `${summary.stormCount} storms • ${summary.earthquakeCount} earthquakes • ${summary.dataSpanDays} days`;
    }
    if (verdictEl) {
      verdictEl.textContent = summary.verdict;
      applyToneClass(verdictEl, summary.tone || 'muted');
    }
    if (detailEl) {
      detailEl.textContent = `${summary.whyText} Null mean ${summary.nullMean.toFixed(2)}×; 99th percentile ${summary.null99Percentile.toFixed(2)}×.`;
    }
    if (noteEl) {
      noteEl.textContent = summary.supportLevel === 'null-consistent'
        ? 'The observed target-window bump is currently consistent with a shuffled-storm null. That argues for restraint, not narrative escalation.'
        : 'A target-window bump can be interesting without being causal. Treat this as empirical calibration against a null, not proof of mechanism.';
      applyToneClass(noteEl, summary.tone || 'muted');
    }
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

  function updateResearchWorkflowUI(meta, prediction, interpretation) {
    const engineEl = document.getElementById('research-engine-status');
    const pythonEl = document.getElementById('research-python-status');
    const stormDefinitionEl = document.getElementById('research-storm-definition');
    const regionEl = document.getElementById('research-region-status');
    const nullEl = document.getElementById('research-null-status');
    const modelingEl = document.getElementById('research-modeling-status');
    const nextStepEl = document.getElementById('research-next-step');
    const noteEl = document.getElementById('research-workflow-note');

    const usingHistoricalCorpus = meta.historicalEarthquakesLoaded || meta.stormArchiveLoaded || meta.stormArchivePartial;
    const foundationReady = meta.historicalEarthquakesLoaded && meta.stormArchiveLoaded;

    if (engineEl) {
      engineEl.textContent = usingHistoricalCorpus
        ? 'Browser statistical engine + historical IndexedDB corpus'
        : 'Browser statistical engine on seed/live corpus';
    }

    if (pythonEl) {
      pythonEl.textContent = formatSidecarStatus(latestResearchSidecarStatus);
      pythonEl.style.color = toneColor(sidecarTone(latestResearchSidecarStatus));
    }

    if (stormDefinitionEl) {
      const activeDefinition = STORM_DEFINITIONS[meta.stormDefinition] || STORM_DEFINITIONS.kp;
      const corpusNote = meta.stormDefinition === 'kp'
        ? (meta.stormArchiveLoaded
          ? 'Kp≥5 with official NOAA archive'
          : meta.stormArchivePartial
            ? 'Kp≥5 with partial NOAA archive'
            : 'Kp≥5 seed/live only')
        : `${activeDefinition.label} — live-accumulated events (${meta.stormCount})`;
      stormDefinitionEl.textContent = corpusNote;
    }

    if (regionEl) {
      regionEl.textContent = meta.regionAvailable === false
        ? 'Stratification unavailable — PB2002 plate polygons failed to load'
        : `${meta.regionLabel} — ${meta.eqCount.toLocaleString()} of ${meta.rawEqCount.toLocaleString()} earthquakes`;
    }

    if (nullEl) {
      if (latestBootstrapResult?.summary) {
        nullEl.textContent = `Empirical p=${latestBootstrapResult.summary.empiricalPValue.toFixed(3)}; 95% null cutoff ${latestBootstrapResult.summary.null95Percentile.toFixed(2)}×`;
      } else if (interpretation?.state === 'null-consistent') {
        nullEl.textContent = 'Current corpus looks null-like; permutation calibration still pending';
      } else {
        nullEl.textContent = latestResearchSidecarStatus.online
          ? 'Python sidecar ready — bootstrap / permutation calibration not run yet'
          : 'Bootstrap / permutation calibration pending — Python sidecar offline';
      }
    }

    if (modelingEl) {
      modelingEl.textContent = foundationReady
        ? 'Empirical lag scan + conditional probability on archive-backed corpus'
        : 'Empirical lag scan + conditional probability, kept exploratory';
    }

    if (nextStepEl) {
      if (!latestResearchSidecarStatus.online) {
        nextStepEl.textContent = 'Start the local Python sidecar, then run the bootstrap null test through the interface.';
      } else if (!foundationReady) {
        nextStepEl.textContent = 'Load both archives and rerun the lag scan before leaning on the probability card.';
      } else if (!latestBootstrapResult?.summary) {
        nextStepEl.textContent = 'The sidecar is ready. Run the bootstrap null test to calibrate whether the 25–30 day bump rises above shuffled-storm behavior.';
      } else if (interpretation?.state === 'insufficient-data') {
        nextStepEl.textContent = 'The interface is wired, but the corpus is still thin for strong claims; the next honest step is bootstrap/permutation calibration.';
      } else if (interpretation?.state === 'null-consistent') {
        nextStepEl.textContent = 'The current interface read is null-like. The next useful step is regional stratification or permutation testing, not stronger rhetoric.';
      } else {
        nextStepEl.textContent = 'If heavier permutation or regional modeling is needed, add a local Python sidecar and proxy it through Node instead of moving the app runtime.';
      }
    }

    if (noteEl) {
      noteEl.textContent = latestResearchSidecarStatus.online
        ? 'The browser path and the local Python sidecar are both visible in the interface now. Deterministic bootstrap null testing is available without exposing Python directly to the browser.'
        : 'The interface now exposes the workflow honestly, including the missing Python sidecar. Start it locally if you want deterministic bootstrap null calibration.';
      applyToneClass(noteEl, latestResearchSidecarStatus.online ? 'good' : 'warn');
    }
  }

  async function runBootstrapCalibration() {
    const button = document.getElementById('btn-run-bootstrap');
    const activeDefinitionKey = document.getElementById('storm-definition-select')?.value || 'kp';

    if (activeDefinitionKey !== 'kp') {
      clearBootstrapResultUI(
        'The permutation null is calibrated for the Kp ≥ 5 baseline corpus only. Switch the storm definition back to Kp to run it.',
      );
      return;
    }

    if (!latestAnalysisResult) {
      await updatePredictionUI();
    }

    await refreshResearchSidecarStatus();
    if (!latestResearchSidecarStatus.online) {
      clearBootstrapResultUI('Python sidecar offline — the bootstrap null test needs the optional local research sidecar running. See the developer handoff for launch steps.');
      if (latestAnalysisResult) {
        updateResearchWorkflowUI(latestAnalysisResult.meta, latestAnalysisResult.prediction, latestAnalysisResult.interpretation);
      }
      return;
    }

    if (!latestAnalysisResult?.catalogs) {
      clearBootstrapResultUI('No analysis corpus is available yet. Run the browser analysis first.');
      return;
    }

    if (button) button.disabled = true;
    const statusEl = document.getElementById('bootstrap-status');
    if (statusEl) {
      statusEl.textContent = 'Running 1000× null test…';
      applyToneClass(statusEl, 'warn');
    }

    try {
      latestBootstrapResult = await runBootstrapNullTest({
        storms: latestAnalysisResult.catalogs.storms,
        earthquakes: latestAnalysisResult.catalogs.earthquakes,
        permutations: 1000,
        maxLag: 60,
        targetMinLag: 25,
        targetMaxLag: 30,
        randomSeed: 42,
      });

      updateBootstrapResultUI(latestBootstrapResult);
      updateResearchWorkflowUI(latestAnalysisResult.meta, latestAnalysisResult.prediction, latestAnalysisResult.interpretation);

      if (statusEl) {
        statusEl.textContent = 'Bootstrap null test complete';
        applyToneClass(statusEl, latestBootstrapResult.summary?.tone || 'good');
      }
    } catch (error) {
      console.warn('Bootstrap null calibration failed:', error);
      clearBootstrapResultUI(error?.message || 'Bootstrap null test failed.');
      if (statusEl) {
        statusEl.textContent = 'Bootstrap null test failed';
        applyToneClass(statusEl, 'warn');
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  /** Render prediction results into the Correlation tab UI. */
  async function updatePredictionUI() {
    const statusEl = document.getElementById('data-load-status');
    const runButton = document.getElementById('btn-run-analysis');
    const definitionKey = document.getElementById('storm-definition-select')?.value || 'kp';
    const definition = STORM_DEFINITIONS[definitionKey] || STORM_DEFINITIONS.kp;
    const regionKey = document.getElementById('region-select')?.value || 'global';

    if (runButton) {
      runButton.disabled = true;
      runButton.textContent = '⏳ Running…';
    }
    if (statusEl) statusEl.textContent = `Running analysis (${definition.label}${regionKey !== 'global' ? `, ${regionKey}` : ''})…`;
    try {
      await refreshResearchSidecarStatus();
      const analysis = await runFullAnalysis({ stormDefinition: definitionKey, region: regionKey });
      const { scanResults, prediction, interpretation, meta, catalogs } = analysis;
      latestAnalysisResult = analysis;
      latestBootstrapResult = null;
      clearBootstrapResultUI('Run the null test to compare the target-window bump against a shuffled-storm null distribution.');

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

      updateResearchWorkflowUI(meta, prediction, interpretation);

      // Lag scan chart
      drawLagScanChart(scanResults);

      // Lag scan verdict + interpretation details
      const verdictEl = document.getElementById('lag-scan-verdict');
      const evidenceStateEl = document.getElementById('lag-evidence-state');
      const evidenceTargetEl = document.getElementById('lag-evidence-target');
      const evidencePeakEl = document.getElementById('lag-evidence-peak');
      const evidenceCorpusEl = document.getElementById('lag-evidence-corpus');
      const evidenceControlEl = document.getElementById('lag-evidence-control');
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
        if (evidenceControlEl) {
          const controls = catalogs?.matchedControls;
          evidenceControlEl.textContent = controls
            ? `${controls.targetWindow} target: ${controls.targetCount} events vs ${controls.controlWindows.join(' / ')} controls: ${controls.controlCount.toFixed(1)} `
              + `(ratio ${controls.rateRatio.toFixed(2)}×; ${controls.trials} closed storms; paired +${controls.positivePairs} / −${controls.negativePairs} / ties ${controls.ties}). Descriptive contrast only; bootstrap calibration still required.`
            : 'Matched control comparison unavailable for this corpus.';
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

      if (!prediction) {
        // Region stratification unavailable: no honest numbers to show.
        if (probEl) probEl.textContent = '—';
        if (labelEl) labelEl.textContent = 'Stratification unavailable';
        if (confEl) confEl.textContent = '—';
        if (detailEl) detailEl.textContent = 'The PB2002 plate polygons failed to load, so the regional corpus cannot be built.';
        if (probNoteEl) {
          probNoteEl.textContent = 'No analysis is shown rather than falling back silently to the global corpus.';
          applyToneClass(probNoteEl, 'warn');
        }
      } else {
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
      }

      if (statusEl) {
        const regionSuffix = meta.region && meta.region !== 'global' ? ` · ${meta.regionLabel}` : '';
        statusEl.textContent = `Last run (${meta.stormDefinitionLabel ?? 'Kp ≥ 5'}${regionSuffix}): ${new Date().toLocaleTimeString()}`;
      }
    } catch (err) {
      console.warn('Prediction analysis failed:', err);
      if (statusEl) statusEl.textContent = `Analysis error: ${err.message}`;
    } finally {
      if (runButton) {
        runButton.disabled = false;
        runButton.textContent = '▶ Run Analysis';
      }
    }
  }

  // Storm definition selector — reruns the lag scan against the chosen driver catalog
  document.getElementById('storm-definition-select')?.addEventListener('change', () => {
    updatePredictionUI();
  });

  // Region selector — reruns the lag scan on the stratified earthquake catalog
  document.getElementById('region-select')?.addEventListener('change', () => {
    updatePredictionUI();
  });

  // ---- b-value computation (Python sidecar, same corpus as the lag scan) ----
  document.getElementById('btn-run-bvalue')?.addEventListener('click', async () => {
    const button = document.getElementById('btn-run-bvalue');
    const statusEl = document.getElementById('bvalue-status');
    const noteEl = document.getElementById('bvalue-note');

    if (!latestAnalysisResult) await updatePredictionUI();
    if (!latestAnalysisResult?.catalogs) {
      if (statusEl) statusEl.textContent = 'No corpus available';
      return;
    }

    await refreshResearchSidecarStatus();
    if (!latestResearchSidecarStatus.online) {
      if (statusEl) statusEl.textContent = 'Python sidecar offline';
      if (noteEl) noteEl.textContent = 'The b-value computation needs the optional local research sidecar running.';
      return;
    }

    if (button) button.disabled = true;
    if (statusEl) statusEl.textContent = 'Computing…';

    try {
      const result = await runBValueTest({
        earthquakes: latestAnalysisResult.catalogs.earthquakes,
        completeness: 5.0,
      });

      const regionSuffix = latestAnalysisResult.meta.region && latestAnalysisResult.meta.region !== 'global'
        ? ` (${latestAnalysisResult.meta.regionLabel})` : '';

      if (result.supportLevel === 'underpowered') {
        setText('bvalue-value', '—');
        setText('bvalue-error', '—');
        setText('bvalue-a', '—');
        setText('bvalue-count', String(result.count));
        if (statusEl) { statusEl.textContent = 'Underpowered'; applyToneClass(statusEl, 'warn'); }
        if (noteEl) noteEl.textContent = result.note || 'Not enough events above the completeness magnitude.';
        return;
      }

      setText('bvalue-value', `${result.bValue.toFixed(3)}${regionSuffix}`);
      setText('bvalue-error', `± ${result.bError.toFixed(3)}`);
      setText('bvalue-count', String(result.count));
      setText('bvalue-a', result.aValue.toFixed(2));
      if (statusEl) { statusEl.textContent = 'Complete'; applyToneClass(statusEl, 'good'); }
      if (noteEl) {
        noteEl.textContent = `Aki (1965) MLE at completeness M${result.completeness.toFixed(1)}; ${result.note}`;
      }
    } catch (error) {
      console.warn('b-value computation failed:', error);
      if (statusEl) { statusEl.textContent = 'Failed'; applyToneClass(statusEl, 'warn'); }
      if (noteEl) noteEl.textContent = error?.message || 'b-value computation failed.';
    } finally {
      if (button) button.disabled = false;
    }
  });

  // ---- Export buttons (reproducible run artifacts) ----
  document.getElementById('btn-export-run')?.addEventListener('click', async () => {
    if (!latestAnalysisResult) await updatePredictionUI();
    if (!latestAnalysisResult) {
      showInAppNotification('Export', 'No analysis result available to export yet.', 'warning');
      return;
    }
    const artifact = buildAnalysisRunArtifact(latestAnalysisResult, latestBootstrapResult, {
      exportedBy: 'Space-Earth Monitor Research Lab',
    });
    if (!artifact) {
      showInAppNotification('Export', 'Analysis result is incomplete; nothing to export.', 'warning');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJson(artifact, `tectonic-solar-run-${stamp}.json`);
    showInAppNotification('Export', 'Run artifact downloaded (catalogs, scan, interpretation, provenance).', 'success');
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    if (!latestAnalysisResult) await updatePredictionUI();
    if (!latestAnalysisResult?.catalogs) {
      showInAppNotification('Export', 'No catalogs available to export yet.', 'warning');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadCsvString(stormsCsv(latestAnalysisResult.catalogs.storms), `storms-${stamp}.csv`);
    setTimeout(() => downloadCsvString(earthquakesCsv(latestAnalysisResult.catalogs.earthquakes), `earthquakes-${stamp}.csv`), 350);
    setTimeout(() => downloadCsvString(lagScanCsv(latestAnalysisResult.scanResults), `lag-scan-${stamp}.csv`), 700);
    showInAppNotification('Export', 'Three CSVs downloading: storms, earthquakes, lag scan.', 'success');
  });

  // Seed storm data and run initial analysis silently on first load
  seedHistoricalStorms().then(() => updatePredictionUI()).catch(() => {});
  refreshResearchSidecarStatus().then(() => {
    if (latestAnalysisResult) {
      updateResearchWorkflowUI(latestAnalysisResult.meta, latestAnalysisResult.prediction, latestAnalysisResult.interpretation);
    }
  }).catch(() => {});

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
          setArchiveProgress(progress.percent);
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

  // "Load 2-Year Dst Archive" button
  document.getElementById('btn-load-dst-archive')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('data-load-status');
    const dstStatusEl = document.getElementById('data-dst-archive-status');
    setArchiveButtonsDisabled(true);
    if (statusEl) statusEl.textContent = 'Fetching monthly hourly Dst from Kyoto WDC (2 years)…';

    try {
      const result = await loadHistoricalDstArchive({
        onProgress(progress) {
          setArchiveProgress(progress.percent);
          if (!statusEl) return;
          statusEl.textContent =
            `Loading Kyoto Dst archive… ${progress.percent}% ` +
            `(${progress.processedMonths}/${progress.totalMonths} months, ${progress.samples.toLocaleString()} hourly samples` +
            `${progress.failedMonths ? `, ${progress.failedMonths} month failures` : ''}).`;
        },
      });

      if (result.loaded) {
        if (statusEl) {
          statusEl.textContent = result.partial
            ? `⚠ Partially loaded Dst archive (${result.failedMonths} months failed; Kyoto WDC is intermittently unavailable). ${result.storms} Dst storm events derived. Re-running analysis…`
            : `✓ Loaded ${result.samples.toLocaleString()} hourly Dst samples from Kyoto WDC; ${result.storms} Dst storm events derived. Re-running analysis…`;
        }
        await updatePredictionUI();
      } else if (statusEl) {
        statusEl.textContent = 'Dst archive already loaded. Re-running analysis…';
        await updatePredictionUI();
      }
    } catch (err) {
      console.warn('Dst archive load failed:', err);
      if (statusEl) statusEl.textContent = `⚠ Dst archive load failed: ${err.message}. Kyoto WDC is intermittently unavailable; retry later.`;
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
          setArchiveProgress(progress.percent);
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
  document.getElementById('btn-run-bootstrap')?.addEventListener('click', runBootstrapCalibration);

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
    scheduleLayoutRefresh(110);
  });
});
