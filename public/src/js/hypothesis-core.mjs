// ===== HYPOTHESIS ANALYSIS CORE =====
// Pure functions shared by the browser app and deterministic simulation runs.

const DAY_MS = 86_400_000;
const THREE_HOUR_MS = 3 * 60 * 60 * 1000;
const WINDOW_HALF_SPAN_MS = 3 * DAY_MS;
const TARGET_MIN_LAG = 25;
const TARGET_MAX_LAG = 30;

const BASIC_FLOORS = {
  storms: 5,
  earthquakes: 40,
  spanDays: 60,
  closedWindows: 3,
};

const POWER_FLOORS = {
  storms: 12,
  earthquakes: 120,
  spanDays: 180,
  closedWindows: 8,
};

function isTargetLag(lag) {
  return lag >= TARGET_MIN_LAG && lag <= TARGET_MAX_LAG;
}

function formatLagSummary(result, rank) {
  if (!result) return '—';
  return `${result.lag}d at ${result.eventRatio.toFixed(2)}×${rank ? ` (rank #${rank})` : ''}`;
}

function collectDataGaps({ stormCount, eqCount, dataSpanDays, stormTrials }, historicalLoaded) {
  const gaps = [];

  if (stormCount < BASIC_FLOORS.storms) {
    gaps.push(`${stormCount} storms (<${BASIC_FLOORS.storms})`);
  }
  if (eqCount < BASIC_FLOORS.earthquakes) {
    gaps.push(`${eqCount} earthquakes (<${BASIC_FLOORS.earthquakes})`);
  }
  if (dataSpanDays < BASIC_FLOORS.spanDays) {
    gaps.push(`${dataSpanDays} days (<${BASIC_FLOORS.spanDays})`);
  }
  if (stormTrials < BASIC_FLOORS.closedWindows) {
    gaps.push(`${stormTrials} closed post-storm windows (<${BASIC_FLOORS.closedWindows})`);
  }
  if (historicalLoaded?.earthquakeArchiveLoaded === false) {
    gaps.push('historical earthquake backfill not loaded');
  }
  if (historicalLoaded?.stormArchiveLoaded === false) {
    gaps.push('historical storm archive not loaded');
  }

  return gaps;
}

export function normalizeStormCatalog(storms = []) {
  const buckets = new Map();

  storms.forEach(storm => {
    const time = new Date(storm?.date).getTime();
    const kp = Number(storm?.kp);

    if (!Number.isFinite(time) || !Number.isFinite(kp)) {
      return;
    }

    const bucketStart = Math.floor(time / THREE_HOUR_MS) * THREE_HOUR_MS;
    const existing = buckets.get(bucketStart);
    if (!existing || kp > existing.kp) {
      buckets.set(bucketStart, {
        ...storm,
        kp,
        date: new Date(bucketStart),
      });
    }
  });

  return [...buckets.values()].sort((a, b) => a.date - b.date);
}

export function normalizeEarthquakeCatalog(earthquakes = []) {
  const unique = new Map();

  earthquakes.forEach(eq => {
    const time = new Date(eq?.date).getTime();
    if (!Number.isFinite(time)) {
      return;
    }

    const lat = Number(eq?.lat);
    const lon = Number(eq?.lon);
    const mag = Number(eq?.mag);
    const key = [
      time,
      Number.isFinite(lat) ? lat.toFixed(3) : '?',
      Number.isFinite(lon) ? lon.toFixed(3) : '?',
      Number.isFinite(mag) ? mag.toFixed(1) : '?',
      eq?.place || '',
    ].join('|');

    if (!unique.has(key)) {
      unique.set(key, {
        ...eq,
        date: new Date(time),
      });
    }
  });

  return [...unique.values()].sort((a, b) => a.date - b.date);
}

/**
 * Scan the event-rate ratio at every integer lag from 0 to maxLag days.
 *
 * For each lag L:
 *   window  = earthquakes within ±3 days of (storm_date + L)
 *   control = earthquakes within ±3 days of (storm_date + L + 14)
 *   ratio   = window / control
 *
 * A ratio significantly > 1 at a specific lag is the hypothesis signal.
 * This event-rate approach avoids the selection bias inherent in
 * Pearson r on matched pairs.
 *
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @param {number} maxLag
 * @returns {Array<{lag:number, eventRatio:number, windowCount:number, controlCount:number}>}
 */
export function scanAllLags(storms, earthquakes, maxLag = 60) {
  const results = [];

  for (let lag = 0; lag <= maxLag; lag++) {
    let windowCount = 0;
    let controlCount = 0;

    storms.forEach(storm => {
      const lagCenter = storm.date.getTime() + lag * DAY_MS;
      const ctrlCenter = storm.date.getTime() + (lag + 14) * DAY_MS;

      earthquakes.forEach(eq => {
        const t = eq.date.getTime();
        if (Math.abs(t - lagCenter) <= WINDOW_HALF_SPAN_MS) windowCount++;
        if (Math.abs(t - ctrlCenter) <= WINDOW_HALF_SPAN_MS) controlCount++;
      });
    });

    results.push({
      lag,
      windowCount,
      controlCount,
      eventRatio: controlCount > 0
        ? windowCount / controlCount
        : (windowCount > 0 ? 2.0 : 1.0),
    });
  }

  return results;
}

/**
 * Find the peak lag(s) and assess whether the 27–28 day region is special.
 * @param {Array<{lag:number, eventRatio:number}>} scanResults
 * @returns {{ peakLag: number, peakRatio: number, lag27ratio: number, isHypothesisSupported: boolean } | null}
 */
export function assessLagScan(scanResults) {
  if (!scanResults.length) return null;

  const peak = scanResults.reduce((a, b) => (b.eventRatio > a.eventRatio ? b : a));
  const lag27 = scanResults.find(r => r.lag === 27) || scanResults.find(r => r.lag === 28);
  const lag27ratio = lag27 ? lag27.eventRatio : 1.0;

  const isHypothesisSupported = (peak.lag >= 25 && peak.lag <= 30) && peak.eventRatio > 1.15;

  return {
    peakLag: peak.lag,
    peakRatio: peak.eventRatio,
    lag27ratio,
    isHypothesisSupported,
  };
}

/**
 * Compute P(≥1 M5+ earthquake in current 27–28d post-storm window) from
 * empirical conditional frequency in the historical corpus.
 *
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @param {number} [referenceTime=Date.now()]
 * @returns {Object} prediction result
 */
export function computePrediction(storms, earthquakes, referenceTime = Date.now()) {
  const now = referenceTime;

  const dataSpanDays = earthquakes.length > 0
    ? (now - Math.min(...earthquakes.map(e => e.date.getTime()))) / DAY_MS
    : 1;
  const dailyRate = earthquakes.length / Math.max(dataSpanDays, 1);
  const baseProbability = 1 - Math.pow(1 - dailyRate, 5);

  let stormTrials = 0;
  let stormHits = 0;

  storms.forEach(storm => {
    const winStart = storm.date.getTime() + 25 * DAY_MS;
    const winEnd = storm.date.getTime() + 30 * DAY_MS;
    if (winEnd < now) {
      stormTrials++;
      if (earthquakes.some(eq => eq.date.getTime() >= winStart && eq.date.getTime() <= winEnd)) {
        stormHits++;
      }
    }
  });

  const conditionalProbability = stormTrials >= 3
    ? stormHits / stormTrials
    : baseProbability;

  const triggeringStorms = storms.filter(s => {
    const ageDays = (now - s.date.getTime()) / DAY_MS;
    return ageDays >= 25 && ageDays <= 30;
  });

  const windowActive = triggeringStorms.length > 0;
  const displayProb = windowActive ? conditionalProbability : baseProbability;

  const confidence =
    stormTrials >= 30 ? 'high'
      : stormTrials >= 10 ? 'medium'
        : stormTrials >= 3 ? 'low'
          : 'insufficient';

  return {
    windowActive,
    probability: Math.min(Math.max(displayProb, 0), 1),
    conditionalProbability: Math.min(Math.max(conditionalProbability, 0), 1),
    baseProbability: Math.min(Math.max(baseProbability, 0), 1),
    stormTrials,
    stormHits,
    triggeringStorms: triggeringStorms.length,
    triggeringDetails: triggeringStorms.map(s => ({
      kp: s.kp,
      agedays: Math.round((now - s.date.getTime()) / DAY_MS),
    })),
    confidence,
    dataPoints: {
      storms: storms.length,
      earthquakes: earthquakes.length,
      dataSpanDays: Math.round(dataSpanDays),
    },
  };
}

/**
 * Convert raw lag-scan output into a stricter interpretation for the live UI.
 * This is intentionally conservative: it separates underpowered corpora,
 * null-like results, off-target peaks, weak target-window bumps, and candidate
 * 27–30 day signals.
 *
 * @param {Array<{lag:number, eventRatio:number}>} scanResults
 * @param {{stormTrials:number, dataPoints?: {storms:number, earthquakes:number, dataSpanDays:number}}} prediction
 * @param {{stormCount?:number, eqCount?:number, historicalLoaded?:boolean}} [meta]
 * @returns {object}
 */
export function interpretHypothesisEvidence(scanResults, prediction, meta = {}) {
  const sorted = [...scanResults].sort((a, b) => b.eventRatio - a.eventRatio);
  const globalPeak = sorted[0] ?? { lag: 0, eventRatio: 1 };
  const targetWindow = scanResults.filter(item => isTargetLag(item.lag));
  const targetPeak = targetWindow.reduce((best, item) => (
    item.eventRatio > best.eventRatio ? item : best
  ), targetWindow[0] ?? { lag: TARGET_MIN_LAG, eventRatio: 1 });
  const outsidePeak = scanResults
    .filter(item => !isTargetLag(item.lag))
    .reduce((best, item) => (item.eventRatio > best.eventRatio ? item : best), { lag: 0, eventRatio: -Infinity });

  const targetRank = sorted.findIndex(item => item.lag === targetPeak.lag) + 1;
  const stormCount = meta.stormCount ?? prediction?.dataPoints?.storms ?? 0;
  const eqCount = meta.eqCount ?? prediction?.dataPoints?.earthquakes ?? 0;
  const dataSpanDays = prediction?.dataPoints?.dataSpanDays ?? 0;
  const stormTrials = prediction?.stormTrials ?? 0;
  const earthquakeArchiveLoaded = meta.historicalEarthquakesLoaded ?? meta.historicalLoaded ?? false;
  const stormArchiveLoaded = meta.stormArchiveLoaded ?? false;
  const historicalContextAvailable = earthquakeArchiveLoaded && stormArchiveLoaded;

  const corpusText = `${stormCount} storms • ${eqCount} earthquakes • ${dataSpanDays} days • ${stormTrials} closed post-storm windows`;
  const basicData = stormCount >= BASIC_FLOORS.storms
    && eqCount >= BASIC_FLOORS.earthquakes
    && dataSpanDays >= BASIC_FLOORS.spanDays
    && stormTrials >= BASIC_FLOORS.closedWindows;
  const poweredData = stormCount >= POWER_FLOORS.storms
    && eqCount >= POWER_FLOORS.earthquakes
    && dataSpanDays >= POWER_FLOORS.spanDays
    && stormTrials >= POWER_FLOORS.closedWindows
    && historicalContextAvailable;

  const dataGaps = collectDataGaps(
    { stormCount, eqCount, dataSpanDays, stormTrials },
    { earthquakeArchiveLoaded, stormArchiveLoaded },
  );
  const overallPeakInTarget = isTargetLag(globalPeak.lag);
  const offTargetLead = Number.isFinite(outsidePeak.eventRatio)
    ? outsidePeak.eventRatio - targetPeak.eventRatio
    : -Infinity;
  const targetClearlyElevated = targetPeak.eventRatio >= 1.15;
  const targetNearNull = targetPeak.eventRatio <= 1.05;
  const globalNearNull = globalPeak.eventRatio <= 1.10;
  const targetWithinTopThree = targetRank > 0 && targetRank <= 3;

  const interpretation = {
    state: 'null-consistent',
    stateLabel: 'Null-consistent',
    tone: 'good',
    powerLevel: poweredData ? 'powered' : basicData ? 'basic' : 'thin',
    targetPeak,
    globalPeak,
    outsidePeak,
    targetRank,
    corpusText,
    dataGaps,
    whyText: '',
    verdict: '',
    probabilityNote: '',
    powerText: poweredData
      ? 'Powered enough for a cautious read.'
      : basicData
        ? 'Exploratory only — the storm catalog is still too thin for a strong claim.'
        : 'Underpowered — treat this as setup, not inference.',
  };

  if (!basicData) {
    interpretation.state = 'insufficient-data';
    interpretation.stateLabel = 'Insufficient data';
    interpretation.tone = 'muted';
    interpretation.whyText = dataGaps.length > 0
      ? `Missing ingredients: ${dataGaps.join(' • ')}.`
      : 'The current corpus is too small to interpret safely.';
    interpretation.verdict =
      `⏳ Underpowered corpus. ${corpusText}. ${interpretation.whyText} ` +
      'Use the percentage card as a descriptive background-rate estimate only.';
    interpretation.probabilityNote =
      'This percentage is a conditional-frequency summary from a thin corpus. It is not evidence for the 27–28 day hypothesis.';
    return interpretation;
  }

  if (overallPeakInTarget && targetClearlyElevated && targetWithinTopThree && outsidePeak.eventRatio <= targetPeak.eventRatio + 0.10) {
    interpretation.state = poweredData ? 'candidate-27-signal' : 'weak-27-signal';
    interpretation.stateLabel = poweredData ? 'Candidate 27–30d signal' : 'Weak 27–30d bump';
    interpretation.tone = poweredData ? 'alert' : 'warn';
    interpretation.whyText = poweredData
      ? `Target-window best ${formatLagSummary(targetPeak, targetRank)} and no outside lag beats it by a meaningful margin.`
      : `Target-window best ${formatLagSummary(targetPeak, targetRank)}, but the corpus is still exploratory rather than powered.`;
    interpretation.verdict = poweredData
      ? `⚠️ Candidate pattern: the strongest lag sits inside the 25–30 day window (${formatLagSummary(targetPeak, targetRank)}). Treat this as a signal candidate only — not proof and not causation.`
      : `⚠️ A 25–30 day bump is present (${formatLagSummary(targetPeak, targetRank)}), but the storm catalog is still too thin for a strong claim.`;
    interpretation.probabilityNote = poweredData
      ? 'Even in this best case, the probability card is only a conditional-frequency estimate from the current corpus. It does not establish a causal mechanism.'
      : 'The probability card is exploratory here because the target-window bump is not yet backed by a powered storm catalog.';
    return interpretation;
  }

  if (!overallPeakInTarget && offTargetLead >= 0.08 && globalPeak.eventRatio > 1.10) {
    interpretation.state = 'off-target-peak';
    interpretation.stateLabel = 'Off-target peak';
    interpretation.tone = 'warn';
    interpretation.whyText =
      `Overall peak ${formatLagSummary(globalPeak)} beats the target-window best ${formatLagSummary(targetPeak, targetRank)}.`;
    interpretation.verdict =
      `⚠️ Stronger activity appears at ${formatLagSummary(globalPeak)}, not in the 25–30 day hypothesis window. ` +
      'That is activity in the corpus, not support for the target lag.';
    interpretation.probabilityNote =
      'A high percentage here can still be misleading: the strongest lag is elsewhere, so do not read this as 27–28 day support.';
    return interpretation;
  }

  if (targetNearNull && globalNearNull) {
    interpretation.state = 'null-consistent';
    interpretation.stateLabel = 'Null-consistent';
    interpretation.tone = 'good';
    interpretation.whyText =
      `Target-window best ${formatLagSummary(targetPeak, targetRank)} and overall peak ${formatLagSummary(globalPeak)} both sit near the null band.`;
    interpretation.verdict =
      `✓ Null-like result: the 25–30 day window does not stand out. ` +
      `Target-window best ${formatLagSummary(targetPeak, targetRank)}; overall peak ${formatLagSummary(globalPeak)}.`;
    interpretation.probabilityNote =
      'Use the probability card as a descriptive background-rate view only. The lag scan currently looks null-like rather than special.';
    return interpretation;
  }

  interpretation.state = 'weak-27-signal';
  interpretation.stateLabel = 'Weak 27–30d bump';
  interpretation.tone = 'warn';
  interpretation.whyText = overallPeakInTarget
    ? `Target-window best ${formatLagSummary(targetPeak, targetRank)} is visible, but other lags remain competitive.`
    : `The target window (${formatLagSummary(targetPeak, targetRank)}) is notable but not dominant.`;
  interpretation.verdict =
    `⚠️ Mixed result: the target window shows some elevation (${formatLagSummary(targetPeak, targetRank)}), ` +
    'but it is not cleanly separated from other lags or the corpus is still exploratory.';
  interpretation.probabilityNote =
    'Treat the probability card as exploratory here. A visible bump is not the same thing as a robust, isolated 27–28 day signal.';

  return interpretation;
}
