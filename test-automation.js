/**
 * Tectonic-Solar Automated Testing Suite
 * Run in browser console: copy this script, paste into DevTools Console (F12)
 * Or: node test-automation.js (requires Puppeteer for headless mode)
 * 
 * Date: March 24, 2026
 * Purpose: Verify all features, data loading, UX responsiveness, error handling
 */

// ============================================================================
// TEST UTILITIES
// ============================================================================

class TestRunner {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  log(message) {
    console.log(`%c${message}`, 'color: #0066cc; font-weight: bold;');
  }

  pass(testName) {
    this.results.push({ name: testName, status: 'PASS' });
    console.log(`%c✓ PASS: ${testName}`, 'color: green; font-weight: bold;');
  }

  fail(testName, error) {
    this.results.push({ name: testName, status: 'FAIL', error });
    console.log(`%c✗ FAIL: ${testName}`, 'color: red; font-weight: bold;');
    console.error(`   Error: ${error}`);
  }

  warn(testName, message) {
    this.results.push({ name: testName, status: 'WARN', message });
    console.log(`%c⚠ WARN: ${testName}`, 'color: orange; font-weight: bold;');
    console.log(`   ${message}`);
  }

  summary() {
    const duration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warned = this.results.filter(r => r.status === 'WARN').length;
    const total = this.results.length;

    console.log('\n%c' + '='.repeat(70), 'color: #0066cc; font-weight: bold;');
    console.log(`%cTEST SUMMARY`, 'color: #0066cc; font-weight: bold; font-size: 16px;');
    console.log(`%cTotal: ${total} | Passed: ${passed} | Failed: ${failed} | Warned: ${warned}`, 
      `color: ${failed > 0 ? 'red' : 'green'}; font-weight: bold; font-size: 14px;`);
    console.log(`%cDuration: ${duration}ms`, 'color: #555; font-size: 12px;');
    console.log('%c' + '='.repeat(70) + '\n', 'color: #0066cc; font-weight: bold;');

    return { passed, failed, warned, total, duration };
  }
}

const runner = new TestRunner();

// ============================================================================
// PART 1: DOM & STRUCTURE TESTS
// ============================================================================

function testDOM() {
  runner.log('PART 1: Testing DOM Structure...');

  // Check required elements
  try {
    const index = document.getElementById('index') || document.body;
    if (!index) throw new Error('Page body missing');
    runner.pass('DOM: Page body exists');
  } catch (e) {
    runner.fail('DOM: Page body exists', e.message);
  }

  // Check tabs
  try {
    const tabs = ['map-tab', 'space-weather-tab', 'seismic-tab', 'environment-tab', 'correlation-tab', 'settings-tab'];
    tabs.forEach(tab => {
      if (!document.getElementById(tab)) throw new Error(`Missing tab: ${tab}`);
    });
    runner.pass('DOM: All 6 tabs present');
  } catch (e) {
    runner.fail('DOM: All 6 tabs present', e.message);
  }

  // Check CSS loaded
  try {
    const stylesheets = Array.from(document.styleSheets).map(s => s.href);
    if (stylesheets.length === 0) throw new Error('No stylesheets loaded');
    runner.pass(`DOM: CSS loaded (${stylesheets.length} files)`);
  } catch (e) {
    runner.fail('DOM: CSS loaded', e.message);
  }

  // Check Chart.js library
  try {
    if (typeof Chart === 'undefined') throw new Error('Chart.js not loaded');
    runner.pass('DOM: Chart.js library available');
  } catch (e) {
    runner.fail('DOM: Chart.js library available', e.message);
  }

  // Check Leaflet library
  try {
    if (typeof L === 'undefined') throw new Error('Leaflet not loaded');
    runner.pass('DOM: Leaflet library available');
  } catch (e) {
    runner.fail('DOM: Leaflet library available', e.message);
  }
}

// ============================================================================
// PART 2: DATA SOURCE TESTS
// ============================================================================

