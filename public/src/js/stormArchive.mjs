// ===== NOAA HISTORICAL STORM ARCHIVE HELPERS =====

const DAYIND_INTERVAL_END_HOURS = [3, 6, 9, 12, 15, 18, 21, 24];

export function toIsoDateOnly(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function enumerateUtcDateRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  ));
  const finalDate = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  ));

  while (cursor <= finalDate) {
    dates.push(toIsoDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Parse the planetary Kp values from a NOAA/NCEI daily `dayind` file.
 *
 * @param {string} text
 * @returns {{ planetaryA:number, kpValues:number[] } | null}
 */
export function parseDayindPlanetaryRecord(text) {
  const lines = text.split(/\r?\n/);
  let inGeomagneticSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith(':Geomagnetic_Indices:')) {
      inGeomagneticSection = true;
      continue;
    }

    if (inGeomagneticSection && line.startsWith(':') && !line.startsWith(':Geomagnetic_Indices:')) {
      break;
    }

    if (!inGeomagneticSection || !/\d+\.\d+/.test(line)) {
      continue;
    }

    const numericMatches = [...line.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
    const decimalMatches = [...line.matchAll(/-?\d+\.\d+/g)].map(match => Number(match[0]));

    if (decimalMatches.length >= 8 && numericMatches.length >= decimalMatches.length + 1) {
      const kpValues = decimalMatches.slice(-8);
      const planetaryA = numericMatches[numericMatches.length - kpValues.length - 1];

      return {
        planetaryA,
        kpValues,
      };
    }
  }

  return null;
}

/**
 * Convert a parsed `dayind` file into storm intervals (planetary Kp >= threshold).
 *
 * @param {string} text
 * @param {string} sourceDateOnly - YYYY-MM-DD
 * @param {number} minKp
 * @returns {Array<{kp:number, ap:number, date:Date, source:string, sourceDate:string}>}
 */
export function parseDayindStorms(text, sourceDateOnly, minKp = 5) {
  const record = parseDayindPlanetaryRecord(text);
  if (!record) return [];

  const [year, month, day] = sourceDateOnly.split('-').map(Number);

  return record.kpValues
    .map((kp, index) => ({ kp, index }))
    .filter(item => Number.isFinite(item.kp) && item.kp >= minKp)
    .map(item => {
      const timestamp = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      timestamp.setUTCHours(DAYIND_INTERVAL_END_HOURS[item.index], 0, 0, 0);

      return {
        kp: item.kp,
        ap: record.planetaryA,
        date: timestamp,
        source: 'NOAA/NCEI dayind archive',
        sourceDate: sourceDateOnly,
      };
    });
}
