// ===== LEAFLET MAP MODULE =====
import {
  TILE_LAYERS,
  MAP_REGIONS,
  TECTONIC_BOUNDARIES,
  TECTONIC_DATASET,
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
let tectonicBoundaryDataset = null;
let tectonicBoundaryDatasetPromise = null;
let tectonicPlateDataset = null;
let tectonicPlateDatasetPromise = null;
let tectonicVectorDataset = null;
let tectonicVectorDatasetPromise = null;
let tectonicOverlayRefreshToken = 0;
const DEFAULT_MAP_TYPE = 'plates';

const TECTONIC_FAMILY_STYLES = {
  convergent: {
    color: '#EF4444',
    weight: 5,
    dashArray: undefined,
    fallbackLabel: 'Convergent family',
    fallbackTooltip: 'Fallback convergent family — collision or subduction style only',
    description: 'plates converge, compress, collide, or subduct',
  },
  divergent: {
    color: '#10B981',
    weight: 4.4,
    dashArray: '10 8',
    fallbackLabel: 'Divergent family',
    fallbackTooltip: 'Fallback divergent family — ridge or rift style only',
    description: 'plates pull apart, spread, or rift',
  },
  transform: {
    color: '#F59E0B',
    weight: 4.2,
    dashArray: '14 8',
    fallbackLabel: 'Transform family',
    fallbackTooltip: 'Fallback transform family — strike-slip style only',
    description: 'plates slide laterally past each other',
  },
};

const TECTONIC_INTERACTION_STYLES = {
  SUB: {
    category: 'convergent',
    color: '#FF4D4F',
    weight: 5.6,
    dashArray: undefined,
    label: 'Subduction zone',
    description: 'oceanic slab descends beneath a neighboring plate',
    familyLabel: 'Convergent family',
    renderTeeth: true,
  },
  OCB: {
    category: 'convergent',
    color: '#E11D48',
    weight: 5,
    dashArray: '18 10',
    label: 'Oceanic convergent boundary',
    description: 'oceanic plates converge; trench or volcanic-arc systems are likely',
    familyLabel: 'Convergent family',
  },
  CCB: {
    category: 'convergent',
    color: '#991B1B',
    weight: 4.8,
    dashArray: '3 9',
    label: 'Continental convergent boundary',
    description: 'continental crust shortens, uplifts, and collides',
    familyLabel: 'Convergent family',
  },
  OSR: {
    category: 'divergent',
    color: '#06B6D4',
    weight: 4.8,
    dashArray: '14 10',
    label: 'Oceanic spreading ridge',
    description: 'seafloor spreading along a mid-ocean ridge system',
    familyLabel: 'Divergent family',
  },
  CRB: {
    category: 'divergent',
    color: '#22C55E',
    weight: 4.2,
    dashArray: '4 9',
    label: 'Continental rift boundary',
    description: 'continental crust stretches and pulls apart',
    familyLabel: 'Divergent family',
  },
  OTF: {
    category: 'transform',
    color: '#F59E0B',
    weight: 4.2,
    dashArray: '18 10',
    label: 'Oceanic transform fault',
    description: 'oceanic plates slide laterally in strike-slip motion',
    familyLabel: 'Transform family',
  },
  CTF: {
    category: 'transform',
    color: '#FB923C',
    weight: 4,
    dashArray: '7 8',
    label: 'Continental transform fault',
    description: 'continental plates shear laterally in strike-slip motion',
    familyLabel: 'Transform family',
  },
};

const CURATED_PLATE_STYLES = {
  AF: { fillColor: '#D6A24E', borderColor: '#7C4E1D' },
  AN: { fillColor: '#D8D6F4', borderColor: '#6C63B8' },
  AR: { fillColor: '#D3A15B', borderColor: '#81531F' },
  AU: { fillColor: '#76C893', borderColor: '#2D6A4F' },
  CA: { fillColor: '#55C1C7', borderColor: '#0E6B73' },
  CO: { fillColor: '#7FB3FF', borderColor: '#2557A7' },
  EU: { fillColor: '#8F88D7', borderColor: '#4338A0' },
  IN: { fillColor: '#F19592', borderColor: '#BE4B4B' },
  NA: { fillColor: '#67B7E1', borderColor: '#1F6D96' },
  NZ: { fillColor: '#F4B66A', borderColor: '#B56A1E' },
  PA: { fillColor: '#57D1F2', borderColor: '#0077B6' },
  PS: { fillColor: '#C5A9FF', borderColor: '#6D28D9' },
  SA: { fillColor: '#9CCF7B', borderColor: '#517A24' },
  SO: { fillColor: '#C9B458', borderColor: '#7A6415' },
  SU: { fillColor: '#8ED5CF', borderColor: '#1D7874' },
};

const TECTONIC_LAYER_TOGGLES = {
  plateRegions: 'l-plate-regions',
  convergent: 'l-convergent',
  divergent: 'l-divergent',
  transform: 'l-transform',
};

const TECTONIC_SOURCE_STATUS = {
  loading: {
    label: 'Loading PB2002…',
    attribution: 'Tectonics: loading Bird PB2002 local artifact…',
  },
  loaded: {
    label: TECTONIC_DATASET.primaryLabel,
    attribution: `Tectonics: ${TECTONIC_DATASET.primaryAttribution}`,
  },
  partial: {
    label: `${TECTONIC_DATASET.primaryLabel} (partial)`,
    attribution: `Tectonics: ${TECTONIC_DATASET.partialAttribution}`,
  },
  fallback: {
    label: TECTONIC_DATASET.fallbackLabel,
    attribution: `Tectonics: ${TECTONIC_DATASET.fallbackAttribution}`,
  },
};

function normalizeLongitude(longitude) {
  if (!Number.isFinite(longitude)) return longitude;
  let normalized = longitude;
  while (normalized > 180) normalized -= 360;
  while (normalized <= -180) normalized += 360;
  return normalized;
}

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

function plateStyleFromCode(plateCode = 'PB', isMajorPlate = false) {
  const curated = CURATED_PLATE_STYLES[plateCode];
  if (curated) {
    return {
      fillColor: curated.fillColor,
      borderColor: curated.borderColor,
      weight: isMajorPlate ? 2.4 : 1.8,
      opacity: isMajorPlate ? 0.96 : 0.86,
      fillOpacity: isMajorPlate ? 0.26 : 0.18,
    };
  }

  const hash = Array.from(plateCode).reduce((accumulator, char) => accumulator * 31 + char.charCodeAt(0), 17);
  const hue = Math.abs(hash) % 360;

  return {
    fillColor: `hsl(${hue}, 58%, ${isMajorPlate ? '64%' : '70%'})`,
    borderColor: `hsl(${hue}, 62%, ${isMajorPlate ? '38%' : '46%'})`,
    weight: isMajorPlate ? 2 : 1.4,
    opacity: isMajorPlate ? 0.92 : 0.82,
    fillOpacity: isMajorPlate ? 0.22 : 0.16,
  };
}

function boundaryStyleForFeature(feature) {
  const sourceType = feature?.properties?.sourceType;
  if (sourceType && TECTONIC_INTERACTION_STYLES[sourceType]) {
    return TECTONIC_INTERACTION_STYLES[sourceType];
  }

  const category = feature?.properties?.category;
  return category ? TECTONIC_FAMILY_STYLES[category] : null;
}

function boundaryFamilyText(category = '') {
  if (!category) return 'Plate-boundary family';
  return `${category.charAt(0).toUpperCase()}${category.slice(1)} family`;
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

function clearTectonicOverlays() {
  tectonicOverlays.forEach(overlay => map.removeLayer(overlay));
  tectonicOverlays = [];
}

function setTectonicSourceStatus(status) {
  setText('tectonic-source', status.label);
  setText('tectonic-attribution', status.attribution);
}

function isCategoryEnabled(category) {
  const toggleId = TECTONIC_LAYER_TOGGLES[category];
  return document.getElementById(toggleId)?.checked ?? false;
}

function isPlateRegionLayerEnabled() {
  return document.getElementById(TECTONIC_LAYER_TOGGLES.plateRegions)?.checked ?? false;
}

function toLeafletLines(multiLineCoordinates = []) {
  return multiLineCoordinates
    .map(line => line
      .filter(point => Array.isArray(point) && point.length >= 2)
      .map(([lon, lat]) => [lat, lon]))
    .filter(line => line.length >= 2);
}

function formatDatasetTooltip(properties = {}, style = {}) {
  const label = style.label || properties.label || 'Plate boundary';
  const description = style.description || 'plate interaction zone';
  const family = style.familyLabel || boundaryFamilyText(properties.category);
  const citation = properties.citationShort ? ` · ${properties.citationShort}` : '';
  return `${label} — ${description} · ${family}${citation}`;
}

function formatPlateTooltip(properties = {}) {
  const displayName = properties.displayName || `PB2002 plate ${properties.plateCode || '??'}`;
  const codeText = properties.plateCode ? ` · code ${properties.plateCode}` : '';
  const citation = properties.citationShort ? ` · ${properties.citationShort}` : '';
  const sizeText = properties.isMajorPlate ? 'major present-day plate region' : 'smaller present-day plate region';
  return `${displayName}${codeText} — ${sizeText}${citation}`;
}

function unwrapLongitudeRing(ring = []) {
  if (!ring.length) return [];

  const [firstLon, firstLat] = ring[0];
  const unwrapped = [[firstLon, firstLat]];

  for (let index = 1; index < ring.length; index += 1) {
    const [rawLon, rawLat] = ring[index];
    let adjustedLon = rawLon;
    const previousLon = unwrapped[unwrapped.length - 1][0];

    while (adjustedLon - previousLon > 180) adjustedLon -= 360;
    while (adjustedLon - previousLon < -180) adjustedLon += 360;

    unwrapped.push([adjustedLon, rawLat]);
  }

  return unwrapped;
}

function getVisibleWorldShifts(unwrappedRing = []) {
  if (!unwrappedRing.length) return [0];

  const longitudes = unwrappedRing.map(([longitude]) => longitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const shifts = [-360, 0, 360].filter((shift) => maxLongitude + shift >= -180 && minLongitude + shift <= 180);

  return shifts.length ? shifts : [0];
}

function toLeafletPolygonCopies(polygonCoordinates = []) {
  const outerRing = polygonCoordinates[0]
    ?.filter(point => Array.isArray(point) && point.length >= 2)
    ?.map(([longitude, latitude]) => [normalizeLongitude(longitude), latitude]);

  if (!outerRing || outerRing.length < 4) return [];

  const unwrappedRing = unwrapLongitudeRing(outerRing);
  const worldShifts = getVisibleWorldShifts(unwrappedRing);

  return worldShifts.map((shift) => unwrappedRing.map(([longitude, latitude]) => [latitude, longitude + shift]));
}

function getNormalizedOuterRing(polygonCoordinates = []) {
  const outerRing = polygonCoordinates[0]
    ?.filter(point => Array.isArray(point) && point.length >= 2)
    ?.map(([longitude, latitude]) => [normalizeLongitude(longitude), latitude]);

  return outerRing && outerRing.length >= 4 ? outerRing : [];
}

function getRepresentativePoint(polygonCoordinates = []) {
  const normalizedRing = getNormalizedOuterRing(polygonCoordinates);
  if (!normalizedRing.length) return null;

  const unwrappedRing = unwrapLongitudeRing(normalizedRing);
  let signedArea = 0;
  let centroidLon = 0;
  let centroidLat = 0;

  for (let index = 0; index < unwrappedRing.length - 1; index += 1) {
    const [x1, y1] = unwrappedRing[index];
    const [x2, y2] = unwrappedRing[index + 1];
    const cross = (x1 * y2) - (x2 * y1);
    signedArea += cross;
    centroidLon += (x1 + x2) * cross;
    centroidLat += (y1 + y2) * cross;
  }

  if (Math.abs(signedArea) > 1e-6) {
    const scale = 1 / (3 * signedArea);
    return [centroidLat * scale, normalizeLongitude(centroidLon * scale)];
  }

  const pointCount = unwrappedRing.length;
  const avgLon = unwrappedRing.reduce((sum, [longitude]) => sum + longitude, 0) / pointCount;
  const avgLat = unwrappedRing.reduce((sum, [, latitude]) => sum + latitude, 0) / pointCount;
  return [avgLat, normalizeLongitude(avgLon)];
}

function getPlateFeatureByCode(plateDataset, plateCode) {
  if (!Array.isArray(plateDataset?.features) || !plateCode) return null;
  return plateDataset.features.find(feature => feature?.properties?.plateCode === plateCode) || null;
}

function fallbackAnchorFromVectorFeature(vectorFeature) {
  const coordinates = vectorFeature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [latitude, normalizeLongitude(longitude)];
}

function resolveVectorAnchor(vectorFeature, plateDataset) {
  const plateFeature = getPlateFeatureByCode(plateDataset, vectorFeature?.properties?.plateCode);
  const representativePoint = getRepresentativePoint(plateFeature?.geometry?.coordinates);
  return representativePoint || fallbackAnchorFromVectorFeature(vectorFeature);
}

function renderDatasetBoundaryFeature(feature) {
  const style = boundaryStyleForFeature(feature);
  const category = style?.category || feature?.properties?.category;
  if (!isCategoryEnabled(category)) return;

  if (!style) return;

  const lines = toLeafletLines(feature?.geometry?.coordinates);
  if (!lines.length) return;

  const casing = L.polyline(lines, {
    color: 'rgba(255,255,255,0.82)',
    weight: style.weight + 4,
    opacity: 0.72,
    interactive: false,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  const line = L.polyline(lines, {
    color: style.color,
    weight: style.weight,
    opacity: 0.98,
    dashArray: style.dashArray,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);

  line.bindTooltip(formatDatasetTooltip(feature.properties, style), {
    sticky: true,
    direction: 'top',
    opacity: 0.95,
  });

  tectonicOverlays.push(casing, line);

  if (style.renderTeeth) {
    lines.forEach(lineCoords => addSubductionTeeth(lineCoords, style.color));
  }
}

function renderDatasetPlateFeature(feature) {
  if (!isPlateRegionLayerEnabled()) return;

  const plateCopies = toLeafletPolygonCopies(feature?.geometry?.coordinates);
  if (!plateCopies.length) return;

  const plateStyle = plateStyleFromCode(feature?.properties?.plateCode, feature?.properties?.isMajorPlate);
  const baseStyle = {
    color: plateStyle.borderColor,
    weight: plateStyle.weight,
    opacity: plateStyle.opacity,
    fillColor: plateStyle.fillColor,
    fillOpacity: plateStyle.fillOpacity,
  };

  plateCopies.forEach((coords) => {
    const polygon = L.polygon(coords, baseStyle).addTo(map);

    polygon.bindTooltip(formatPlateTooltip(feature.properties), {
      sticky: true,
      direction: 'top',
      opacity: 0.95,
    });

    polygon.on('mouseover', () => {
      polygon.setStyle({
        weight: baseStyle.weight + 0.6,
        fillOpacity: Math.min(0.36, baseStyle.fillOpacity + 0.1),
        opacity: 1,
      });
    });

    polygon.on('mouseout', () => {
      polygon.setStyle(baseStyle);
    });

    tectonicOverlays.push(polygon);
  });
}

function renderFallbackBoundaryOverlays() {
  if (document.getElementById('l-convergent')?.checked) {
    TECTONIC_BOUNDARIES.convergent.forEach(coords => {
      addBoundarySet(coords, {
        color: TECTONIC_FAMILY_STYLES.convergent.color,
        weight: TECTONIC_FAMILY_STYLES.convergent.weight,
        label: TECTONIC_FAMILY_STYLES.convergent.fallbackLabel,
        tooltip: TECTONIC_FAMILY_STYLES.convergent.fallbackTooltip,
      });
    });
  }

  if (document.getElementById('l-divergent')?.checked) {
    TECTONIC_BOUNDARIES.divergent.forEach(coords => {
      addBoundarySet(coords, {
        color: TECTONIC_FAMILY_STYLES.divergent.color,
        weight: TECTONIC_FAMILY_STYLES.divergent.weight,
        dashArray: TECTONIC_FAMILY_STYLES.divergent.dashArray,
        label: TECTONIC_FAMILY_STYLES.divergent.fallbackLabel,
        tooltip: TECTONIC_FAMILY_STYLES.divergent.fallbackTooltip,
      });
    });
  }

  if (document.getElementById('l-transform')?.checked) {
    TECTONIC_BOUNDARIES.transform.forEach(coords => {
      addBoundarySet(coords, {
        color: TECTONIC_FAMILY_STYLES.transform.color,
        weight: TECTONIC_FAMILY_STYLES.transform.weight,
        dashArray: TECTONIC_FAMILY_STYLES.transform.dashArray,
        label: TECTONIC_FAMILY_STYLES.transform.fallbackLabel,
        tooltip: TECTONIC_FAMILY_STYLES.transform.fallbackTooltip,
      });
    });
  }
}

async function ensureTectonicBoundaryDataset() {
  if (tectonicBoundaryDataset) return tectonicBoundaryDataset;

  if (!tectonicBoundaryDatasetPromise) {
    tectonicBoundaryDatasetPromise = (async () => {
      const response = await fetchWithRetry(TECTONIC_DATASET.boundariesUrl);
      if (!response.ok) {
        throw new Error(`PB2002 load failed with HTTP ${response.status}`);
      }

      const dataset = await response.json();
      if (!Array.isArray(dataset?.features)) {
        throw new Error('PB2002 dataset is missing a features array');
      }

      tectonicBoundaryDataset = dataset;
      return dataset;
    })().catch((error) => {
      console.warn('Failed to load PB2002 tectonic boundaries, using fallback sample lines:', error);
      return null;
    });
  }

  return tectonicBoundaryDatasetPromise;
}

async function ensureTectonicPlateDataset() {
  if (tectonicPlateDataset) return tectonicPlateDataset;

  if (!tectonicPlateDatasetPromise) {
    tectonicPlateDatasetPromise = (async () => {
      const response = await fetchWithRetry(TECTONIC_DATASET.platesUrl);
      if (!response.ok) {
        throw new Error(`PB2002 plate load failed with HTTP ${response.status}`);
      }

      const dataset = await response.json();
      if (!Array.isArray(dataset?.features)) {
        throw new Error('PB2002 plate dataset is missing a features array');
      }

      tectonicPlateDataset = dataset;
      return dataset;
    })().catch((error) => {
      console.warn('Failed to load PB2002 plate polygons, keeping the boundary-only baselayer:', error);
      return null;
    });
  }

  return tectonicPlateDatasetPromise;
}

async function ensureTectonicVectorDataset() {
  if (tectonicVectorDataset) return tectonicVectorDataset;

  if (!tectonicVectorDatasetPromise) {
    tectonicVectorDatasetPromise = (async () => {
      const response = await fetchWithRetry(TECTONIC_DATASET.vectorsUrl);
      if (!response.ok) {
        throw new Error(`Plate motion vector load failed with HTTP ${response.status}`);
      }

      const dataset = await response.json();
      if (!Array.isArray(dataset?.features)) {
        throw new Error('Plate motion vector dataset is missing a features array');
      }

      tectonicVectorDataset = dataset;
      return dataset;
    })().catch((error) => {
      console.warn('Failed to load local plate motion vector artifact:', error);
      return null;
    });
  }

  return tectonicVectorDatasetPromise;
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
  setTectonicSourceStatus(TECTONIC_SOURCE_STATUS.loading);

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
export async function addTectonicOverlays() {
  clearTectonicOverlays();

  const refreshToken = ++tectonicOverlayRefreshToken;
  const plateRegionsEnabled = isPlateRegionLayerEnabled();
  const vectorsEnabled = document.getElementById('l-vectors')?.checked ?? false;
  const needsPlateDataset = plateRegionsEnabled || vectorsEnabled;

  const [boundaryDataset, plateDataset, vectorDataset] = await Promise.all([
    ensureTectonicBoundaryDataset(),
    needsPlateDataset ? ensureTectonicPlateDataset() : Promise.resolve(tectonicPlateDataset),
    vectorsEnabled ? ensureTectonicVectorDataset() : Promise.resolve(tectonicVectorDataset),
  ]);

  if (refreshToken !== tectonicOverlayRefreshToken) {
    return false;
  }

  const boundaryDatasetLoaded = Array.isArray(boundaryDataset?.features) && boundaryDataset.features.length > 0;
  const plateDatasetLoaded = Array.isArray(plateDataset?.features) && plateDataset.features.length > 0;

  if (boundaryDatasetLoaded) {
    setTectonicSourceStatus(TECTONIC_SOURCE_STATUS.loaded);
  } else if (plateDatasetLoaded) {
    setTectonicSourceStatus(TECTONIC_SOURCE_STATUS.partial);
  } else {
    setTectonicSourceStatus(TECTONIC_SOURCE_STATUS.fallback);
  }

  if (plateRegionsEnabled && plateDatasetLoaded) {
    plateDataset.features.forEach(renderDatasetPlateFeature);
  }

  if (boundaryDatasetLoaded) {
    boundaryDataset.features.forEach(renderDatasetBoundaryFeature);
  } else {
    renderFallbackBoundaryOverlays();
  }

  if (vectorsEnabled) {
    addPlateMotionVectors(plateDataset, vectorDataset);
  }

  return true;
}

function addSubductionTeeth(coords, color = TECTONIC_INTERACTION_STYLES.SUB.color) {
  if (!Array.isArray(coords) || coords.length < 2) return;

  for (let index = 1; index < coords.length; index += 1) {
    const start = coords[index - 1];
    const end = coords[index];
    if (!Array.isArray(start) || !Array.isArray(end)) continue;

    const deltaLat = end[0] - start[0];
    const deltaLon = end[1] - start[1];
    const segmentLength = Math.hypot(deltaLat, deltaLon);
    if (!segmentLength) continue;

    const midpointLat = (start[0] + end[0]) / 2;
    const midpointLon = (start[1] + end[1]) / 2;
    const tangentLat = deltaLat / segmentLength;
    const tangentLon = deltaLon / segmentLength;
    const normalLat = -tangentLon;
    const normalLon = tangentLat;
    const offset = Math.min(0.22, Math.max(0.08, segmentLength * 0.18));
    const toothLat = midpointLat + normalLat * offset;
    const toothLon = midpointLon + normalLon * offset;
    const angleDeg = (Math.atan2(tangentLat, tangentLon) * 180 / Math.PI) + 90;

    const tooth = L.marker([toothLat, toothLon], {
      icon: L.divIcon({
        className: 'subduction-tooth-marker',
        html: `<span class="subduction-tooth" style="--tooth-color:${color};--tooth-rotation:${angleDeg}deg"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
      interactive: false,
    }).addTo(map);

    tectonicOverlays.push(tooth);
  }
}

// ===== PLATE MOTION VECTORS =====
export function addPlateMotionVectors(plateDataset, vectorDataset) {
  if (!Array.isArray(vectorDataset?.features)) return;

  vectorDataset.features.forEach((feature) => {
    const properties = feature?.properties || {};
    const anchor = resolveVectorAnchor(feature, plateDataset);
    if (!anchor) return;

    const speedMmYr = Number.parseFloat(properties.speedMmYr);
    const azimuthDeg = Number.parseFloat(properties.azimuthDeg);
    if (!Number.isFinite(speedMmYr) || !Number.isFinite(azimuthDeg)) return;

    const plateStyle = plateStyleFromCode(properties.plateCode, true);
    const distance = Math.min(7.2, Math.max(2.4, speedMmYr / 22));
    const angleRad = (azimuthDeg * Math.PI) / 180;
    const endLat = anchor[0] + distance * Math.sin(angleRad);
    const endLon = anchor[1] + distance * Math.cos(angleRad);
    const lineCoords = [anchor, [endLat, endLon]];
    const tooltipText = `${properties.displayName || properties.plateCode} (${properties.plateCode || '??'}) — ${speedMmYr.toFixed(0)} mm/yr toward ${azimuthDeg.toFixed(0)}° · ${properties.note || 'illustrative vector'}`;

    const casing = L.polyline(lineCoords, {
      color: 'rgba(255,255,255,0.84)',
      weight: 5.6,
      opacity: 0.78,
      interactive: false,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    const arrow = L.polyline(lineCoords, {
      color: plateStyle.borderColor,
      weight: 3.4,
      opacity: 0.98,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    arrow.bindTooltip(tooltipText, {
      sticky: true,
      direction: 'top',
      opacity: 0.95,
    });

    const arrowHead = L.marker([endLat, endLon], {
      icon: L.divIcon({
        className: 'arrow-head',
        html: `<span class="vector-arrow-head-icon" style="--vector-color:${plateStyle.borderColor};--vector-rotation:${azimuthDeg}deg"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      interactive: false,
    }).addTo(map);

    const label = L.marker(anchor, {
      icon: L.divIcon({
        className: 'plate-label',
        html: `<div class="plate-vector-label" style="--plate-vector-border:${plateStyle.borderColor};--plate-vector-fill:${plateStyle.fillColor}"><strong>${properties.plateCode || '??'}</strong><span>${speedMmYr.toFixed(0)} mm/yr</span></div>`,
        iconAnchor: [14, 32],
      }),
      interactive: false,
    }).addTo(map);

    tectonicOverlays.push(casing, arrow, arrowHead, label);
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
export async function updateMapLayers() {
  const rendered = await addTectonicOverlays();
  if (!rendered) return;

  if (document.getElementById('l-earthquakes')?.checked) {
    earthquakeMarkers.forEach(marker => map.addLayer(marker));
  } else {
    earthquakeMarkers.forEach(marker => map.removeLayer(marker));
  }
}

export function activatePlateGuideView() {
  const desiredState = {
    'l-plate-regions': true,
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