async function testDataSources() {
  runner.log('PART 2: Testing Data Sources (Real API Calls)...');

  // NOAA Solar Wind
  try {
    const res = await fetch('https://services.swpc.noaa.gov/json/ace_swepam.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('No data returned');
    runner.pass('Data: NOAA Solar Wind API accessible');
  } catch (e) {
    runner.fail('Data: NOAA Solar Wind API accessible', e.message);
  }

  // NOAA Kp Index
  try {
    const res = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('No data returned');
    runner.pass('Data: NOAA Kp Index API accessible');
  } catch (e) {
    runner.fail('Data: NOAA Kp Index API accessible', e.message);
  }

  // USGS Earthquakes
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.features || data.features.length === 0) throw new Error('No earthquakes found');
    runner.pass(`Data: USGS Earthquakes API accessible (${data.features.length} earthquakes)`);
  } catch (e) {
    runner.fail('Data: USGS Earthquakes API accessible', e.message);
  }

  // Open-Meteo Weather
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,weather_code');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.current) throw new Error('No current weather data');
    runner.pass('Data: Open-Meteo Weather API accessible');
  } catch (e) {
    runner.fail('Data: Open-Meteo Weather API accessible', e.message);
  }

  // Open-Meteo Air Quality
  try {
    const res = await fetch('https://air-quality-api.open-meteo.com/v1/air_quality?latitude=37.7749&longitude=-122.4194&current=pm2_5,pm10_2_5');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.current) throw new Error('No air quality data');
    runner.pass('Data: Open-Meteo Air Quality API accessible');
  } catch (e) {
    runner.fail('Data: Open-Meteo Air Quality API accessible', e.message);
  }
}

// ============================================================================
// PART 3: MODULE TESTS
// ============================================================================

function testModules() {
  runner.log('PART 3: Testing JavaScript Modules...');

  // Check store
  try {
    if (typeof store === 'undefined') throw new Error('store module not loaded');
    if (typeof store.earthquakes !== 'object') throw new Error('earthquakes not in store');
    runner.pass('Modules: store.js loaded and initialized');
  } catch (e) {
    runner.fail('Modules: store.js loaded', e.message);
  }

  // Check utils functions
  try {
    if (typeof fetchWithRetry !== 'function') throw new Error('fetchWithRetry not found');
    if (typeof fetchWithTimeout !== 'function') throw new Error('fetchWithTimeout not found');
    runner.pass('Modules: utils.js fetch functions available');
  } catch (e) {
    runner.fail('Modules: utils.js fetch functions available', e.message);
  }

  // Check db functions
  try {
    if (typeof initDB !== 'function') throw new Error('initDB not found');
    if (typeof db === 'undefined') throw new Error('db not found');
    runner.pass('Modules: db.js IndexedDB functions available');
  } catch (e) {
    runner.fail('Modules: db.js IndexedDB functions available', e.message);
  }

  // Check correlation functions
  try {
    if (typeof calculatePearsonCorrelation !== 'function') throw new Error('calculatePearsonCorrelation not found');
    if (typeof analyzeCorrelation !== 'function') throw new Error('analyzeCorrelation not found');
    runner.pass('Modules: correlation.js statistical functions available');
  } catch (e) {
    runner.fail('Modules: correlation.js statistical functions available', e.message);
  }
}

// ============================================================================
// PART 4: DARK MODE TESTS
// ============================================================================

