// ===== SPACE WEATHER MODULE =====
import { NOAA_APIS } from './config.js';
import {
  spaceWeatherCache,
  alertSettings,
  addHistoricalStorm,
  setSolarWindHistory,
  setKpHistory,
  solarWindHistory,
  kpHistory,
  setConnectionStatus,
} from './store.js';
import { getKpStatus, detectFlares, setText, setStyle, fetchWithRetry } from './utils.js';
import { sendNotification, showInAppNotification } from './notifications.js';
import { drawRealSolarWindChart, drawRealKpChart } from './charts.js';
import { addStorm } from './db.js';
import { errorLogger } from './error-logger.js';

const SPACE_WEATHER_STORAGE_KEY = 'space-earth-monitor-space-weather-last-good';
const FEED_STATE_COLORS = {
  live: '#4CAF50',
  degraded: '#FF9800',
  stale: '#FF9800',
  unavailable: '#F44336',
  loading: 'var(--color-text-secondary)',
};

function buildFeedStatus(state, source, message, updatedAt = 0) {
  return { state, source, message, updatedAt };
}

function defaultFeedStatuses() {
  return {
    solarWind: buildFeedStatus('loading', 'live', 'Checking NOAA solar-wind feeds…'),
    kpIndex: buildFeedStatus('loading', 'live', 'Checking NOAA Kp feeds…'),
    xrayFlux: buildFeedStatus('loading', 'live', 'Checking NOAA X-ray feed…'),
  };
}

function ensureFeedStatuses() {
  if (!spaceWeatherCache.feedStatus) {
    spaceWeatherCache.feedStatus = defaultFeedStatuses();
    return;
  }

  const defaults = defaultFeedStatuses();
  Object.entries(defaults).forEach(([key, status]) => {
    if (!spaceWeatherCache.feedStatus[key]) {
      spaceWeatherCache.feedStatus[key] = status;
    }
  });
}

function setFeedStatus(feedKey, state, source, message, updatedAt = 0) {
  ensureFeedStatuses();
  spaceWeatherCache.feedStatus[feedKey] = buildFeedStatus(state, source, message, updatedAt);
}

function feedColor(state = 'loading') {
  return FEED_STATE_COLORS[state] || FEED_STATE_COLORS.loading;
}

function toTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatClockTime(value) {
  const timestamp = toTimestampMs(value);
  return timestamp ? new Date(timestamp).toLocaleTimeString() : '—';
}

