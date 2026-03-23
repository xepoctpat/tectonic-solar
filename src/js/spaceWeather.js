// ===== SPACE WEATHER MODULE =====
import { NOAA_APIS } from './config.js';
import { spaceWeatherCache, alertSettings, addHistoricalStorm } from './store.js';
import { getKpStatus, detectFlares, setText, setStyle } from './utils.js';
import { sendNotification } from './notifications.js';

// ===== FETCH NOAA DATA =====
export async function fetchNOAASpaceWeather() {
  try {
    // Solar wind
    const swRes = await fetch(NOAA_APIS.solarWind);
    const swData = await swRes.json();
    if (swData && swData.length > 0) {
      const latest = swData[swData.length - 1];
      spaceWeatherCache.solarWind = {
        speed: parseFloat(latest.speed) || 450,
        density: parseFloat(latest.density) || 5,
        bt: parseFloat(latest.bt) || 5,
        bz: parseFloat(latest.bz_gsm) || 0,
        timestamp: latest.time_tag,
      };
    }

    // Kp index
    const kpRes = await fetch(NOAA_APIS.kpIndex);
    const kpData = await kpRes.json();
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

    // X-ray flux / solar flares
    const xrayRes = await fetch(NOAA_APIS.xrayFlux);
    const xrayData = await xrayRes.json();
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
export function updateSpaceWeatherDisplay() {
  const sw = spaceWeatherCache.solarWind;
  const kp = spaceWeatherCache.kpIndex;

  if (sw) {
    setText('solar-wind-speed', Math.round(sw.speed));
    setText('solar-wind-density', sw.density.toFixed(1));
    setText('solar-wind-bz', sw.bz.toFixed(1));
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

  const flares = spaceWeatherCache.xrayFlux;
  if (flares && flares.length > 0) {
    setText('flare-count', flares.length);
    const latest = flares[flares.length - 1];
    setText('latest-flare', `${latest.class}${latest.level}`);
    const flareList = document.getElementById('flare-list');
    if (flareList) {
      flareList.innerHTML = flares.slice(-5).reverse()
        .map(f => `<div>${f.class}${f.level} – ${new Date(f.time).toLocaleTimeString()}</div>`)
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
}

// ===== SPACE WEATHER ALERTS =====
export function checkSpaceWeatherAlerts() {
  const kp = spaceWeatherCache.kpIndex;
  const flares = spaceWeatherCache.xrayFlux;

  if (kp && kp.value >= alertSettings.kpThreshold) {
    sendNotification(
      '⚠️ Geomagnetic Storm Alert',
      `Kp index: ${kp.value.toFixed(1)} (${kp.status})`,
      '⚡',
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
          '🌞',
        );
      }
    }
  }
}

// ===== MANUAL REFRESH (randomized demo data) =====
export function refreshSpaceData() {
  const speed = Math.floor(Math.random() * 300 + 300);
  const density = (Math.random() * 10 + 3).toFixed(1);
  const kp = (Math.random() * 6 + 1).toFixed(1);
  const dst = Math.floor(Math.random() * 40 - 30);

  setText('solar-wind-speed', speed);
  setText('solar-wind-density', density);
  setText('kp-value', kp);
  setText('dst-value', dst);
  setText('kp-status', getKpStatus(parseFloat(kp)));
}
