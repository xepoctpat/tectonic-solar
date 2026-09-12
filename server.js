const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { loadLocalEnv, createAiBriefingHandler } = require('./ai-briefing');
const {
  parseFdsnEventText,
  normalizeSeismicFeature,
  mergeRankedSeismicProviders,
} = require('./lib/seismic-merge.cjs');
const { mergeVolcanoCatalog } = require('./lib/volcanoes.cjs');

loadLocalEnv(__dirname);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const REQUEST_TIMEOUT_MS = 15000;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdn.vercel-insights.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://services.swpc.noaa.gov https://earthquake.usgs.gov https://api.open-meteo.com https://air-quality-api.open-meteo.com https://www.ngdc.noaa.gov https://vitals.vercel-insights.com",
  "font-src 'self' data: https:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_COMCAT_ORDER = new Set(['time-asc', 'time', 'magnitude']);
const DAYIND_ARCHIVE_MIN_DATE = new Date('2011-01-01T00:00:00Z');
const FALLBACK_LOG_THROTTLE_MS = 15 * 60 * 1000;
const RESEARCH_SIDECAR = {
  baseUrl: 'http://127.0.0.1:5051',
  timeoutMs: 120_000,
  payloadLimit: '512kb',
  maxStorms: 5_000,
  maxEarthquakes: 10_000,
};
const researchJsonParser = express.json({ limit: RESEARCH_SIDECAR.payloadLimit });
const fallbackLogState = new Map();
// Process-lifetime last-good bodies only. Advertised via X-Feed-Freshness; not a database.
const lastGoodFeeds = new Map();

function toIsoZ(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildGfzKpUrl(hours) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const params = new URLSearchParams({
    start: toIsoZ(start),
    end: toIsoZ(end),
    index: 'Kp',
  });
  return `${UPSTREAM.gfz.kpJson}?${params}`;
}

function normalizeGfzKpBody(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return JSON.stringify({ source: 'GFZ Potsdam', license: 'CC BY 4.0', points: [] });
  }
  const times = Array.isArray(data.datetime) ? data.datetime : [];
  const values = Array.isArray(data.Kp) ? data.Kp : [];
  const statuses = Array.isArray(data.status) ? data.status : [];
  const n = Math.min(times.length, values.length);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const kp = Number(values[i]);
    if (!Number.isFinite(kp) || !times[i]) continue;
    points.push({
      time: times[i],
      kp,
      status: statuses[i] || null,
      source: 'GFZ Potsdam',
    });
  }
  return JSON.stringify({
    source: 'GFZ Potsdam',
    license: 'CC BY 4.0',
    attribution: 'GFZ German Research Centre for Geosciences',
    points,
  });
}

function normalizeRtswWindBody(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return body;
  }
  if (!Array.isArray(data)) return body;

  const mapped = data.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    return {
      ...row,
      speed: row.speed ?? row.proton_speed,
      density: row.density ?? row.proton_density,
      temperature: row.temperature ?? row.proton_temperature,
    };
  });
  return JSON.stringify(mapped);
}

app.disable('x-powered-by');

// Rate limiting — 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  next();
});

// Serve only the public/ directory — no project root files are web-accessible
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  dotfiles: 'deny',
}));