function formatRelativeAge(value) {
  const timestamp = toTimestampMs(value);
  if (!timestamp) return '';

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m old`;

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m old` : `${hours}h old`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d old`;
}

function formatCachedMessage(label, timestamp) {
  const timeText = formatClockTime(timestamp);
  const ageText = formatRelativeAge(timestamp);
  return ageText
    ? `Showing cached ${label} from ${timeText} (${ageText})`
    : `Showing cached ${label}`;
}

function parseNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function setMetricText(id, value, formatter, fallback = '—') {
  if (Number.isFinite(value)) {
    setText(id, formatter(value));
    return;
  }

  setText(id, fallback);
}

function renderFeedMessage(id, status) {
  setText(id, status?.message || '');
  setStyle(id, 'color', feedColor(status?.state));
}

function renderSpaceWeatherSummary() {
  ensureFeedStatuses();

  const statuses = Object.values(spaceWeatherCache.feedStatus);
  const liveCount = statuses.filter(status => status.state === 'live').length;
  const degradedCount = statuses.filter(status => status.state === 'degraded').length;
  const staleCount = statuses.filter(status => status.state === 'stale').length;
  const unavailableCount = statuses.filter(status => status.state === 'unavailable').length;
  const loadingCount = statuses.filter(status => status.state === 'loading').length;

  let text = 'Checking NOAA feeds…';
  let color = FEED_STATE_COLORS.loading;
  let overallState = 'loading';
  let connectionState = 'online';

  if (loadingCount === statuses.length) {
    text = 'Checking NOAA feeds…';
  } else if (liveCount === statuses.length) {
    text = 'All NOAA space-weather feeds are live.';
    color = FEED_STATE_COLORS.live;
    overallState = 'live';
    connectionState = 'online';
  } else if (unavailableCount === statuses.length) {
    text = 'All NOAA space-weather feeds are unavailable right now.';
    color = FEED_STATE_COLORS.unavailable;
    overallState = 'unavailable';
    connectionState = 'offline';
  } else {
    const parts = [];
    if (liveCount) parts.push(`${liveCount} live`);
    if (degradedCount) parts.push(`${degradedCount} degraded`);
    if (staleCount) parts.push(`${staleCount} cached`);
    if (unavailableCount) parts.push(`${unavailableCount} unavailable`);

    text = `Partial NOAA update: ${parts.join(' • ')}.`;
    color = unavailableCount > 0 ? FEED_STATE_COLORS.unavailable : FEED_STATE_COLORS.degraded;
    overallState = unavailableCount > 0 ? 'unavailable' : 'partial';
    connectionState = unavailableCount > 0 ? 'degraded' : 'online';
  }

  setText('space-weather-summary', text);
  setStyle('space-weather-summary', 'color', color);
  setConnectionStatus(connectionState);

  return { text, color, overallState, connectionState };
}

function readCachedSpaceWeatherSnapshot() {
  try {
    const raw = localStorage.getItem(SPACE_WEATHER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to read cached space-weather snapshot:', error);
    return null;
  }
}

function persistSpaceWeatherSnapshot() {
  try {
    const existing = readCachedSpaceWeatherSnapshot() || {};
    const nextSnapshot = {
      ...existing,
      savedAt: Date.now(),
      solarWind: spaceWeatherCache.solarWind,
      kpIndex: spaceWeatherCache.kpIndex,
      xrayFlux: Array.isArray(spaceWeatherCache.xrayFlux) ? spaceWeatherCache.xrayFlux : [],
      solarWindHistory,
      kpHistory,
    };

    localStorage.setItem(SPACE_WEATHER_STORAGE_KEY, JSON.stringify(nextSnapshot));
  } catch (error) {
    console.warn('Failed to cache space-weather snapshot:', error);
  }
}

function restoreCachedSolarWind(snapshot) {
  if (!snapshot?.solarWind) {
    return false;
  }

  spaceWeatherCache.solarWind = snapshot.solarWind;
  setSolarWindHistory(Array.isArray(snapshot.solarWindHistory) ? snapshot.solarWindHistory : []);

  const timestamp = snapshot.solarWind.timestamp || snapshot.savedAt;
  setFeedStatus('solarWind', 'stale', 'cache', formatCachedMessage('solar-wind data', timestamp), timestamp);
  return true;
}

function restoreCachedKp(snapshot) {
  if (!snapshot?.kpIndex && !Array.isArray(snapshot?.kpHistory)) {
    return false;
  }

  if (snapshot.kpIndex) {
    spaceWeatherCache.kpIndex = snapshot.kpIndex;
  }
  setKpHistory(Array.isArray(snapshot.kpHistory) ? snapshot.kpHistory : []);

  const timestamp = snapshot.kpIndex?.timestamp || snapshot.savedAt;
  const hasCachedData = Boolean(snapshot.kpIndex)
    || (Array.isArray(snapshot.kpHistory) && snapshot.kpHistory.length > 0);

  if (hasCachedData) {
    setFeedStatus('kpIndex', 'stale', 'cache', formatCachedMessage('Kp data', timestamp), timestamp);
  }

  return hasCachedData;
}

function restoreCachedXray(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.xrayFlux)) {
    return false;
  }

  spaceWeatherCache.xrayFlux = snapshot.xrayFlux;
  const latestFlareTime = snapshot.xrayFlux.at(-1)?.time || snapshot.savedAt;
  setFeedStatus('xrayFlux', 'stale', 'cache', formatCachedMessage('GOES flare data', latestFlareTime), latestFlareTime);
  return true;
}

async function fetchJsonFeed(url, { description, minimumItems = 1 } = {}) {
  if (!url) {
    return {
      ok: false,
      disabled: true,
      data: null,
      error: new Error('Feed disabled in this runtime'),
    };
  }

  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const itemCount = Array.isArray(data) ? data.length : 0;
    if (itemCount < minimumItems) {
      throw new Error(itemCount === 0 ? 'Feed returned no records' : `Feed returned ${itemCount} record(s)`);
    }

    return {
      ok: true,
      disabled: false,
      data,
    };
  } catch (error) {
    await errorLogger.logError(error, {
      endpoint: url,
      type: 'upstream_failure',
      severity: 'non_critical',
      description,
    });

    return {
      ok: false,
      disabled: false,
      data: null,
      error,
    };
  }
}

function renderFlareList(flares = [], emptyMessage = 'No recent flares') {
  const flareList = document.getElementById('flare-list');
  if (!flareList) return;

  flareList.replaceChildren();

  const recentFlares = flares.slice(-5).reverse();
  if (!recentFlares.length) {
    flareList.textContent = emptyMessage;
    return;
  }

  recentFlares.forEach(flare => {
    const entry = document.createElement('div');
    entry.className = 'flare-entry';

    const flareClass = document.createElement('span');
    flareClass.className = 'flare-class';
    flareClass.textContent = `${flare.class}${flare.level}`;

    const flareTime = document.createElement('span');
    flareTime.textContent = new Date(flare.time).toLocaleString();

    entry.append(flareClass, flareTime);
    flareList.appendChild(entry);
  });
}

// ===== FETCH NOAA DATA =====
/**
 * Fetch all relevant NOAA space weather feeds concurrently and update the UI.
 * Degrades honestly on partial failure and may reuse cached client-side data.
 * @returns {Promise<{text:string,color:string,overallState:string,connectionState:string}>}
 */
export async function fetchNOAASpaceWeather() {
  ensureFeedStatuses();

  setFeedStatus('solarWind', 'loading', 'live', 'Checking NOAA solar-wind feeds…');
  setFeedStatus('kpIndex', 'loading', 'live', 'Checking NOAA Kp feeds…');
  setFeedStatus('xrayFlux', 'loading', 'live', 'Checking NOAA X-ray feed…');
  updateSpaceWeatherDisplay();

  const cachedSnapshot = readCachedSpaceWeatherSnapshot();

  try {
    const [magResult, plasmaResult, kpResult, kpHistoryResult, xrayResult] = await Promise.all([
      fetchJsonFeed(NOAA_APIS.solarWindMag, {
        description: 'NOAA magnetometer data unavailable',
        minimumItems: 1,
      }),
      fetchJsonFeed(NOAA_APIS.solarWindPlasma, {
        description: 'NOAA plasma data unavailable',
        minimumItems: 1,
      }),
      fetchJsonFeed(NOAA_APIS.kpIndex, {
        description: 'NOAA real-time Kp index unavailable',
        minimumItems: 1,
      }),
      fetchJsonFeed(NOAA_APIS.kpHistory, {
        description: 'NOAA Kp history unavailable',
        minimumItems: 2,
      }),
      fetchJsonFeed(NOAA_APIS.xrayFlux, {
        description: 'NOAA GOES X-ray data unavailable',
        minimumItems: 1,
      }),
    ]);

    // ---- Solar wind (composite card: magnetometer + plasma) ----
    const magData = Array.isArray(magResult.data) ? magResult.data : [];
    const plasmaData = Array.isArray(plasmaResult.data) ? plasmaResult.data : [];
    const latestMag = magData.length > 0 ? magData[magData.length - 1] : null;
    const latestPlasma = plasmaData.length > 0 ? plasmaData[plasmaData.length - 1] : null;

    if (latestMag || latestPlasma) {
      spaceWeatherCache.solarWind = {
        speed: parseNumber(latestPlasma?.speed),
        density: parseNumber(latestPlasma?.density),
        bt: parseNumber(latestMag?.bt),
        bz: parseNumber(latestMag?.bz_gsm),
        timestamp: latestPlasma?.time_tag || latestMag?.time_tag || new Date().toISOString(),
      };

      const speedHistory = plasmaData
        .slice(-60)
        .map(point => ({
          speed: parseNumber(point.speed),
          time: point.time_tag,
        }))
        .filter(point => Number.isFinite(point.speed));

      setSolarWindHistory(speedHistory);

      const solarWindUpdatedAt = latestPlasma?.time_tag || latestMag?.time_tag;
      if (latestMag && latestPlasma) {
        setFeedStatus('solarWind', 'live', 'live', 'Live NOAA magnetometer + plasma', solarWindUpdatedAt);
      } else if (latestMag) {
        setFeedStatus(
          'solarWind',
          'degraded',
          'live',
          'Magnetometer live; plasma unavailable — speed/density hidden',
          solarWindUpdatedAt,
        );
      } else {
        setFeedStatus(
          'solarWind',
          'degraded',
          'live',
          'Plasma live; magnetometer unavailable — Bt/Bz hidden',
          solarWindUpdatedAt,
        );
      }
    } else if (!restoreCachedSolarWind(cachedSnapshot)) {
      spaceWeatherCache.solarWind = null;
      setSolarWindHistory([]);
      const solarWindReason = plasmaResult.disabled
        ? 'Solar-wind plasma feed is disabled outside proxy mode'
        : 'NOAA solar-wind feeds unavailable — no cached data';
      setFeedStatus('solarWind', 'unavailable', 'live', solarWindReason);
    }

    // ---- Kp index + history ----
    const kpData = Array.isArray(kpResult.data) ? kpResult.data : [];
    const kp3DayData = Array.isArray(kpHistoryResult.data) ? kpHistoryResult.data : [];
    const latestRealtimeKp = kpData.length > 0 ? kpData[kpData.length - 1] : null;
    const kpHist = kp3DayData.length > 1
      ? kp3DayData.slice(1)
          .map(row => ({ kp: parseNumber(row[1]), time: row[0] }))
          .filter(point => Number.isFinite(point.kp))
      : [];

    setKpHistory(kpHist);

    if (latestRealtimeKp || kpHist.length > 0) {
      const fallbackKp = kpHist.length > 0 ? kpHist[kpHist.length - 1] : null;
      const kpValue = latestRealtimeKp
        ? parseNumber(latestRealtimeKp.kp_index ?? latestRealtimeKp.kp)
        : fallbackKp?.kp ?? null;
      const kpTimestamp = latestRealtimeKp?.time_tag || fallbackKp?.time || 0;

      spaceWeatherCache.kpIndex = Number.isFinite(kpValue)
        ? {
            value: kpValue,
            status: getKpStatus(kpValue),
            timestamp: kpTimestamp,
          }
        : null;

      if (Number.isFinite(kpValue) && kpValue >= 5 && latestRealtimeKp) {
        const storm = { kp: kpValue, date: new Date(latestRealtimeKp.time_tag) };
        addHistoricalStorm(storm);
        addStorm(storm).catch(err => console.warn('Failed to save storm to DB:', err));
      }

      if (latestRealtimeKp && kpHist.length > 0) {
        setFeedStatus('kpIndex', 'live', 'live', 'Live 1-minute Kp + 3-day NOAA history', kpTimestamp);
      } else if (latestRealtimeKp) {
        setFeedStatus('kpIndex', 'degraded', 'live', 'Live 1-minute Kp; 3-day history unavailable', kpTimestamp);
      } else {
        setFeedStatus('kpIndex', 'degraded', 'history', 'Realtime Kp unavailable — using latest 3-day NOAA product', kpTimestamp);
      }
    } else if (!restoreCachedKp(cachedSnapshot)) {
      spaceWeatherCache.kpIndex = null;
      setKpHistory([]);
      setFeedStatus('kpIndex', 'unavailable', 'live', 'NOAA Kp feeds unavailable — no cached data');
    }

    // ---- X-ray flux / solar flares ----
    const xrayData = Array.isArray(xrayResult.data) ? xrayResult.data : [];
    if (xrayData.length > 0) {
      spaceWeatherCache.xrayFlux = detectFlares(xrayData);
      const xrayUpdatedAt = xrayData[xrayData.length - 1]?.time_tag || 0;
      setFeedStatus('xrayFlux', 'live', 'live', 'Live GOES X-ray flux', xrayUpdatedAt);
    } else if (!restoreCachedXray(cachedSnapshot)) {
      spaceWeatherCache.xrayFlux = null;
      setFeedStatus('xrayFlux', 'unavailable', 'live', 'GOES X-ray feed unavailable — no cached data');
    }

    const feedTimestamps = Object.values(spaceWeatherCache.feedStatus)
      .map(status => toTimestampMs(status.updatedAt))
      .filter(Boolean);
    spaceWeatherCache.lastUpdate = feedTimestamps.length > 0 ? Math.max(...feedTimestamps) : 0;

    const hasFreshData = Object.values(spaceWeatherCache.feedStatus)
      .some(status => status.state === 'live' || status.state === 'degraded');
    if (hasFreshData) {
      persistSpaceWeatherSnapshot();
    }

    updateSpaceWeatherDisplay();
    checkSpaceWeatherAlerts();
    return renderSpaceWeatherSummary();
  } catch (error) {
    console.warn('Unexpected space-weather update failure:', error);

    if (!restoreCachedSolarWind(cachedSnapshot)) {
      spaceWeatherCache.solarWind = null;
      setSolarWindHistory([]);
      setFeedStatus('solarWind', 'unavailable', 'live', 'NOAA solar-wind feeds unavailable — no cached data');
    }

    if (!restoreCachedKp(cachedSnapshot)) {
      spaceWeatherCache.kpIndex = null;
      setKpHistory([]);
      setFeedStatus('kpIndex', 'unavailable', 'live', 'NOAA Kp feeds unavailable — no cached data');
    }

    if (!restoreCachedXray(cachedSnapshot)) {
      spaceWeatherCache.xrayFlux = null;
      setFeedStatus('xrayFlux', 'unavailable', 'live', 'GOES X-ray feed unavailable — no cached data');
    }

    const feedTimestamps = Object.values(spaceWeatherCache.feedStatus)
      .map(status => toTimestampMs(status.updatedAt))
      .filter(Boolean);
    spaceWeatherCache.lastUpdate = feedTimestamps.length > 0 ? Math.max(...feedTimestamps) : 0;

    updateSpaceWeatherDisplay();
    return renderSpaceWeatherSummary();
  }
}

// ===== DISPLAY UPDATE =====
/** Populate all space weather UI elements from cached data. */
export function updateSpaceWeatherDisplay() {
  ensureFeedStatuses();

  const sw = spaceWeatherCache.solarWind;
  const kp = spaceWeatherCache.kpIndex;
  const solarWindStatus = spaceWeatherCache.feedStatus.solarWind;
  const kpStatus = spaceWeatherCache.feedStatus.kpIndex;
  const xrayStatus = spaceWeatherCache.feedStatus.xrayFlux;

  renderFeedMessage('solar-wind-source', solarWindStatus);
  renderFeedMessage('kp-source', kpStatus);
  renderFeedMessage('flare-source', xrayStatus);

  if (sw) {
    setMetricText('solar-wind-speed', sw.speed, value => Math.round(value));
    setMetricText('solar-wind-density', sw.density, value => value.toFixed(1));
    setMetricText('solar-wind-bt', sw.bt, value => value.toFixed(1));
    setMetricText('solar-wind-bz', sw.bz, value => value.toFixed(1));

    const bzColor = Number.isFinite(sw.bz)
      ? (sw.bz < -5 ? '#F44336' : sw.bz < 0 ? '#FF9800' : '#4CAF50')
      : 'var(--color-text-secondary)';
    setStyle('solar-wind-bz', 'color', bzColor);

    const prefix = solarWindStatus.state === 'stale' ? 'Cached ' : '';
    setText('space-last-update', `${prefix}${formatClockTime(sw.timestamp)}`);
  } else {
    setText('solar-wind-speed', '—');
    setText('solar-wind-density', '—');
    setText('solar-wind-bt', '—');
    setText('solar-wind-bz', '—');
    setStyle('solar-wind-bz', 'color', 'var(--color-text-secondary)');
    setText('space-last-update', solarWindStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
  }

  if (kp) {
    setMetricText('kp-value', kp.value, value => value.toFixed(1));
    setText('kp-status', kp.status);

    const kpColor = kp.value < 4 ? '#4CAF50'
      : kp.value < 5 ? '#FFC107'
      : kp.value < 7 ? '#FF9800'
      : '#F44336';
    setStyle('kp-status', 'color', kpColor);
  } else {
    setText('kp-value', '—');
    setText('kp-status', kpStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
    setStyle('kp-status', 'color', feedColor(kpStatus.state));
  }

  const flares = spaceWeatherCache.xrayFlux;
  if (Array.isArray(flares)) {
    setText('flare-count', flares.length);

    if (flares.length > 0) {
      const latest = flares[flares.length - 1];
      setText('latest-flare', `${latest.class}${latest.level}`);
      renderFlareList(flares);
    } else if (['live', 'degraded', 'stale'].includes(xrayStatus.state)) {
      setText('latest-flare', 'None');
      renderFlareList([], 'No recent flares detected');
    } else {
      setText('latest-flare', 'Unavailable');
      renderFlareList([], xrayStatus.message || 'GOES X-ray feed unavailable');
    }
  } else {
    setText('flare-count', '—');
    setText('latest-flare', xrayStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
    renderFlareList([], xrayStatus.message || 'GOES X-ray feed unavailable');
  }

  renderSpaceWeatherSummary();
  drawRealSolarWindChart(solarWindHistory);
  drawRealKpChart(kpHistory);
}

// ===== SPACE WEATHER ALERTS =====
/** Check cached data against user-configured thresholds and fire alerts. */
export function checkSpaceWeatherAlerts() {
  ensureFeedStatuses();

  const kp = spaceWeatherCache.kpIndex;
  const flares = spaceWeatherCache.xrayFlux;
  const kpStatus = spaceWeatherCache.feedStatus.kpIndex;
  const xrayStatus = spaceWeatherCache.feedStatus.xrayFlux;

  if (
    kp
    && !['stale', 'unavailable', 'loading'].includes(kpStatus.state)
    && kp.value >= alertSettings.kpThreshold
  ) {
    sendNotification(
      '⚠️ Geomagnetic Storm Alert',
      `Kp index: ${kp.value.toFixed(1)} (${kp.status})`,
    );
  }

  if (
    Array.isArray(flares)
    && !['stale', 'unavailable', 'loading'].includes(xrayStatus.state)
    && flares.length > 0
  ) {
    const threshold = alertSettings.solarFlareClass;
    const majorFlares = flares.filter(flare => {
      if (threshold === 'X') return flare.class === 'X';
      if (threshold === 'M') return flare.class === 'M' || flare.class === 'X';
      return true;
    });

    if (majorFlares.length > 0) {
      const flare = majorFlares[majorFlares.length - 1];
      const flareTime = new Date(flare.time);
      const twoHours = 2 * 60 * 60 * 1000;
      if (Date.now() - flareTime.getTime() < twoHours) {
        sendNotification(
          `☀️ ${flare.class}${flare.level} Solar Flare Detected`,
          `Detected at ${flareTime.toLocaleTimeString()}`,
        );
      }
    }
  }
}

/**
 * Refresh space weather by re-fetching from NOAA.
 * Called when the user clicks the "Refresh" button on the Space Weather tab.
 */
export async function refreshSpaceData() {
  showInAppNotification('Space Weather', 'Fetching latest NOAA data…', 'info');

  try {
    const summary = await fetchNOAASpaceWeather();
    if (summary.overallState === 'live') {
      showInAppNotification('Space Weather', 'NOAA feeds updated successfully.', 'success');
    } else {
      showInAppNotification('Space Weather', summary.text, 'warning');
    }
  } catch (error) {
    showInAppNotification('Space Weather', error?.message || 'Space-weather refresh failed.', 'warning');
  }
}
