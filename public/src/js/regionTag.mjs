// ===== REGIONAL STRATIFICATION (PB2002 point-in-polygon tagging) =====
// Assigns each earthquake to a PB2002 tectonic plate via a spherical winding
// number over the committed plate polygons. The winding formulation is immune
// to antimeridian and polar degeneracies that break planar ray casting for
// globally-wrapping rings (North America, Eurasia, Antarctica). Used at
// analysis time so stored IndexedDB records need no migration.

import { TECTONIC_DATASET } from './config.js';

// Plate-code groups named in the ROADMAP: Circum-Pacific ("Ring of Fire")
// and its complement. Global is the unstratified baseline.
export const REGION_GROUPS = {
  global: {
    key: 'global',
    label: 'Global (no stratification)',
    plates: null,
    note: 'Frozen baseline: every stored earthquake participates.',
  },
  'ring-of-fire': {
    key: 'ring-of-fire',
    label: 'Circum-Pacific (Ring of Fire)',
    plates: ['PA', 'CO', 'NZ', 'PS', 'JF', 'RI', 'KE', 'TO', 'NB', 'SB', 'SS', 'BU', 'MA', 'OK', 'SC', 'SW', 'PM', 'CA', 'AN', 'AU', 'WL', 'NH', 'NI', 'FT', 'CR', 'BR', 'EA', 'GP', 'JZ', 'CL', 'MN', 'MS', 'MO', 'TI', 'AS', 'AT'],
    note: 'Earthquakes on plates bounding the Pacific basin (PB2002 membership).',
  },
};

function toUnitVector(latitudeDeg, longitudeDeg) {
  const lat = latitudeDeg * Math.PI / 180;
  const lon = longitudeDeg * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Spherical point-in-polygon via stereographic projection centered on the
 * probe. Projection from the probe's antipode maps the sphere (minus that
 * one point) homeomorphically onto the plane, so the ring's image is a
 * closed planar curve and the standard winding number around the origin
 * (= the probe) decides containment exactly — immune to antimeridian and
 * polar degeneracies, and correct for rings that enclose the antipode
 * (their image winds the other way, which the winding number captures).
 */
export function pointInSphericalRing(latitudeDeg, longitudeDeg, ring) {
  const latRad = latitudeDeg * Math.PI / 180;
  const lonRad = longitudeDeg * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);

  // Local east/north basis at the probe (stereographic plane axes).
  const east = [-Math.sin(lonRad), Math.cos(lonRad), 0];
  const north = [-sinLat * Math.cos(lonRad), -sinLat * Math.sin(lonRad), cosLat];

  let previousAngle = null;
  let total = 0;

  for (const [lon, lat] of ring) {
    const v = toUnitVector(lat, lon);
    const denom = 1 + dot(v, [cosLat * Math.cos(lonRad), cosLat * Math.sin(lonRad), sinLat]);
    // A vertex exactly at the antipode projects to infinity; clamp keeps the
    // angle arithmetic finite (measure-zero case, slight distortion only).
    const scale = 1 / Math.max(denom, 1e-9);
    const angle = Math.atan2(dot(v, north) * scale, dot(v, east) * scale);

    if (previousAngle !== null) {
      let delta = angle - previousAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      total += delta;
    }
    previousAngle = angle;
  }

  // PB2002 rings are digitized counterclockwise as seen from above the plate
  // interior, so the signed winding is +1 for interior probes. Pole-encircling
  // band rings (Antarctica and similar) wind −1 around the opposite cap, and
  // the sign is what distinguishes the plate from its complement.
  return total / (2 * Math.PI) >= 0.5;
}

let plateIndexPromise = null;

/**
 * Load and index the PB2002 plate polygons once per session.
 * Returns null when the local artifact is unavailable (stratification then
 * reports 'unavailable' instead of guessing).
 */
export function ensurePlateIndex() {
  if (plateIndexPromise) return plateIndexPromise;

  plateIndexPromise = (async () => {
    try {
      const response = await fetch(TECTONIC_DATASET.platesUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const dataset = await response.json();
      if (!Array.isArray(dataset?.features)) throw new Error('missing features array');

      return dataset.features
        .filter(feature => feature?.geometry?.coordinates?.[0]?.length >= 4)
        .map(feature => ({
          plateCode: feature.properties.plateCode,
          displayName: feature.properties.displayName,
          ring: feature.geometry.coordinates[0].map(([lon, lat]) => [normalizeLon(lon), lat]),
        }));
    } catch (error) {
      console.warn('Plate index unavailable, regional stratification disabled:', error);
      return null;
    }
  })();
  return plateIndexPromise;
}

function normalizeLon(lon) {
  let value = ((lon + 180) % 360 + 360) % 360 - 180;
  if (value === -180) value = 180;
  return value;
}

/**
 * Tag one earthquake {lat, lon} with its PB2002 plate code.
 * Returns the plate code or null when outside every polygon (orogen gaps,
 * plate-model edges) — honestly unassigned rather than nearest-guessed.
 */
export function tagEarthquake(plateIndex, latitude, longitude) {
  if (!plateIndex || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  for (const plate of plateIndex) {
    if (pointInSphericalRing(latitude, longitude, plate.ring)) {
      return plate.plateCode;
    }
  }
  return null;
}

/**
 * Filter an earthquake catalog to a region group.
 * Returns the subset whose plate tag is in the group; when the plate index
 * is unavailable, returns null so callers can report 'unavailable'.
 */
export function filterEarthquakesByRegion(plateIndex, earthquakes, regionKey) {
  if (regionKey === 'global') return earthquakes;
  const group = REGION_GROUPS[regionKey];
  if (!group?.plates) return earthquakes;
  if (!plateIndex) return null;

  const plateSet = new Set(group.plates);
  return earthquakes.filter(eq => {
    const plateCode = tagEarthquake(plateIndex, Number(eq.lat), Number(eq.lon));
    return plateCode !== null && plateSet.has(plateCode);
  });
}
