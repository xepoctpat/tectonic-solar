// ===== API ENDPOINTS =====
const LOCAL_PROXY_PORT = '3000';
const LOCAL_PROXY_BASE =
  typeof window !== 'undefined' && window.location.port === LOCAL_PROXY_PORT
    ? `${window.location.origin}/api`
    : '';

export const IS_PROXY_MODE = Boolean(LOCAL_PROXY_BASE);

function resolveApiUrl(proxyPath, directUrl) {
  return LOCAL_PROXY_BASE ? `${LOCAL_PROXY_BASE}${proxyPath}` : directUrl;
}

function buildNoaaHistoricalDayIndexUrl(date) {
  const [year, month, day] = date.split('-');
  return `https://www.ngdc.noaa.gov/stp/space-weather/swpc-products/daily_reports/space_weather_indices/${year}/${month}/${year}${month}${day}dayind.txt`;
}

export const NOAA_APIS = {
  // Real-time magnetometer data (Bt, Bz field components)
  solarWindMag: resolveApiUrl('/noaa/rtsw-mag', 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
  // Real-time solar wind plasma (speed, density, temperature) – enabled in proxy mode
  // Direct browser mode (:8000) can hit CORS blocks on this endpoint, so it is disabled there.
  solarWindPlasma: IS_PROXY_MODE
    ? resolveApiUrl('/noaa/rtsw-plasma', 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json')
    : null,
  // 1-minute Kp index
  kpIndex: resolveApiUrl('/noaa/kp-1m', 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'),
  // 3-day Kp history for charting
  kpHistory: resolveApiUrl('/noaa/kp-history', 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
  // GOES X-ray flux (solar flares, 7-day window)
  xrayFlux: resolveApiUrl('/noaa/xrays', 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json'),
  // Proton flux (radiation storm indicator)
  protonFlux: resolveApiUrl('/noaa/protons', 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-6-hour.json'),
  // Dst index (geomagnetic disturbance storm time)
  dst: resolveApiUrl('/noaa/dst', 'https://services.swpc.noaa.gov/products/kyoto-dst.json'),
  // Historical daily space-weather indices archive (official NOAA/NCEI dayind text files)
  historicalDayIndex: (date) => resolveApiUrl(
    `/noaa/dayind?date=${encodeURIComponent(date)}`,
    buildNoaaHistoricalDayIndexUrl(date),
  ),
};

// Legacy alias kept for backward compatibility
export const NOAA_APIS_SOLAR_WIND = NOAA_APIS.solarWindMag;

export const USGS_APIS = {
  // M4.5+ past day (main real-time feed)
  earthquakes: resolveApiUrl('/usgs/eq-4.5-day', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson'),
  // M2.5+ past week (richer history for correlation & stats)
  earthquakesWeek: resolveApiUrl('/usgs/eq-2.5-week', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'),
  // M4.5+ past 7 days (wider window for correlation analysis)
  earthquakesWeekM45: resolveApiUrl('/usgs/eq-4.5-week', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'),
  // Historical ComCat search for deeper hypothesis testing windows
  comcatSearch: ({ startTime, endTime, minMagnitude = 5.0, limit = 5000, orderBy = 'time-asc' }) =>
    resolveApiUrl(
      `/usgs/comcat?starttime=${encodeURIComponent(startTime)}` +
      `&endtime=${encodeURIComponent(endTime)}` +
      `&minmagnitude=${encodeURIComponent(minMagnitude)}` +
      `&limit=${encodeURIComponent(limit)}` +
      `&orderby=${encodeURIComponent(orderBy)}`,
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
      `&minmagnitude=${encodeURIComponent(minMagnitude)}` +
      `&starttime=${encodeURIComponent(startTime)}` +
      `&endtime=${encodeURIComponent(endTime)}` +
      `&limit=${encodeURIComponent(limit)}` +
      `&orderby=${encodeURIComponent(orderBy)}`,
    ),
};

// ===== OPEN-METEO FREE WEATHER API (no API key required) =====
export const OPEN_METEO_APIS = {
  /**
   * Current weather – returns temperature, humidity, condition, wind, pressure, precipitation.
   * @param {number} lat  Latitude
   * @param {number} lon  Longitude
   * @returns {string} URL
   */
  weather: (lat, lon) =>
    resolveApiUrl(
      `/openmeteo/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,` +
      `wind_speed_10m,wind_direction_10m,pressure_msl,precipitation&timezone=auto`,
    ),

  /**
   * Current air quality – returns PM2.5, PM10, AQI (European standard).
   * @param {number} lat  Latitude
   * @param {number} lon  Longitude
   * @returns {string} URL
   */
  airQuality: (lat, lon) =>
    resolveApiUrl(
      `/openmeteo/air-quality?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,european_aqi&timezone=auto`,
    ),
};

// ===== OPTIONAL PYTHON RESEARCH SIDECAR (Node proxy only) =====
export const RESEARCH_APIS = {
  status: IS_PROXY_MODE ? resolveApiUrl('/research/status', null) : null,
  bootstrap: IS_PROXY_MODE ? resolveApiUrl('/research/bootstrap', null) : null,
};

// ===== DEFAULT ALERT SETTINGS =====
export const DEFAULT_ALERT_SETTINGS = {
  earthquakeMagnitude: 6.0,
  kpThreshold: 6,
  solarFlareClass: 'M',
  enabled: true,
};

// ===== REFRESH INTERVALS (milliseconds) =====
export const REFRESH_INTERVALS = {
  earthquakes: 60_000,    // 1 minute
  spaceWeather: 300_000,  // 5 minutes
  environment: 600_000,   // 10 minutes
};

// ===== MAP TILE LAYERS =====
export const TILE_LAYERS = {
  standard: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    name: 'Standard',
  },
  crust: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Relief tiles © Esri',
    name: 'Crust / Relief',
    maxZoom: 13,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    name: 'Satellite',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    name: 'Terrain',
  },
  dark: {
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    attribution: '© <a href="https://carto.com/">CARTO</a>',
    name: 'Dark',
  },
};

// ===== MAP REGIONS =====
export const MAP_REGIONS = {
  world: { center: [20, 0], zoom: 2 },
  ring: { center: [0, -140], zoom: 3 },
  japan: { center: [37, 137], zoom: 6 },
  cali: { center: [37, -120], zoom: 7 },
};

// ===== TECTONIC BOUNDARIES =====
export const TECTONIC_BOUNDARIES = {
  convergent: [
    [[50, -125], [42, -123], [36, -120], [32, -115]],
    [[45, 152], [35, 141], [30, 135], [25, 130]],
    [[0, -78], [-10, -75], [-20, -70], [-30, -72], [-45, -73]],
    [[8, -82], [10, -84], [15, -92]],
  ],
  divergent: [
    [[65, -25], [40, -20], [20, -15], [0, -10], [-20, -5], [-40, 0]],
    [[20, -110], [10, -112], [0, -115], [-10, -118], [-20, -115]],
  ],
  transform: [
    [[42, -123], [38, -121], [36, -120], [32, -115]],
    [[-45, 166], [-42, 170], [-40, 172], [-38, 177]],
  ],
};

// ===== PLATE MOTION VECTORS =====
export const PLATE_VECTORS = [
  { lat: 0, lon: -140, speed: 80, direction: 300, name: 'Pacific Plate', color: '#4CAF50' },
  { lat: 45, lon: -100, speed: 20, direction: 245, name: 'N. American Plate', color: '#2196F3' },
  { lat: 55, lon: 90, speed: 25, direction: 95, name: 'Eurasian Plate', color: '#9C27B0' },
  { lat: -25, lon: 135, speed: 70, direction: 35, name: 'Australian Plate', color: '#00BCD4' },
  { lat: -15, lon: -60, speed: 25, direction: 270, name: 'S. American Plate', color: '#E91E63' },
  { lat: -20, lon: -100, speed: 150, direction: 80, name: 'Nazca Plate (fastest!)', color: '#F44336' },
];

// ===== DEMO DATA (fallback when APIs are unavailable) =====
export const DEMO_EARTHQUAKES = [
  { mag: 6.2, lat: 38.0, lon: 140.0, place: 'Japan Region', depth: 45 },
  { mag: 5.8, lat: -15.0, lon: -173.0, place: 'Tonga', depth: 55 },
  { mag: 5.2, lat: -2.5, lon: 118.0, place: 'Indonesia', depth: 90 },
  { mag: 4.8, lat: 36.0, lon: -120.0, place: 'California', depth: 12 },
  { mag: 4.7, lat: 63.0, lon: -152.0, place: 'Alaska', depth: 22 },
];

export const DEMO_STORMS = [
  { kp: 6.5, date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  { kp: 5.2, date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
  { kp: 7.1, date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000) },
];

// ===== LOCATION OPTIONS (environment tab) – include coordinates for API calls =====
export const LOCATIONS = {
  'Stara Pazova, Serbia': { lat: 44.97, lon: 20.17 },
  'Belgrade, Serbia':     { lat: 44.82, lon: 20.46 },
  'Tokyo, Japan':         { lat: 35.68, lon: 139.69 },
  'New York, USA':        { lat: 40.71, lon: -74.01 },
  'Los Angeles, USA':     { lat: 34.05, lon: -118.24 },
  'London, UK':           { lat: 51.51, lon: -0.13 },
  'Sydney, Australia':    { lat: -33.87, lon: 151.21 },
};

// ===== WMO WEATHER INTERPRETATION CODES (ISO 4677) =====
export const WMO_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
};

// ===== EUROPEAN AQI SCALE =====
export const AQI_LEVELS = [
  { max: 20,  label: 'Good',          color: '#50C878' },
  { max: 40,  label: 'Fair',          color: '#9ACD32' },
  { max: 60,  label: 'Moderate',      color: '#FFC107' },
  { max: 80,  label: 'Poor',          color: '#FF9800' },
  { max: 100, label: 'Very Poor',     color: '#F44336' },
  { max: Infinity, label: 'Extremely Poor', color: '#9C27B0' },
];

// ===== SETTINGS STORAGE KEY =====
export const SETTINGS_STORAGE_KEY = 'space-earth-monitor-settings';
