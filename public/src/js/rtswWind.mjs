// NOAA RTSW wind/mag JSON helpers.
// SWPC SCN 26-21: rtsw_plasma_1m.json retired; rtsw_wind_1m.json is the successor.
// Rows mix spacecraft; `active: true` is the operational stream (often SOLAR1).

function parseNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function operationalRtswRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const hasActiveFlag = rows.some(row => row && typeof row === 'object' && 'active' in row);
  if (!hasActiveFlag) return rows;
  const active = rows.filter(row => row && row.active === true);
  return active.length > 0 ? active : rows;
}

export function windSpeed(row) {
  return parseNumber(row?.speed ?? row?.proton_speed);
}

export function windDensity(row) {
  return parseNumber(row?.density ?? row?.proton_density);
}

export function windTemperature(row) {
  return parseNumber(row?.temperature ?? row?.proton_temperature);
}
