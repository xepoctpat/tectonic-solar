import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URLS = {
  landing: 'http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm',
  ftp: 'http://peterbird.name/oldFTP/PB2002/',
  steps: 'http://peterbird.name/oldFTP/PB2002/PB2002_steps.dat.txt',
  plates: 'http://peterbird.name/oldFTP/PB2002/PB2002_plates.dig.txt',
  readme: 'http://peterbird.name/oldFTP/PB2002/2001GC000252_readme.txt',
};

const TYPE_MAP = {
  CCB: { category: 'convergent', label: 'Continental convergent boundary' },
  OCB: { category: 'convergent', label: 'Oceanic convergent boundary' },
  SUB: { category: 'convergent', label: 'Subduction zone' },
  CRB: { category: 'divergent', label: 'Continental rift boundary' },
  OSR: { category: 'divergent', label: 'Oceanic spreading ridge' },
  CTF: { category: 'transform', label: 'Continental transform fault' },
  OTF: { category: 'transform', label: 'Oceanic transform fault' },
};

const CATEGORY_ORDER = ['convergent', 'divergent', 'transform'];
const TYPE_ORDER = ['SUB', 'OCB', 'CCB', 'OSR', 'CRB', 'OTF', 'CTF'];
const MAJOR_PLATE_CODES = new Set(['AF', 'AN', 'AR', 'AU', 'CA', 'CO', 'EU', 'IN', 'NA', 'NZ', 'PA', 'PS', 'SA', 'SO', 'SU']);

const PLATE_NAME_MAP = {
  AF: 'African Plate',
  AM: 'Amur Plate',
  AN: 'Antarctic Plate',
  AR: 'Arabian Plate',
  AT: 'Anatolia Plate',
  AU: 'Australian Plate',
  BU: 'Burma Plate',
  CA: 'Caribbean Plate',
  CO: 'Cocos Plate',
  EA: 'Easter Plate',
  EU: 'Eurasian Plate',
  FT: 'Futuna Plate',
  IN: 'Indian Plate',
  JF: 'Juan de Fuca Plate',
  KE: 'Kermadec Plate',
  MA: 'Mariana Plate',
  MN: 'Manus Plate',
  MO: 'Molucca Sea Plate',
  NA: 'North American Plate',
  NB: 'North Bismarck Plate',
  NI: 'Niuafo’ou Plate',
  NZ: 'Nazca Plate',
  PA: 'Pacific Plate',
  PM: 'Panama Plate',
  PS: 'Philippine Sea Plate',
  RI: 'Rivera Plate',
  SA: 'South American Plate',
  SC: 'Scotia Plate',
  SO: 'Somalia Plate',
  SS: 'South Bismarck Plate',
  SU: 'Sunda Plate',
  SW: 'South Sandwich Plate',
  TI: 'Timor Plate',
  TO: 'Tonga Plate',
  WL: 'Woodlark Plate',
  YA: 'Yangtze Plate',
};

function normalizeLongitude(longitude) {
  return longitude > 180 ? longitude - 360 : longitude;
}

// ===== PB2002 PLATE MOTION (Euler poles, Bird 2003 Table 1) =====

const EARTH_RADIUS_KM = 6371.0088;
const DEG_TO_RAD = Math.PI / 180;
const MOTION_POLE_FILE = 'pb2002-euler-poles.json';
const MOTION_OUTPUT_FILE = 'plate-motion-vectors.geojson';
const MAJOR_SAMPLE_TARGET = 8;
const MINOR_SAMPLE_TARGET = 2;

function buildPlateMotionDisplayName(plateCode, poleName) {
  return PLATE_NAME_MAP[plateCode] ?? `${poleName} Plate`;
}

async function loadEulerPoles(scriptDirectory) {
  const poleFilePath = path.join(scriptDirectory, MOTION_POLE_FILE);
  const payload = JSON.parse(await readFile(poleFilePath, 'utf8'));
  if (!Array.isArray(payload?.plates) || payload.plates.length === 0) {
    throw new Error(`${MOTION_POLE_FILE} is missing a plates array`);
  }
  return payload;
}