const UPSTREAM = {
  noaa: {
    rtswMag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
    // SCN 26-21: rtsw_plasma_1m.json retired. rtsw_wind_1m.json is the successor.
    rtswWind: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
    rtswPlasma: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
    kp1m: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    kpHistory: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    xray7d: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json',
    proton6h: 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-6-hour.json',
    dst: 'https://services.swpc.noaa.gov/products/kyoto-dst.json',
    dayindArchiveBase: 'https://www.ngdc.noaa.gov/stp/space-weather/swpc-products/daily_reports/space_weather_indices',
  },
  usgs: {
    m45Day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    m25Week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    m45Week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
  },
  emsc: {
    eventQuery: 'https://www.seismicportal.eu/fdsnws/event/1/query',
  },
  geofon: {
    eventQuery: 'https://geofon.gfz.de/fdsnws/event/1/query',
    version: 'https://geofon.gfz.de/fdsnws/event/1/version',
  },
  gfz: {
    kpJson: 'https://kp.gfz.de/app/json/',
  },
  gvp: {
    holocene: 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json',
    holoceneProbe: 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&maxFeatures=1&outputFormat=application/json',
  },
  usgsVolcano: {
    elevated: 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes',
  },
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseBoundedNumber(value, { min, max, fallback }) {
  const parsed = Number(firstQueryValue(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function parseDateOnly(value) {
  const normalized = firstQueryValue(value);
  return typeof normalized === 'string' && ISO_DATE_ONLY_PATTERN.test(normalized)
    ? normalized
    : null;
}

function buildDayindArchiveUrl(dateOnly) {
  const [year, month, day] = dateOnly.split('-');
  return `${UPSTREAM.noaa.dayindArchiveBase}/${year}/${month}/${year}${month}${day}dayind.txt`;
}

function parseResearchEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function logFallbackEvent(url, detail) {
  const key = `${url}::${detail}`;
  const now = Date.now();
  const existing = fallbackLogState.get(key);

  if (existing && now - existing.lastLoggedAt < FALLBACK_LOG_THROTTLE_MS) {
    existing.suppressedCount += 1;
    return;
  }

  const suppressedCount = existing?.suppressedCount || 0;
  fallbackLogState.set(key, {
    lastLoggedAt: now,
    suppressedCount: 0,
  });

  const suffix = suppressedCount > 0
    ? ` (+${suppressedCount} similar event${suppressedCount === 1 ? '' : 's'} suppressed)`
    : '';

  console.log(`[proxy] ${url} fell back to default (${detail})${suffix}`);
}

function validateResearchStorms(items) {
  if (!Array.isArray(items)) {
    throw new Error('storms must be an array');
  }
  if (items.length > RESEARCH_SIDECAR.maxStorms) {
    throw new Error(`storms exceeds limit (${RESEARCH_SIDECAR.maxStorms})`);
  }

  return items.map((storm, index) => {
    const date = parseResearchEpochMs(storm?.date);
    const kp = Number(storm?.kp);
    if (!Number.isFinite(date) || !Number.isFinite(kp)) {
      throw new Error(`storm[${index}] must include finite date and kp values`);
    }

    return { date, kp };
  });
}

function validateResearchEarthquakes(items) {
  if (!Array.isArray(items)) {
    throw new Error('earthquakes must be an array');
  }
  if (items.length > RESEARCH_SIDECAR.maxEarthquakes) {
    throw new Error(`earthquakes exceeds limit (${RESEARCH_SIDECAR.maxEarthquakes})`);
  }

  return items.map((earthquake, index) => {
    const date = parseResearchEpochMs(earthquake?.date);
    const mag = Number(earthquake?.mag);
    if (!Number.isFinite(date) || !Number.isFinite(mag)) {
      throw new Error(`earthquake[${index}] must include finite date and mag values`);
    }

    const lat = Number(earthquake?.lat);
    const lon = Number(earthquake?.lon);

    return {
      date,
      mag,
      ...(Number.isFinite(lat) ? { lat } : {}),
      ...(Number.isFinite(lon) ? { lon } : {}),
      ...(earthquake?.place ? { place: String(earthquake.place) } : {}),
    };
  });
}

async function fetchResearchSidecar(pathname, { method = 'GET', body, timeoutMs = RESEARCH_SIDECAR.timeoutMs } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${RESEARCH_SIDECAR.baseUrl}${pathname}`, {
      method,
      signal: controller.signal,
      headers: {
        'User-Agent': 'tectonic-solar-local-proxy/1.0',
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    });

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      json,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/research/status', async (_req, res) => {
  try {
    const upstream = await fetchResearchSidecar('/health', { timeoutMs: 5_000 });
    if (!upstream.ok) {
      res.status(200).json({
        ok: false,
        online: false,
        error: upstream.json?.error || 'Python research sidecar returned a non-success status',
        message: upstream.json?.message || upstream.text || 'Start the local Python research sidecar after activating solar-env.',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      online: true,
      ...(upstream.json || {}),
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    res.status(200).json({
      ok: false,
      online: false,
      error: isTimeout ? 'Python research sidecar timeout' : 'Python research sidecar unavailable',
      message: 'Activate solar-env and run python scripts/research_sidecar.py to enable deterministic bootstrap null testing.',
    });
  }
});

app.post('/api/research/bootstrap', researchJsonParser, async (req, res) => {
  let storms;
  let earthquakes;

  try {
    storms = validateResearchStorms(req.body?.storms);
    earthquakes = validateResearchEarthquakes(req.body?.earthquakes);
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || 'Invalid research payload' });
    return;
  }

  const permutations = parseBoundedNumber(req.body?.permutations, { min: 100, max: 5000, fallback: 1000 });
  const maxLag = parseBoundedNumber(req.body?.maxLag, { min: 1, max: 120, fallback: 60 });
  const targetMinLag = parseBoundedNumber(req.body?.targetMinLag, { min: 0, max: maxLag, fallback: Math.min(25, maxLag) });
  const targetMaxLag = parseBoundedNumber(req.body?.targetMaxLag, {
    min: targetMinLag,
    max: maxLag,
    fallback: Math.min(Math.max(30, targetMinLag), maxLag),
  });
  const randomSeed = parseBoundedNumber(req.body?.randomSeed, { min: 0, max: 2_147_483_647, fallback: 42 });

  try {
    const upstream = await fetchResearchSidecar('/bootstrap-null', {
      method: 'POST',
      body: JSON.stringify({
        storms,
        earthquakes,
        permutations,
        maxLag,
        targetMinLag,
        targetMaxLag,
        randomSeed,
      }),
    });

    if (!upstream.ok) {
      res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 503).json({
        ok: false,
        error: upstream.json?.error || 'Python bootstrap null test failed',
        message: upstream.json?.message || upstream.text || 'The local Python research sidecar did not complete the bootstrap request.',
      });
      return;
    }

    res.status(200).json(upstream.json || { ok: true });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    res.status(503).json({
      ok: false,
      error: isTimeout ? 'Python bootstrap null test timed out' : 'Python research sidecar unavailable',
      message: 'Activate solar-env and run python scripts/research_sidecar.py before requesting bootstrap null calibration.',
    });
  }
});

app.post('/api/research/bvalue', researchJsonParser, async (req, res) => {
  let earthquakes;

  try {
    earthquakes = validateResearchEarthquakes(req.body?.earthquakes);
  } catch (error) {
    res.status(400).json({ ok: false, error: error?.message || 'Invalid research payload' });
    return;
  }

  const completeness = parseBoundedNumber(req.body?.completeness, { min: 0, max: 10, fallback: 5 });

  try {
    const upstream = await fetchResearchSidecar('/bvalue', {
      method: 'POST',
      body: JSON.stringify({ earthquakes, completeness }),
    });

    if (!upstream.ok) {
      res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 503).json({
        ok: false,
        error: upstream.json?.error || 'Python b-value computation failed',
        message: upstream.json?.message || upstream.text || 'The local Python research sidecar did not complete the b-value request.',
      });
      return;
    }

    res.status(200).json(upstream.json || { ok: true });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    res.status(503).json({
      ok: false,
      error: isTimeout ? 'Python b-value computation timed out' : 'Python research sidecar unavailable',
      message: 'Activate solar-env and run python scripts/research_sidecar.py before requesting b-value analysis.',
    });
  }
});

app.use(express.json({ limit: '16kb' }));

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'tectonic-solar-local-proxy/1.0',
        Accept: 'application/json, text/plain, */*',
      },
    });

    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      contentType: response.headers.get('content-type') || 'application/json',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchWithTimeout(url);
      if (result.ok) {
        return result;
      }
      // On non-2xx, don't retry — upstream returned an error
      if (result.status < 500) {
        return result;
      }
      // On 5xx, retry once
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }
      return result;
    } catch (error) {
      // On network error, retry once
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
}

function sendLastGood(res, url, reason) {
  const cached = lastGoodFeeds.get(url);
  if (!cached) return false;
  res.status(200);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Feed-Freshness', 'last-good');
  res.setHeader('X-Last-Good-At', cached.savedAt);
  res.type(cached.contentType).send(cached.body);
  logFallbackEvent(url, `last-good after ${reason}`);
  return true;
}

function sendEmptyFallback(res, url, options, reason) {
  res.status(200);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Feed-Freshness', 'empty');
  res.type(options.fallbackContentType || 'application/json')
    .send(options.fallbackData || '[]');
  logFallbackEvent(url, reason);
}

async function proxyRequest(res, url, options = {}) {
  try {
    const upstream = await fetchWithRetry(url, options.maxRetries || 1);

    if (!upstream.ok) {
      if (sendLastGood(res, url, `status ${upstream.status}`)) return;
      if (options.fallbackOnError) {
        sendEmptyFallback(res, url, options, `status ${upstream.status}`);
        return;
      }

      res.status(502).json({
        ok: false,
        error: 'Upstream request failed',
        upstreamStatus: upstream.status,
        upstream: url,
      });
      return;
    }

    let body = upstream.body;
    if (typeof options.transformBody === 'function') {
      try {
        body = options.transformBody(body);
      } catch {
        body = upstream.body;
      }
    }

    lastGoodFeeds.set(url, {
      body,
      contentType: upstream.contentType || 'application/json',
      savedAt: new Date().toISOString(),
    });

    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Feed-Freshness', 'live');
    res.type(upstream.contentType).send(body);
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    const reason = `error: ${error?.message || 'unknown error'}`;

    if (sendLastGood(res, url, reason)) return;
    if (options.fallbackOnError) {
      sendEmptyFallback(res, url, options, reason);
      return;
    }

    res.status(502).json({
      ok: false,
      error: isTimeout ? 'Upstream timeout' : 'Proxy error',
      message: error?.message || String(error),
      upstream: url,
    });
  }
}

function parseProviderJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function fetchSeismicProvider(url, source, options = {}) {
  try {
    const result = await fetchWithRetry(url, 1);
    if (!result.ok) return { source, ok: false, status: result.status, features: [] };
    let features = [];
    if (options.textFormat === 'fdsn-text') {
      features = parseFdsnEventText(result.body, source);
    } else {
      const dataset = parseProviderJson(result.body);
      features = Array.isArray(dataset?.features)
        ? dataset.features.map(feature => normalizeSeismicFeature(feature, source)).filter(Boolean)
        : [];
    }
    return { source, ok: true, status: result.status, features };
  } catch (error) {
    return { source, ok: false, status: 0, features: [], error: error?.message || 'provider request failed' };
  }
}

const SEISMIC_LAST_GOOD_KEY = 'seismic:global';

async function loadGlobalSeismic() {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
  const windowParams = {
    starttime: startTime.toISOString(),
    endtime: endTime.toISOString(),
    minmagnitude: '4.5',
    orderby: 'time-asc',
    limit: '2000',
  };
  const emscParams = new URLSearchParams({ format: 'json', ...windowParams });
  const geofonParams = new URLSearchParams({ format: 'text', ...windowParams });

  const providers = await Promise.all([
    fetchSeismicProvider(UPSTREAM.usgs.m45Day, 'USGS'),
    fetchSeismicProvider(`${UPSTREAM.emsc.eventQuery}?${emscParams}`, 'EMSC SeismicPortal'),
    fetchSeismicProvider(`${UPSTREAM.geofon.eventQuery}?${geofonParams}`, 'GFZ GEOFON', { textFormat: 'fdsn-text' }),
  ]);

  const accepted = mergeRankedSeismicProviders(providers);
  const liveProviders = providers
    .filter(provider => provider.ok && provider.features.length > 0)
    .map(provider => provider.source);
  const sourceLabel = liveProviders.length > 0 ? liveProviders.join(' + ') : 'No live seismic providers';

  if (accepted.length === 0) {
    const cached = lastGoodFeeds.get(SEISMIC_LAST_GOOD_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.body);
        if (parsed?.metadata) {
          parsed.metadata.freshness = 'last-good';
          parsed.metadata.lastGoodAt = cached.savedAt;
        }
        return parsed;
      } catch {
        // fall through to empty
      }
    }
  }

  const collection = {
    type: 'FeatureCollection',
    metadata: {
      count: accepted.length,
      sourceLabel,
      freshness: accepted.length > 0 ? 'live' : 'empty',
      providers: providers.map(provider => ({
        source: provider.source,
        ok: provider.ok,
        status: provider.status,
        count: provider.features.length,
      })),
      deduplication: 'time ±120s, location ±0.5°, magnitude ±0.4; rank USGS > EMSC > GFZ GEOFON',
      geofon: {
        format: 'fdsn-text (JSON/GeoJSON not offered)',
        license: 'CC-BY-4.0',
        attribution: '© GFZ (GEOFON)',
        magNote: 'Preferred magnitudes are mixed mb/Mw; not homogenized with USGS',
      },
    },
    features: accepted,
  };

  if (accepted.length > 0) {
    lastGoodFeeds.set(SEISMIC_LAST_GOOD_KEY, {
      body: JSON.stringify(collection),
      contentType: 'application/json',
      savedAt: new Date().toISOString(),
    });
  }

  return collection;
}

const VOLCANO_LAST_GOOD_KEY = 'volcanoes:global';

async function loadVolcanoCatalog() {
  const [gvpResult, usgsResult] = await Promise.all([
    fetchWithRetry(UPSTREAM.gvp.holocene, 1).catch(error => ({ ok: false, status: 0, body: '', error })),
    fetchWithRetry(UPSTREAM.usgsVolcano.elevated, 1).catch(error => ({ ok: false, status: 0, body: '', error })),
  ]);

  const gvpCollection = gvpResult.ok ? parseProviderJson(gvpResult.body) : null;
  const usgsAlerts = usgsResult.ok ? parseProviderJson(usgsResult.body) : [];
  const hasGvp = gvpCollection && Array.isArray(gvpCollection.features) && gvpCollection.features.length > 0;

  if (!hasGvp) {
    const cached = lastGoodFeeds.get(VOLCANO_LAST_GOOD_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.body);
        if (parsed?.metadata) {
          parsed.metadata.freshness = 'last-good';
          parsed.metadata.lastGoodAt = cached.savedAt;
        }
        return parsed;
      } catch {
        // fall through
      }
    }
    return {
      type: 'FeatureCollection',
      metadata: {
        count: 0,
        freshness: 'empty',
        providers: {
          gvp: { ok: Boolean(gvpResult.ok), status: gvpResult.status || 0 },
          usgs: { ok: Boolean(usgsResult.ok), status: usgsResult.status || 0 },
        },
      },
      features: [],
    };
  }

  const collection = mergeVolcanoCatalog(gvpCollection, Array.isArray(usgsAlerts) ? usgsAlerts : []);
  collection.metadata.freshness = 'live';
  collection.metadata.providers = {
    gvp: { ok: true, status: gvpResult.status, count: gvpCollection.features.length },
    usgs: {
      ok: Boolean(usgsResult.ok),
      status: usgsResult.status || 0,
      elevated: Array.isArray(usgsAlerts) ? usgsAlerts.length : 0,
    },
  };

  lastGoodFeeds.set(VOLCANO_LAST_GOOD_KEY, {
    body: JSON.stringify(collection),
    contentType: 'application/json',
    savedAt: new Date().toISOString(),
  });
  return collection;
}

app.get('/api/volcanoes/global', async (_req, res) => {
  try {
    const collection = await loadVolcanoCatalog();
    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Feed-Freshness', collection?.metadata?.freshness || 'live');
    if (collection?.metadata?.lastGoodAt) {
      res.setHeader('X-Last-Good-At', collection.metadata.lastGoodAt);
    }
    res.json(collection);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error?.message || 'Volcano catalog merge failed',
    });
  }
});

app.get('/api/seismic/global', async (_req, res) => {
  try {
    const collection = await loadGlobalSeismic();
    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Feed-Freshness', collection?.metadata?.freshness || 'live');
    if (collection?.metadata?.lastGoodAt) {
      res.setHeader('X-Last-Good-At', collection.metadata.lastGoodAt);
    }
    res.json(collection);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error?.message || 'Seismic merge failed',
    });
  }
});

app.get('/api/noaa/rtsw-mag', (_req, res) => proxyRequest(res, UPSTREAM.noaa.rtswMag, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
const rtswWindProxyOptions = {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
  transformBody: normalizeRtswWindBody,
};
app.get('/api/noaa/rtsw-plasma', (_req, res) => proxyRequest(res, UPSTREAM.noaa.rtswWind, rtswWindProxyOptions));
app.get('/api/noaa/rtsw-wind', (_req, res) => proxyRequest(res, UPSTREAM.noaa.rtswWind, rtswWindProxyOptions));
app.get('/api/noaa/kp-1m', (_req, res) => proxyRequest(res, UPSTREAM.noaa.kp1m, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/noaa/kp-history', (_req, res) => proxyRequest(res, UPSTREAM.noaa.kpHistory, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/gfz/kp', (req, res) => {
  const hours = parseBoundedNumber(req.query.hours, { min: 6, max: 168, fallback: 72 });
  proxyRequest(res, buildGfzKpUrl(hours), {
    fallbackOnError: true,
    fallbackData: '{"source":"GFZ Potsdam","license":"CC BY 4.0","points":[]}',
    fallbackContentType: 'application/json',
    transformBody: normalizeGfzKpBody,
  });
});
app.get('/api/noaa/xrays', (_req, res) => proxyRequest(res, UPSTREAM.noaa.xray7d, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/noaa/protons', (_req, res) => proxyRequest(res, UPSTREAM.noaa.proton6h, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/noaa/dst', (_req, res) => proxyRequest(res, UPSTREAM.noaa.dst, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/noaa/dayind', (req, res) => {
  const date = parseDateOnly(req.query.date);

  if (!date) {
    res.status(400).json({ ok: false, error: 'Missing or invalid date query param' });
    return;
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);

  if (Number.isNaN(parsedDate.getTime()) || parsedDate < DAYIND_ARCHIVE_MIN_DATE || parsedDate > today) {
    res.status(400).json({ ok: false, error: 'date must be between 2011-01-01 and today' });
    return;
  }

  proxyRequest(res, buildDayindArchiveUrl(date), { maxRetries: 1 });
});

// Kyoto WDC monthly provisional Dst. The monthly index page embeds the full
// month of hourly Dst in a <pre class="data"> block in a fixed-width table;
// negative values may be glued together ("-313-390"), so parsing consumes
// one signed integer at a time. Server-side parse keeps one implementation.
//
// Quirk: wdc.kugi.kyoto-u.ac.jp returns 404 to HTTP/1.1 requests (only h2
// responses exist), and its TLS ALPN extension is malformed enough that
// Node's OpenSSL rejects the handshake outright. Node's fetch cannot do h2,
// so this host is fetched via curl (whose TLS stack tolerates the quirk),
// with the Node http2 client as an in-process fallback.
const KYOTO_DST_ORIGIN = 'https://wdc.kugi.kyoto-u.ac.jp';
const http2 = require('node:http2');
const { execFile } = require('node:child_process');

function fetchKyotoHttp2(pathname) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(KYOTO_DST_ORIGIN);
    session.setTimeout(REQUEST_TIMEOUT_MS, () => {
      session.destroy(new Error('Kyoto WDC request timed out'));
    });

    const request = session.request({
      ':method': 'GET',
      ':path': pathname,
      'user-agent': 'tectonic-solar-local-proxy/1.0',
      accept: 'text/html,*/*',
    });
    request.setEncoding('utf8');

    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const status = request.responseHeaders?.[':status'] ?? 0;
      session.close();
      resolve({ ok: status >= 200 && status < 300, status, body });
    });
    request.on('error', (error) => {
      session.destroy();
      reject(error);
    });
    session.on('error', (error) => reject(error));
    request.end();
  });
}

function fetchKyotoViaCurl(pathname) {
  return new Promise((resolve) => {
    execFile('curl', ['-s', '--max-time', '20', `${KYOTO_DST_ORIGIN}${pathname}`], { timeout: 25_000 }, (error, stdout) => {
      if (error || !stdout) {
        resolve({ ok: false, status: 0, body: '' });
        return;
      }
      resolve({ ok: stdout.includes('<pre class="data">'), status: stdout.includes('<pre class="data">') ? 200 : 404, body: stdout });
    });
  });
}

async function fetchKyotoMonthlyPage(pathname) {
  try {
    const viaHttp2 = await fetchKyotoHttp2(pathname);
    if (viaHttp2.ok) return viaHttp2;
  } catch { /* fall through to curl */ }

  return fetchKyotoViaCurl(pathname);
}

function parseKyotoDstHtml(html, yearMonth) {
  const match = /<pre class="data">([\s\S]*?)<\/pre>/i.exec(html || '');
  if (!match) return null;

  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const records = [];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^\d{1,2}\s/.test(line)) continue;

    const dayMatch = /^(\d{1,2})\s+(.*)$/.exec(line);
    if (!dayMatch) continue;
    const day = Number(dayMatch[1]);

    const values = [];
    let rest = dayMatch[2].trim();
    while (values.length < 24 && rest.length > 0) {
      const valueMatch = /^(-?\d{1,4})/.exec(rest);
      if (!valueMatch) break;
      const value = Number(valueMatch[1]);
      if (!Number.isInteger(value)) break;
      // Kyoto uses large negatives as missing-data markers (e.g. -9999).
      values.push(value <= -9999 ? null : value);
      rest = rest.slice(valueMatch[1].length).replace(/^\s+/, '');
    }

    if (values.length !== 24) continue;
    values.forEach((dst, hourIndex) => {
      if (dst === null) return;
      const date = new Date(Date.UTC(year, month - 1, day, hourIndex));
      if (Number.isNaN(date.getTime())) return;
      records.push({ time: date.toISOString(), dst });
    });
  }

  return records.length > 0 ? records : null;
}

app.get('/api/noaa/dst-archive', async (req, res) => {
  const month = parseDateOnly(req.query.month ? `${req.query.month}-01` : null);

  if (!month) {
    res.status(400).json({ ok: false, error: 'Missing or invalid month query param (expected YYYY-MM)' });
    return;
  }

  const monthDate = new Date(`${month}T00:00:00Z`);
  const now = new Date();
  if (monthDate < new Date('1995-01-01T00:00:00Z') || monthDate > now) {
    res.status(400).json({ ok: false, error: 'month must be between 1995-01 and the current month' });
    return;
  }

  const yearMonth = month.slice(0, 7);

  try {
    // The monthly .for.request link is form-gated; the monthly index page
    // itself embeds the same table, so fetch and parse that (over HTTP/2).
    const indexUrl = `${KYOTO_DST_ORIGIN}/dst_provisional/${yearMonth}/index.html`;
    const upstream = await fetchKyotoMonthlyPage(`/dst_provisional/${yearMonth}/index.html`);
    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `Kyoto WDC returned HTTP ${upstream.status}` });
      return;
    }

    const records = parseKyotoDstHtml(upstream.body, yearMonth);
    if (!records) {
      res.status(502).json({ ok: false, error: 'Kyoto WDC page did not contain a parseable Dst table' });
      return;
    }

    res.status(200).json({
      ok: true,
      month: yearMonth,
      source: 'WDC for Geomagnetism, Kyoto (provisional Dst)',
      sourceUrl: indexUrl,
      count: records.length,
      records,
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: 'Kyoto WDC Dst archive unavailable' });
  }
});

app.get('/api/usgs/eq-4.5-day', (_req, res) => proxyRequest(res, UPSTREAM.usgs.m45Day));
app.get('/api/usgs/eq-2.5-week', (_req, res) => proxyRequest(res, UPSTREAM.usgs.m25Week));
app.get('/api/usgs/eq-4.5-week', (_req, res) => proxyRequest(res, UPSTREAM.usgs.m45Week));
app.get('/api/usgs/comcat', (req, res) => {
  const starttime = parseDateOnly(req.query.starttime);
  const endtime = parseDateOnly(req.query.endtime);
  const minMagnitude = parseBoundedNumber(req.query.minmagnitude, { min: 0, max: 10, fallback: 5.0 });
  const limit = parseBoundedNumber(req.query.limit, { min: 1, max: 5000, fallback: 5000 });
  const orderby = firstQueryValue(req.query.orderby) || 'time-asc';

  if (!starttime || !endtime) {
    res.status(400).json({ ok: false, error: 'Missing or invalid starttime/endtime query params' });
    return;
  }

  const startDate = new Date(`${starttime}T00:00:00Z`);
  const endDate = new Date(`${endtime}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    res.status(400).json({ ok: false, error: 'starttime must be before or equal to endtime' });
    return;
  }

  if (!ALLOWED_COMCAT_ORDER.has(orderby)) {
    res.status(400).json({ ok: false, error: 'Unsupported orderby value' });
    return;
  }

  const url =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    `&minmagnitude=${encodeURIComponent(minMagnitude)}` +
    `&starttime=${encodeURIComponent(starttime)}` +
    `&endtime=${encodeURIComponent(endtime)}` +
    `&limit=${encodeURIComponent(limit)}` +
    `&orderby=${encodeURIComponent(orderby)}`;

  proxyRequest(res, url, { maxRetries: 1 });
});

app.get('/api/openmeteo/weather', (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ ok: false, error: 'Missing or invalid lat/lon query params' });
    return;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,' +
    'wind_speed_10m,wind_direction_10m,pressure_msl,precipitation&timezone=auto';

  proxyRequest(res, url);
});

