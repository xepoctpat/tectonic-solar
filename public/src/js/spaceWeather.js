// ===== SPACE WEATHER MODULE =====
import { NOAA_APIS } from './config.js';
import {
  spaceWeatherCache,
  alertSettings,
  addHistoricalStorm,
  setSolarWindHistory,
  setKpHistory,
  setDstHistory,
  solarWindHistory,
  kpHistory,
  dstHistory,
  setConnectionStatus,
} from './store.js';
import { getKpStatus, detectFlares, setText, setStyle, fetchWithRetry } from './utils.js';
import { sendNotification, showInAppNotification } from './notifications.js';
import { drawRealSolarWindChart, drawRealKpChart, drawDstChart } from './charts.js';
import { addStorm, addDstSample, addDriverEvent } from './db.js';
import { errorLogger } from './error-logger.js';
import {
  dynamicPressure,
  electricFieldEy,
  classifyPressure,
  classifyEy,
  classifyDst,
  classifyProtons,
  detectDstStorms,
  detectPressurePulses,
  detectProtonEvents,
  PROTON_ENERGY_CHANNEL,
} from './solarMetrics.mjs';

const SPACE_WEATHER_STORAGE_KEY = 'space-earth-monitor-space-weather-last-good';
const DRIVER_INGEST_KEY = 'space-earth-driver-ingest-v1';
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
    dst: buildFeedStatus('loading', 'live', 'Checking NOAA/Kyoto Dst feed…'),
    protonFlux: buildFeedStatus('loading', 'live', 'Checking NOAA GOES proton feed…'),
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

