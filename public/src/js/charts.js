// ===== CHART.JS CHART RENDERING =====
import { getCSSVar } from './utils.js';

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

  destroyChart('solarWind');

  const recent = history.slice(-120);
  cacheData('solarWindHistory', recent);

  const hasData = recent.some(sample => Number.isFinite(Number(sample.speed)));
  const labels = recent.length > 0 ? recent.map((_, i) => `${i}m`) : createSequenceLabels(12, 'm');
  const speed = recent.length > 0 ? recent.map(d => Number(d.speed) || null) : createPlaceholderSeries(12);
  const density = recent.map(d => Number.isFinite(Number(d.density)) ? Number(d.density) : null);
  const pdyn = recent.map(d => Number.isFinite(Number(d.pdyn)) ? Number(d.pdyn) : null);

  chartInstances.solarWind = new Chart(canvas.getContext('2d'), {
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

  destroyChart('dst');

  const recent = history.slice(-72);
  cacheData('dstHistory', recent);

  const hasData = recent.some(sample => Number.isFinite(Number(sample.dst)));
  const labels = recent.length > 0 ? recent.map((_, i) => `${i}h`) : createSequenceLabels(12, 'h');
  const data = recent.length > 0 ? recent.map(d => Number(d.dst) || null) : createPlaceholderSeries(12);

  chartInstances.dst = new Chart(canvas.getContext('2d'), {
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

  destroyChart('kp');

  const recent = history.slice(-24);
  cacheData('kpHistory', recent);

  const data = recent.length > 0
    ? recent.map(d => Number(d.kp) || 0)
    : createPlaceholderSeries(12);
  const labels = recent.length > 0 ? data.map((_, i) => `${i}h`) : createSequenceLabels(12, 'h');
  const hasData = hasSeriesData(data);

  const colors = hasData
    ? data.map(v => (v >= 7 ? '#F44336' : v >= 5 ? '#FF9800' : v >= 4 ? '#FFC107' : '#32B8C6'))
    : Array.from({ length: data.length }, () => colorVar('--color-border', '#d0d0d0'));

  chartInstances.kp = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
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

  destroyChart('magnitude');
  cacheData('earthquakes', earthquakes);

  const bins = { 'M4–4.9': 0, 'M5–5.9': 0, 'M6–6.9': 0, 'M7+': 0 };
  earthquakes.forEach(eq => {
    const mag = Number(eq.mag) || 0;
    if (mag >= 7) bins['M7+']++;
    else if (mag >= 6) bins['M6–6.9']++;
    else if (mag >= 5) bins['M5–5.9']++;
    else if (mag >= 4) bins['M4–4.9']++;
  });

  chartInstances.magnitude = new Chart(canvas.getContext('2d'), {
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
 * Draw AQI gauge chart.
 * @param {number} aqiValue
 */
export function drawAqiChart(aqiValue) {
  const canvas = document.getElementById('aqi-chart');
  if (!canvas) return;

  destroyChart('aqi');
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

  chartInstances.aqi = new Chart(canvas.getContext('2d'), {
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
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = gaugeColor;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(hasData ? String(Math.round(safeValue)) : '—', left + width / 2, top + height / 2 - 8);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = tickColor();
        ctx.fillText(label, left + width / 2, top + height / 2 + 15);
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

  destroyChart('depth');
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

  chartInstances.depth = new Chart(canvas.getContext('2d'), {
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
          grid: { color: gridColor() },
          ticks: { color: tickColor() },
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

  destroyChart('lagScan');
  cacheData('lagData', lagData);

  if (!lagData.length) {
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

  chartInstances.lagScan = new Chart(canvas.getContext('2d'), {
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
        // Shade the hypothesis window 25–30d
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

  destroyChart('correlation');
  cacheData('storms', storms);
  cacheData('correlationEarthquakes', earthquakes);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const stormPoints = storms.map(s => ({
    x: (s.date - thirtyDaysAgo) / (24 * 60 * 60 * 1000),
    y: 100 + (Number(s.kp) || 0) * 10,
    label: `Kp${Number(s.kp || 0).toFixed(1)}`,
  }));

  const eqPoints = earthquakes.map(e => ({
    x: (e.date - thirtyDaysAgo) / (24 * 60 * 60 * 1000),
    y: -100 - (Number(e.mag) || 0) * 10,
    label: `M${Number(e.mag || 0).toFixed(1)}`,
  }));

  let correlationCount = 0;
  storms.forEach(storm => {
    const lagDate = new Date(storm.date.getTime() + 27.5 * 24 * 60 * 60 * 1000);
    earthquakes.forEach(eq => {
      const diffDays = Math.abs(eq.date - lagDate) / (24 * 60 * 60 * 1000);
      if (diffDays <= 3) correlationCount++;
    });
  });

  chartInstances.correlation = new Chart(canvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Geomagnetic Storms',
          data: stormPoints,
          pointBackgroundColor: '#FF9800',
          pointBorderColor: '#FF5722',
          pointRadius: 6,
          pointHoverRadius: 8,
        },
        {
          label: 'Major Earthquakes',
          data: eqPoints,
          pointBackgroundColor: '#FFC107',
          pointBorderColor: '#F44336',
          pointRadius: 5,
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
          labels: { color: tickColor() },
        },
        emptyStateMessage: {
          hasData: stormPoints.length + eqPoints.length > 0,
          message: 'Waiting for storm and earthquake data',
        },
        tooltip: {
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
          ticks: { color: tickColor() },
          grid: { color: gridColor() },
        },
      },
      animation: { duration: 700 },
    },
    plugins: [EMPTY_STATE_PLUGIN],
  });

  return { stormCount: storms.length, eqCount: earthquakes.length, correlationCount };
}


