import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'tab-smoke');

const tabs = [
  { name: 'map', button: '[data-tab="map"]', panel: '#map-tab', probe: '#map-display' },
  { name: 'space', button: '[data-tab="space"]', panel: '#space-tab', probe: '#solar-wind-chart' },
  { name: 'seismic', button: '[data-tab="seismic"]', panel: '#seismic-tab', probe: '#eq-list-container' },
  { name: 'env', button: '[data-tab="env"]', panel: '#env-tab', probe: '#location-select' },
  { name: 'correlation', button: '[data-tab="correlation"]', panel: '#correlation-tab', probe: '#correlation-timeline' },
  { name: 'settings', button: '[data-tab="settings"]', panel: '#settings-tab', probe: '#alert-eq-mag' },
];

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function checkHealth() {
  try {
    const response = await fetch(`${APP_URL}/api/health`);
    const body = await response.json();
    return {
      ok: response.ok && body?.ok === true,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error?.message || String(error) },
    };
  }
}

async function main() {
  ensureOutputDir();

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    console.error('No Chromium-based browser executable found (Edge/Chrome).');
    console.error('Set PLAYWRIGHT_EXECUTABLE_PATH to your browser executable.');
    process.exit(1);
  }

  const health = await checkHealth();
  console.log(`Health endpoint: ${health.status} (ok=${health.ok})`);

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        message: msg.text(),
        args: msg.args().map(a => a.toString()).join(', '),
      });
    }
  });

  page.on('pageerror', err => pageErrors.push(err.message));

  page.on('requestfailed', req => {
    requestFailures.push({
      url: req.url(),
      reason: req.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', resp => {
    if (!resp.ok() && resp.status() >= 400) {
      httpErrors.push({
        url: resp.url(),
        status: resp.status(),
      });
    }
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const results = [];

  for (const tab of tabs) {
    await page.click(tab.button);
    await page.waitForTimeout(900);

    const state = await page.evaluate(({ panel, probe, name }) => {
      const panelEl = document.querySelector(panel);
      const probeEl = document.querySelector(probe);

      const panelRect = panelEl ? panelEl.getBoundingClientRect() : null;
      const probeRect = probeEl ? probeEl.getBoundingClientRect() : null;

      const panelVisible = !!panelEl && panelRect.width > 0 && panelRect.height > 0;
      const probeVisible = !!probeEl && probeRect.width > 0 && probeRect.height > 0;

      const panelActive = !!panelEl && panelEl.classList.contains('active') && panelEl.hidden === false;

      const strictProbeVisible = name === 'map'
        ? probeVisible && probeRect.width >= 200 && probeRect.height >= 200
        : probeVisible;

      return {
        panelExists: !!panelEl,
        probeExists: !!probeEl,
        panelActive,
        panelVisible,
        probeVisible: strictProbeVisible,
        panelRect,
        probeRect,
      };
    }, tab);

    const passed = state.panelExists
      && state.probeExists
      && state.panelActive
      && state.panelVisible
      && state.probeVisible;

    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${tab.name}.png`),
      fullPage: true,
    });

    results.push({
      tab: tab.name,
      passed,
      ...state,
    });
  }

  const report = {
    appUrl: APP_URL,
    generatedAt: new Date().toISOString(),
    health,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    requestFailureCount: requestFailures.length,
    httpErrorCount: httpErrors.length,
    consoleErrors,
    pageErrors,
    requestFailures,
    httpErrors,
    tabResults: results,
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  console.table(results.map(r => ({
    tab: r.tab,
    passed: r.passed,
    panelActive: r.panelActive,
    panelVisible: r.panelVisible,
    probeVisible: r.probeVisible,
  })));

  console.log(`Screenshots and report: ${OUTPUT_DIR}`);
  console.log(`Console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}, request failures: ${requestFailures.length}`);

  await browser.close();

  const allTabsPassed = results.every(r => r.passed);
  const runtimeHealthy = health.ok;

  if (!allTabsPassed || !runtimeHealthy) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
