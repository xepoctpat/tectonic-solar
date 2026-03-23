// ===== SPACE WEATHER MODULE =====
import { NOAA_APIS } from './config.js';
import { spaceWeatherCache, alertSettings, addHistoricalStorm, setSolarWindHistory, setKpHistory, solarWindHistory, kpHistory } from './store.js';
import { getKpStatus, detectFlares, setText, setStyle } from './utils.js';
import { sendNotification, showInAppNotification } from './notifications.js';
import { drawRealSolarWindChart, drawRealKpChart } from './charts.js';

// ===== FETCH NOAA DATA =====
/**
 * Fetch all relevant NOAA space weather feeds concurrently and update the UI.
 * Falls back to demo data on network failure.
 * @returns {Promise<boolean>} true on success
 */
export async function fetchNOAASpaceWeather() {
  try {
    // Fetch all feeds in parallel for speed
    const [magData, plasmaData, kpData, kp3DayData, xrayData] = await Promise.all([
      fetch(NOAA_APIS.solarWindMag).then(r => r.json()),
      fetch(NOAA_APIS.solarWindPlasma).then(r => r.json()).catch(() => []),
      fetch(NOAA_APIS.kpIndex).then(r => r.json()),
      fetch(NOAA_APIS.kpHistory).then(r => r.json()).catch(() => []),
      fetch(NOAA_APIS.xrayFlux).then(r => r.json()).catch(() => []),
    ]);

    // ---- Solar wind (magnetic field Bt/Bz from magnetometer feed) ----
    if (magData && magData.length > 0) {
      const latest = magData[magData.length - 1];
      // Use plasma speed/density if available, fall back to mag feed values
      const plasmaLatest = plasmaData && plasmaData.length > 0 ? plasmaData[plasmaData.length - 1] : null;
      spaceWeatherCache.solarWind = {
        speed: parseFloat(plasmaLatest?.speed ?? latest.speed) || 450,
        density: parseFloat(plasmaLatest?.density ?? latest.density) || 5,
        bt: parseFloat(latest.bt) || 5,
        bz: parseFloat(latest.bz_gsm) || 0,
        timestamp: latest.time_tag,
      };

      // Build solar wind speed history for chart (last 60 plasma points)
      const source = plasmaData && plasmaData.length > 0 ? plasmaData : magData;
      const speedHistory = source.slice(-60).map(d => ({
        speed: parseFloat(d.speed) || 0,
        time: d.time_tag,
      })).filter(d => d.speed > 0);
      setSolarWindHistory(speedHistory);
    }

    // ---- Kp index (real-time) ----
    if (kpData && kpData.length > 0) {
      const latestKp = kpData[kpData.length - 1];
      const kpValue = parseFloat(latestKp.kp_index) || parseFloat(latestKp.kp) || 3;
      spaceWeatherCache.kpIndex = {
        value: kpValue,
        status: getKpStatus(kpValue),
        timestamp: latestKp.time_tag,
      };

      if (kpValue >= 5) {
        addHistoricalStorm({ kp: kpValue, date: new Date(latestKp.time_tag) });
      }
    }

    // ---- Kp 3-day history for chart ----
    // Product format: [["time_tag", "kp"], ["2025-03-21 00:00:00", "3.00"], ...]
    if (Array.isArray(kp3DayData) && kp3DayData.length > 1) {
      const kpHist = kp3DayData.slice(1) // skip header row
        .map(row => ({ kp: parseFloat(row[1]) || 0, time: row[0] }))
        .filter(d => d.kp >= 0);
      setKpHistory(kpHist);
    }

    // ---- X-ray flux / solar flares ----
    if (xrayData && xrayData.length > 0) {
      spaceWeatherCache.xrayFlux = detectFlares(xrayData);
    }

    spaceWeatherCache.lastUpdate = Date.now();
    updateSpaceWeatherDisplay();
    checkSpaceWeatherAlerts();
    return true;
  } catch (err) {
    console.warn('NOAA API unavailable, using demo data:', err.message);
    spaceWeatherCache.solarWind = { speed: 450, density: 5.0, bt: 5, bz: 0, timestamp: new Date().toISOString() };
    spaceWeatherCache.kpIndex = { value: 3, status: 'Quiet', timestamp: new Date().toISOString() };
    spaceWeatherCache.lastUpdate = Date.now();
    updateSpaceWeatherDisplay();
    return false;
  }
}

