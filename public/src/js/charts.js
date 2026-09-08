// ===== CHART.JS CHART RENDERING =====
import { getCSSVar, finiteOrNull, latestChronological } from './utils.js';

const chartInstances = {};
const chartCache = {
  solarWindHistory: [],
  kpHistory: [],
  dstHistory: [],
  earthquakes: [],
  aqiValue: undefined,
  lagData: [],
  storms: [],
  correlationEarthquakes: [],
};

const EMPTY_STATE_PLUGIN = {
  id: 'emptyStateMessage',
  afterDraw(chart, _args, options) {
    if (!options?.message || options.hasData) {
      return;
    }

    const { ctx, chartArea } = chart;
    if (!ctx || !chartArea) {
      return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colorVar('--color-text-secondary', '#626c71');
    ctx.font = '12px sans-serif';
    ctx.fillText(options.message, chartArea.left + chartArea.width / 2, chartArea.top + chartArea.height / 2);
    ctx.restore();
  },
};

function colorVar(name, fallback) {
  const value = getCSSVar(name);
  return value || fallback;
}

function gridColor() {
  return colorVar('--color-border', 'rgba(0,0,0,0.1)');
}

function tickColor() {
  return colorVar('--color-text-secondary', '#626c71');
}

function cacheData(key, value) {
  chartCache[key] = Array.isArray(value) ? [...value] : value;
}

function createPlaceholderSeries(length) {
  return Array.from({ length }, () => null);
}

function createSequenceLabels(length, suffix = '') {
  return Array.from({ length }, (_, i) => suffix ? `${i}${suffix}` : `${i}`);
}

function hasSeriesData(values = []) {
  return values.some(value => Number.isFinite(value));
}

function renderCanvasNotice(canvas, message) {
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = tickColor();
  context.font = '12px sans-serif';
  context.fillText(message, canvas.width / 2, canvas.height / 2);
  context.restore();
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    chartInstances[key] = null;
  }
}

function preserveDatasetHidden(existing, nextDatasets) {
  if (!existing?.data?.datasets) return nextDatasets;
  const hiddenByLabel = new Map(
    existing.data.datasets.map(ds => [ds.label, ds.hidden]),
  );
  return nextDatasets.map(ds => {
    if (ds.label && hiddenByLabel.has(ds.label) && hiddenByLabel.get(ds.label) != null) {
      return { ...ds, hidden: hiddenByLabel.get(ds.label) };
    }
    return ds;
  });
}

function upsertChart(key, canvas, config) {
  const existing = chartInstances[key];
  const nextType = config.type;
  if (existing && existing.canvas === canvas && existing.config.type === nextType) {
    existing.data.labels = config.data.labels;
    existing.data.datasets = preserveDatasetHidden(existing, config.data.datasets);
    if (config.options?.plugins?.emptyStateMessage && existing.options?.plugins) {
      existing.options.plugins.emptyStateMessage = config.options.plugins.emptyStateMessage;
    }
    existing.update('none');
    return existing;
  }

  destroyChart(key);
  const created = new Chart(canvas.getContext('2d'), {
    ...config,
    options: {
      ...config.options,
      animation: existing ? { duration: 0 } : (config.options?.animation ?? { duration: 700 }),
    },
  });
  chartInstances[key] = created;
  return created;
}

export function resizeOpenCharts() {
  Object.values(chartInstances).forEach(chart => {
    if (chart && typeof chart.resize === 'function') chart.resize();
  });
}

export function redrawCachedCharts() {
  drawRealSolarWindChart(chartCache.solarWindHistory);
  drawRealKpChart(chartCache.kpHistory);
  drawDstChart(chartCache.dstHistory);
  drawMagnitudeDistribution(chartCache.earthquakes);
  drawDepthHistogram(chartCache.depthEarthquakes);
  drawAqiChart(chartCache.aqiValue);

  if (chartCache.lagData.length > 0) {
    drawLagScanChart(chartCache.lagData);
  } else {
    renderCanvasNotice(document.getElementById('lag-scan-chart'), 'Run analysis to populate chart');
  }

  if (document.getElementById('correlation-timeline')) {
    drawCorrelationTimeline(chartCache.storms, chartCache.correlationEarthquakes);
  }
}