function unwrapRing(ring) {
  const unwrapped = [[ring[0][0], ring[0][1]]];
  for (let index = 1; index < ring.length; index += 1) {
    let longitude = ring[index][0];
    const previous = unwrapped[index - 1][0];
    while (longitude - previous > 180) longitude -= 360;
    while (previous - longitude > 180) longitude += 360;
    unwrapped.push([longitude, ring[index][1]]);
  }
  return unwrapped;
}

function pointInUnwrappedRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xCurrent, yCurrent] = ring[index];
    const [xPrevious, yPrevious] = ring[previous];
    const crossesLatitude = (yCurrent > latitude) !== (yPrevious > latitude);
    if (crossesLatitude && longitude < ((xPrevious - xCurrent) * (latitude - yCurrent)) / (yPrevious - yCurrent) + xCurrent) {
      inside = !inside;
    }
  }
  return inside;
}

function ringBBox(ring) {
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const [longitude, latitude] of ring) {
    lonMin = Math.min(lonMin, longitude);
    lonMax = Math.max(lonMax, longitude);
    latMin = Math.min(latMin, latitude);
    latMax = Math.max(latMax, latitude);
  }
  return { lonMin, lonMax, latMin, latMax };
}

function shoelaceCentroid(ring) {
  let signedArea = 0;
  let centroidLon = 0;
  let centroidLat = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    signedArea += cross;
    centroidLon += (x1 + x2) * cross;
    centroidLat += (y1 + y2) * cross;
  }
  if (Math.abs(signedArea) < 1e-9) return null;
  const scale = 1 / (3 * signedArea);
  return [centroidLon * scale, centroidLat * scale];
}

function strideSubset(points, target) {
  if (points.length <= target) return points;
  const stride = (points.length - 1) / (target - 1);
  const subset = [];
  for (let index = 0; index < target; index += 1) {
    subset.push(points[Math.round(index * stride)]);
  }
  return subset;
}

function samplePlateInteriorPoints(outerRing, isMajorPlate) {
  const unwrapped = unwrapRing(outerRing);
  const bbox = ringBBox(unwrapped);
  const referenceLon = unwrapped[0][0];
  const target = isMajorPlate ? MAJOR_SAMPLE_TARGET : MINOR_SAMPLE_TARGET;

  const centroid = shoelaceCentroid(unwrapped);
  const centroidPoint = centroid && pointInUnwrappedRing(centroid[0], centroid[1], unwrapped)
    ? [[centroid[0], centroid[1]]]
    : [];

  const lonSpan = Math.max(bbox.lonMax - bbox.lonMin, 1);
  const latSpan = Math.max(bbox.latMax - bbox.latMin, 1);
  const lonStep = isMajorPlate
    ? Math.min(25, Math.max(9, lonSpan / 11))
    : Math.min(30, Math.max(7, lonSpan / 4));
  const latStep = isMajorPlate
    ? Math.min(20, Math.max(7, latSpan / 9))
    : Math.min(25, Math.max(5, latSpan / 4));

  const gridPoints = [];
  for (let latitude = bbox.latMin + latStep / 2; latitude < bbox.latMax; latitude += latStep) {
    for (let longitude = bbox.lonMin + lonStep / 2; longitude < bbox.lonMax; longitude += lonStep) {
      if (pointInUnwrappedRing(longitude, latitude, unwrapped)) {
        gridPoints.push([longitude, latitude]);
      }
    }
  }

  const anchor = centroidPoint[0] ?? gridPoints[0] ?? [
    (bbox.lonMin + bbox.lonMax) / 2,
    (bbox.latMin + bbox.latMax) / 2,
  ];
  const spread = centroidPoint.concat(gridPoints.filter(([lon]) => Math.abs(lon - anchor[0]) > lonStep));
  const subset = strideSubset(spread, target);

  return {
    points: subset.length > 0 ? subset : [anchor],
    anchorIsApproximate: centroidPoint.length === 0 && gridPoints.length === 0,
  };
}

