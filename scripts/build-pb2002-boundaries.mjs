import { mkdir, writeFile } from 'node:fs/promises';
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

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputDirectory = path.join(__dirname, '..', 'public', 'data', 'tectonics');
  const boundaryOutputFile = path.join(outputDirectory, 'pb2002-boundaries.geojson');
  const plateOutputFile = path.join(outputDirectory, 'pb2002-plates.geojson');

  const [stepsText, platesText] = await Promise.all([
    fetchText(SOURCE_URLS.steps),
    fetchText(SOURCE_URLS.plates),
  ]);

  const boundaryFeatures = parseBoundarySteps(stepsText);
  const boundaryFeatureCollection = buildFeatureCollection(boundaryFeatures);
  const plateFeatures = parsePlatePolygons(platesText);
  const plateFeatureCollection = buildPlateFeatureCollection(plateFeatures);

  await mkdir(outputDirectory, { recursive: true });
  await writeJsonFile(boundaryOutputFile, boundaryFeatureCollection);
  await writeJsonFile(plateOutputFile, plateFeatureCollection);

  const boundarySummary = boundaryFeatures
    .map((feature) => `${feature.properties.sourceType}: ${feature.properties.lineCount} lines (${feature.properties.rawStepCount} raw steps)`)
    .join('\n');

  console.log(`Wrote ${boundaryOutputFile}`);
  console.log(boundarySummary);
  console.log(`Wrote ${plateOutputFile}`);
  console.log(`Plate polygons: ${plateFeatures.length} features (${plateFeatures.filter(feature => feature.properties.isMajorPlate).length} major-plate labels)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
