#!/usr/bin/env node

import {
  assessLagScan,
  compareTargetToMatchedControls,
  computePrediction,
  interpretHypothesisEvidence,
  scanAllLags,
} from '../public/src/js/hypothesis-core.mjs';

const DAY_MS = 86_400_000;
const LOOKBACK_DAYS = 730;
const NOW = Date.now();

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
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function createStormCatalog(rng, { includeActiveStorm = true } = {}) {
  const storms = [];
  let daysAgo = LOOKBACK_DAYS - 18;

  while (daysAgo > 38) {
    storms.push({
      kp: Number((5 + rng() * 4).toFixed(1)),
      date: new Date(NOW - daysAgo * DAY_MS),
    });
    daysAgo -= 13 + Math.floor(rng() * 16);
  }

  if (includeActiveStorm) {
    storms.push({ kp: 6.8, date: new Date(NOW - 27 * DAY_MS) });
  }

  return storms.sort((a, b) => a.date - b.date);
}

function createEarthquake(timestamp, magnitude, label) {
  return {
    mag: magnitude,
    date: new Date(timestamp),
    place: label,
  };
}

function generateBackgroundEarthquakes(rng, { dailyLambda = 0.35 } = {}) {
  const earthquakes = [];

  for (let day = 0; day <= LOOKBACK_DAYS; day++) {
    const eventCount = poisson(rng, dailyLambda);
    for (let i = 0; i < eventCount; i++) {
      const magnitude = Number((5 + rng() * 1.8 + (rng() < 0.08 ? 0.7 : 0)).toFixed(1));
      const timestamp = NOW - day * DAY_MS + Math.floor(rng() * DAY_MS);
      earthquakes.push(createEarthquake(timestamp, magnitude, 'Simulated background earthquake'));
    }
  }

  return earthquakes;
}

function injectLagSignal(rng, storms, earthquakes, { lagDays, label }) {
  storms.forEach(storm => {
    const center = storm.date.getTime() + lagDays * DAY_MS;
    if (center > NOW || center < NOW - LOOKBACK_DAYS * DAY_MS) return;

    const extraCount = 1 + (rng() < 0.55 ? 1 : 0);
    for (let i = 0; i < extraCount; i++) {
      const jitter = Math.floor((rng() * 4 - 2) * DAY_MS);
      const magnitude = Number((5.6 + rng() * 1.5).toFixed(1));
      earthquakes.push(createEarthquake(center + jitter, magnitude, label));
    }
  });
}

function topLagSummary(scanResults, topN = 3) {
  return [...scanResults]
    .sort((a, b) => b.eventRatio - a.eventRatio)
    .slice(0, topN)
    .map(item => `${item.lag}d=${item.eventRatio.toFixed(2)}×`)
    .join(', ');
}

function buildScenario({ seed, signalLagDays = null, label }) {
  const rng = mulberry32(seed);
  const storms = createStormCatalog(rng);
  const earthquakes = generateBackgroundEarthquakes(rng);

  if (typeof signalLagDays === 'number') {
    injectLagSignal(rng, storms, earthquakes, {
      lagDays: signalLagDays,
      label,
    });
  }

  earthquakes.sort((a, b) => a.date - b.date);
  return { storms, earthquakes };
}

function within(value, min, max) {
  return value >= min && value <= max;
}

const scenarios = [
  {
    name: 'Null independence',
    seed: 17,
    signalLagDays: null,
    expected(result) {
      return ['null-consistent', 'off-target-peak'].includes(result.interpretation?.state)
        && result.assessment
        && result.assessment.isHypothesisSupported === false;
    },
  },
  {
    name: 'Positive control (27d)',
    seed: 23,
    signalLagDays: 27,
    expected(result) {
      return result.assessment
        && result.assessment.isHypothesisSupported === true
        && within(result.assessment.peakLag, 25, 30)
        && result.matchedControls.rateRatio > 1
        && result.interpretation?.state === 'candidate-27-signal';
    },
  },
  {
    name: 'Off-target control (12d)',
    seed: 31,
    signalLagDays: 12,
    expected(result) {
      return result.assessment
        && result.assessment.isHypothesisSupported === false
        && within(result.assessment.peakLag, 10, 14)
        && result.interpretation?.state === 'off-target-peak';
    },
  },
];

// Seed sweep: each scenario's structural expectation must hold across a block
// of seeds, not just its showcase seed. A single-seed pass is luck; a sweep
// pass is the regression gate.
const SEED_SWEEP_OFFSETS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SWEEP_TOLERANCE = 1; // at most one failing seed per scenario block

function runScenario(scenario, seed) {
  const { storms, earthquakes } = buildScenario({
    seed,
    signalLagDays: scenario.signalLagDays,
    label: scenario.name,
  });
  const scanResults = scanAllLags(storms, earthquakes, 60);
  const assessment = assessLagScan(scanResults);
  const prediction = computePrediction(storms, earthquakes, NOW);
  const interpretation = interpretHypothesisEvidence(scanResults, prediction, {
    stormCount: storms.length,
    eqCount: earthquakes.length,
    historicalLoaded: true,
    historicalEarthquakesLoaded: true,
    stormArchiveLoaded: true,
  });

  return {
    scenario: scenario.name,
    seed,
    storms,
    earthquakes,
    scanResults,
    assessment,
    prediction,
    matchedControls: compareTargetToMatchedControls(storms, earthquakes, NOW),
    interpretation,
    passed: scenario.expected({ assessment, prediction, interpretation, matchedControls: compareTargetToMatchedControls(storms, earthquakes, NOW) }),
    topLags: topLagSummary(scanResults),
  };
}