/**
 * Draw solar wind history: speed plus toggleable density and dynamic-pressure
 * series (data available since the composite solar-wind history change).
 * @param {Array<{speed:number, density:number, bt:number, bz:number, pdyn:number, ey:number, time:string}>} history
 */
export function drawRealSolarWindChart(history = []) {
  const canvas = document.getElementById('solar-wind-chart');
  if (!canvas) return;

  const recent = latestChronological(history, 120);
  cacheData('solarWindHistory', recent);

  const hasData = recent.some(sample => Number.isFinite(Number(sample.speed)));
  const labels = recent.length > 0 ? recent.map((_, i) => `${i}m`) : createSequenceLabels(12, 'm');
  const speed = recent.length > 0 ? recent.map(d => finiteOrNull(d.speed)) : createPlaceholderSeries(12);
  const density = recent.map(d => finiteOrNull(d.density));
  const pdyn = recent.map(d => finiteOrNull(d.pdyn));

  upsertChart('solarWind', canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Speed (km/s)',
          data: speed,
          borderColor: colorVar('--color-primary', '#32B8C6'),
          backgroundColor: 'rgba(33, 128, 141, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          spanGaps: false,
          yAxisID: 'y',
        },
        {
          label: 'Density (cm⁻³)',
          data: density,
          borderColor: '#FF9800',
          backgroundColor: 'transparent',
          borderDash: [4, 3],
          tension: 0.35,
          pointRadius: 0,
          hidden: true,
          yAxisID: 'y1',
        },
        {
          label: 'P_dyn (nPa)',
          data: pdyn,
          borderColor: '#AB47BC',
          backgroundColor: 'transparent',
          borderDash: [2, 3],
          tension: 0.35,
          pointRadius: 0,
          hidden: true,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: tickColor(), boxWidth: 12, font: { size: 10 } },
        },
        emptyStateMessage: {
          hasData,
          message: 'Waiting for live solar wind data',
        },
      },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: false,
          grid: { color: gridColor() },
          ticks: { color: tickColor() },
        },
        y1: {
          position: 'right',
          display: 'auto',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });
}

/**
 * Draw the Dst index chart with storm threshold reference lines.
 * @param {Array<{dst:number, time:number}>} history
 */