function computePlateVelocity(pole, latitudeDeg, longitudeDeg) {
  const omegaRad = pole.omegaDegPerMyr * DEG_TO_RAD;
  const poleLatRad = pole.latDeg * DEG_TO_RAD;
  const poleLonRad = pole.lonDeg * DEG_TO_RAD;
  const pointLatRad = latitudeDeg * DEG_TO_RAD;
  const pointLonRad = longitudeDeg * DEG_TO_RAD;

  const omegaUnitX = Math.cos(poleLatRad) * Math.cos(poleLonRad);
  const omegaUnitY = Math.cos(poleLatRad) * Math.sin(poleLonRad);
  const omegaUnitZ = Math.sin(poleLatRad);

  const rx = Math.cos(pointLatRad) * Math.cos(pointLonRad);
  const ry = Math.cos(pointLatRad) * Math.sin(pointLonRad);
  const rz = Math.sin(pointLatRad);

  // v = omega x r on the unit sphere; omega magnitude factors out of the projection.
  const vx = omegaUnitY * rz - omegaUnitZ * ry;
  const vy = omegaUnitZ * rx - omegaUnitX * rz;
  const vz = omegaUnitX * ry - omegaUnitY * rx;

  const east = vx * -Math.sin(pointLonRad) + vy * Math.cos(pointLonRad);
  const north = vx * -Math.sin(pointLatRad) * Math.cos(pointLonRad)
    + vy * -Math.sin(pointLatRad) * Math.sin(pointLonRad)
    + vz * Math.cos(pointLatRad);

  // km/Myr is numerically equal to mm/yr.
  const speedMmYr = Math.hypot(east, north) * omegaRad * EARTH_RADIUS_KM;
  const azimuthDeg = (Math.atan2(east, north) / DEG_TO_RAD + 360) % 360;
  return { speedMmYr, azimuthDeg };
}

function buildMotionFeatures(plateFeatures, polesPayload) {
  const polesByCode = new Map(polesPayload.plates.map(pole => [pole.code, pole]));
  const features = [];
  const perPlateSummary = [];

  for (const plateFeature of plateFeatures) {
    const plateCode = plateFeature.properties.plateCode;
    const pole = polesByCode.get(plateCode);
    if (!pole) {
      throw new Error(`No PB2002 Euler pole found for plate code ${plateCode}`);
    }

    const outerRing = plateFeature.geometry?.coordinates?.[0];
    if (!Array.isArray(outerRing) || outerRing.length < 4) {
      throw new Error(`Plate ${plateCode} has no usable outer ring`);
    }

    const isMajorPlate = plateFeature.properties.isMajorPlate;
    const { points, anchorIsApproximate } = samplePlateInteriorPoints(outerRing, isMajorPlate);
    const primaryIndex = features.length;

    points.forEach(([longitude, latitude], index) => {
      const { speedMmYr, azimuthDeg } = computePlateVelocity(pole, latitude, longitude);
      features.push({
        type: 'Feature',
        properties: {
          id: `vector-${plateCode.toLowerCase()}-${index + 1}`,
          plateCode,
          displayName: buildPlateMotionDisplayName(plateCode, pole.name),
          speedMmYr: Number.parseFloat(speedMmYr.toFixed(2)),
          azimuthDeg: Number.parseFloat(azimuthDeg.toFixed(1)),
          isPrimary: index === 0,
          isMajorPlate,
          anchorApproximate: anchorIsApproximate,
          coverage: 'computed-from-pb2002-euler-poles',
          referenceFrame: 'Pacific-plate reference frame (PB2002 Table 1)',
          eulerPole: {
            latDeg: pole.latDeg,
            lonDeg: pole.lonDeg,
            omegaDegPerMyr: pole.omegaDegPerMyr,
            sourceReference: pole.reference,
          },
          sourceModel: 'PB2002',
          citationShort: 'Bird (2003)',
          citationDoi: '10.1029/2001GC000252',
        },
        geometry: {
          type: 'Point',
          coordinates: [Number.parseFloat(normalizeLongitude(longitude).toFixed(3)), Number.parseFloat(latitude.toFixed(3))],
        },
      });
    });

    const primary = features[primaryIndex].properties;
    perPlateSummary.push({
      code: plateCode,
      name: pole.name,
      vectors: points.length,
      speedMmYr: primary.speedMmYr,
      azimuthDeg: primary.azimuthDeg,
      omega: pole.omegaDegPerMyr,
    });
  }

  return { features, perPlateSummary };
}

