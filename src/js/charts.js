// ===== CANVAS CHART RENDERING =====
import { getCSSVar } from './utils.js';

// ===== INTERNAL HELPERS =====

/**
 * Draw a line chart on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values - Normalized 0..1 values.
 * @param {string} [color='#32B8C6']
 */
function drawLineChart(canvas, values, color = '#32B8C6') {
  if (!canvas || values.length === 0) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - Math.max(0, Math.min(1, v)) * (height - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/**
 * Draw a bar chart on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values - Normalized 0..1 values.
 * @param {string} [color='#32B8C6']
 */
function drawBarChart(canvas, values, color = '#32B8C6') {
  if (!canvas || values.length === 0) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = color;
  const barWidth = Math.floor(width / (values.length * 1.5));
  values.forEach((v, i) => {
    const barH = Math.max(0, Math.min(1, v)) * (height - 4);
    const x = (i / values.length) * width;
    const y = height - barH;
    ctx.fillRect(x, y, Math.max(barWidth, 1), barH);
  });
}

// ===== PUBLIC: REAL-DATA CHARTS =====

/**
 * Draw solar wind speed history from real NOAA plasma data.
 * @param {Array<{speed:number, time:string}>} history - Last N readings.
 */
export function drawRealSolarWindChart(history) {
  const canvas = document.getElementById('solar-wind-chart');
  if (!canvas) return;

  if (!history || history.length === 0) {
    // Fallback: draw random placeholder
    drawLineChart(canvas, Array.from({ length: 20 }, () => Math.random() * 0.5 + 0.3));
    return;
  }

  // Normalize speed to 0..1 in 200–900 km/s range
  const normalized = history.map(d => (d.speed - 200) / 700);
  drawLineChart(canvas, normalized);

  // Label most recent value
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#32B8C6';
  ctx.font = '10px sans-serif';
  const latest = history[history.length - 1];
  ctx.fillText(`${Math.round(latest.speed)} km/s`, 4, 14);
}

/**
 * Draw Kp index bar chart from real NOAA 3-day history.
 * @param {Array<{kp:number, time:string}>} history - Kp readings.
 */
export function drawRealKpChart(history) {
  const canvas = document.getElementById('kp-chart');
  if (!canvas) return;

  if (!history || history.length === 0) {
    drawBarChart(canvas, Array.from({ length: 12 }, () => Math.random() * 0.6));
    return;
  }

  // Show last 24 readings; normalize Kp 0–9 → 0..1
  const recent = history.slice(-24);
  const normalized = recent.map(d => d.kp / 9);

  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  // Colour bars by storm level
  const barWidth = Math.floor(width / (recent.length * 1.5));
  recent.forEach((d, i) => {
    const barH = (d.kp / 9) * (height - 4);
    const x = (i / recent.length) * width;
    const y = height - barH;
    ctx.fillStyle = d.kp >= 7 ? '#F44336' : d.kp >= 5 ? '#FF9800' : d.kp >= 4 ? '#FFC107' : '#32B8C6';
    ctx.fillRect(x, y, Math.max(barWidth, 1), barH);
  });

  // Draw Kp=5 storm threshold line
  const stormY = height - (5 / 9) * (height - 4);
  ctx.strokeStyle = 'rgba(255,152,0,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, stormY);
  ctx.lineTo(width, stormY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * Draw magnitude distribution bar chart from real earthquake data.
 * @param {Array<{mag:number}>} earthquakes
 */
export function drawMagnitudeDistribution(earthquakes) {
  const canvas = document.getElementById('magnitude-chart');
  if (!canvas) return;

  const bins = { 'M4–4.9': 0, 'M5–5.9': 0, 'M6–6.9': 0, 'M7+': 0 };
  earthquakes.forEach(eq => {
    if (eq.mag >= 7)      bins['M7+']++;
    else if (eq.mag >= 6) bins['M6–6.9']++;
    else if (eq.mag >= 5) bins['M5–5.9']++;
    else                  bins['M4–4.9']++;
  });

  const labels  = Object.keys(bins);
  const counts  = Object.values(bins);
  const maxVal  = Math.max(...counts, 1);
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  const barW   = Math.floor(width / (labels.length * 1.8));
  const colors = ['#32B8C6', '#FFC107', '#FF9800', '#F44336'];
  const usableH = height - 28;

  labels.forEach((label, i) => {
    const barH = (counts[i] / maxVal) * usableH;
    const x = (i / labels.length) * width + 8;
    const y = usableH - barH + 4;

    ctx.fillStyle = colors[i];
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = '#626c71';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barW / 2, height - 14);
    ctx.fillText(counts[i], x + barW / 2, Math.max(y - 2, 12));
  });
  ctx.textAlign = 'left';
}

/**
 * Draw AQI gauge (horizontal bar) for the environment tab.
 * @param {number} aqiValue - European AQI (0–150+)
 */
export function drawAqiChart(aqiValue) {
  const canvas = document.getElementById('aqi-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  // Draw gradient background scale
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0,    '#50C878');
  gradient.addColorStop(0.25, '#9ACD32');
  gradient.addColorStop(0.45, '#FFC107');
  gradient.addColorStop(0.65, '#FF9800');
  gradient.addColorStop(0.85, '#F44336');
  gradient.addColorStop(1,    '#9C27B0');
  ctx.fillStyle = gradient;
  ctx.fillRect(8, height / 2 - 8, width - 16, 16);

  // Draw indicator needle
  const pct = Math.min(aqiValue / 150, 1);
  const needleX = 8 + pct * (width - 16);
  ctx.fillStyle = '#fff';
  ctx.fillRect(needleX - 2, height / 2 - 14, 4, 28);

  ctx.fillStyle = '#333';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`AQI ${aqiValue}`, width / 2, height - 4);
  ctx.textAlign = 'left';
}

// ===== PUBLIC: FALLBACK PLACEHOLDER CHARTS =====

/** Draw all dashboard charts – uses real data if available, random fallback otherwise. */
export function drawSpaceCharts() {
  drawRealSolarWindChart([]);
  drawRealKpChart([]);
  drawMagnitudeDistribution([]);
  drawAqiChart(0);
}

// ===== CORRELATION TIMELINE =====
/**
 * Draw the 30-day correlation timeline canvas.
 * @param {Array<{kp:number, date:Date}>} storms
 * @param {Array<{mag:number, date:Date}>} earthquakes
 * @returns {{stormCount:number, eqCount:number, correlationCount:number}}
 */
export function drawCorrelationTimeline(storms, earthquakes) {
  const canvas = document.getElementById('correlation-timeline');
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');

  // Resize canvas to its rendered size
  canvas.width  = canvas.offsetWidth  || 1000;
  canvas.height = canvas.offsetHeight || 400;

  const { width, height } = canvas;
  const bgColor      = getCSSVar('--color-background')    || '#fcfcf9';
  const borderColor  = getCSSVar('--color-border')        || 'rgba(94,82,64,0.2)';
  const textSecColor = getCSSVar('--color-text-secondary') || '#626c71';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const now          = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const timelineY    = height / 2;

  // Horizontal axis
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(50, timelineY);
  ctx.lineTo(width - 50, timelineY);
  ctx.stroke();

  // Plot storms (above axis)
  ctx.font = '10px sans-serif';
  storms.forEach(storm => {
    const x = _mapX(storm.date, thirtyDaysAgo, now, 50, width - 50);
    const y = timelineY - 80;
    ctx.fillStyle = storm.kp >= 7 ? '#F44336' : '#FF9800';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#FF9800';
    ctx.fillText(`Kp${storm.kp.toFixed(1)}`, x - 15, y - 15);
  });

  // Plot earthquakes (below axis)
  earthquakes.forEach(eq => {
    const x = _mapX(eq.date, thirtyDaysAgo, now, 50, width - 50);
    const y = timelineY + 80;
    ctx.fillStyle = eq.mag >= 6 ? '#F44336' : '#FFC107';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#FFC107';
    ctx.fillText(`M${eq.mag.toFixed(1)}`, x - 12, y + 20);
  });

  // Draw 27–28 day lag correlation lines
  let correlationCount = 0;
  ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
  ctx.lineWidth   = 1;
  storms.forEach(storm => {
    const lagDate   = new Date(storm.date.getTime() + 27.5 * 24 * 60 * 60 * 1000);
    const correlated = earthquakes.filter(eq => {
      const diff = Math.abs(eq.date - lagDate) / (24 * 60 * 60 * 1000);
      return diff <= 3;
    });
    correlated.forEach(eq => {
      const x1 = _mapX(storm.date, thirtyDaysAgo, now, 50, width - 50);
      const x2 = _mapX(eq.date,    thirtyDaysAgo, now, 50, width - 50);
      ctx.beginPath();
      ctx.moveTo(x1, timelineY - 80);
      ctx.lineTo(x2, timelineY + 80);
      ctx.stroke();
      correlationCount++;
    });
  });

  // Section labels
  ctx.fillStyle = textSecColor;
  ctx.font      = '12px sans-serif';
  ctx.fillText('Geomagnetic Storms', 60, timelineY - 100);
  ctx.fillText('Major Earthquakes',  60, timelineY + 100);

  // Date labels
  ctx.font = '10px sans-serif';
  [0, 7, 14, 21, 28].forEach(days => {
    const d = new Date(thirtyDaysAgo.getTime() + days * 24 * 60 * 60 * 1000);
    const x = _mapX(d, thirtyDaysAgo, now, 50, width - 50);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x - 15, timelineY + 20);
  });

  return { stormCount: storms.length, eqCount: earthquakes.length, correlationCount };
}

function _mapX(date, start, end, minX, maxX) {
  return minX + ((date - start) / (end - start)) * (maxX - minX);
}


