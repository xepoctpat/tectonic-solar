import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(process.cwd(), 'test-results', 'ux-interaction');

const tabs = [
  { name: 'map', button: '[data-tab="map"]' },
  { name: 'space', button: '[data-tab="space"]' },
  { name: 'seismic', button: '[data-tab="seismic"]' },
  { name: 'env', button: '[data-tab="env"]' },
  { name: 'correlation', button: '[data-tab="correlation"]' },
  { name: 'research', button: '[data-tab="research"]' },
];

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

function collectClipDiagnostics() {
  const charts = [...document.querySelectorAll('.chart-box canvas')];
  const chartInfo = charts.map(canvas => {
    const box = canvas.closest('.chart-box');
    const panel = canvas.closest('.resizable-panel');
    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = box?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const style = panel ? getComputedStyle(panel) : null;
    const clippedByPanel = !!(panelRect && boxRect && (
      boxRect.bottom > panelRect.bottom + 4 || boxRect.top < panelRect.top - 4
    ));
    const overflowHidden = style ? !style.overflowY.includes('auto') && style.overflowY !== 'scroll' : false;
    return {
      id: canvas.id,
      panelId: panel?.dataset.panelId || null,
      canvasH: Math.round(canvasRect.height),
      boxH: boxRect ? Math.round(boxRect.height) : 0,
      panelH: panelRect ? Math.round(panelRect.height) : 0,
      panelOverflowY: style?.overflowY || null,
      clippedByPanel,
      overflowHidden,
      hardClip: clippedByPanel && overflowHidden,
    };
  });

  const analysisOverflow = [...document.querySelectorAll('.analysis-item')].map(item => {
    const rect = item.getBoundingClientRect();
    return {
      label: item.querySelector('.analysis-label')?.textContent?.trim() || '',
      overflowX: item.scrollWidth > item.clientWidth + 2,
      width: Math.round(rect.width),
    };
  }).filter(row => row.overflowX);

  const toast = document.getElementById('toast-container');
  const toastRect = toast?.getBoundingClientRect();
  const toastStyle = toast ? getComputedStyle(toast) : null;

  let timelineScale = null;
  const timelineCanvas = document.getElementById('correlation-timeline');
  if (timelineCanvas && window.Chart?.getChart) {
    const chart = window.Chart.getChart(timelineCanvas);
    if (chart?.scales?.y) {
      timelineScale = { min: chart.scales.y.min, max: chart.scales.y.max };
    }
  }

  let magnitudeScale = null;
  const magCanvas = document.getElementById('magnitude-chart');
  if (magCanvas && window.Chart?.getChart) {
    const chart = window.Chart.getChart(magCanvas);
    if (chart?.scales?.y) {
      magnitudeScale = { min: chart.scales.y.min, max: chart.scales.y.max };
    }
  }

  return {
    chartInfo,
    analysisOverflow,
    toast: toastRect ? {
      top: Math.round(toastRect.top),
      bottom: Math.round(toastRect.bottom),
      position: toastStyle?.position,
      cssTop: toastStyle?.top,
      cssBottom: toastStyle?.bottom,
    } : null,
    timelineScale,
    magnitudeScale,
    toastsVisible: toast ? [...toast.children].map(node => node.textContent) : [],
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUTPUT_DIR)) {
    if (name.endsWith('.webm')) fs.unlinkSync(path.join(OUTPUT_DIR, name));
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    console.error('No Chromium-based browser executable found (Edge/Chrome).');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6500);

  const findings = [];
  const failures = [];

  for (const tab of tabs) {
    await page.click(tab.button);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${tab.name}.png`), fullPage: true });

    const diag = await page.evaluate(collectClipDiagnostics);
    findings.push({ tab: tab.name, ...diag });

    const visibleCharts = diag.chartInfo.filter(row => row.panelH > 0 && row.boxH > 0);
    const hardClips = visibleCharts.filter(row => row.hardClip);
    const tinyCharts = visibleCharts.filter(row => row.canvasH < 80);
    if (hardClips.length) {
      failures.push(`${tab.name}: overflow:hidden clipped ${hardClips.map(row => row.id).join(', ')}`);
    }
    if (tinyCharts.length) {
      failures.push(`${tab.name}: tiny canvases ${tinyCharts.map(row => `${row.id}=${row.canvasH}px`).join(', ')}`);
    }
    if (tab.name === 'correlation' && diag.timelineScale) {
      if (diag.timelineScale.min > 10 || diag.timelineScale.max > 20) {
        failures.push(`correlation: timeline Y scale still numeric (${diag.timelineScale.min}–${diag.timelineScale.max}), expected swimlanes ~0.4–2.6`);
      }
    }
    if (tab.name === 'seismic' && diag.magnitudeScale && diag.magnitudeScale.min > 0.5) {
      failures.push(`seismic: magnitude Y min is ${diag.magnitudeScale.min}, expected 0`);
    }
    if (tab.name === 'research' && diag.analysisOverflow.length) {
      failures.push(`research: analysis items overflow: ${diag.analysisOverflow.map(row => row.label).join(', ')}`);
    }
    if (tab.name === 'map' && diag.toastsVisible.some(text => /Correlation Data Updated/i.test(text))) {
      failures.push('map: auto correlation toast still covering the map on load');
    }
  }

  await page.click('[data-tab="space"]');
  await page.waitForTimeout(400);
  const solar = page.locator('#solar-wind-chart');
  await solar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const solarBox = await solar.boundingBox();
  if (solarBox) {
    await page.mouse.move(solarBox.x + solarBox.width * 0.62, solarBox.y + solarBox.height * 0.42);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'space-chart-hover.png') });
  }

  const collapse = page.locator('[data-testid="panel-collapse-space-solar-wind"]');
  if (await collapse.count()) {
    await collapse.click();
    await page.waitForTimeout(250);
    const collapsed = await page.locator('[data-panel-id="space-solar-wind"]').evaluate(el => el.classList.contains('is-collapsed'));
    if (!collapsed) failures.push('space: collapse control did not collapse the solar-wind panel');
    await collapse.click();
    await page.waitForTimeout(250);
  }

  const splitter = page.locator('#space-tab [data-splitter]');
  if (await splitter.count()) {
    const box = await splitter.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  }

  await page.click('[data-tab="correlation"]');
  await page.waitForTimeout(500);
  const timeline = page.locator('#correlation-timeline');
  await timeline.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const timelineBox = await timeline.boundingBox();
  if (timelineBox) {
    await page.mouse.move(timelineBox.x + timelineBox.width * 0.22, timelineBox.y + timelineBox.height * 0.32);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'correlation-hover.png') });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tab="space"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'space-mobile.png'), fullPage: true });

  const mobileOverlap = await page.evaluate(() => {
    const solar = document.querySelector('[data-panel-id="space-solar-wind"]')?.getBoundingClientRect();
    const flares = document.querySelector('[data-panel-id="space-flares"]')?.getBoundingClientRect();
    if (!solar || !flares) return { missing: true, overlapping: false };
    const overlapY = Math.min(solar.bottom, flares.bottom) - Math.max(solar.top, flares.top);
    return {
      overlapping: overlapY > 8,
      overlapY: Math.round(overlapY),
      solarBottom: Math.round(solar.bottom),
      flaresTop: Math.round(flares.top),
    };
  });
  if (mobileOverlap.missing) {
    failures.push('mobile space: solar-wind or flares panel missing');
  } else if (mobileOverlap.overlapping) {
    failures.push(`mobile space: solar-wind overlaps flares by ${mobileOverlap.overlapY}px`);
  }

  const flaresPanel = page.locator('[data-panel-id="space-flares"]');
  if (await flaresPanel.count()) {
    await flaresPanel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'space-mobile-flares.png') });
  }

  await page.click('[data-tab="seismic"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'seismic-mobile.png'), fullPage: true });

  const report = {
    appUrl: APP_URL,
    generatedAt: new Date().toISOString(),
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    consoleErrors,
    pageErrors,
    failures,
    findings,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  await context.close();
  await browser.close();

  const videos = fs.readdirSync(OUTPUT_DIR).filter(name => name.endsWith('.webm'));
  console.log(`UX interaction artifacts: ${OUTPUT_DIR}`);
  if (videos.length) console.log(`Video: ${path.join(OUTPUT_DIR, videos[0])}`);
  console.log(`Failures: ${failures.length}`);
  failures.forEach(item => console.log(` - ${item}`));
  console.log(`Console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`);

  if (failures.length || pageErrors.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