// ===== DISPLAY UPDATE =====
/** Populate all space weather UI elements from cached data. */
export function updateSpaceWeatherDisplay() {
  const sw = spaceWeatherCache.solarWind;
  const kp = spaceWeatherCache.kpIndex;

  if (sw) {
    setText('solar-wind-speed', Math.round(sw.speed));
    setText('solar-wind-density', sw.density.toFixed(1));
    setText('solar-wind-bt', sw.bt.toFixed(1));
    setText('solar-wind-bz', sw.bz.toFixed(1));
    // Colour-code Bz: negative (southward) is geomagnetically active
    const bzColor = sw.bz < -5 ? '#F44336' : sw.bz < 0 ? '#FF9800' : '#4CAF50';
    setStyle('solar-wind-bz', 'color', bzColor);
  }

  if (kp) {
    setText('kp-value', kp.value.toFixed(1));
    setText('kp-status', kp.status);

    const kpColor = kp.value < 4 ? '#4CAF50'
      : kp.value < 5 ? '#FFC107'
      : kp.value < 7 ? '#FF9800'
      : '#F44336';
    setStyle('kp-status', 'color', kpColor);
  }

  // Solar flares
  const flares = spaceWeatherCache.xrayFlux;
  if (flares && flares.length > 0) {
    setText('flare-count', flares.length);
    const latest = flares[flares.length - 1];
    setText('latest-flare', `${latest.class}${latest.level}`);
    const flareList = document.getElementById('flare-list');
    if (flareList) {
      flareList.innerHTML = flares.slice(-5).reverse()
        .map(f => `<div class="flare-entry"><span class="flare-class">${f.class}${f.level}</span><span>${new Date(f.time).toLocaleString()}</span></div>`)
        .join('') || 'No recent flares';
    }
  } else {
    setText('flare-count', '0');
    setText('latest-flare', 'None');
    setText('flare-list', 'No flares detected in last 7 days');
  }

  if (spaceWeatherCache.lastUpdate) {
    setText('space-last-update', new Date(spaceWeatherCache.lastUpdate).toLocaleTimeString());
  }

  // Update charts with real data
  drawRealSolarWindChart(solarWindHistory);
  drawRealKpChart(kpHistory);
}

// ===== SPACE WEATHER ALERTS =====
/** Check cached data against user-configured thresholds and fire alerts. */
export function checkSpaceWeatherAlerts() {
  const kp = spaceWeatherCache.kpIndex;
  const flares = spaceWeatherCache.xrayFlux;

  if (kp && kp.value >= alertSettings.kpThreshold) {
    sendNotification(
      '⚠️ Geomagnetic Storm Alert',
      `Kp index: ${kp.value.toFixed(1)} (${kp.status})`,
    );
  }

  if (flares && flares.length > 0) {
    const threshold = alertSettings.solarFlareClass;
    const majorFlares = flares.filter(f => {
      if (threshold === 'X') return f.class === 'X';
      if (threshold === 'M') return f.class === 'M' || f.class === 'X';
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
 * Refresh space weather by re-fetching from NOAA (replaces old random-data stub).
 * Called when the user clicks the "Refresh" button on the Space Weather tab.
 */
export function refreshSpaceData() {
  showInAppNotification('Space Weather', 'Fetching latest NOAA data…', 'info');
  fetchNOAASpaceWeather();
}

