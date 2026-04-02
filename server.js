const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const REQUEST_TIMEOUT_MS = 15000;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://services.swpc.noaa.gov https://earthquake.usgs.gov https://api.open-meteo.com https://air-quality-api.open-meteo.com https://www.ngdc.noaa.gov",
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
const RESEARCH_SIDECAR = {
  baseUrl: 'http://127.0.0.1:5051',
  timeoutMs: 120_000,
  payloadLimit: '512kb',
  maxStorms: 5_000,
  maxEarthquakes: 10_000,
};
const researchJsonParser = express.json({ limit: RESEARCH_SIDECAR.payloadLimit });

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
    rtswPlasma: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json',
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

async function proxyRequest(res, url, options = {}) {
  try {
    const upstream = await fetchWithRetry(url, options.maxRetries || 1);

    if (!upstream.ok) {
      // For non-critical endpoints, return graceful fallback instead of 502
      // This prevents browser console errors while still logging the failure
      if (options.fallbackOnError) {
        res.status(200)
           .type(options.fallbackContentType || 'application/json')
           .send(options.fallbackData || '[]');
        console.log(`[proxy] ${url} fell back to default (status ${upstream.status})`);
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

    res.status(200);
    res.setHeader('Cache-Control', 'no-store');
    res.type(upstream.contentType).send(upstream.body);
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    
    // For non-critical endpoints, return graceful fallback on error
    if (options.fallbackOnError) {
      res.status(200)
         .type(options.fallbackContentType || 'application/json')
         .send(options.fallbackData || '[]');
      console.log(`[proxy] ${url} fell back to default (error: ${error?.message})`);
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

app.get('/api/noaa/rtsw-mag', (_req, res) => proxyRequest(res, UPSTREAM.noaa.rtswMag, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
app.get('/api/noaa/rtsw-plasma', (_req, res) => proxyRequest(res, UPSTREAM.noaa.rtswPlasma, {
  fallbackOnError: true,
  fallbackData: '[]',
  fallbackContentType: 'application/json',
}));
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

app.get('/api/health', async (_req, res) => {
  const checks = {
    noaa: UPSTREAM.noaa.kp1m,
    usgs: UPSTREAM.usgs.m45Day,
    openmeteo: 'https://api.open-meteo.com/v1/forecast?latitude=44.97&longitude=20.17&current=temperature_2m',
  };

  const startedAt = Date.now();
  const result = {};

  await Promise.all(
    Object.entries(checks).map(async ([key, url]) => {
      try {
        const upstream = await fetchWithTimeout(url);
        result[key] = {
          ok: upstream.ok,
          status: upstream.status,
        };
      } catch (error) {
        result[key] = {
          ok: false,
          error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'unknown'),
        };
      }
    })
  );

  const allOk = Object.values(result).every(entry => entry.ok === true);

  res.status(allOk ? 200 : 503).json({
    ok: allOk,
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
app.get('*', (req, res) => {
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
