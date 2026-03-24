// ===== CHART.JS CHART RENDERING =====
import { getCSSVar } from './utils.js';

const chartInstances = {};

function colorVar(name, fallback) {
  const value = getCSSVar(name);
  return value || fallback;
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    chartInstances[key] = null;
  }
}

/**
 * Draw solar wind speed history.
 * @param {Array<{speed:number, time:string}>} history
 */
export function drawRealSolarWindChart(history = []) {
  const canvas = document.getElementById('solar-wind-chart');
  if (!canvas) return;

  destroyChart('solarWind');

  const recent = history.slice(-60);
  const data = recent.length > 0
    ? recent.map(d => Number(d.speed) || 0)
    : Array.from({ length: 30 }, () => 350 + Math.random() * 220);
  const labels = data.map((_, i) => `${i}m`);

  chartInstances.solarWind = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Solar Wind (km/s)',
        data,
        borderColor: colorVar('--color-primary', '#32B8C6'),
        backgroundColor: 'rgba(33, 128, 141, 0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: false,
          grid: { color: colorVar('--color-border', 'rgba(0,0,0,0.1)') },
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
        },
      },
      animation: { duration: 700 },
    },
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
  const data = recent.length > 0
    ? recent.map(d => Number(d.kp) || 0)
    : Array.from({ length: 12 }, () => Math.random() * 6);
  const labels = data.map((_, i) => `${i}h`);

  const colors = data.map(v => (v >= 7 ? '#F44336' : v >= 5 ? '#FF9800' : v >= 4 ? '#FFC107' : '#32B8C6'));

  chartInstances.kp = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          beginAtZero: true,
          max: 9,
          grid: { color: colorVar('--color-border', 'rgba(0,0,0,0.1)') },
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
        },
      },
      animation: { duration: 700 },
    },
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
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
        },
        y: {
          beginAtZero: true,
          grid: { color: colorVar('--color-border', 'rgba(0,0,0,0.1)') },
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
        },
      },
      animation: { duration: 700 },
    },
  });
}

/**
 * Draw AQI gauge chart.
 * @param {number} aqiValue
 */
export function drawAqiChart(aqiValue = 0) {
  const canvas = document.getElementById('aqi-chart');
  if (!canvas) return;

  destroyChart('aqi');

  const safeValue = Math.max(0, Number(aqiValue) || 0);
  let label = 'Good';
  let gaugeColor = '#4CAF50';
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
        data: [Math.min(safeValue, 150), Math.max(150 - safeValue, 0)],
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
        ctx.fillText(String(Math.round(safeValue)), left + width / 2, top + height / 2 - 8);
        ctx.font = '11px sans-serif';
        ctx.fillStyle = colorVar('--color-text-secondary', '#626c71');
        ctx.fillText(label, left + width / 2, top + height / 2 + 15);
        ctx.restore();
      },
    }],
  });
}

/** Draw initial placeholder charts. */
export function drawSpaceCharts() {
  drawRealSolarWindChart([]);
  drawRealKpChart([]);
  drawMagnitudeDistribution([]);
  drawAqiChart(0);
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
          labels: { color: colorVar('--color-text-secondary', '#626c71') },
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
          title: { display: true, text: 'Days (last 30)', color: colorVar('--color-text-secondary', '#626c71') },
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
          grid: { color: colorVar('--color-border', 'rgba(0,0,0,0.1)') },
        },
        y: {
          ticks: { color: colorVar('--color-text-secondary', '#626c71') },
          grid: { color: colorVar('--color-border', 'rgba(0,0,0,0.1)') },
        },
      },
      animation: { duration: 700 },
    },
  });

  return { stormCount: storms.length, eqCount: earthquakes.length, correlationCount };
}


