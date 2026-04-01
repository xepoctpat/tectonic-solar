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
  "connect-src 'self' https://services.swpc.noaa.gov https://earthquake.usgs.gov https://api.open-meteo.com https://air-quality-api.open-meteo.com",
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

app.disable('x-powered-by');

// Rate limiting — 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later' },
});
app.use(limiter);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  next();
});

app.use(express.json({ limit: '16kb' }));

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