function assertMotionSanity(features, polesPayload) {
  const pacific = polesPayload.plates.find(pole => pole.code === 'PA');
  if (!pacific || pacific.latDeg !== 0 || pacific.lonDeg !== 0 || pacific.omegaDegPerMyr !== 0) {
    throw new Error('Pacific plate pole must be the identity rotation of the reference frame');
  }

  const checks = [
    { code: 'NA', lat: 37, lon: -122, min: 35, max: 60 },
    { code: 'NZ', lat: -20, lon: -70, min: 110, max: 160 },
    { code: 'CO', lat: 8, lon: -95, min: 90, max: 140 },
    { code: 'AU', lat: -25, lon: 135, min: 65, max: 100 },
  ];
  for (const check of checks) {
    const pole = polesPayload.plates.find(candidate => candidate.code === check.code);
    const { speedMmYr } = computePlateVelocity(pole, check.lat, check.lon);
    if (speedMmYr < check.min || speedMmYr > check.max) {
      throw new Error(
        `Sanity check failed for ${check.code} at (${check.lat}, ${check.lon}): ${speedMmYr.toFixed(1)} mm/yr outside [${check.min}, ${check.max}]`,
      );
    }
  }

  for (const feature of features) {
    const { speedMmYr, azimuthDeg } = feature.properties;
    if (!Number.isFinite(speedMmYr) || speedMmYr < 0 || speedMmYr > 400) {
      throw new Error(`Implausible speed for ${feature.properties.plateCode}: ${speedMmYr}`);
    }
    if (!Number.isFinite(azimuthDeg) || azimuthDeg < 0 || azimuthDeg >= 360) {
      throw new Error(`Implausible azimuth for ${feature.properties.plateCode}: ${azimuthDeg}`);
    }
  }
}

function buildMotionFeatureCollection(features, polesPayload, plateCount) {
  return {
    type: 'FeatureCollection',
    metadata: {
      name: 'Peter Bird PB2002 computed plate motion vectors',
      status: 'computed',
      citation:
        'Bird, P. (2003). An updated digital model of plate boundaries. Geochemistry Geophysics Geosystems, 4(3), 1027. doi:10.1029/2001GC000252.',
      citationDoi: '10.1029/2001GC000252',
      sourceModel: 'PB2002',
      poleSource: 'scripts/pb2002-euler-poles.json (transcribed from Table 1, page 6 of the published PDF)',
      sourceUrls: SOURCE_URLS,
      generatedAt: new Date().toISOString(),
      generatedBy: 'scripts/build-pb2002-boundaries.mjs',
      plateCount,
      featureCount: features.length,
      referenceFrame: 'Pacific-plate reference frame (PB2002 Table 1); the Pacific plate itself has zero velocity by definition',
      velocityModel: 'v = omega x r on a sphere of radius 6371.0088 km; km/Myr is numerically equal to mm/yr',
      notes: [
        'Each feature is a sample point inside a PB2002 plate polygon with the linear velocity computed from that plate Euler pole.',
        'Major plates carry multiple sample points so their velocity gradients are visible; small plates carry fewer.',
        'All poles and boundary geometry come from the same PB2002 model, so plates and motions are internally consistent.',
        'Euler vectors are stated with high precision to avoid round-off, but their true accuracy is lower (Table 1, footnote a).',
      ],
      poleMetadata: polesPayload.metadata,
    },
    features,
  };
}


