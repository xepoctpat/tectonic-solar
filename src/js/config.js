// ===== API ENDPOINTS =====
export const NOAA_APIS = {
  solarWind: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
  kpIndex: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  xrayFlux: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json',
  protonFlux: 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-6-hour.json',
};

export const USGS_APIS = {
  earthquakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
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
  earthquakes: 60_000,   // 1 minute
  spaceWeather: 300_000, // 5 minutes
};

// ===== MAP TILE LAYERS =====
export const TILE_LAYERS = {
  standard: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    name: 'Standard',
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

// ===== LOCATION OPTIONS (environment tab) =====
export const LOCATIONS = {
  'Stara Pazova, Serbia': { temp: 22.5 },
  'Belgrade, Serbia': { temp: 23.1 },
  'Tokyo, Japan': { temp: 18.4 },
  'New York, USA': { temp: 15.2 },
};

// ===== SETTINGS STORAGE KEY =====
export const SETTINGS_STORAGE_KEY = 'space-earth-monitor-settings';
