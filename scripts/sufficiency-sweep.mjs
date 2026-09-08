#!/usr/bin/env node
// What injected 27-day excess is enough for the engine to call "candidate-27-signal"?
// Uses the same core as hypothesis-sim. Not a proof of the real-world claim.

import {
  scanAllLags,
  assessLagScan,
  computePrediction,
  interpretHypothesisEvidence,
  compareTargetToMatchedControls,
} from '../public/src/js/hypothesis-core.mjs';

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 730;
const NOW = Date.now();
const SEEDS = [17, 23, 31, 41, 47, 53, 59, 67, 71];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function createStormCatalog(rng) {
  const storms = [];
  let daysAgo = LOOKBACK_DAYS - 18;
  while (daysAgo > 38) {
    storms.push({ kp: Number((5 + rng() * 4).toFixed(1)), date: new Date(NOW - daysAgo * DAY_MS) });
    daysAgo -= 13 + Math.floor(rng() * 16);
  }
  storms.push({ kp: 6.8, date: new Date(NOW - 27 * DAY_MS) });
  return storms.sort((a, b) => a.date - b.date);
}

function generateBackgroundEarthquakes(rng) {
  const earthquakes = [];
  for (let day = 0; day <= LOOKBACK_DAYS; day += 1) {
    const eventCount = poisson(rng, 0.35);
    for (let i = 0; i < eventCount; i += 1) {
      earthquakes.push({
        mag: Number((5 + rng() * 1.8).toFixed(1)),
        date: new Date(NOW - day * DAY_MS + Math.floor(rng() * DAY_MS)),
      });
    }
  }
  return earthquakes;
}

function injectFixed(rng, storms, earthquakes, extraPerStorm) {
  const whole = Math.floor(extraPerStorm);
  const frac = extraPerStorm - whole;
  storms.forEach((storm) => {
    const center = storm.date.getTime() + 27 * DAY_MS;
    if (center > NOW || center < NOW - LOOKBACK_DAYS * DAY_MS) return;
    const extra = whole + (rng() < frac ? 1 : 0);
    for (let i = 0; i < extra; i += 1) {
      const jitter = Math.floor((rng() * 4 - 2) * DAY_MS);
      earthquakes.push({
        mag: Number((5.6 + rng() * 1.5).toFixed(1)),
        date: new Date(center + jitter),
      });
    }
  });
}

function runOne(seed, extraPerStorm) {
  const rng = mulberry32(seed + Math.round(extraPerStorm * 100));
  const storms = createStormCatalog(rng);
  const earthquakes = generateBackgroundEarthquakes(rng);
  injectFixed(rng, storms, earthquakes, extraPerStorm);
  earthquakes.sort((a, b) => a.date - b.date);
  const scan = scanAllLags(storms, earthquakes, 60);
  const assessment = assessLagScan(scan);
  const prediction = computePrediction(storms, earthquakes, NOW);
  const interpretation = interpretHypothesisEvidence(scan, prediction, {
    stormCount: storms.length,
    eqCount: earthquakes.length,
    historicalLoaded: true,
    historicalEarthquakesLoaded: true,
    stormArchiveLoaded: true,
  });
  const matched = compareTargetToMatchedControls(storms, earthquakes, NOW);
  return {
    state: interpretation.state,
    peakLag: assessment.peakLag,
    peakRatio: assessment.peakRatio,
    lag27: assessment.lag27ratio,
    supported: assessment.isHypothesisSupported,
    controlRatio: matched.rateRatio,
    storms: storms.length,
    eqs: earthquakes.length,
  };
}

const extras = [0, 0.5, 1, 1.5, 2, 3, 5];
console.log('Sufficiency sweep: extra M5+ planted at +27d (±2d) per storm');
console.log('candidate-27-signal needs: peak in 25–30d, ratio≥1.15, rank≤3, not beaten by another lag by >0.10');
console.log('---');

const rows = [];
for (const extra of extras) {
  const runs = SEEDS.map(seed => runOne(seed, extra));
  const candidates = runs.filter(r => r.state === 'candidate-27-signal').length;
  const supported = runs.filter(r => r.supported).length;
  const mean27 = runs.reduce((s, r) => s + r.lag27, 0) / runs.length;
  const meanPeak = runs.reduce((s, r) => s + r.peakLag, 0) / runs.length;
  const meanRatio = runs.reduce((s, r) => s + r.peakRatio, 0) / runs.length;
  const meanCtrl = runs.reduce((s, r) => s + r.controlRatio, 0) / runs.length;
  rows.push({
    extraPerStorm: extra,
    candidate: `${candidates}/${SEEDS.length}`,
    jsSupported: `${supported}/${SEEDS.length}`,
    mean27: mean27.toFixed(2),
    meanPeakLag: meanPeak.toFixed(1),
    meanPeakRatio: meanRatio.toFixed(2),
    meanControlRatio: meanCtrl.toFixed(2),
  });
}

console.table(rows);

console.log('\nReal 2y archive (from archive-analysis.json) was 28d=1.02× rank 18, peak 57d=1.48×.');
console.log('To become the global peak it must beat 1.48×, not merely 1.15×.');
const control = 8177;
const have = 8301;
const need115 = Math.ceil(1.15 * control - have);
const need148 = Math.ceil(1.48 * control - have);
console.log(`If control stays ~${control}: +${need115} window-counts for 1.15×; +${need148} to match the 57d peak.`);
console.log('With ~2 overlapping storm windows per planted quake: ~' + Math.ceil(need115 / 2) + ' extra M5+ globally for 1.15×, ~' + Math.ceil(need148 / 2) + ' to outrun 57d.');
console.log('On 272 storms that is ~' + (need115 / 2 / 272).toFixed(1) + ' extra M5+ per storm (1.15×) or ~' + (need148 / 2 / 272).toFixed(1) + ' per storm (beat 57d).');
