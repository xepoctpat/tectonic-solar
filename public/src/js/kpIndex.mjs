// NOAA + GFZ Kp parsers. GFZ is the official IAGA Kp (CC BY 4.0, 3-hour bins).
// NOAA 1-min estimated Kp stays first for "now"; NOAA 3-day history may be
// either a header+rows table or an array of {time_tag, Kp} objects (SCN 26-21).

function parseNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNoaaKpHistory(data) {
  if (!Array.isArray(data) || data.length === 0) return [];

  const header = data[0];
  const startsWithHeader = Array.isArray(header)
    && String(header[0] || '').toLowerCase() === 'time_tag';
  const rows = startsWithHeader ? data.slice(1) : data;
  const points = [];

  for (const row of rows) {
    if (Array.isArray(row)) {
      const kp = parseNumber(row[1]);
      const time = row[0];
      if (time && kp != null) points.push({ kp, time, source: 'NOAA' });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const time = row.time_tag || row.time;
    const kp = parseNumber(row.Kp ?? row.kp_index ?? row.kp);
    if (time && kp != null) points.push({ kp, time, source: 'NOAA' });
  }
  return points;
}

export function parseGfzKpPayload(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.points)) {
    return data.points
      .map(point => ({
        kp: parseNumber(point.kp),
        time: point.time,
        status: point.status || null,
        source: 'GFZ Potsdam',
      }))
      .filter(point => point.time && point.kp != null);
  }

  const times = Array.isArray(data.datetime) ? data.datetime : [];
  const values = Array.isArray(data.Kp) ? data.Kp : [];
  const statuses = Array.isArray(data.status) ? data.status : [];
  const n = Math.min(times.length, values.length);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const kp = parseNumber(values[i]);
    if (kp == null || !times[i]) continue;
    points.push({
      kp,
      time: times[i],
      status: statuses[i] || null,
      source: 'GFZ Potsdam',
    });
  }
  return points;
}

export function parseNoaaKp1mLatest(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const index = parseNumber(row?.kp_index ?? row?.kp);
    const estimated = parseNumber(row?.estimated_kp);
    const kp = index != null && index !== 0 ? index : estimated;
    if (kp == null || kp === 0) continue;
    return { value: kp, time: row.time_tag || row.time || 0, source: 'NOAA 1-min' };
  }
  const last = rows[rows.length - 1];
  const kp = parseNumber(last?.kp_index ?? last?.estimated_kp ?? last?.kp);
  if (kp == null) return null;
  return { value: kp, time: last.time_tag || last.time || 0, source: 'NOAA 1-min' };
}

export function pickCurrentKp({ noaa1m, noaaHistory, gfzPoints }) {
  const from1m = parseNoaaKp1mLatest(noaa1m);
  if (from1m) return from1m;

  const gfz = Array.isArray(gfzPoints) && gfzPoints.length > 0
    ? gfzPoints[gfzPoints.length - 1]
    : null;
  if (gfz && gfz.kp != null) {
    return { value: gfz.kp, time: gfz.time, source: 'GFZ Potsdam' };
  }

  const hist = Array.isArray(noaaHistory) && noaaHistory.length > 0
    ? noaaHistory[noaaHistory.length - 1]
    : null;
  if (hist && hist.kp != null) {
    return { value: hist.kp, time: hist.time, source: 'NOAA 3-day' };
  }
  return null;
}

export function pickKpHistory(noaaHistory, gfzPoints) {
  if (Array.isArray(noaaHistory) && noaaHistory.length > 0) {
    return { points: noaaHistory, source: 'NOAA' };
  }
  if (Array.isArray(gfzPoints) && gfzPoints.length > 0) {
    return { points: gfzPoints, source: 'GFZ Potsdam' };
  }
  return { points: [], source: null };
}