console.log('Hypothesis simulation benchmark');
console.log('Checks that the lag scanner stays near-null under independence, detects an implanted 27-day signal, and does not mislabel an off-target lag as the hypothesis.');
console.log('---');

const results = scenarios.map(scenario => runScenario(scenario, scenario.seed));

// ---- Seed sweep ----
const sweepResults = [];
for (const scenario of scenarios) {
  for (const offset of SEED_SWEEP_OFFSETS) {
    sweepResults.push(runScenario(scenario, scenario.seed + offset * 101));
  }
}
const sweepFailures = {};
sweepResults.forEach(result => {
  if (!result.passed) {
    sweepFailures[result.scenario] = (sweepFailures[result.scenario] || 0) + 1;
  }
});
const sweepSummary = Object.entries(sweepFailures).map(([name, count]) => `${name}: ${count}/${SEED_SWEEP_OFFSETS.length} seeds`);
const sweepPassed = Object.values(sweepFailures).every(count => count <= SWEEP_TOLERANCE);

// ---- Optional sidecar scenarios (skipped when the sidecar is offline) ----
async function runSidecarScenarios() {
  const base = 'http://127.0.0.1:3000';
  const serialize = (storms, earthquakes) => ({
    storms: storms.map(s => ({ date: s.date.getTime(), kp: s.kp })),
    earthquakes: earthquakes.map(e => ({ date: e.date.getTime(), mag: e.mag })),
  });

  const outcomes = [];
  for (const scenario of scenarios.slice(0, 2)) {
    const result = results.find(r => r.scenario === scenario.name);
    try {
      const response = await fetch(`${base}/api/research/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...serialize(result.storms, result.earthquakes),
          permutations: 300,
          maxLag: 60,
          targetMinLag: 25,
          targetMaxLag: 30,
          randomSeed: 7,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const p = payload.summary?.empiricalPValue;
      if (!Number.isFinite(p)) throw new Error('missing empiricalPValue');
      const expectLowP = scenario.name.startsWith('Positive');
      const sidecarPassed = expectLowP ? p <= 0.1 : p > 0.1;
      outcomes.push({ scenario: scenario.name, p, passed: sidecarPassed, ran: true });
    } catch (error) {
      outcomes.push({ scenario: scenario.name, p: null, passed: null, ran: false, reason: error.message });
    }
  }
  return outcomes;
}

console.table(results.map(result => ({
  scenario: result.scenario,
  storms: result.storms.length,
  earthquakes: result.earthquakes.length,
  peakLag: result.assessment?.peakLag ?? '—',
  peakRatio: result.assessment?.peakRatio?.toFixed(2) ?? '—',
  lag27Ratio: result.assessment?.lag27ratio?.toFixed(2) ?? '—',
  interpretation: result.interpretation?.stateLabel ?? '—',
  hypothesisSupported: result.assessment?.isHypothesisSupported ?? false,
  activeWindowProbability: `${Math.round((result.prediction?.probability ?? 0) * 100)}%`,
  controlRatio: result.matchedControls?.rateRatio?.toFixed(2) ?? '—',
  topLags: result.topLags,
  passed: result.passed,
})));

const failed = results.filter(result => !result.passed);
if (failed.length > 0) {
  console.error('---');
  console.error('Simulation assertions failed. The lag engine is not behaving as expected under one or more control scenarios.');
  failed.forEach(result => {
    console.error(
      `- ${result.scenario}: ${result.interpretation?.stateLabel ?? '—'}, ` +
      `peak ${result.assessment?.peakLag ?? '—'}d, ratio ${result.assessment?.peakRatio?.toFixed(2) ?? '—'}×, top lags ${result.topLags}`,
    );
  });
  process.exit(1);
}

console.log('---');
console.log(`Seed sweep (${SEED_SWEEP_OFFSETS.length} extra seeds per scenario, tolerance ${SWEEP_TOLERANCE}): ${sweepPassed ? 'PASS' : 'FAIL'}${sweepSummary.length ? ` — ${sweepSummary.join('; ')}` : ' — all seeds passed'}`);

if (!sweepPassed) {
  console.error('Seed sweep tolerance exceeded. The engine is seed-sensitive, which is a regression.');
  process.exit(1);
}

const sidecarOutcomes = await runSidecarScenarios();
const sidecarRan = sidecarOutcomes.some(outcome => outcome.ran);
console.log('---');
if (sidecarRan) {
  const sidecarFailed = sidecarOutcomes.filter(outcome => outcome.ran && !outcome.passed);
  sidecarOutcomes.forEach(outcome => {
    console.log(
      `Sidecar ${outcome.scenario}: ${outcome.ran ? `p=${outcome.p?.toFixed(3)} ${outcome.passed ? 'PASS' : 'FAIL'}` : `skipped (${outcome.reason})`}`,
    );
  });
  if (sidecarFailed.length > 0) {
    console.error('Sidecar null-calibration scenarios failed.');
    process.exit(1);
  }
} else {
  console.log('Sidecar scenarios skipped (server or Python sidecar not running).');
}

console.log('---');
console.log('All simulation assertions passed. The same core lag-analysis logic now supports both live-data analysis and deterministic scenario testing.');