export function drawDstChart(history = []) {
  const canvas = document.getElementById('dst-chart');
  if (!canvas) return;

  const recent = latestChronological(history, 72);
  cacheData('dstHistory', recent);

  const hasData = recent.some(sample => Number.isFinite(Number(sample.dst)));
  const labels = recent.length > 0 ? recent.map((_, i) => `${i}h`) : createSequenceLabels(12, 'h');
  const data = recent.length > 0 ? recent.map(d => finiteOrNull(d.dst)) : createPlaceholderSeries(12);

  upsertChart('dst', canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Dst (nT)',
        data,
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        spanGaps: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        emptyStateMessage: {
          hasData,
          message: 'Waiting for Dst data',
        },
        tooltip: {
          callbacks: {
            label: context => `Dst ${Math.round(context.parsed.y)} nT`,
          },
        },
      },
      scales: {
        x: { display: false },
        y: {
          grid: { color: gridColor() },
          ticks: { color: tickColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });
}

/**
 * Draw Kp index chart.
 * @param {Array<{kp:number, time:string}>} history
 */
export function drawRealKpChart(history = []) {
  const canvas = document.getElementById('kp-chart');
  if (!canvas) return;

  const recent = latestChronological(history, 24);
  cacheData('kpHistory', recent);

  const data = recent.length > 0
    ? recent.map(d => finiteOrNull(d.kp) ?? 0)
    : createPlaceholderSeries(12);
  const labels = recent.length > 0 ? data.map((_, i) => `${i}h`) : createSequenceLabels(12, 'h');
  const hasData = hasSeriesData(data);

  const colors = hasData
    ? data.map(v => (v >= 7 ? '#F44336' : v >= 5 ? '#FF9800' : v >= 4 ? '#FFC107' : '#32B8C6'))
    : Array.from({ length: data.length }, () => colorVar('--color-border', '#d0d0d0'));

  upsertChart('kp', canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Kp', data, backgroundColor: colors, borderWidth: 0 },
        {
          type: 'line',
          label: 'Storm threshold (Kp 5)',
          data: labels.map(() => 5),
          borderColor: '#FF9800',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        emptyStateMessage: {
          hasData,
          message: 'Waiting for Kp history',
        },
      },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          max: 9,
          grid: { color: gridColor() },
          ticks: { color: tickColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });
}

/**
 * Draw magnitude distribution chart.
 * @param {Array<{mag:number}>} earthquakes
 */
export function drawMagnitudeDistribution(earthquakes = []) {
  const canvas = document.getElementById('magnitude-chart');
  if (!canvas) return;

  cacheData('earthquakes', earthquakes);

  const bins = { 'M4–4.9': 0, 'M5–5.9': 0, 'M6–6.9': 0, 'M7+': 0 };
  earthquakes.forEach(eq => {
    const mag = Number(eq.mag) || 0;
    if (mag >= 7) bins['M7+']++;
    else if (mag >= 6) bins['M6–6.9']++;
    else if (mag >= 5) bins['M5–5.9']++;
    else if (mag >= 4) bins['M4–4.9']++;
  });

  upsertChart('magnitude', canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(bins),
      datasets: [{
        data: Object.values(bins),
        backgroundColor: ['#FFC107', '#FF9800', '#F44336', '#9C27B0'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        emptyStateMessage: {
          hasData: earthquakes.length > 0,
          message: 'No earthquake data loaded yet',
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor() },
        },
        y: {
          beginAtZero: true,
          ticks: { color: tickColor(), precision: 0 },
          grid: { color: gridColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });
}

/**
 * Draw AQI gauge chart.
 * @param {number} aqiValue
 */
export function drawAqiChart(aqiValue) {
  const canvas = document.getElementById('aqi-chart');
  if (!canvas) return;

  cacheData('aqiValue', aqiValue);

  const hasData = Number.isFinite(aqiValue);
  const safeValue = hasData ? Math.max(0, Number(aqiValue) || 0) : 0;
  let label = hasData ? 'Good' : 'Awaiting data';
  let gaugeColor = hasData ? '#4CAF50' : colorVar('--color-border', '#d0d0d0');
  if (safeValue > 20) { label = 'Fair'; gaugeColor = '#8BC34A'; }
  if (safeValue > 40) { label = 'Moderate'; gaugeColor = '#FFC107'; }
  if (safeValue > 60) { label = 'Poor'; gaugeColor = '#FF9800'; }
  if (safeValue > 80) { label = 'Very Poor'; gaugeColor = '#F44336'; }
  if (safeValue > 100) { label = 'Extreme'; gaugeColor = '#9C27B0'; }

  upsertChart('aqi', canvas, {
    type: 'doughnut',
    data: {
      labels: [label, 'Remaining'],
      datasets: [{
        data: hasData
          ? [Math.min(safeValue, 150), Math.max(150 - safeValue, 0)]
          : [0, 150],
        backgroundColor: [gaugeColor, colorVar('--color-border', '#d0d0d0')],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { display: false } },
      animation: { duration: 700 },
    },
    plugins: [{
      id: 'aqiCenterText',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea: { left, top, width, height } } = chart;
        const dataset = chart.data.datasets[0];
        const centerLabel = chart.data.labels?.[0] || '';
        const liveValue = chartCache.aqiValue;
        const live = Number.isFinite(liveValue);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dataset?.backgroundColor?.[0] || gaugeColor;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(live ? String(Math.round(liveValue)) : '—', left + width / 2, top + height / 2 - 8);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = tickColor();
        ctx.fillText(centerLabel, left + width / 2, top + height / 2 + 15);
        ctx.restore();
      },
    }],
  });
}

/** Draw initial placeholder charts. */
/**
 * Draw earthquake depth distribution histogram.
 * Bins follow the standard shallow/intermediate/deep zonation.
 * @param {Array<{depth:number}>} earthquakes
 */
export function drawDepthHistogram(earthquakes = []) {
  const canvas = document.getElementById('depth-chart');
  if (!canvas) return;

  cacheData('depthEarthquakes', earthquakes);

  const bins = [
    { label: '0–35 km (shallow)', min: 0, max: 35 },
    { label: '35–70 km', min: 35, max: 70 },
    { label: '70–150 km', min: 70, max: 150 },
    { label: '150–300 km', min: 150, max: 300 },
    { label: '300+ km (deep)', min: 300, max: Infinity },
  ];

  const counts = bins.map(bin => earthquakes.filter(eq => {
    const depth = Number(eq.depth);
    return Number.isFinite(depth) && depth >= bin.min && depth < bin.max;
  }).length);
  const hasData = counts.some(count => count > 0);

  upsertChart('depth', canvas, {
    type: 'bar',
    data: {
      labels: bins.map(bin => bin.label),
      datasets: [{
        label: 'Earthquakes',
        data: counts,
        backgroundColor: ['#F44336', '#FF9800', '#FFC107', '#42A5F5', '#7E57C2'],
        borderWidth: 0,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        emptyStateMessage: {
          hasData,
          message: 'No depth data loaded yet',
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: tickColor(), precision: 0 },
          grid: { color: gridColor() },
        },
        y: {
          grid: { display: false },
          ticks: { color: tickColor(), font: { size: 10 } },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });
}

export function drawSpaceCharts() {
  drawRealSolarWindChart(chartCache.solarWindHistory);
  drawRealKpChart(chartCache.kpHistory);
  drawDstChart(chartCache.dstHistory);
  drawMagnitudeDistribution(chartCache.earthquakes);
  drawAqiChart(chartCache.aqiValue);
}

/**
 * Draw the cross-lag scan: event-rate ratio vs lag day (0–60).
 * A horizontal dashed line at ratio=1 represents the null hypothesis.
 * The 25–30 day range is highlighted to show the hypothesis window.
 *
 * @param {Array<{lag:number, eventRatio:number}>} lagData - from scanAllLags()
 */
export function drawLagScanChart(lagData = []) {
  const canvas = document.getElementById('lag-scan-chart');
  if (!canvas) return;

  cacheData('lagData', lagData);

  if (!lagData.length) {
    destroyChart('lagScan');
    renderCanvasNotice(canvas, 'Run analysis to populate chart');
    return;
  }

  const labels = lagData.map(d => d.lag);
  const ratios = lagData.map(d => parseFloat(d.eventRatio.toFixed(3)));

  // Coloring: hypothesis window (25–30d) in amber, rest in teal
  const pointColors = ratios.map((_, i) =>
    (i >= 25 && i <= 30) ? '#FF9800' : colorVar('--color-primary', '#32B8C6'),
  );
  const pointSizes = ratios.map((_, i) => (i >= 25 && i <= 30) ? 6 : 2);

  upsertChart('lagScan', canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Event ratio (window / control)',
          data: ratios,
          borderColor: colorVar('--color-primary', '#32B8C6'),
          backgroundColor: 'rgba(50, 184, 198, 0.07)',
          fill: true,
          tension: 0.35,
          pointRadius: pointSizes,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          borderWidth: 2,
        },
        {
          label: 'Null: no effect (ratio = 1)',
          data: Array(lagData.length).fill(1.0),
          borderColor: 'rgba(160,160,160,0.55)',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: colorVar('--color-text-secondary', '#626c71'),
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            title: items => `Lag: ${items[0].label} days`,
            label: item => {
              if (item.datasetIndex === 1) return 'Null (1.00)';
              const r = Number(item.raw);
              const marker = r > 1.15 ? ' ▲ elevated' : r < 0.85 ? ' ▼ suppressed' : ' ≈ null';
              return `Ratio: ${r.toFixed(2)}${marker}`;
            },
          },
        },
        annotation: undefined,
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Lag (days after storm)',
            color: tickColor(),
          },
          ticks: {
            color: tickColor(),
            maxTicksLimit: 16,
          },
          grid: { color: gridColor() },
        },
        y: {
          title: {
            display: true,
            text: 'Event ratio',
            color: tickColor(),
          },
          beginAtZero: true,
          suggestedMax: 2,
          ticks: { color: tickColor() },
          grid: { color: gridColor() },
        },
      },
      animation: { duration: 900 },
    },
  });
}