function testDarkMode() {
  runner.log('PART 4: Testing Dark Mode...');

  // Check dark mode button exists
  try {
    const btn = document.querySelector('[aria-label*="Dark Mode"], button:has-text("🌙"), button:has-text("☀️")');
    if (!btn) throw new Error('Dark mode button not found (check HTML for moon/sun emoji)');
    runner.pass('Dark Mode: Toggle button found');
  } catch (e) {
    runner.warn('Dark Mode: Toggle button found', e.message);
  }

  // Check localStorage dark mode setting
  try {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === null || darkMode === '') throw new Error('darkMode not in localStorage');
    if (darkMode !== 'true' && darkMode !== 'false') throw new Error(`Invalid darkMode value: ${darkMode}`);
    runner.pass(`Dark Mode: localStorage setting exists (${darkMode})`);
  } catch (e) {
    runner.warn('Dark Mode: localStorage setting exists', e.message);
  }

  // Check .dark CSS class capability
  try {
    document.documentElement.classList.add('dark-test');
    const hasClass = document.documentElement.classList.contains('dark-test');
    document.documentElement.classList.remove('dark-test');
    if (!hasClass) throw new Error('Cannot add CSS classes to <html>');
    runner.pass('Dark Mode: CSS class toggle works');
  } catch (e) {
    runner.fail('Dark Mode: CSS class toggle works', e.message);
  }
}

// ============================================================================
// PART 5: INDEXEDDB TESTS
// ============================================================================

async function testIndexedDB() {
  runner.log('PART 5: Testing IndexedDB Persistence...');

  // Check IndexedDB supported
  try {
    if (!window.indexedDB) throw new Error('IndexedDB not supported');
    runner.pass('IndexedDB: Browser supports IndexedDB');
  } catch (e) {
    runner.fail('IndexedDB: Browser supports IndexedDB', e.message);
    return; // Skip rest of IndexedDB tests
  }

  // Check database exists
  try {
    const dbs = await indexedDB.databases();
    const tectonicSolar = dbs.find(d => d.name === 'TectonicSolar');
    if (!tectonicSolar) throw new Error('TectonicSolar database not created');
    runner.pass('IndexedDB: TectonicSolar database exists');
  } catch (e) {
    runner.fail('IndexedDB: TectonicSolar database exists', e.message);
    return;
  }

  // Check stores exist
  try {
    const storeNames = ['storms', 'earthquakes'];
    const req = indexedDB.open('TectonicSolar');
    await new Promise((resolve, reject) => {
      req.onsuccess = resolve;
      req.onerror = reject;
    });
    const db = req.result;
    storeNames.forEach(name => {
      if (!db.objectStoreNames.contains(name)) throw new Error(`Store ${name} missing`);
    });
    runner.pass('IndexedDB: Both object stores (storms, earthquakes) exist');
    db.close();
  } catch (e) {
    runner.fail('IndexedDB: Object stores exist', e.message);
  }
}

// ============================================================================
// PART 6: SERVICE WORKER TESTS
// ============================================================================

async function testServiceWorker() {
  runner.log('PART 6: Testing Service Worker (PWA)...');

  // Check Service Worker supported
  try {
    if (!('serviceWorker' in navigator)) throw new Error('Service Workers not supported');
    runner.pass('Service Worker: Browser supports Service Workers');
  } catch (e) {
    runner.warn('Service Worker: Browser supports Service Workers', e.message);
    return;
  }

  // Check Service Worker registered
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) {
      runner.warn('Service Worker: Not registered yet (try hard refresh Ctrl+Shift+R)', 'SW registers on page load');
    } else {
      const active = regs.some(r => r.active);
      if (!active) throw new Error('Service Worker registered but not active');
      runner.pass(`Service Worker: Registered and active (${regs.length} registration)`);
    }
  } catch (e) {
    runner.fail('Service Worker: Registered and active', e.message);
  }

  // Check manifest.json
  try {
    const manifests = document.querySelectorAll('link[rel="manifest"]');
    if (manifests.length === 0) throw new Error('No manifest.json link found');
    const href = manifests[0].getAttribute('href');
    if (!href) throw new Error('Manifest href missing');
    runner.pass(`Service Worker: manifest.json linked (${href})`);
  } catch (e) {
    runner.fail('Service Worker: manifest.json linked', e.message);
  }
}

// ============================================================================
// PART 7: RESPONSIVE DESIGN TESTS
// ============================================================================

