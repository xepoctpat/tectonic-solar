// ===== SERVICE WORKER: OFFLINE & CACHING SUPPORT =====

const CACHE_NAME = 'tectonic-solar-v2';
const API_CACHE_NAME = 'tectonic-solar-api-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './src/css/variables.css',
  './src/css/base.css',
  './src/css/components.css',
  './src/css/map.css',
  './src/css/notifications.css',
  './src/js/main.js',
  './src/js/store.js',
  './src/js/utils.js',
  './src/js/charts.js',
  './src/js/tabs.js',
  './src/js/map.js',
  './src/js/spaceWeather.js',
  './src/js/seismic.js',
  './src/js/correlation.js',
  './src/js/environment.js',
  './src/js/settings.js',
  './src/js/notifications.js',
  './src/js/config.js',
  './src/js/db.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://cdn.jsdelivr.net/npm/chart.js',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((e) => {
        console.warn('Failed to cache some assets:', e);
        // Continue even if some assets fail to cache
        return STATIC_ASSETS.reduce((promise, url) => {
          return promise.then(() =>
            cache.add(url).catch(() => {
              console.warn(`Failed to cache ${url}`);
            })
          );
        }, Promise.resolve());
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (except APIs we want to cache)
  if (url.origin !== self.location.origin && !isAllowedAPI(url.href)) {
    return;
  }

  // API calls: Network-first, fallback to cache
  if (isAPICall(url.href)) {
    event.respondWith(networkFirstAPI(request));
  }
  // Static assets: Cache-first, fallback to network
  else {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn('Fetch failed; offline:', error);
    return caches.match('./index.html') || new Response('Offline', { status: 503 });
  }
}

async function networkFirstAPI(request) {
  const cache = await caches.open(API_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn('API fetch failed; using cache:', error);
    const cached = await cache.match(request);
    if (cached) {
      return new Response(cached.body, {
        status: 206,
        statusText: 'Partial (Stale)',
        headers: {
          'X-From-Cache': 'true',
          'X-Cache-Status': 'stale',
          ...Array.from(cached.headers.entries()).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
        }
      });
    }
    return new Response('Offline: No cached data', { status: 503 });
  }
}

function isAPICall(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/api/')) return true;
    const h = parsed.hostname;
    return h === 'noaa.gov' || h.endsWith('.noaa.gov') ||
           h === 'usgs.gov' || h.endsWith('.usgs.gov') ||
           h === 'open-meteo.com' || h.endsWith('.open-meteo.com');
  } catch {
    return false;
  }
}

function isAllowedAPI(url) {
  return isAPICall(url);
}

// Background sync (when offline connection returns)
self.addEventListener('sync', (event) => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(
      fetch('./index.html').then(() => {
        // Sync successful
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SYNC_COMPLETE',
              message: 'Data refreshed after offline period'
            });
          });
        });
      }).catch(() => {
        // Still offline
        console.log('Background sync failed: still offline');
      })
    );
  }
});

// Message handling
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
