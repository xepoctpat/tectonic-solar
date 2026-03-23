// ===== CANVAS CHART RENDERING =====
import { getCSSVar } from './utils.js';

/**
 * Draw a line chart on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values - Normalized 0..1 values.
 * @param {string} [color='#32B8C6']
 */
function drawLineChart(canvas, values, color = '#32B8C6') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - v * height;
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
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;

  ctx.fillStyle = 'rgba(33, 128, 141, 0.1)';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = color;
  const barWidth = width / (values.length * 1.5);
  values.forEach((v, i) => {
    const barH = v * height;
    const x = (i / values.length) * width;
    const y = height - barH;
    ctx.fillRect(x, y, barWidth, barH);
  });
}

/** Draw all dashboard charts with demo/random data. */
export function drawSpaceCharts() {
  // Solar wind line chart (random)
  const solarWindValues = Array.from({ length: 20 }, () => Math.random() * 0.5 + 0.3);
  drawLineChart(document.getElementById('solar-wind-chart'), solarWindValues);

  // Kp bar chart (random)
  const kpValues = Array.from({ length: 12 }, () => Math.random() * 0.6);
  drawBarChart(document.getElementById('kp-chart'), kpValues);

  // Magnitude distribution bar chart (fixed demo data)
  const magValues = [15, 8, 3, 1, 1].map(v => v / 20);
  drawBarChart(document.getElementById('magnitude-chart'), magValues);

  // AQI line chart (random)
  const aqiValues = Array.from({ length: 15 }, () => Math.random() * 0.4 + 0.4);
  drawLineChart(document.getElementById('aqi-chart'), aqiValues);
}

/**
 * Draw the correlation timeline canvas.
 * @param {Array} storms - Array of {kp, date} objects.
 * @param {Array} earthquakes - Array of {mag, date} objects.
 * @param {{stormCount: string, majorEqCount: string, correlationStrength: string}} statEls - IDs to update.
 */
export function drawCorrelationTimeline(storms, earthquakes) {
  const canvas = document.getElementById('correlation-timeline');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Resize canvas to its rendered size for correct pixel density
  canvas.width = canvas.offsetWidth || 1000;
  canvas.height = canvas.offsetHeight || 400;

  const { width, height } = canvas;
  const bgColor = getCSSVar('--color-background') || '#fcfcf9';
  const borderColor = getCSSVar('--color-border') || 'rgba(94,82,64,0.2)';
  const textSecColor = getCSSVar('--color-text-secondary') || '#626c71';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const timelineY = height / 2;

  // Horizontal axis
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
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

  // Draw 27-28 day lag correlation lines
  let correlationCount = 0;
  ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
  ctx.lineWidth = 1;
  storms.forEach(storm => {
    const lagDate = new Date(storm.date.getTime() + 27.5 * 24 * 60 * 60 * 1000);
    const correlated = earthquakes.filter(eq => {
      const diff = Math.abs(eq.date - lagDate) / (24 * 60 * 60 * 1000);
      return diff <= 3;
    });
    correlated.forEach(eq => {
      const x1 = _mapX(storm.date, thirtyDaysAgo, now, 50, width - 50);
      const x2 = _mapX(eq.date, thirtyDaysAgo, now, 50, width - 50);
      ctx.beginPath();
      ctx.moveTo(x1, timelineY - 80);
      ctx.lineTo(x2, timelineY + 80);
      ctx.stroke();
      correlationCount++;
    });
  });

  // Section labels
  ctx.fillStyle = textSecColor;
  ctx.font = '12px sans-serif';
  ctx.fillText('Geomagnetic Storms', 60, timelineY - 100);
  ctx.fillText('Major Earthquakes', 60, timelineY + 100);

  // Date labels on axis
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
