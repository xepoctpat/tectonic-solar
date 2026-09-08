'use strict';

const NEAR_QUAKE_KM = 150;
const ACTIVE_SINCE_YEAR = 1800;

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyVolcano(lastEruptionYear, usgs) {
  const color = String(usgs?.color_code || '').toUpperCase();
  const alertLevel = usgs?.alert_level || null;
  if (color === 'RED' || color === 'ORANGE' || color === 'YELLOW') {
    return { class: 'unrest', alert: color, alertLevel };
  }
  const year = toNumber(lastEruptionYear);
  const dated = year != null && year !== 0;
  if (dated && year >= ACTIVE_SINCE_YEAR) {
    return { class: 'active', alert: color || null, alertLevel };
  }
  if (dated) {
    return { class: 'dormant', alert: null, alertLevel: null };
  }
  return { class: 'unknown', alert: null, alertLevel: null };
}

function thinGvpFeature(feature, usgsByVnum) {
  const coords = feature?.geometry?.coordinates;
  const longitude = toNumber(coords?.[0] ?? feature?.properties?.Longitude);
  const latitude = toNumber(coords?.[1] ?? feature?.properties?.Latitude);
  if (longitude == null || latitude == null) return null;

  const props = feature.properties || {};
  const vnum = String(props.Volcano_Number ?? props.VolcanoNumber ?? '').trim();
  const usgs = vnum ? usgsByVnum.get(vnum) : null;
  const lastEruptionYear = toNumber(props.Last_Eruption_Year);
  const classified = classifyVolcano(lastEruptionYear, usgs);

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: {
      vnum: vnum || null,
      name: String(props.Volcano_Name || props.VolcanoName || 'Unnamed volcano'),
      volcanoType: props.Primary_Volcano_Type || props.Volcanic_Landform || null,
      lastEruptionYear,
      country: props.Country || null,
      region: props.Region || null,
      elevationM: toNumber(props.Elevation),
      tectonicSetting: props.Tectonic_Setting || null,
      class: classified.class,
      alert: classified.alert,
      alertLevel: classified.alertLevel,
      usgsNoticeUrl: usgs?.notice_url || null,
      source: 'Smithsonian GVP',
    },
    id: vnum || `gvp-${latitude}-${longitude}`,
  };
}

function indexUsgsAlerts(alerts) {
  const map = new Map();
  for (const alert of Array.isArray(alerts) ? alerts : []) {
    const vnum = String(alert?.vnum || '').trim();
    if (!vnum) continue;
    map.set(vnum, alert);
  }
  return map;
}

function kmBetween(lat1, lon1, lat2, lon2) {
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function markNearQuakes(volcanoes, earthquakes, radiusKm = NEAR_QUAKE_KM) {
  const quakes = Array.isArray(earthquakes) ? earthquakes : [];
  return volcanoes.map(feature => {
    const lon = feature.geometry.coordinates[0];
    const lat = feature.geometry.coordinates[1];
    let nearestKm = null;
    for (const quake of quakes) {
      const qLat = toNumber(quake.lat);
      const qLon = toNumber(quake.lon);
      if (qLat == null || qLon == null) continue;
      const km = kmBetween(lat, lon, qLat, qLon);
      if (nearestKm == null || km < nearestKm) nearestKm = km;
    }
    const nearQuake = nearestKm != null && nearestKm <= radiusKm;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        nearQuake,
        nearestQuakeKm: nearQuake ? Math.round(nearestKm) : null,
      },
    };
  });
}

function mergeVolcanoCatalog(gvpCollection, usgsAlerts) {
  const usgsByVnum = indexUsgsAlerts(usgsAlerts);
  const features = (Array.isArray(gvpCollection?.features) ? gvpCollection.features : [])
    .map(feature => thinGvpFeature(feature, usgsByVnum))
    .filter(Boolean);

  const counts = { unrest: 0, active: 0, dormant: 0, unknown: 0 };
  for (const feature of features) {
    counts[feature.properties.class] = (counts[feature.properties.class] || 0) + 1;
  }

  return {
    type: 'FeatureCollection',
    metadata: {
      count: features.length,
      counts,
      sources: ['Smithsonian GVP Holocene', 'USGS Volcano Notification Service (elevated)'],
      citation: 'Global Volcanism Program, 2026. Volcanoes of the World (v. 5.4.0). Smithsonian Institution. https://doi.org/10.5479/si.GVP.VOTW5-2026.5.4',
      usgsAttribution: 'USGS Volcano Hazards Program aviation color codes',
      classes: {
        unrest: 'USGS YELLOW / ORANGE / RED (live aviation code)',
        active: `Last eruption year ≥ ${ACTIVE_SINCE_YEAR} (GVP Holocene)`,
        dormant: `Holocene, last eruption before ${ACTIVE_SINCE_YEAR}`,
      },
      nearQuakeKm: NEAR_QUAKE_KM,
    },
    features,
  };
}

module.exports = {
  NEAR_QUAKE_KM,
  ACTIVE_SINCE_YEAR,
  classifyVolcano,
  thinGvpFeature,
  indexUsgsAlerts,
  kmBetween,
  markNearQuakes,
  mergeVolcanoCatalog,
};
