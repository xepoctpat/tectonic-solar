export const NEAR_VOLCANO_KM = 150;

export function kmBetween(lat1, lon1, lat2, lon2) {
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lon, lat, geometry) {
  if (!geometry) return false;
  const polys = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
  return polys.some((rings) => {
    if (!Array.isArray(rings) || rings.length === 0) return false;
    if (!pointInRing(lon, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i += 1) {
      if (pointInRing(lon, lat, rings[i])) return false;
    }
    return true;
  });
}

export function isTongaNamed(volcano) {
  const props = volcano?.properties || volcano || {};
  const blob = [props.name, props.region, props.country, props.volcanoType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /tonga|kermadec|hunga/.test(blob);
}

function volcanoLatLon(feature) {
  const lon = feature?.geometry?.coordinates?.[0];
  const lat = feature?.geometry?.coordinates?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function nearestQuakeKm(volcano, earthquakes) {
  const loc = volcanoLatLon(volcano);
  if (!loc) return null;
  let nearest = null;
  for (const eq of earthquakes) {
    if (!Number.isFinite(eq.lat) || !Number.isFinite(eq.lon)) continue;
    const km = kmBetween(loc.lat, loc.lon, eq.lat, eq.lon);
    if (nearest == null || km < nearest) nearest = km;
  }
  return nearest;
}

export function summarizeVolcanoSeismicity({
  volcanoes = [],
  earthquakes = [],
  tongaGeometry = null,
} = {}) {
  const quakes = Array.isArray(earthquakes) ? earthquakes : [];
  const cats = Array.isArray(volcanoes) ? volcanoes : [];

  const unrest = cats.filter(v => v.properties?.class === 'unrest');
  const quakesNearVolcano = quakes.filter((eq) => {
    if (!Number.isFinite(eq.lat) || !Number.isFinite(eq.lon)) return false;
    return cats.some((volcano) => {
      const loc = volcanoLatLon(volcano);
      if (!loc) return false;
      const klass = volcano.properties?.class;
      if (klass !== 'unrest' && klass !== 'active') return false;
      return kmBetween(eq.lat, eq.lon, loc.lat, loc.lon) <= NEAR_VOLCANO_KM;
    });
  });
  const quakesNearUnrest = quakes.filter((eq) => {
    if (!Number.isFinite(eq.lat) || !Number.isFinite(eq.lon)) return false;
    return unrest.some((volcano) => {
      const loc = volcanoLatLon(volcano);
      return loc && kmBetween(eq.lat, eq.lon, loc.lat, loc.lon) <= NEAR_VOLCANO_KM;
    });
  });

  const tongaVolcanoes = cats.filter((volcano) => {
    const loc = volcanoLatLon(volcano);
    const inPlate = loc && pointInPolygon(loc.lon, loc.lat, tongaGeometry);
    return inPlate || isTongaNamed(volcano);
  });
  const tongaQuakes = quakes.filter((eq) => {
    if (!Number.isFinite(eq.lat) || !Number.isFinite(eq.lon)) return false;
    if (tongaGeometry && pointInPolygon(eq.lon, eq.lat, tongaGeometry)) return true;
    return /tonga|kermadec|hunga/i.test(String(eq.place || ''));
  });
  const tongaQuakesNearVolcano = tongaQuakes.filter((eq) => tongaVolcanoes.some((volcano) => {
    const loc = volcanoLatLon(volcano);
    return loc && kmBetween(eq.lat, eq.lon, loc.lat, loc.lon) <= NEAR_VOLCANO_KM;
  }));

  const hunga = cats.find(v => /hunga/i.test(String(v.properties?.name || ''))) || null;

  const nearbyPairs = unrest.concat(cats.filter(v => v.properties?.class === 'active'))
    .map((volcano) => {
      const loc = volcanoLatLon(volcano);
      if (!loc) return null;
      const nearby = quakes.filter(eq => Number.isFinite(eq.lat) && Number.isFinite(eq.lon)
        && kmBetween(eq.lat, eq.lon, loc.lat, loc.lon) <= NEAR_VOLCANO_KM);
      if (nearby.length === 0) return null;
      const maxMag = nearby.reduce((max, eq) => Math.max(max, eq.mag || 0), 0);
      return {
        name: volcano.properties.name,
        class: volcano.properties.class,
        vnum: volcano.properties.vnum,
        quakeCount: nearby.length,
        maxMag,
        nearestKm: Math.round(nearestQuakeKm(volcano, nearby) ?? 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.quakeCount - a.quakeCount || b.maxMag - a.maxMag)
    .slice(0, 8);

  return {
    quakeCount: quakes.length,
    volcanoCount: cats.length,
    unrestCount: unrest.length,
    quakesNearVolcano: quakesNearVolcano.length,
    quakesNearUnrest: quakesNearUnrest.length,
    tonga: {
      volcanoCount: tongaVolcanoes.length,
      quakeCount: tongaQuakes.length,
      quakesNearVolcano: tongaQuakesNearVolcano.length,
      hungaName: hunga?.properties?.name || null,
      hungaClass: hunga?.properties?.class || null,
      hungaYear: hunga?.properties?.lastEruptionYear ?? null,
    },
    nearbyPairs,
  };
}