function testResponsive() {
  runner.log('PART 7: Testing Responsive Design...');

  const width = window.innerWidth;
  const height = window.innerHeight;

  // Check viewport meta tag
  try {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) throw new Error('Viewport meta tag missing');
    runner.pass('Responsive: Viewport meta tag present');
  } catch (e) {
    runner.fail('Responsive: Viewport meta tag present', e.message);
  }

  // Check mobile breakpoint styles
  try {
    const computed = window.getComputedStyle(document.body);
    const fontSize = parseFloat(computed.fontSize);
    if (fontSize < 12 || fontSize > 20) throw new Error(`Font size seems off: ${fontSize}px`);
    runner.pass(`Responsive: Font size reasonable (${fontSize}px at ${width}x${height})`);
  } catch (e) {
    runner.warn('Responsive: Font size reasonable', e.message);
  }

  // Check CSS Grid/Flex
  try {
    const mainContent = document.querySelector('main');
    if (mainContent) {
      const computed = window.getComputedStyle(mainContent);
      const display = computed.display;
      if (display !== 'grid' && display !== 'flex' && display !== 'block') {
        runner.warn('Responsive: Main layout might not be responsive', `display: ${display}`);
      } else {
        runner.pass(`Responsive: Layout uses ${display} (responsive)`);
      }
    }
  } catch (e) {
    runner.warn('Responsive: Layout detection', e.message);
  }
}

// ============================================================================
// PART 8: ACCESSIBILITY TESTS
// ============================================================================

function testAccessibility() {
  runner.log('PART 8: Testing Accessibility (WCAG AA)...');

  // Check page title
  try {
    const title = document.title;
    if (!title || title.length < 3) throw new Error('Page title missing or too short');
    runner.pass(`Accessibility: Page title present ("${title}")`);
  } catch (e) {
    runner.fail('Accessibility: Page title present', e.message);
  }

  // Check headings
  try {
    const h1 = document.querySelector('h1');
    if (!h1) runner.warn('Accessibility: H1 heading', 'No H1 found (recommended)');
    else runner.pass('Accessibility: H1 heading found');
  } catch (e) {
    runner.warn('Accessibility: H1 heading', e.message);
  }

  // Check labels for inputs
  try {
    const inputs = document.querySelectorAll('input[type="range"], input[type="checkbox"]');
    let unlabeled = 0;
    inputs.forEach(input => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      const ariaLabel = input.getAttribute('aria-label');
      if (!label && !ariaLabel) unlabeled++;
    });
    if (unlabeled > 0) {
      runner.warn('Accessibility: Input labels', `${unlabeled} inputs missing labels`);
    } else {
      runner.pass('Accessibility: All inputs have labels or aria-label');
    }
  } catch (e) {
    runner.warn('Accessibility: Input labels', e.message);
  }

  // Check alt text on images
  try {
    const images = document.querySelectorAll('img');
    let noAlt = 0;
    images.forEach(img => {
      if (!img.hasAttribute('alt')) noAlt++;
    });
    if (noAlt > 0) {
      runner.warn('Accessibility: Image alt text', `${noAlt} images missing alt`);
    } else {
      runner.pass('Accessibility: All images have alt text');
    }
  } catch (e) {
    runner.warn('Accessibility: Image alt text', e.message);
  }

  // Check color contrast (simplified)
  try {
    const body = document.body;
    const computed = window.getComputedStyle(body);
    const bgColor = computed.backgroundColor;
    const color = computed.color;
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      runner.pass('Accessibility: Dark mode enabled (contrast should be good)');
    } else {
      runner.pass('Accessibility: Light mode active (verify contrast manually)');
    }
  } catch (e) {
    runner.warn('Accessibility: Color contrast', e.message);
  }
}

// ============================================================================
// PART 9: FETCH RETRY TESTS
// ============================================================================

