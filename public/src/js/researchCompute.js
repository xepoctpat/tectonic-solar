import { RESEARCH_APIS } from './config.js';
import { fetchWithRetry } from './utils.js';

function toEpochMs(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function serializeStorm(storm) {
  const date = toEpochMs(storm?.date);
  const kp = Number(storm?.kp);
  if (!Number.isFinite(date) || !Number.isFinite(kp)) return null;

  return { date, kp };
}

function serializeEarthquake(earthquake) {
  const date = toEpochMs(earthquake?.date);
  const mag = Number(earthquake?.mag);
  if (!Number.isFinite(date) || !Number.isFinite(mag)) return null;

  return {
    date,
    mag,
    lat: Number.isFinite(Number(earthquake?.lat)) ? Number(earthquake.lat) : undefined,
    lon: Number.isFinite(Number(earthquake?.lon)) ? Number(earthquake.lon) : undefined,
    place: earthquake?.place || '',
  };
}

export async function checkResearchSidecarStatus() {
  if (!RESEARCH_APIS.status) {
    return {
      ok: false,
      online: false,
      reason: 'proxy-required',
      message: 'Node proxy mode is required for Python research compute.',
    };
  }

  try {
    const response = await fetchWithRetry(RESEARCH_APIS.status, 1, 750);
    const data = await response.json();

    if (!response.ok || data.ok === false) {
      return {
        ok: false,
        online: false,
        reason: 'offline',
        message: data.message || data.error || 'Python research sidecar is unavailable.',
      };
    }

    return {
      ok: true,
      online: true,
      ...data,
    };
  } catch (error) {
    return {
      ok: false,
      online: false,
      reason: 'offline',
      message: error?.message || 'Python research sidecar is unavailable.',
    };
  }
}

export async function runBootstrapNullTest({
  storms,
  earthquakes,
  permutations = 1000,
  maxLag = 60,
  targetMinLag = 25,
  targetMaxLag = 30,
  randomSeed = 42,
} = {}) {
  if (!RESEARCH_APIS.bootstrap) {
    throw new Error('Node proxy mode is required for bootstrap null testing.');
  }

  const payload = {
    storms: (storms || []).map(serializeStorm).filter(Boolean),
    earthquakes: (earthquakes || []).map(serializeEarthquake).filter(Boolean),
    permutations,
    maxLag,
    targetMinLag,
    targetMaxLag,
    randomSeed,
  };

  const response = await fetchWithRetry(RESEARCH_APIS.bootstrap, 1, 1000, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Bootstrap null test failed (HTTP ${response.status})`);
  }

  return data;
}
