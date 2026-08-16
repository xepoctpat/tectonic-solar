// ===== SOLAR-Terrestrial COUPLING METRICS =====
// Pure, node-runnable derivations from NOAA SWPC feeds. Shared by the
// Space Weather tab, the Coupling Chain Monitor, and the research engine's
// alternative storm definitions. Thresholds follow published NOAA SWPC /
// Kyoto WDC conventions and are labeled in the UI accordingly.

export const PROTON_ENERGY_CHANNEL = '>=10 MeV';
export const PROTON_S1_FLUX = 10; // pfu; NOAA S1 radiation storm scale

export const PRESSURE_BANDS = { quiet: 5, elevated: 10 };
export const DST_BANDS = { quiet: -20, moderate: -50, intense: -100 };
export const EY_SIGNIFICANT = 3; // mV/m; strong southward-IMF reconnection driver

const PROTON_MASS_KG = 1.6726219e-27;
const CM3_TO_M3 = 1e6;
const KM_S_TO_M_S = 1e3;

// P_dyn = rho * v^2, expressed in nPa from density [cm^-3] and speed [km/s].
export function dynamicPressure(density, speed) {
  if (!Number.isFinite(density) || !Number.isFinite(speed) || density < 0 || speed < 0) return null;
  const rho = density * CM3_TO_M3 * PROTON_MASS_KG;
  const pascals = rho * (speed * KM_S_TO_M_S) ** 2;
  return pascals * 1e9;
}

// Geoeffective convective electric field E_y = -v * Bz [mV/m]
// (southward Bz gives positive Ey, the dayside reconnection driver).
export function electricFieldEy(speed, bzGsm) {
  if (!Number.isFinite(speed) || !Number.isFinite(bzGsm)) return null;
  return -(speed * bzGsm) / 1000;
}

export function classifyPressure(pdynNPa) {
  if (!Number.isFinite(pdynNPa)) return { band: 'unknown', label: '—' };
  if (pdynNPa >= PRESSURE_BANDS.elevated) return { band: 'strong', label: 'Strong compression' };
  if (pdynNPa >= PRESSURE_BANDS.quiet) return { band: 'elevated', label: 'Elevated' };
  return { band: 'quiet', label: 'Quiet' };
}

export function classifyEy(eyMVm) {
  if (!Number.isFinite(eyMVm)) return { band: 'unknown', label: '—' };
  if (eyMVm >= EY_SIGNIFICANT) return { band: 'strong', label: 'Strong coupling' };
  if (eyMVm >= 1) return { band: 'moderate', label: 'Moderate' };
  return { band: 'weak', label: 'Weak' };
}

export function classifyDst(dstnT) {
  if (!Number.isFinite(dstnT)) return { band: 'unknown', label: '—' };
  if (dstnT <= DST_BANDS.intense) return { band: 'intense', label: 'Intense storm' };
  if (dstnT <= DST_BANDS.moderate) return { band: 'moderate', label: 'Moderate storm' };
  if (dstnT <= DST_BANDS.quiet) return { band: 'unsettled', label: 'Unsettled' };
  return { band: 'quiet', label: 'Quiet' };
}

export function classifyProtons(fluxPfu) {
  if (!Number.isFinite(fluxPfu)) return { band: 'unknown', label: '—', scale: null };
  // NOAA S-scale thresholds: S1=10, S2=100, S3=1000, S4=10^4, S5=10^5 pfu.
  if (fluxPfu >= PROTON_S1_FLUX) {
    const scale = fluxPfu >= 1e5 ? 5 : fluxPfu >= 1e4 ? 4 : fluxPfu >= 1e3 ? 3 : fluxPfu >= 100 ? 2 : 1;
    return { band: 'event', label: `S${scale} radiation storm`, scale };
  }
  return { band: 'quiet', label: 'Quiet', scale: 0 };
}

function toTime(record) {
  if (record.date instanceof Date) return record.date.getTime();
  if (typeof record.time === 'string' || typeof record.time_tag === 'string') {
    return Date.parse(record.time ?? record.time_tag);
  }
  return Number.isFinite(record.time) ? record.time : null;
}

