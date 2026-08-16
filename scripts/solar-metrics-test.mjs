// Deterministic unit checks for public/src/js/solarMetrics.mjs.
import {
  dynamicPressure,
  electricFieldEy,
  classifyPressure,
  classifyEy,
  classifyDst,
  classifyProtons,
  detectDstStorms,
  detectPressurePulses,
  detectProtonEvents,
} from '../public/src/js/solarMetrics.mjs';

let failures = 0;
function check(name, actual, expected) {
  const pass = Number.isFinite(expected)
    ? Math.abs(actual - expected) < 1e-6 || (Number.isFinite(actual) === false && Number.isFinite(expected) === false)
    : actual === expected;
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${String(expected)}, got ${String(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

// --- dynamicPressure: P_dyn = 1.6726e-6 * n * v^2 nPa (textbook values) ---
check('Pdyn typical slow wind (n=5, v=350) ~1.02 nPa', dynamicPressure(5, 350), 1.0244809);
check('Pdyn CME-driven (n=20, v=700) ~16.4 nPa', dynamicPressure(20, 700), 16.3916946);
check('Pdyn invalid density -> null', dynamicPressure(-1, 400) === null, true);
check('Pdyn missing speed -> null', dynamicPressure(5, NaN) === null, true);

// --- electricFieldEy: southward Bz drives positive Ey ---
check('Ey southward Bz (v=400, bz=-10) = 4 mV/m', electricFieldEy(400, -10), 4);
check('Ey northward Bz (v=400, bz=10) = -4 mV/m', electricFieldEy(400, 10), -4);
check('Ey invalid -> null', electricFieldEy(400, undefined) === null, true);

// --- classifications against published bands ---
check('Pdyn band 12 nPa -> strong', classifyPressure(12).band, 'strong');
check('Pdyn band 6 nPa -> elevated', classifyPressure(6).band, 'elevated');
check('Pdyn band 2 nPa -> quiet', classifyPressure(2).band, 'quiet');
check('Dst -120 -> intense', classifyDst(-120).band, 'intense');
check('Dst -60 -> moderate', classifyDst(-60).band, 'moderate');
check('Dst -30 -> unsettled', classifyDst(-30).band, 'unsettled');
check('Dst -5 -> quiet', classifyDst(-5).band, 'quiet');
check('Ey 4.5 -> strong', classifyEy(4.5).band, 'strong');
check('Protons 15 pfu -> S1', classifyProtons(15).scale, 1);
check('Protons 200 pfu -> S2', classifyProtons(200).scale, 2);
check('Protons 5000 pfu -> S3', classifyProtons(5000).scale, 3);
check('Protons 0.2 pfu -> quiet', classifyProtons(0.2).band, 'quiet');

// --- Dst storm detection: two dips merged by a brief recovery ---
const H = 3600 * 1000;
const dstRecords = [
  { time: 0, dst: -10 },
  { time: 1 * H, dst: -55 },
  { time: 2 * H, dst: -80 },
  { time: 3 * H, dst: -52 },
  { time: 4 * H, dst: -30 },
  { time: 5 * H, dst: -10 },
  { time: 6 * H, dst: -75 },
  { time: 7 * H, dst: -40 },
  { time: 8 * H, dst: -5 },
];
const dstEvents = detectDstStorms(dstRecords);
check('Dst events detected: 2', dstEvents.length, 2);
check('First Dst event starts at -55 crossing', dstEvents[0]?.date.getTime(), 1 * H);
check('First Dst event min is -80', dstEvents[0]?.minDst, -80);
check('Second Dst event min is -75', dstEvents[1]?.minDst, -75);

// Ongoing storm at end of window still closes as an event.
const ongoing = detectDstStorms([{ time: 0, dst: -5 }, { time: H, dst: -60 }]);
check('Ongoing Dst storm still reported', ongoing.length, 1);

// --- Pressure pulse detection: absolute threshold and 1h jump ---
const pulseSamples = [
  { time: 0, pdyn: 1.0 },
  { time: 30 * 60 * 1000, pdyn: 1.5 },
  { time: 60 * 60 * 1000, pdyn: 9.5 },  // absolute >= 8 AND jump >= 4 within 1h
  { time: 90 * 60 * 1000, pdyn: 9.0 },
  { time: 120 * 60 * 1000, pdyn: 2.0 },
  { time: 150 * 60 * 1000, pdyn: 2.3 }, // +0.3 only -> no event
  { time: 180 * 60 * 1000, pdyn: 2.4 },
];
const pulses = detectPressurePulses(pulseSamples);
check('Pressure pulses detected: 1', pulses.length, 1);
check('Pulse peak ~9.5 nPa', pulses[0]?.peakPdynNPa, 9.5);

// Cooldown suppresses rapid re-triggers.
const rapid = detectPressurePulses([
  { time: 0, pdyn: 9 },
  { time: 10 * 60 * 1000, pdyn: 11 },
  { time: 20 * 60 * 1000, pdyn: 12 },
]);
check('Cooldown suppresses re-triggers', rapid.length, 1);

// --- Proton events: S1 crossing with cooldown ---
const protonRecords = [
  { time_tag: '2026-01-01T00:00:00Z', energy: '>=10 MeV', flux: 0.5 },
  { time_tag: '2026-01-01T00:05:00Z', energy: '>=10 MeV', flux: 12 },
  { time_tag: '2026-01-01T00:10:00Z', energy: '>=10 MeV', flux: 20 },
  { time_tag: '2026-01-01T00:15:00Z', energy: '>=100 MeV', flux: 30 }, // wrong channel, ignored
  { time_tag: '2026-01-01T00:20:00Z', energy: '>=10 MeV', flux: 3 },   // dip closes event 1
  { time_tag: '2026-01-02T00:00:00Z', energy: '>=10 MeV', flux: 15 },  // new elevated period: event 2
];
const protonEvents = detectProtonEvents(protonRecords);
check('Proton events detected: 2', protonEvents.length, 2);
check('Wrong energy channel ignored', protonEvents[0]?.peakFluxPfu, 20);

console.log(failures === 0 ? '\nAll solar-metrics checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
