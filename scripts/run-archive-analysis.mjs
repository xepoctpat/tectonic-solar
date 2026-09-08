#!/usr/bin/env node
// Load 2-year public archives (ComCat M5+ + GFZ IAGA Kp) and run the same
// lag-scan core as Research Lab. Writes a JSON artifact. Not a forecast.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeStormCatalog,
  normalizeEarthquakeCatalog,
  scanAllLags,
  compareTargetToMatchedControls,
  assessLagScan,
  computePrediction,
  interpretHypothesisEvidence,
} from '../public/src/js/hypothesis-core.mjs';
import { parseGfzKpPayload } from '../public/src/js/kpIndex.mjs';
import { detectDstStorms } from '../public/src/js/solarMetrics.mjs';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000';
const LOOKBACK_DAYS = 730;
const MIN_KP = 5;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'test-results');

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function toIsoZ(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function fetchJson(url, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'tectonic-solar-archive-analysis/1.0', Accept: 'application/json' },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${url} ${text.slice(0, 180)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function loadComcat() {
  const end = isoDate(new Date());
  const start = isoDate(new Date(Date.now() - LOOKBACK_DAYS * 86_400_000));
  const url = `${APP_URL}/api/usgs/comcat?starttime=${start}&endtime=${end}&minmagnitude=5&limit=5000&orderby=time-asc`;
  console.log(`ComCat M5+ ${start} → ${end}`);
  const data = await fetchJson(url);
  const earthquakes = (data.features || []).map(feature => ({
    mag: feature.properties.mag,
    place: feature.properties.place || 'Unknown',
    lat: feature.geometry?.coordinates?.[1],
    lon: feature.geometry?.coordinates?.[0],
    depth: feature.geometry?.coordinates?.[2],
    date: new Date(feature.properties.time),
  })).filter(eq => Number.isFinite(eq.mag) && Number.isFinite(eq.date.getTime()));
  console.log(`  ${earthquakes.length} events (metadata count=${data.metadata?.count ?? 'n/a'})`);
  return earthquakes;
}

async function loadGfzStorms() {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
  const url = `https://kp.gfz.de/app/json/?start=${encodeURIComponent(toIsoZ(start))}&end=${encodeURIComponent(toIsoZ(end))}&index=Kp`;
  console.log(`GFZ IAGA Kp ${toIsoZ(start)} → ${toIsoZ(end)}`);
  const data = await fetchJson(url);
  const points = parseGfzKpPayload(data);
  const storms = points
    .filter(point => point.kp >= MIN_KP)
    .map(point => ({ kp: point.kp, date: new Date(point.time), source: 'GFZ Potsdam Kp', status: point.status }));
  console.log(`  ${points.length} 3-hour bins, ${storms.length} with Kp≥${MIN_KP}`);
  return storms;
}

async function loadDstStorms() {
  const storms = [];
  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const months = [];
  for (let i = 0; i < 24; i += 1) {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1));
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  months.reverse();
  let failed = 0;
  for (const month of months) {
    try {
      const payload = await fetchJson(`${APP_URL}/api/noaa/dst-archive?month=${month}`, 60_000);
      const records = (payload.records || [])
        .map(record => ({ time: Date.parse(record.time), dst: Number(record.dst) }))
        .filter(record => Number.isFinite(record.time) && Number.isFinite(record.dst));
      storms.push(...detectDstStorms(records));
      process.stdout.write('.');
    } catch {
      failed += 1;
      process.stdout.write('x');
    }
  }
  process.stdout.write('\n');
  console.log(`  Dst storms ${storms.length} from ${months.length - failed}/${months.length} months`);
  return { storms, monthsOk: months.length - failed, months: months.length };
}

function runScan(label, storms, earthquakes) {
  const normalizedStorms = normalizeStormCatalog(storms);
  const normalizedEq = normalizeEarthquakeCatalog(earthquakes);
  const scanResults = scanAllLags(normalizedStorms, normalizedEq, 60);
  const matchedControls = compareTargetToMatchedControls(normalizedStorms, normalizedEq);
  const assessment = assessLagScan(scanResults);
  const prediction = computePrediction(normalizedStorms, normalizedEq);
  const meta = {
    stormCount: normalizedStorms.length,
    eqCount: normalizedEq.length,
    historicalLoaded: true,
    historicalEarthquakesLoaded: true,
    stormArchiveLoaded: true,
  };
  const interpretation = interpretHypothesisEvidence(scanResults, prediction, meta);
  const top = [...scanResults].sort((a, b) => b.eventRatio - a.eventRatio).slice(0, 8)
    .map(row => `${row.lag}d=${row.eventRatio.toFixed(2)}×`);
  console.log(`\n${label}`);
  console.log(`  storms=${normalizedStorms.length}  M5+=${normalizedEq.length}  span=${prediction.dataPoints.dataSpanDays}d  trials=${prediction.stormTrials}`);
  console.log(`  peak ${assessment?.peakLag}d @ ${assessment?.peakRatio?.toFixed(2)}×   27d ${assessment?.lag27ratio?.toFixed(2)}×`);
  console.log(`  ${interpretation.stateLabel} — ${interpretation.verdict}`);
  console.log(`  top: ${top.join(', ')}`);
  return {
    label,
    assessment,
    prediction,
    interpretation: {
      state: interpretation.state,
      stateLabel: interpretation.stateLabel,
      verdict: interpretation.verdict,
      powerLevel: interpretation.powerLevel,
      targetPeak: interpretation.targetPeak,
      globalPeak: interpretation.globalPeak,
      targetRank: interpretation.targetRank,
    },
    matchedControls,
    topLags: top,
    scanResults,
    stormCount: normalizedStorms.length,
    eqCount: normalizedEq.length,
  };
}

async function runBootstrap(storms, earthquakes) {
  const payload = {
    storms: storms.map(s => ({ date: s.date.getTime(), kp: s.kp ?? s.intensity })),
    earthquakes: earthquakes.map(e => ({ date: e.date.getTime(), mag: e.mag })),
    permutations: 1000,
    maxLag: 60,
    targetMinLag: 25,
    targetMaxLag: 30,
    randomSeed: 42,
  };
  console.log('\nBootstrap null via sidecar…');
  const response = await fetch(`${APP_URL}/api/research/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'tectonic-solar-archive-analysis/1.0' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    console.log(`  sidecar ${response.status}: ${json.error || json.message || 'failed'}`);
    return { ok: false, ...json };
  }
  console.log(`  p_target=${json.pValue ?? json.targetPValue ?? json.p}  p_global=${json.correctedGlobalPValue ?? json.globalPValue ?? 'n/a'}`);
  return json;
}

async function main() {
  const health = await fetchJson(`${APP_URL}/api/health`);
  if (!health.local && health.ok === false && !health.checks) {
    throw new Error('Node proxy is not serving /api/health');
  }
  console.log(`proxy ${APP_URL} health=${health.status || (health.ok ? 'ok' : 'degraded')}`);

  const earthquakes = await loadComcat();
  const kpStorms = await loadGfzStorms();
  const dst = await loadDstStorms();

  const kpRun = runScan('Kp≥5 (GFZ IAGA, 2y)', kpStorms, earthquakes);
  const dstStormsAsKp = dst.storms.map(s => ({
    date: s.date,
    kp: Math.abs(s.minDst) / 20,
    intensity: -Math.abs(s.minDst),
  }));
  const dstRun = dst.storms.length > 0
    ? runScan('Dst storms (Kyoto archive)', dstStormsAsKp, earthquakes)
    : null;

  const normalizedKp = normalizeStormCatalog(kpStorms);
  const normalizedEq = normalizeEarthquakeCatalog(earthquakes);
  let bootstrap = null;
  try {
    bootstrap = await runBootstrap(normalizedKp, normalizedEq);
  } catch (error) {
    bootstrap = { ok: false, error: error.message };
    console.log(`  bootstrap error: ${error.message}`);
  }

  const artifact = {
    artifactType: 'tectonic-solar-archive-analysis',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hypothesis: '27-28 day geomagnetic-storm to M5+ earthquake lag (exploratory; no established mechanism)',
    sources: {
      earthquakes: 'USGS ComCat M5+ via local /api/usgs/comcat, 730 days',
      storms: 'GFZ Potsdam IAGA Kp JSON, Kp≥5, CC BY 4.0',
      dst: `Kyoto WDC monthly Dst via /api/noaa/dst-archive (${dst.monthsOk}/${dst.months} months)`,
    },
    kp: kpRun,
    dst: dstRun ? { ...dstRun, monthsOk: dst.monthsOk } : null,
    bootstrap,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'archive-analysis.json');
  const slim = JSON.parse(JSON.stringify(artifact));
  if (slim.kp?.scanResults) {
    slim.kp.scanResults = slim.kp.scanResults.map(row => ({
      lag: row.lag,
      eventRatio: row.eventRatio,
      windowCount: row.windowCount,
      controlCount: row.controlCount,
    }));
  }
  if (slim.dst?.scanResults) {
    slim.dst.scanResults = slim.dst.scanResults.map(row => ({
      lag: row.lag,
      eventRatio: row.eventRatio,
      windowCount: row.windowCount,
      controlCount: row.controlCount,
    }));
  }
  fs.writeFileSync(outPath, JSON.stringify(slim, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
