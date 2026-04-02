// ===== LEAFLET MAP MODULE =====
import {
  TILE_LAYERS,
  MAP_REGIONS,
  TECTONIC_BOUNDARIES,
  PLATE_VECTORS,
  DEMO_EARTHQUAKES,
  USGS_APIS,
} from './config.js';
import { setHistoricalEarthquakes, magnitudeFilter, setDataMode, setMagnitudeFilter } from './store.js';
import { setText, fetchWithRetry } from './utils.js';
import { addEarthquake } from './db.js';

// ---- Module-level callbacks (set by main.js to avoid circular imports) ----
let _earthquakeAlertCallback = null;
let _earthquakeDisplayCallback = null;

export function setEarthquakeAlertCallback(fn)   { _earthquakeAlertCallback = fn; }
export function setEarthquakeDisplayCallback(fn) { _earthquakeDisplayCallback = fn; }

// ---- Module-level map state ----
let map = null;
let allEarthquakes = [];   // raw fetched list (unfiltered)
let earthquakeMarkers = [];
let tectonicOverlays = [];
let currentTileLayer = null;
const DEFAULT_MAP_TYPE = 'plates';

function createTileLayer(type) {
  const layer = TILE_LAYERS[type];
  if (!layer) return null;

  const options = {
    attribution: layer.attribution,
    maxZoom: layer.maxZoom ?? 18,
  };

  if (layer.subdomains) {
    options.subdomains = layer.subdomains;
  }

  return L.tileLayer(layer.url, options);
}

function getMidpoint(coords) {
  if (!coords.length) return [0, 0];
  const middle = Math.floor(coords.length / 2);
  if (coords.length % 2 === 1) return coords[middle];

  const previous = coords[middle - 1];
  const next = coords[middle];
  return [
    (previous[0] + next[0]) / 2,
    (previous[1] + next[1]) / 2,
  ];
}

function addBoundaryLabel(coords, text, color) {
  const [lat, lon] = getMidpoint(coords);
  const label = L.marker([lat, lon], {
    icon: L.divIcon({
      className: 'boundary-label',
      html: `<span style="--boundary-color:${color}">${text}</span>`,
      iconSize: [140, 28],
      iconAnchor: [70, 14],
    }),
    interactive: false,
  }).addTo(map);
  tectonicOverlays.push(label);
}