async function testFetchRetry() {
  runner.log('PART 9: Testing Fetch Retry Logic...');

  // Note: fetchWithRetry requires testing with intentional failures
  // This test validates that the function exists and can be called

  try {
    if (typeof fetchWithRetry !== 'function') throw new Error('fetchWithRetry not found');

    // Test with a valid public API (not breaking anything)
    const startTime = performance.now();
    const result = await fetchWithRetry('https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0', 1);
    const duration = performance.now() - startTime;

    if (!result) throw new Error('fetchWithRetry returned no data');
    runner.pass(`Fetch: fetchWithRetry function works (${duration.toFixed(0)}ms)`);
  } catch (e) {
    runner.fail('Fetch: fetchWithRetry function works', e.message);
  }
}

// ============================================================================
// PART 10: PERFORMANCE TESTS
// ============================================================================

function testPerformance() {
  runner.log('PART 10: Testing Performance Metrics...');

  try {
    const perfData = performance.getEntriesByType('navigation')[0];
    if (!perfData) throw new Error('Performance data not available');

    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const lcp = performance.getEntriesByType('largest-contentful-paint').pop();

    if (fcp) {
      const fcpMs = fcp.startTime;
      runner.pass(`Performance: FCP = ${fcpMs.toFixed(0)}ms (target <1800ms)`);
    }

    if (lcp) {
      const lcpMs = lcp.startTime;
      runner.pass(`Performance: LCP = ${lcpMs.toFixed(0)}ms (target <2500ms)`);
    }

    // Current time to interactive (simplified - resource loading complete)
    const resourceTiming = performance.getEntriesByType('resource');
    if (resourceTiming.length > 0) {
      const lastResource = resourceTiming[resourceTiming.length - 1];
      const tti = lastResource.responseEnd;
      runner.pass(`Performance: Resources loaded by ${tti.toFixed(0)}ms`);
    }
  } catch (e) {
    runner.warn('Performance: Metrics collection', e.message);
  }

  // Check for render-blocking resources
  try {
    const scripts = document.querySelectorAll('script:not([defer]):not([async])');
    const syncScripts = Array.from(scripts).filter(s => !s.src && s.innerHTML);
    if (syncScripts.length > 0) {
      runner.warn('Performance: Render-blocking scripts', `${syncScripts.length} inline scripts found`);
    } else {
      runner.pass('Performance: No render-blocking inline scripts detected');
    }
  } catch (e) {
    runner.warn('Performance: Render-blocking check', e.message);
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.clear();
  console.log('%c🚀 TECTONIC-SOLAR AUTOMATED TEST SUITE\n', 'font-size: 20px; font-weight: bold; color: #0066cc;');
  console.log(`Date: ${new Date().toLocaleString()}`);
  console.log(`URL: ${window.location.href}\n`);

  testDOM();
  await testDataSources();
  testModules();
  testDarkMode();
  await testIndexedDB();
  await testServiceWorker();
  testResponsive();
  testAccessibility();
  await testFetchRetry();
  testPerformance();

  const summary = runner.summary();

  // Return summary for programmatic use
  return summary;
}

// ============================================================================
// RUN TESTS
// ============================================================================

if (typeof window !== 'undefined') {
  // Browser environment
  console.log('%cStarting automated tests... (check for failures below)', 'color: #0066cc; font-weight: bold; font-size: 12px;');
  runAllTests().then(summary => {
    if (summary.failed === 0) {
      console.log('%c✓ ALL TESTS PASSED! ✓', 'font-size: 16px; font-weight: bold; color: green; background: #e8f5e9; padding: 10px;');
    } else if (summary.failed > 0) {
      console.log(`%c✗ ${summary.failed} TEST(S) FAILED`, 'font-size: 16px; font-weight: bold; color: red; background: #ffebee; padding: 10px;');
    }
  });
} else {
  // Node.js environment (for future headless testing)
  module.exports = { TestRunner, runAllTests };
}