/**
 * Draw 30-day storm vs seismic timeline.
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @returns {{stormCount:number, eqCount:number, correlationCount:number}|null}
 */
export function drawCorrelationTimeline(storms = [], earthquakes = []) {
  const canvas = document.getElementById('correlation-timeline');
  if (!canvas) return null;

  cacheData('storms', storms);
  cacheData('correlationEarthquakes', earthquakes);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const STORM_LANE = 2;
  const QUAKE_LANE = 1;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
  const inWindow = x => Number.isFinite(x) && x >= 0 && x <= 30;

  const stormPoints = storms.map(s => {
    const x = (s.date - thirtyDaysAgo) / MS_PER_DAY;
    const kp = Number(s.kp) || 0;
    return {
      x,
      y: STORM_LANE,
      label: `Storm Kp${kp.toFixed(1)}`,
      r: Math.min(10, 4 + kp * 0.5),
    };
  }).filter(point => inWindow(point.x));

  const eqPoints = earthquakes.map(e => {
    const x = (e.date - thirtyDaysAgo) / MS_PER_DAY;
    const mag = Number(e.mag) || 0;
    return {
      x,
      y: QUAKE_LANE,
      label: `M${mag.toFixed(1)}`,
      r: Math.min(10, 4 + Math.max(0, mag - 4.5)),
    };
  }).filter(point => inWindow(point.x));

  let correlationCount = 0;
  const pairSegments = [];
  storms.forEach(storm => {
    const stormX = (storm.date - thirtyDaysAgo) / MS_PER_DAY;
    const lagDate = new Date(storm.date.getTime() + 27.5 * MS_PER_DAY);
    earthquakes.forEach(eq => {
      const diffDays = Math.abs(eq.date - lagDate) / MS_PER_DAY;
      if (diffDays > 3) return;
      correlationCount++;
      const eqX = (eq.date - thirtyDaysAgo) / MS_PER_DAY;
      if (inWindow(stormX) && inWindow(eqX)) {
        pairSegments.push(
          { x: stormX, y: STORM_LANE },
          { x: eqX, y: QUAKE_LANE },
          null,
        );
      }
    });
  });

  upsertChart('correlation', canvas, {
    type: 'scatter',
    data: {
      datasets: [
        {
          type: 'line',
          label: '27–28 day lag pairs',
          data: pairSegments,
          hidden: pairSegments.length === 0,
          borderColor: 'rgba(76, 175, 80, 0.7)',
          borderWidth: 1.5,
          pointRadius: 0,
          showLine: true,
          spanGaps: false,
          fill: false,
        },
        {
          label: 'Geomagnetic Storms',
          data: stormPoints,
          pointBackgroundColor: '#FF9800',
          pointBorderColor: '#FF5722',
          pointRadius: ctx => ctx.raw?.r ?? 6,
          pointHoverRadius: 8,
        },
        {
          label: 'Major Earthquakes',
          data: eqPoints,
          pointBackgroundColor: '#FFC107',
          pointBorderColor: '#F44336',
          pointRadius: ctx => ctx.raw?.r ?? 5,
          pointHoverRadius: 7,
          pointStyle: 'triangle',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: tickColor(), boxWidth: 12, font: { size: 10 } },
        },
        emptyStateMessage: {
          hasData: stormPoints.length + eqPoints.length > 0,
          message: 'Waiting for storm and earthquake data',
        },
        tooltip: {
          filter: item => item.dataset.type !== 'line',
          callbacks: {
            label: (ctx) => ctx.raw?.label || `Day ${Math.round(ctx.raw?.x || 0)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 30,
          title: { display: true, text: 'Days (last 30)', color: tickColor() },
          ticks: { color: tickColor() },
          grid: { color: gridColor() },
        },
        y: {
          min: 0.4,
          max: 2.6,
          ticks: {
            color: tickColor(),
            stepSize: 1,
            callback(value) {
              if (value === STORM_LANE) return 'Storms';
              if (value === QUAKE_LANE) return 'M5+ quakes';
              return '';
            },
          },
          grid: { color: gridColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });

  return { stormCount: storms.length, eqCount: earthquakes.length, correlationCount };
}