function addBoundarySet(coords, style) {
  const casing = L.polyline(coords, {
    color: 'rgba(255,255,255,0.82)',
    weight: style.weight + 4,
    opacity: 0.72,
    interactive: false,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  const line = L.polyline(coords, {
    color: style.color,
    weight: style.weight,
    opacity: 0.98,
    dashArray: style.dashArray,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  line.bindTooltip(style.tooltip, {
    sticky: true,
    direction: 'top',
    opacity: 0.95,
  });

  tectonicOverlays.push(casing, line);
  addBoundaryLabel(coords, style.label, style.color);
}

// ===== MAP INITIALIZATION =====
export function initializeMap() {
  map = L.map('map-display', {
    center: [20, 0],
    zoom: 2,
    zoomControl: false,
    minZoom: 2,
    maxZoom: 18,
  });

  currentTileLayer = createTileLayer(DEFAULT_MAP_TYPE)?.addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft' }).addTo(map);

  // Track zoom level display
  map.on('zoom', () => setText('zoom-display', `Z${map.getZoom()}`));
  setText('zoom-display', `Z${map.getZoom()}`);

  return map;
}

/** Expose the internal Leaflet map instance. */
export function getMap() {
  return map;
}

// ===== MAP TYPE SWITCHING =====
export function switchMapType(type) {
  if (!TILE_LAYERS[type]) return;
  if (currentTileLayer) map.removeLayer(currentTileLayer);

  currentTileLayer = createTileLayer(type)?.addTo(map);

  document.querySelectorAll('.map-controls button[data-map-type]').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`[data-map-type="${type}"]`);
  if (btn) btn.classList.add('active');
}

// ===== REGION ZOOM =====
export function zoomToRegion(region) {
  const r = MAP_REGIONS[region];
  if (r) map.setView(r.center, r.zoom);
}

// ===== TECTONIC OVERLAYS =====
export function addTectonicOverlays() {
  tectonicOverlays.forEach(overlay => map.removeLayer(overlay));
  tectonicOverlays = [];

  if (document.getElementById('l-convergent')?.checked) {
    TECTONIC_BOUNDARIES.convergent.forEach(coords => {
      addBoundarySet(coords, {
        color: '#FF3333',
        weight: 5,
        label: 'Plates collide',
        tooltip: 'Convergent boundary — plates collide / subduct',
      });
      _addSubductionTriangles(coords);
    });
  }

  if (document.getElementById('l-divergent')?.checked) {
    TECTONIC_BOUNDARIES.divergent.forEach(coords => {
      addBoundarySet(coords, {
        color: '#4CAF50',
        weight: 4,
        dashArray: '10 8',
        label: 'Plates pull apart',
        tooltip: 'Divergent boundary — plates pull apart / spread',
      });
    });
  }

  if (document.getElementById('l-transform')?.checked) {
    TECTONIC_BOUNDARIES.transform.forEach(coords => {
      addBoundarySet(coords, {
        color: '#FF9800',
        weight: 4,
        dashArray: '14 8',
        label: 'Plates slide past',
        tooltip: 'Transform boundary — plates slide past each other',
      });
    });
  }
}

function _addSubductionTriangles(coords) {
  if (coords.length < 2) return;
  const start = coords[coords.length - 2];
  const end = coords[coords.length - 1];
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const offset = 0.8;
  const left = [end[0] - offset * Math.cos(angle - Math.PI / 7), end[1] - offset * Math.sin(angle - Math.PI / 7)];
  const right = [end[0] - offset * Math.cos(angle + Math.PI / 7), end[1] - offset * Math.sin(angle + Math.PI / 7)];
  const triangle = L.polygon([end, left, right], { color: '#FF3333', fillOpacity: 0.65, weight: 0 }).addTo(map);
  tectonicOverlays.push(triangle);
}

// ===== PLATE MOTION VECTORS =====
export function addPlateMotionVectors() {
  PLATE_VECTORS.forEach(v => {
    const distance = (v.speed / 150) * 8;
    const angleRad = (v.direction * Math.PI) / 180;
    const endLat = v.lat + distance * Math.sin(angleRad);
    const endLon = v.lon + distance * Math.cos(angleRad);

    const arrow = L.polyline([[v.lat, v.lon], [endLat, endLon]], {
      color: v.color, weight: 3, opacity: 0.9,
    }).addTo(map);

    const arrowHead = L.marker([endLat, endLon], {
      icon: L.divIcon({
        className: 'arrow-head',
        html: `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:15px solid ${v.color};transform:rotate(${v.direction}deg)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map);

    const label = L.marker([v.lat, v.lon], {
      icon: L.divIcon({
        className: 'plate-label',
        html: `<div style="background:rgba(0,0,0,0.7);color:${v.color};padding:4px 8px;border-radius:3px;font-size:11px;font-weight:bold;white-space:nowrap">${v.name}<br>${v.speed}&nbsp;mm/yr</div>`,
        iconAnchor: [0, 30],
      }),
    }).addTo(map);

    tectonicOverlays.push(arrow, arrowHead, label);
  });
}

// ===== EARTHQUAKE MARKERS =====
export function addEarthquakeMarkers(earthquakes) {
  earthquakeMarkers.forEach(marker => map.removeLayer(marker));
  earthquakeMarkers = [];

  // Apply magnitude filter
  const filtered = earthquakes.filter(eq => eq.mag >= magnitudeFilter);
  // Check whether the earthquakes layer is currently enabled
  const layerEnabled = document.getElementById('l-earthquakes')?.checked ?? true;

  filtered.forEach(eq => {
    const iconSize = Math.max(10, eq.mag * 4);
    // Colour encodes magnitude band
    let iconColor = '#FFC107'; // M4–5.4
    if (eq.mag >= 6)   iconColor = '#F44336';
    else if (eq.mag >= 5.5) iconColor = '#FF9800';

    // Border thickness encodes depth: shallow = thick border
    const borderPx = eq.depth != null
      ? (eq.depth < 35 ? 3 : eq.depth < 100 ? 2 : 1)
      : 2;

    const icon = L.divIcon({
      className: 'earthquake-marker',
      html: `<div style="width:${iconSize}px;height:${iconSize}px;background:${iconColor};border:${borderPx}px solid white;border-radius:50%;box-shadow:0 0 10px rgba(255,255,255,0.5)"></div>`,
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
    });

    // Build popup with DOM nodes to avoid XSS from external USGS strings
    const depthText = eq.depth != null ? `${eq.depth.toFixed(0)} km` : '?';
    const depthZone = eq.depth != null
      ? (eq.depth < 35 ? '🟥 Shallow' : eq.depth < 100 ? '🟧 Intermediate' : '🟦 Deep')
      : '—';

    const popup = document.createElement('div');
    popup.style.cssText = 'color:#000;font-family:Arial;min-width:200px';

    const title = document.createElement('h3');
    title.style.cssText = `margin:0 0 10px 0;color:${iconColor}`;
    title.textContent = `M${eq.mag.toFixed(1)} Earthquake`;
    popup.appendChild(title);

    [
      ['Location', eq.place || 'Unknown'],
      ['Depth', `${depthText} ${depthZone}`],
      ['Coordinates', `${eq.lat.toFixed(3)}°, ${eq.lon.toFixed(3)}°`],
      ['Time', eq.time || 'Recent'],
    ].forEach(([label, value]) => {
      const p = document.createElement('p');
      p.style.margin = '5px 0';
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(value));
      popup.appendChild(p);
    });

    const marker = L.marker([eq.lat, eq.lon], { icon }).bindPopup(popup);

    // Only add to map if the layer is enabled
    if (layerEnabled) marker.addTo(map);
    earthquakeMarkers.push(marker);
  });

  setText('eq-count', filtered.length);
  setText('eq-filter-count', filtered.length);
}

// ===== LAYER TOGGLE =====
export function updateMapLayers() {
  addTectonicOverlays();

  if (document.getElementById('l-vectors')?.checked) {
    addPlateMotionVectors();
  }

  if (document.getElementById('l-earthquakes')?.checked) {
    earthquakeMarkers.forEach(marker => map.addLayer(marker));
  } else {
    earthquakeMarkers.forEach(marker => map.removeLayer(marker));
  }
}

export function activatePlateGuideView() {
  const desiredState = {
    'l-earthquakes': false,
    'l-vectors': false,
    'l-convergent': true,
    'l-divergent': true,
    'l-transform': true,
  };

  Object.entries(desiredState).forEach(([id, checked]) => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.checked = checked;
  });

  switchMapType('plates');
  zoomToRegion('ring');
  updateMapLayers();
}

// ===== EARTHQUAKE DATA FETCHING =====
export async function fetchRealEarthquakeData() {
  try {
    const response = await fetchWithRetry(USGS_APIS.earthquakes);
    const data = await response.json();

    const earthquakes = data.features.map(feature => ({
      mag: feature.properties.mag,
      place: feature.properties.place,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      depth: feature.geometry.coordinates[2],
      time: new Date(feature.properties.time).toLocaleString(),
      date: new Date(feature.properties.time),
      url: feature.properties.url,
    }));

    allEarthquakes = earthquakes;
    // Run alert checks BEFORE updating the historical store to avoid the
    // new events being seen as "already alerted" by the duplicate suppressor.
    if (_earthquakeAlertCallback) _earthquakeAlertCallback(earthquakes);
    setHistoricalEarthquakes(earthquakes);
    // Also save to IndexedDB for persistence
    earthquakes.forEach(eq => {
      addEarthquake(eq).catch(err => console.warn('Failed to save EQ to DB:', err));
    });
    addEarthquakeMarkers(earthquakes);
    if (_earthquakeDisplayCallback) _earthquakeDisplayCallback(earthquakes);

    setText('footer-status', 'Real Data – USGS & NOAA');
    setText('map-update', new Date().toLocaleTimeString());
    setText('data-source', 'USGS');
    setDataMode('live');
  } catch {
    const demo = DEMO_EARTHQUAKES.map(eq => ({ ...eq, date: new Date(), time: new Date().toLocaleString() }));
    allEarthquakes = demo;
    setHistoricalEarthquakes(demo);
    addEarthquakeMarkers(DEMO_EARTHQUAKES);
    if (_earthquakeDisplayCallback) _earthquakeDisplayCallback(demo);
    setText('footer-status', 'Demo Mode');
    setText('map-update', 'Demo');
    setText('data-source', 'Demo');
    setDataMode('demo');
  }
}

// ===== MAGNITUDE FILTER =====
/**
 * Apply a minimum magnitude filter and re-render markers from cached data.
 * @param {number} minMag - Minimum magnitude to show (e.g. 4.5).
 */
export function applyMagnitudeFilter(minMag) {
  setMagnitudeFilter(minMag);
  setText('mag-filter-value', `${minMag.toFixed(1)}+`);
  addEarthquakeMarkers(allEarthquakes);
}
