// ===== ENVIRONMENT MODULE =====
// Fetches real weather and air quality data from the Open-Meteo free API.
// No API key required. CORS-enabled. https://open-meteo.com
import { LOCATIONS, OPEN_METEO_APIS, WMO_CODES, AQI_LEVELS } from './config.js';
import { setText, fetchWithRetry } from './utils.js';
import { drawAqiChart } from './charts.js';

// ---- Internal state ----
let _currentLocation = null;

// ===== LOCATION SELECTOR INIT =====
/** Populate the <select> from config and attach change handler. */
export function initLocationSelector() {
  const select = document.getElementById('location-select');
  if (!select) return;

  select.innerHTML = Object.keys(LOCATIONS)
    .map(loc => `<option value="${loc}">${loc}</option>`)
    .join('');

  select.addEventListener('change', updateLocation);
  updateLocation();
}

/** Triggered when the user changes the location dropdown. */
export function updateLocation() {
  const select = document.getElementById('location-select');
  if (!select) return;
  _currentLocation = select.value;
  setText('env-source', 'Loading…');
  fetchEnvironmentData(_currentLocation);
}

// ===== DATA FETCHING =====
/**
 * Fetch weather + air quality for the selected location and update the UI.
 * @param {string} locationName - Key in LOCATIONS config.
 */
export async function fetchEnvironmentData(locationName) {
  const loc = LOCATIONS[locationName];
  if (!loc) return;

  const [weatherOk, aqOk] = await Promise.all([
    _fetchWeather(loc.lat, loc.lon),
    _fetchAirQuality(loc.lat, loc.lon),
  ]);

  const source = (weatherOk && aqOk) ? 'Open-Meteo (live)'
    : weatherOk ? 'Open-Meteo (live) / AQ unavailable'
    : 'Demo data';
  setText('env-source', source);
}

/** Fetch current weather from Open-Meteo and update weather card. */
async function _fetchWeather(lat, lon) {
  try {
    const res = await fetchWithRetry(OPEN_METEO_APIS.weather(lat, lon));
    const data = await res.json();
    const c = data.current;
    if (!c) return false;

    setText('temp', c.temperature_2m?.toFixed(1) ?? '—');
    setText('apparent-temp', c.apparent_temperature?.toFixed(1) ?? '—');
    setText('humidity', `${c.relative_humidity_2m ?? '—'}%`);
    setText('pressure', c.pressure_msl?.toFixed(0) ?? '—');
    setText('wind-speed', c.wind_speed_10m?.toFixed(1) ?? '—');
    setText('wind-direction', _windDirection(c.wind_direction_10m));
    setText('precipitation', `${c.precipitation ?? 0} mm`);
    setText('weather-condition', WMO_CODES[c.weather_code] ?? `Code ${c.weather_code}`);
    setText('weather-last-update', new Date().toLocaleTimeString());
    return true;
  } catch (err) {
    console.warn('Open-Meteo weather fetch failed:', err.message);
    return false;
  }
}

/** Fetch current air quality from Open-Meteo and update AQ card. */
async function _fetchAirQuality(lat, lon) {
  try {
    const res = await fetchWithRetry(OPEN_METEO_APIS.airQuality(lat, lon));
    const data = await res.json();
    const c = data.current;
    if (!c) return false;

    const aqiValue = Math.round(c.european_aqi ?? 0);
    const level = AQI_LEVELS.find(l => aqiValue <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1];

    setText('aqi', aqiValue);
    setText('aqi-status', level.label);
    const aqiStatusEl = document.getElementById('aqi-status');
    if (aqiStatusEl) aqiStatusEl.style.color = level.color;

    setText('pm25', c.pm2_5?.toFixed(1) ?? '—');
    setText('pm10', c.pm10?.toFixed(1) ?? '—');
    setText('co', ((c.carbon_monoxide ?? 0) / 1000).toFixed(3)); // µg/m³ → mg/m³
    setText('no2', c.nitrogen_dioxide?.toFixed(1) ?? '—');
    setText('aq-last-update', new Date().toLocaleTimeString());

    // Draw AQI chart bar (normalized 0..1 against EAQI max ~150)
    drawAqiChart(aqiValue);
    return true;
  } catch (err) {
    console.warn('Open-Meteo air quality fetch failed:', err.message);
    return false;
  }
}

// ===== HELPERS =====
/** Convert degrees to compass direction abbreviation. */
function _windDirection(deg) {
  if (deg == null) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
