'use strict';

// Ranked live M4.5+ merge. Lower rank wins when two catalogs report the same event.
const SEISMIC_SOURCE_RANK = {
  USGS: 0,
  'EMSC SeismicPortal': 1,
  'GFZ GEOFON': 2,
};

function parseFdsnTime(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  if (/Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) return Date.parse(raw);
  return Date.parse(`${raw}Z`);
}

function normalizeSeismicFeature(feature, source) {
  const coordinates = feature?.geometry?.coordinates;
  const properties = feature?.properties || {};
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  const depth = Number(coordinates?.[2]);
  const magnitude = Number(properties.mag ?? properties.magnitude);
  const time = typeof properties.time === 'number'
    ? properties.time
    : Date.parse(properties.time || properties.originTime || '');

  if (![longitude, latitude, magnitude, time].every(Number.isFinite)) return null;

  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [longitude, latitude, Number.isFinite(depth) ? depth : null],
    },
    properties: {
      mag: magnitude,
      magType: properties.magType || properties.magtype || null,
      place: String(properties.place || properties.flynn_region || properties.description || 'Unknown location'),
      time,
      updated: Number.isFinite(Number(properties.updated)) ? Number(properties.updated) : time,
      url: properties.url || null,
      source,
      sourceEventId: feature.id || properties.eventid || properties.id || null,
    },
    id: feature.id || properties.eventid || properties.id || `${source}-${time}-${latitude}-${longitude}`,
  };
}

function parseFdsnEventText(body, source) {
  if (typeof body !== 'string' || !body.trim()) return [];

  const features = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('|');
    if (cols.length < 11) continue;

    const eventType = String(cols[13] || 'earthquake').trim().toLowerCase();
    if (eventType && eventType !== 'earthquake') continue;

    const eventId = String(cols[0] || '').trim();
    const time = parseFdsnTime(cols[1]);
    const latitude = Number(cols[2]);
    const longitude = Number(cols[3]);
    const depth = Number(cols[4]);
    const magType = String(cols[9] || '').trim();
    const magnitude = Number(cols[10]);
    const place = String(cols[12] || '').trim() || 'Unknown location';

    if (![longitude, latitude, magnitude, time].every(Number.isFinite)) continue;

    const url = source === 'GFZ GEOFON' && eventId
      ? `https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(eventId)}`
      : null;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude, Number.isFinite(depth) ? depth : null],
      },
      properties: {
        mag: magnitude,
        magType: magType || null,
        place,
        time,
        updated: time,
        url,
        source,
        sourceEventId: eventId || null,
      },
      id: eventId || `${source}-${time}-${latitude}-${longitude}`,
    });
  }
  return features;
}

function seismicEventsMatch(left, right) {
  const leftCoords = left.geometry.coordinates;
  const rightCoords = right.geometry.coordinates;
  const distance = Math.hypot(leftCoords[0] - rightCoords[0], leftCoords[1] - rightCoords[1]);
  return Math.abs(left.properties.time - right.properties.time) <= 120_000
    && distance <= 0.5
    && Math.abs(left.properties.mag - right.properties.mag) <= 0.4;
}

function providerRank(source) {
  const rank = SEISMIC_SOURCE_RANK[source];
  return Number.isInteger(rank) ? rank : 99;
}

function mergeRankedSeismicProviders(providers) {
  const accepted = [];
  const ranked = [...providers].sort((left, right) => providerRank(left.source) - providerRank(right.source));
  for (const provider of ranked) {
    for (const feature of provider.features || []) {
      if (!accepted.some(existing => seismicEventsMatch(existing, feature))) {
        accepted.push(feature);
      }
    }
  }
  accepted.sort((left, right) => right.properties.time - left.properties.time);
  return accepted;
}

module.exports = {
  SEISMIC_SOURCE_RANK,
  parseFdsnTime,
  parseFdsnEventText,
  normalizeSeismicFeature,
  seismicEventsMatch,
  mergeRankedSeismicProviders,
};