function roundCoord(value) {
  return Number.parseFloat(value.toFixed(3));
}

function buildPoint(longitude, latitude) {
  return [roundCoord(normalizeLongitude(longitude)), roundCoord(latitude)];
}

function pointsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function buildPlateDisplayName(plateCode) {
  return PLATE_NAME_MAP[plateCode] ?? `PB2002 plate ${plateCode}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function flushOpenLine(groups, openLine) {
  if (!openLine) return;
  const group = groups.get(openLine.sourceType);
  group.lines.push(openLine.coordinates);
}

function parseBoundarySteps(rawText) {
  const groups = new Map();
  Object.entries(TYPE_MAP).forEach(([sourceType, meta]) => {
    groups.set(sourceType, {
      sourceType,
      category: meta.category,
      label: meta.label,
      lines: [],
      rawStepCount: 0,
    });
  });

  let openLine = null;

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const tokens = line.split(/\s+/);
    const sourceType = tokens.at(-1);
    if (!TYPE_MAP[sourceType] || tokens.length < 7) continue;

    const startLon = Number.parseFloat(tokens[2]);
    const startLat = Number.parseFloat(tokens[3]);
    const endLon = Number.parseFloat(tokens[4]);
    const endLat = Number.parseFloat(tokens[5]);
    if ([startLon, startLat, endLon, endLat].some(Number.isNaN)) continue;

    const group = groups.get(sourceType);
    group.rawStepCount += 1;

    const segmentKey = (tokens[1] || '').replace(/^:/, '');
    const start = buildPoint(startLon, startLat);
    const end = buildPoint(endLon, endLat);

    const continuesOpenLine =
      openLine &&
      openLine.sourceType === sourceType &&
      openLine.segmentKey === segmentKey &&
      pointsEqual(openLine.coordinates[openLine.coordinates.length - 1], start);

    if (continuesOpenLine) {
      openLine.coordinates.push(end);
      continue;
    }

    flushOpenLine(groups, openLine);
    openLine = {
      sourceType,
      segmentKey,
      coordinates: [start, end],
    };
  }

  flushOpenLine(groups, openLine);

  return TYPE_ORDER
    .map((sourceType) => groups.get(sourceType))
    .filter((group) => group.lines.length > 0)
    .map((group) => ({
      type: 'Feature',
      properties: {
        id: `pb2002-${group.sourceType.toLowerCase()}`,
        sourceModel: 'PB2002',
        citationShort: 'Bird (2003)',
        category: group.category,
        sourceType: group.sourceType,
        label: group.label,
        lineCount: group.lines.length,
        rawStepCount: group.rawStepCount,
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: group.lines,
      },
    }))
    .sort((a, b) => {
      const categoryDelta =
        CATEGORY_ORDER.indexOf(a.properties.category) - CATEGORY_ORDER.indexOf(b.properties.category);
      if (categoryDelta !== 0) return categoryDelta;
      return TYPE_ORDER.indexOf(a.properties.sourceType) - TYPE_ORDER.indexOf(b.properties.sourceType);
    });
}

function parsePlatePolygons(rawText) {
  const features = [];
  let currentPlateCode = null;
  let currentRing = [];

  function flushPlateRing() {
    if (!currentPlateCode || currentRing.length < 4) {
      currentPlateCode = null;
      currentRing = [];
      return;
    }

    const firstPoint = currentRing[0];
    const lastPoint = currentRing[currentRing.length - 1];
    if (!pointsEqual(firstPoint, lastPoint)) {
      currentRing.push(firstPoint);
    }

    features.push({
      type: 'Feature',
      properties: {
        id: `pb2002-plate-${currentPlateCode.toLowerCase()}`,
        sourceModel: 'PB2002',
        citationShort: 'Bird (2003)',
        plateCode: currentPlateCode,
        displayName: buildPlateDisplayName(currentPlateCode),
        pointCount: currentRing.length,
        isMajorPlate: MAJOR_PLATE_CODES.has(currentPlateCode),
        hasKnownName: Boolean(PLATE_NAME_MAP[currentPlateCode]),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [currentRing],
      },
    });

    currentPlateCode = null;
    currentRing = [];
  }

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('*** end of line segment')) {
      flushPlateRing();
      continue;
    }

    if (line.includes(',')) {
      const [lonText, latText] = line.split(',').map(token => token.trim());
      const longitude = Number.parseFloat(lonText);
      const latitude = Number.parseFloat(latText);
      if (!Number.isNaN(longitude) && !Number.isNaN(latitude)) {
        currentRing.push(buildPoint(longitude, latitude));
      }
      continue;
    }

    flushPlateRing();
    currentPlateCode = line.slice(0, 2).trim().toUpperCase();
    currentRing = [];
  }

  flushPlateRing();

  return features.sort((a, b) => a.properties.plateCode.localeCompare(b.properties.plateCode));
}

function buildFeatureCollection(features) {
  const categoryCounts = features.reduce((accumulator, feature) => {
    const { category, lineCount, rawStepCount } = feature.properties;
    if (!accumulator[category]) {
      accumulator[category] = {
        featureTypes: 0,
        lineCount: 0,
        rawStepCount: 0,
      };
    }
    accumulator[category].featureTypes += 1;
    accumulator[category].lineCount += lineCount;
    accumulator[category].rawStepCount += rawStepCount;
    return accumulator;
  }, {});

  return {
    type: 'FeatureCollection',
    metadata: {
      name: 'Peter Bird PB2002 present-day plate boundaries',
      citation:
        'Bird, P. (2003). An updated digital model of plate boundaries. Geochemistry Geophysics Geosystems, 4(3), 1027. doi:10.1029/2001GC000252.',
      sourceUrls: SOURCE_URLS,
      generatedAt: new Date().toISOString(),
      generatedBy: 'scripts/build-pb2002-boundaries.mjs',
      categoryCounts,
      notes: [
        'Derived from PB2002_steps.dat.txt.',
        'Boundary classes are grouped into convergent, divergent, and transform categories for the browser map.',
        'Longitudes greater than 180° are normalized into the [-180, 180] range.',
        'Coordinates are rounded to 0.001° for lighter browser payloads.',
      ],
    },
    features,
  };
}

function buildPlateFeatureCollection(features) {
  const majorPlateCount = features.filter(feature => feature.properties.isMajorPlate).length;

  return {
    type: 'FeatureCollection',
    metadata: {
      name: 'Peter Bird PB2002 present-day tectonic plates',
      citation:
        'Bird, P. (2003). An updated digital model of plate boundaries. Geochemistry Geophysics Geosystems, 4(3), 1027. doi:10.1029/2001GC000252.',
      sourceUrls: SOURCE_URLS,
      generatedAt: new Date().toISOString(),
      generatedBy: 'scripts/build-pb2002-boundaries.mjs',
      featureCount: features.length,
      majorPlateCount,
      notes: [
        'Derived from PB2002_plates.dig.txt.',
        'Each feature is a closed plate outline digitized counterclockwise in the source dataset.',
        'Longitudes greater than 180° are normalized into the [-180, 180] range for the browser artifact.',
        'Coordinates are rounded to 0.001° for lighter browser payloads.',
      ],
    },
    features,
  };
}

async function writeJsonFile(outputFile, payload) {
  await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function loadPlateFeatures(scriptDirectory, platesText) {
  if (platesText) return parsePlatePolygons(platesText);

  const committedPath = path.join(scriptDirectory, '..', 'public', 'data', 'tectonics', 'pb2002-plates.geojson');
  const committed = JSON.parse(await readFile(committedPath, 'utf8'));
  if (!Array.isArray(committed?.features) || committed.features.length === 0) {
    throw new Error(`Could not fetch PB2002 plates and no committed artifact at ${committedPath}`);
  }
  return committed.features.map(feature => ({
    ...feature,
    properties: { ...feature.properties },
  }));
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputDirectory = path.join(__dirname, '..', 'public', 'data', 'tectonics');
  const boundaryOutputFile = path.join(outputDirectory, 'pb2002-boundaries.geojson');
  const plateOutputFile = path.join(outputDirectory, 'pb2002-plates.geojson');
  const motionOutputFile = path.join(outputDirectory, MOTION_OUTPUT_FILE);

  const [stepsText, platesText] = await Promise.all([
    fetchText(SOURCE_URLS.steps).catch(() => null),
    fetchText(SOURCE_URLS.plates).catch(() => null),
  ]);

  if (!stepsText) {
    console.warn('Could not fetch PB2002 steps source; keeping the committed boundary artifact.');
  }
  if (!platesText) {
    console.warn('Could not fetch PB2002 plates source; reusing the committed plate artifact for motion computation.');
  }

  const boundaryFeatures = stepsText ? parseBoundarySteps(stepsText) : [];
  const boundaryFeatureCollection = stepsText ? buildFeatureCollection(boundaryFeatures) : null;
  const plateFeatures = await loadPlateFeatures(__dirname, platesText);
  const plateFeatureCollection = platesText ? buildPlateFeatureCollection(plateFeatures) : null;

  const polesPayload = await loadEulerPoles(__dirname);
  const poleCodes = new Set(polesPayload.plates.map(pole => pole.code));
  const plateCodes = new Set(plateFeatures.map(feature => feature.properties.plateCode));
  for (const code of poleCodes) {
    if (!plateCodes.has(code)) {
      throw new Error(`Euler pole ${code} has no matching PB2002 plate polygon`);
    }
  }
  const { features: motionFeatures, perPlateSummary } = buildMotionFeatures(plateFeatures, polesPayload);
  assertMotionSanity(motionFeatures, polesPayload);
  const motionFeatureCollection = buildMotionFeatureCollection(motionFeatures, polesPayload, plateFeatures.length);

  await mkdir(outputDirectory, { recursive: true });
  if (boundaryFeatureCollection) await writeJsonFile(boundaryOutputFile, boundaryFeatureCollection);
  if (plateFeatureCollection) await writeJsonFile(plateOutputFile, plateFeatureCollection);
  await writeJsonFile(motionOutputFile, motionFeatureCollection);

  if (boundaryFeatures.length) {
    const boundarySummary = boundaryFeatures
      .map((feature) => `${feature.properties.sourceType}: ${feature.properties.lineCount} lines (${feature.properties.rawStepCount} raw steps)`)
      .join('\n');
    console.log(`Wrote ${boundaryOutputFile}`);
    console.log(boundarySummary);
  }
  if (plateFeatureCollection) {
    console.log(`Wrote ${plateOutputFile}`);
    console.log(`Plate polygons: ${plateFeatures.length} features (${plateFeatures.filter(feature => feature.properties.isMajorPlate).length} major-plate labels)`);
  }

  console.log(`Wrote ${motionOutputFile}`);
  console.log(`Motion vectors: ${motionFeatures.length} sample points across ${plateFeatures.length} plates (Pacific reference frame)`);
  console.table(
    perPlateSummary
      .filter(entry => entry.vectors > 0)
      .map(entry => ({
        plate: entry.code,
        name: entry.name,
        vectors: entry.vectors,
        'speed mm/yr': entry.speedMmYr,
        'azimuth deg': entry.azimuthDeg,
        'omega deg/Myr': entry.omega,
      })),
  );
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