// Merge 1-minute mag + plasma streams by time_tag, computing the derived
// coupling metrics per matched sample. Keeps the last 240 samples (~4 h).
export function buildCompositeSolarWindHistory(magData = [], plasmaData = []) {
  const plasmaByTime = new Map(plasmaData.map(point => [point.time_tag, point]));

  const merged = [];
  magData.forEach((magPoint) => {
    const plasma = plasmaByTime.get(magPoint.time_tag);
    const speed = parseNumber(plasma?.speed);
    const density = parseNumber(plasma?.density);
    const bt = parseNumber(magPoint.bt);
    const bz = parseNumber(magPoint.bz_gsm);
    merged.push({
      time: magPoint.time_tag,
      speed,
      density,
      bt,
      bz,
      pdyn: dynamicPressure(density, speed),
      ey: electricFieldEy(speed, bz),
    });
  });

  return merged.filter(sample => Number.isFinite(sample.speed) || Number.isFinite(sample.bt)).slice(-240);
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
      dst: spaceWeatherCache.dst,
      protonFlux: spaceWeatherCache.protonFlux,
      solarWindHistory,
      kpHistory,
      dstHistory,
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

function restoreCachedDst(snapshot) {
  if (!snapshot?.dst && !Array.isArray(snapshot?.dstHistory)) {
    return false;
  }

  if (snapshot.dst) {
    spaceWeatherCache.dst = snapshot.dst;
  }
  setDstHistory(Array.isArray(snapshot.dstHistory) ? snapshot.dstHistory : []);

  const timestamp = snapshot.dst?.timestamp || snapshot.savedAt;
  setFeedStatus('dst', 'stale', 'cache', formatCachedMessage('Dst data', timestamp), timestamp);
  return Boolean(snapshot.dst) || (Array.isArray(snapshot.dstHistory) && snapshot.dstHistory.length > 0);
}

function restoreCachedProtons(snapshot) {
  if (!snapshot?.protonFlux) return false;

  spaceWeatherCache.protonFlux = snapshot.protonFlux;
  const timestamp = snapshot.protonFlux.timestamp || snapshot.savedAt;
  setFeedStatus('protonFlux', 'stale', 'cache', formatCachedMessage('GOES proton data', timestamp), timestamp);
  return true;
}

// ---- Typed driver-event ingestion ----
// Each detector fires on every poll; localStorage high-water marks keep the
// IndexedDB driverEvents store free of duplicates without server-side storage.

function readIngestState() {
  try {
    const raw = localStorage.getItem(DRIVER_INGEST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      dstSample: parsed.dstSample ?? 0,
      dstStorm: parsed.dstStorm ?? 0,
      proton: parsed.proton ?? 0,
      pulse: parsed.pulse ?? 0,
      xflare: parsed.xflare ?? 0,
    };
  } catch {
    return { dstSample: 0, dstStorm: 0, proton: 0, pulse: 0, xflare: 0 };
  }
}

function writeIngestState(state) {
  try {
    localStorage.setItem(DRIVER_INGEST_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: worst case is duplicate driver events on next poll.
  }
}

async function ingestDriverEvents(events, type, markerKey) {
  const ingestState = readIngestState();
  const fresh = events.filter(event => event.date.getTime() > ingestState[markerKey]);
  if (fresh.length === 0) return 0;

  let added = 0;
  for (const event of fresh) {
    try {
      await addDriverEvent({
        type,
        date: event.date,
        value: event.minDst ?? event.peakPdynNPa ?? event.peakFluxPfu ?? event.flux ?? null,
        unit: event.metric === 'dst' ? 'nT' : event.metric === 'pdyn' ? 'nPa' : event.metric === 'protons' ? 'pfu' : 'W/m2',
        source: event.source || 'NOAA SWPC',
        metric: event.metric || null,
      });
      added += 1;
      ingestState[markerKey] = Math.max(ingestState[markerKey], event.date.getTime());
    } catch (error) {
      console.warn(`Failed to store ${type} driver event:`, error);
    }
  }
  writeIngestState(ingestState);
  return added;
}

async function ingestDstSamples(records) {
  const ingestState = readIngestState();
  const fresh = records.filter(record => record.time > ingestState.dstSample);
  if (fresh.length === 0) return;

  for (const record of fresh) {
    try {
      await addDstSample({ date: new Date(record.time), dst: record.dst });
      ingestState.dstSample = Math.max(ingestState.dstSample, record.time);
    } catch (error) {
      console.warn('Failed to store Dst sample:', error);
      break;
    }
  }
  writeIngestState(ingestState);
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
  setFeedStatus('dst', 'loading', 'live', 'Checking NOAA/Kyoto Dst feed…');
  setFeedStatus('protonFlux', 'loading', 'live', 'Checking NOAA GOES proton feed…');
  updateSpaceWeatherDisplay();

  const cachedSnapshot = readCachedSpaceWeatherSnapshot();

  try {
    const [magResult, plasmaResult, kpResult, kpHistoryResult, xrayResult, dstResult, protonResult] = await Promise.all([
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
      fetchJsonFeed(NOAA_APIS.dst, {
        description: 'NOAA/Kyoto Dst index unavailable',
        minimumItems: 1,
      }),
      fetchJsonFeed(NOAA_APIS.protonFlux, {
        description: 'NOAA GOES proton flux unavailable',
        minimumItems: 1,
      }),
    ]);

    // ---- Solar wind (composite card: magnetometer + plasma + derived coupling) ----
    const magData = Array.isArray(magResult.data) ? magResult.data : [];
    const plasmaData = Array.isArray(plasmaResult.data) ? plasmaResult.data : [];
    const latestMag = magData.length > 0 ? magData[magData.length - 1] : null;
    const latestPlasma = plasmaData.length > 0 ? plasmaData[plasmaData.length - 1] : null;

    // Merge 1-minute mag + plasma streams by time_tag so derived metrics use
    // matched samples; unmatched samples still carry whichever side exists.
    const compositeHistory = buildCompositeSolarWindHistory(magData, plasmaData);

    if (latestMag || latestPlasma) {
      const speed = parseNumber(latestPlasma?.speed);
      const density = parseNumber(latestPlasma?.density);
      const bt = parseNumber(latestMag?.bt);
      const bz = parseNumber(latestMag?.bz_gsm);
      const pdyn = dynamicPressure(density, speed);
      const ey = electricFieldEy(speed, bz);

      spaceWeatherCache.solarWind = {
        speed,
        density,
        bt,
        bz,
        pdyn,
        pdynBand: classifyPressure(pdyn).band,
        ey,
        eyBand: classifyEy(ey).band,
        timestamp: latestPlasma?.time_tag || latestMag?.time_tag || new Date().toISOString(),
      };

      setSolarWindHistory(compositeHistory);

      const solarWindUpdatedAt = latestPlasma?.time_tag || latestMag?.time_tag;
      if (latestMag && latestPlasma) {
        setFeedStatus('solarWind', 'live', 'live', 'Live NOAA magnetometer + plasma', solarWindUpdatedAt);
      } else if (latestMag) {
        setFeedStatus(
          'solarWind',
          'degraded',
          'live',
          'Magnetometer live (Bt/Bz); NOAA plasma feed unavailable upstream — speed/density/pressure hidden',
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

      // Pressure pulses (derived driver events) need at least an hour of samples.
      if (compositeHistory.length >= 30) {
        const pulses = detectPressurePulses(compositeHistory.slice(-1440));
        ingestDriverEvents(pulses, 'pressure-pulse', 'pulse').catch(err =>
          console.warn('Pressure-pulse ingestion failed:', err));
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

      const xFlares = (spaceWeatherCache.xrayFlux || [])
        .filter(flare => flare.class === 'X')
        .map(flare => ({
          date: new Date(flare.time),
          flux: flare.flux,
          metric: 'xray',
          source: 'NOAA SWPC GOES X-ray (derived flare log)',
        }));
      ingestDriverEvents(xFlares, 'x-flare', 'xflare').catch(err =>
        console.warn('X-flare ingestion failed:', err));
    } else if (!restoreCachedXray(cachedSnapshot)) {
      spaceWeatherCache.xrayFlux = null;
      setFeedStatus('xrayFlux', 'unavailable', 'live', 'GOES X-ray feed unavailable — no cached data');
    }

    // ---- Dst index (Kyoto via SWPC) ----
    const dstRows = Array.isArray(dstResult.data) ? dstResult.data : [];
    const dstRecords = dstRows
      .map(row => ({ time: Date.parse(row.time_tag), dst: parseNumber(row.dst) }))
      .filter(record => Number.isFinite(record.time) && Number.isFinite(record.dst))
      .sort((a, b) => a.time - b.time);

    if (dstRecords.length > 0) {
      const latestDst = dstRecords[dstRecords.length - 1];
      spaceWeatherCache.dst = {
        value: latestDst.dst,
        band: classifyDst(latestDst.dst).band,
        label: classifyDst(latestDst.dst).label,
        timestamp: latestDst.time,
      };
      setDstHistory(dstRecords.map(record => ({ dst: record.dst, time: record.time })));
      setFeedStatus('dst', 'live', 'live', 'Live NOAA/Kyoto Dst (hourly)', latestDst.time);

      ingestDstSamples(dstRecords).catch(err => console.warn('Dst ingestion failed:', err));
      const dstStorms = detectDstStorms(dstRecords);
      ingestDriverEvents(dstStorms, 'dst-storm', 'dstStorm').catch(err =>
        console.warn('Dst-storm ingestion failed:', err));
    } else if (!restoreCachedDst(cachedSnapshot)) {
      spaceWeatherCache.dst = null;
      setDstHistory([]);
      setFeedStatus('dst', 'unavailable', 'live', 'NOAA/Kyoto Dst feed unavailable — no cached data');
    }

    // ---- GOES integral proton flux (>=10 MeV channel) ----
    const protonRows = Array.isArray(protonResult.data) ? protonResult.data : [];
    const protonRecords = protonRows
      .filter(row => !row.energy || row.energy === PROTON_ENERGY_CHANNEL)
      .map(row => ({ time: Date.parse(row.time_tag), flux: parseNumber(row.flux), energy: row.energy }))
      .filter(record => Number.isFinite(record.time) && Number.isFinite(record.flux))
      .sort((a, b) => a.time - b.time);

    if (protonRecords.length > 0) {
      const latestProton = protonRecords[protonRecords.length - 1];
      const classification = classifyProtons(latestProton.flux);
      spaceWeatherCache.protonFlux = {
        value: latestProton.flux,
        scale: classification.scale,
        label: classification.label,
        band: classification.band,
        timestamp: latestProton.time,
      };
      setFeedStatus('protonFlux', 'live', 'live', `Live GOES protons (${PROTON_ENERGY_CHANNEL})`, latestProton.time);

      const protonEvents = detectProtonEvents(protonRecords);
      ingestDriverEvents(protonEvents, 'proton-event', 'proton').catch(err =>
        console.warn('Proton-event ingestion failed:', err));
    } else if (!restoreCachedProtons(cachedSnapshot)) {
      spaceWeatherCache.protonFlux = null;
      setFeedStatus('protonFlux', 'unavailable', 'live', 'GOES proton feed unavailable — no cached data');
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

    if (!restoreCachedDst(cachedSnapshot)) {
      spaceWeatherCache.dst = null;
      setDstHistory([]);
      setFeedStatus('dst', 'unavailable', 'live', 'NOAA/Kyoto Dst feed unavailable — no cached data');
    }

    if (!restoreCachedProtons(cachedSnapshot)) {
      spaceWeatherCache.protonFlux = null;
      setFeedStatus('protonFlux', 'unavailable', 'live', 'GOES proton feed unavailable — no cached data');
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
    setMetricText('solar-wind-pdyn', sw.pdyn, value => `${value.toFixed(1)} nPa`);
    setMetricText('solar-wind-ey', sw.ey, value => `${value.toFixed(1)} mV/m`);

    const bzColor = Number.isFinite(sw.bz)
      ? (sw.bz < -5 ? '#F44336' : sw.bz < 0 ? '#FF9800' : '#4CAF50')
      : 'var(--color-text-secondary)';
    setStyle('solar-wind-bz', 'color', bzColor);

    const pressure = classifyPressure(sw.pdyn);
    setText('solar-wind-pdyn-band', pressure.label);
    setStyle('solar-wind-pdyn-band', 'color', pressure.band === 'strong' ? '#F44336' : pressure.band === 'elevated' ? '#FF9800' : '#4CAF50');
    const eyClass = classifyEy(sw.ey);
    setText('solar-wind-ey-band', eyClass.label);
    setStyle('solar-wind-ey-band', 'color', eyClass.band === 'strong' ? '#F44336' : eyClass.band === 'moderate' ? '#FF9800' : '#4CAF50');

    const prefix = solarWindStatus.state === 'stale' ? 'Cached ' : '';
    setText('space-last-update', `${prefix}${formatClockTime(sw.timestamp)}`);
  } else {
    setText('solar-wind-speed', '—');
    setText('solar-wind-density', '—');
    setText('solar-wind-bt', '—');
    setText('solar-wind-bz', '—');
    setText('solar-wind-pdyn', '—');
    setText('solar-wind-ey', '—');
    setText('solar-wind-pdyn-band', '—');
    setText('solar-wind-ey-band', '—');
    setStyle('solar-wind-bz', 'color', 'var(--color-text-secondary)');
    setStyle('solar-wind-pdyn-band', 'color', 'var(--color-text-secondary)');
    setStyle('solar-wind-ey-band', 'color', 'var(--color-text-secondary)');
    setText('space-last-update', solarWindStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
  }

  // ---- Dst card ----
  const dst = spaceWeatherCache.dst;
  const dstStatus = spaceWeatherCache.feedStatus.dst;
  renderFeedMessage('dst-source', dstStatus);
  if (dst) {
    setMetricText('dst-value', dst.value, value => `${Math.round(value)} nT`);
    setText('dst-status', dst.label);
    const dstColor = dst.band === 'intense' ? '#F44336' : dst.band === 'moderate' ? '#FF9800' : dst.band === 'unsettled' ? '#FFC107' : '#4CAF50';
    setStyle('dst-status', 'color', dstColor);
    const dstPrefix = dstStatus.state === 'stale' ? 'Cached ' : '';
    setText('dst-last-update', `${dstPrefix}${formatClockTime(dst.timestamp)}`);
  } else {
    setText('dst-value', '—');
    setText('dst-status', dstStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
    setStyle('dst-status', 'color', feedColor(dstStatus.state));
    setText('dst-last-update', '');
  }

  // ---- Proton card ----
  const protons = spaceWeatherCache.protonFlux;
  const protonStatus = spaceWeatherCache.feedStatus.protonFlux;
  renderFeedMessage('proton-source', protonStatus);
  if (protons) {
    setMetricText('proton-flux', protons.value, value => value.toFixed(2));
    setText('proton-status', protons.label);
    setStyle('proton-status', 'color', protons.band === 'event' ? '#F44336' : '#4CAF50');
    const protonPrefix = protonStatus.state === 'stale' ? 'Cached ' : '';
    setText('proton-last-update', `${protonPrefix}${formatClockTime(protons.timestamp)}`);
  } else {
    setText('proton-flux', '—');
    setText('proton-status', protonStatus.state === 'loading' ? 'Loading…' : 'Unavailable');
    setStyle('proton-status', 'color', feedColor(protonStatus.state));
    setText('proton-last-update', '');
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
  renderCouplingChain();
  drawRealSolarWindChart(solarWindHistory);
  drawRealKpChart(kpHistory);
  drawDstChart(dstHistory);
}

// ===== SOLAR-TERRESTRIAL COUPLING CHAIN MONITOR =====
// Renders the hypothesized mechanism chain with the live status of every
// monitored stage. Stages without a public feed are labeled honestly rather
// than approximated.
const CHAIN_STAGE_COLORS = {
  quiet: '#4CAF50',
  elevated: '#FF9800',
  strong: '#F44336',
  event: '#F44336',
  intense: '#F44336',
  moderate: '#FF9800',
  unsettled: '#FFC107',
  loading: 'var(--color-text-secondary)',
  unmonitored: 'var(--color-text-secondary)',
};

function chainStageColor(band) {
  return CHAIN_STAGE_COLORS[band] || CHAIN_STAGE_COLORS.loading;
}

export function renderCouplingChain() {
  const container = document.getElementById('coupling-chain');
  if (!container) return;

  ensureFeedStatuses();
  const sw = spaceWeatherCache.solarWind;
  const kp = spaceWeatherCache.kpIndex;
  const dst = spaceWeatherCache.dst;
  const protons = spaceWeatherCache.protonFlux;

  const driverLines = [];
  if (sw?.speed != null) driverLines.push(`Speed ${Math.round(sw.speed)} km/s`);
  if (sw?.density != null) driverLines.push(`Density ${sw.density.toFixed(1)} cm⁻³`);
  if (sw?.bt != null) driverLines.push(`Bt ${sw.bt.toFixed(1)} nT`);
  if (sw?.bz != null) driverLines.push(`Bz ${sw.bz.toFixed(1)} nT`);
  if (sw?.pdyn != null) driverLines.push(`P_dyn ${sw.pdyn.toFixed(1)} nPa (${classifyPressure(sw.pdyn).label.toLowerCase()})`);
  if (sw?.ey != null) driverLines.push(`E_y ${sw.ey.toFixed(1)} mV/m (${classifyEy(sw.ey).label.toLowerCase()})`);
  const pressureBand = sw?.pdyn != null ? classifyPressure(sw.pdyn).band : 'loading';
  const eyBand = sw?.ey != null ? classifyEy(sw.ey).band : 'loading';
  const driverBand = pressureBand === 'strong' || eyBand === 'strong' ? 'strong'
    : pressureBand === 'elevated' || eyBand === 'moderate' ? 'elevated' : 'quiet';

  const magnetosphereLines = [];
  let magnetosphereBand = 'quiet';
  if (kp?.value != null) {
    magnetosphereLines.push(`Kp ${kp.value.toFixed(1)} (${kp.status})`);
    if (kp.value >= 7) magnetosphereBand = 'strong';
    else if (kp.value >= 5) magnetosphereBand = 'elevated';
  }
  if (dst?.value != null) {
    const dstClass = classifyDst(dst.value);
    magnetosphereLines.push(`Dst ${Math.round(dst.value)} nT (${dstClass.label.toLowerCase()})`);
    if (dstClass.band === 'intense') magnetosphereBand = 'intense';
    else if (dstClass.band === 'moderate' && magnetosphereBand !== 'intense') magnetosphereBand = 'moderate';
  }
  if (protons?.value != null) {
    magnetosphereLines.push(`Protons ${protons.value.toFixed(1)} pfu (${protons.label.toLowerCase()})`);
    if (protons.band === 'event' && (magnetosphereBand === 'quiet' || magnetosphereBand === 'elevated')) {
      magnetosphereBand = 'strong';
    }
  }

  const renderStage = (id, title, lines, band, note, emptyLabel = 'Awaiting data…') => {
    const stage = document.getElementById(id);
    if (!stage) return;
    const valueElement = stage.querySelector('.chain-value');
    const noteElement = stage.querySelector('.chain-note');
    if (valueElement) {
      valueElement.textContent = lines.length > 0 ? lines.join(' · ') : emptyLabel;
      valueElement.style.color = chainStageColor(lines.length > 0 ? band : 'loading');
    }
    if (noteElement) noteElement.textContent = note || '';
    stage.dataset.band = lines.length > 0 ? band : 'loading';
  };

  renderStage('chain-solar-wind', 'Solar wind driver', driverLines, driverBand,
    'DSCOVR/ACE/IMAP — pressure P_dyn = ρv², reconnection driver E_y = −v·Bz. If fields are missing, the NOAA plasma feed is degraded upstream.');
  renderStage('chain-magnetosphere', 'Magnetosphere response', magnetosphereLines, magnetosphereBand,
    'NOAA SWPC Kp · Kyoto Dst · GOES protons');
  renderStage('chain-ionosphere', 'Ionosphere / atmosphere', [], 'unmonitored',
    'No public real-time feed wired in — this link is not monitored by this app',
    'Not monitored');
  renderStage('chain-lithosphere', 'Lithosphere response (hypothesis under test)', [], 'quiet',
    'USGS M4.5+ seismicity — tested via the Research Lab lag scan',
    'See Research Lab');

  // Compact readout on the Research Lab tab so the current regime is visible
  // next to the lag-scan interpretation.
  const researchDrivers = document.getElementById('research-current-drivers');
  if (researchDrivers) {
    const pressureLine = driverLines.find(line => line.startsWith('P_dyn'));
    researchDrivers.textContent = [
      driverLines.length > 0 ? `SW: ${driverLines[0]}${pressureLine ? ` · ${pressureLine}` : ''}` : null,
      magnetosphereLines.length > 0 ? `Geo: ${magnetosphereLines.slice(0, 2).join(' · ')}` : null,
      protons?.band === 'event' ? `SEP event active (${protons.label})` : null,
    ].filter(Boolean).join(' ‖ ') || 'Awaiting space-weather data…';
  }
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
 * Toasts only when something needs attention; a clean update is its own feedback.
 */
export async function refreshSpaceData() {
  try {
    const summary = await fetchNOAASpaceWeather();
    if (summary.overallState !== 'live') {
      showInAppNotification('Space Weather', summary.text, 'warning');
    }
  } catch (error) {
    showInAppNotification('Space Weather', error?.message || 'Space-weather refresh failed.', 'warning');
  }
}