// Merge consecutive below-threshold Dst hours into discrete storm events,
// keyed on the first hour crossing DST_BANDS.moderate. Returns event records
// shaped like the existing storm catalog ({date, intensity, metric, source}).
export function detectDstStorms(dstRecords, threshold = DST_BANDS.moderate) {
  const events = [];
  let open = null;

  for (const record of (dstRecords || [])) {
    const time = toTime(record);
    const dst = Number.isFinite(record.dst) ? record.dst : Number.parseFloat(record.dst);
    if (!Number.isFinite(time) || !Number.isFinite(dst)) continue;

    const inStorm = dst <= threshold;
    if (inStorm && !open) {
      open = { start: time, minDst: dst };
    } else if (inStorm && open) {
      open.minDst = Math.min(open.minDst, dst);
    } else if (!inStorm && open) {
      events.push({
        date: new Date(open.start),
        minDst: open.minDst,
        metric: 'dst',
        source: 'NOAA SWPC Kyoto Dst',
      });
      open = null;
    }
  }
  // An event still open at the end of the window is a real ongoing storm.
  if (open) {
    events.push({
      date: new Date(open.start),
      minDst: open.minDst,
      metric: 'dst',
      source: 'NOAA SWPC Kyoto Dst',
    });
  }
  return events;
}

// Discrete solar-wind pressure pulses: either an absolute compression
// (P_dyn >= absoluteNPa) or a jump of at least jumpNPa within one hour.
// Records are `{time, pdyn}` samples (1-minute plasma feed).
export function detectPressurePulses(samples, { absoluteNPa = 8, jumpNPa = 4, cooldownMs = 3 * 3600 * 1000 } = {}) {
  const events = [];
  let lastEventTime = -Infinity;
  let previous = null;

  for (const sample of (samples || [])) {
    const time = toTime(sample);
    const pdyn = Number.isFinite(sample.pdyn) ? sample.pdyn : Number.parseFloat(sample.pdyn);
    if (!Number.isFinite(time) || !Number.isFinite(pdyn)) {
      previous = null;
      continue;
    }

    let triggered = false;
    if (pdyn >= absoluteNPa) triggered = true;
    if (previous && time - previous.time <= 3600 * 1000 && pdyn - previous.pdyn >= jumpNPa) triggered = true;

    if (triggered && time - lastEventTime >= cooldownMs) {
      events.push({
        date: new Date(time),
        peakPdynNPa: pdyn,
        metric: 'pdyn',
        source: 'NOAA SWPC DSCOVR/ACE plasma (derived)',
      });
      lastEventTime = time;
    }
    previous = { time, pdyn };
  }
  return events;
}

// >=10 MeV proton flux crossing the S1 threshold. One event per elevated
// period, carrying the peak flux while elevated (not the first crossing).
export function detectProtonEvents(records, { thresholdPfu = PROTON_S1_FLUX } = {}) {
  const events = [];
  let open = null;

  for (const record of (records || [])) {
    if (record.energy && record.energy !== PROTON_ENERGY_CHANNEL) continue;
    const time = toTime(record);
    const flux = Number.isFinite(record.flux) ? record.flux : Number.parseFloat(record.flux);
    if (!Number.isFinite(time) || !Number.isFinite(flux)) continue;

    if (flux >= thresholdPfu) {
      if (!open) {
        open = { start: time, peak: flux };
      } else {
        open.peak = Math.max(open.peak, flux);
      }
    } else if (open) {
      events.push({
        date: new Date(open.start),
        peakFluxPfu: open.peak,
        metric: 'protons',
        source: 'NOAA SWPC GOES integral protons',
      });
      open = null;
    }
  }
  if (open) {
    events.push({
      date: new Date(open.start),
      peakFluxPfu: open.peak,
      metric: 'protons',
      source: 'NOAA SWPC GOES integral protons',
    });
  }
  return events;
}