app.get('/api/openmeteo/air-quality', (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ ok: false, error: 'Missing or invalid lat/lon query params' });
    return;
  }

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    '&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,european_aqi&timezone=auto';

  proxyRequest(res, url);
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many briefing requests, please try again in a minute' },
});

app.post(
  '/api/ai/briefing',
  aiLimiter,
  createAiBriefingHandler({
    fetchWithTimeout,
    loadGlobalSeismic,
    upstream: UPSTREAM,
  }),
);

app.get('/api/health', async (_req, res) => {
  const checks = {
    noaa_mag: UPSTREAM.noaa.rtswMag,
    noaa_wind: UPSTREAM.noaa.rtswWind,
    noaa_kp: UPSTREAM.noaa.kp1m,
    usgs: UPSTREAM.usgs.m45Day,
    emsc: `${UPSTREAM.emsc.eventQuery}?format=json&limit=1`,
    geofon: UPSTREAM.geofon.version,
    gfz_kp: buildGfzKpUrl(24),
    gvp: UPSTREAM.gvp.holoceneProbe,
    usgs_volcano: UPSTREAM.usgsVolcano.elevated,
    openmeteo: 'https://api.open-meteo.com/v1/forecast?latitude=44.97&longitude=20.17&current=temperature_2m',
  };

  const startedAt = Date.now();
  const result = {};

  await Promise.all(
    Object.entries(checks).map(async ([key, url]) => {
      const cached = lastGoodFeeds.get(url);
      try {
        const upstream = await fetchWithTimeout(url);
        result[key] = {
          ok: upstream.ok,
          status: upstream.status,
          freshness: upstream.ok ? 'live' : (cached ? 'last-good' : 'none'),
        };
        if (cached) result[key].lastGoodAt = cached.savedAt;
      } catch (error) {
        result[key] = {
          ok: false,
          error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'unknown'),
          freshness: cached ? 'last-good' : 'none',
        };
        if (cached) result[key].lastGoodAt = cached.savedAt;
      }
    })
  );

  const allOk = Object.values(result).every(entry => entry.ok === true);

  // HTTP 200 means this Node process is serving. `ok`/`status` describe upstreams.
  res.status(200).json({
    ok: allOk,
    status: allOk ? 'ok' : 'degraded',
    local: true,
    mode: 'deployment-simulation',
    uptimeSeconds: Math.round(process.uptime()),
    durationMs: Date.now() - startedAt,
    checks: result,
  });
});

// Proto-SIR Pattern Logging Endpoint
// Captures network failures and other diagnostic events for learning
app.post('/api/proto-sir/log-event', (req, res) => {
  try {
    const event = req.body || {};
    const timestamp = new Date().toISOString();
    
    // Log to stdout for now (can be piped to Proto-SIR learner)
    console.log(JSON.stringify({
      eventType: 'frontend-error',
      timestamp,
      ...event,
    }));
    
    res.json({
      ok: true,
      logged: true,
      timestamp,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || 'Logging failed',
    });
  }
});

// SPA fallback — only serve index.html for clean navigation paths
const spaFallbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests' },
});

app.get('/{*splat}', spaFallbackLimiter, (req, res) => {
  // Block anything with a file extension or starting with a dot-segment
  if (path.extname(req.path) || /\/\./.test(req.path)) {
    res.status(404).end();
    return;
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[tectonic-solar] Simulation server running at http://localhost:${PORT}`);
});
