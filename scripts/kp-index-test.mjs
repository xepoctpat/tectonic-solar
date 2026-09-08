import {
  parseNoaaKpHistory,
  parseGfzKpPayload,
  parseNoaaKp1mLatest,
  pickCurrentKp,
  pickKpHistory,
} from '../public/src/js/kpIndex.mjs';

let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) {
    failures += 1;
    console.error(`FAIL ${name}: expected ${String(expected)}, got ${String(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const oldTable = [
  ['time_tag', 'Kp'],
  ['2026-09-08T00:00:00', '2.00'],
  ['2026-09-08T03:00:00', '3.33'],
];
const fromTable = parseNoaaKpHistory(oldTable);
check('legacy table skips header', fromTable.length, 2);
check('legacy table Kp', fromTable[1].kp, 3.33);

const newObjects = [
  { time_tag: '2026-09-08T00:00:00', Kp: 1.0, a_running: 4, station_count: 8 },
  { time_tag: '2026-09-08T03:00:00', Kp: 2.67, a_running: 12, station_count: 8 },
];
const fromObjects = parseNoaaKpHistory(newObjects);
check('SCN object rows parse', fromObjects.length, 2);
check('SCN object Kp', fromObjects[1].kp, 2.67);

const gfzRaw = {
  meta: { license: 'CC BY 4.0', source: 'GFZ Potsdam' },
  datetime: ['2026-09-08T15:00:00Z', '2026-09-08T18:00:00Z'],
  Kp: [4.0, 2.667],
  status: ['pre', 'pre'],
};
const gfzPoints = parseGfzKpPayload(gfzRaw);
check('GFZ raw points', gfzPoints.length, 2);
check('GFZ last Kp', gfzPoints[1].kp, 2.667);

const gfzNorm = parseGfzKpPayload({ points: [{ time: 't', kp: 5, status: 'def' }] });
check('GFZ normalized points', gfzNorm[0].kp, 5);

check('NOAA 1-min latest', parseNoaaKp1mLatest([{ time_tag: 't', kp_index: 4, estimated_kp: 3.67 }]).value, 4);
check(
  'NOAA 1-min skips trailing new-bin zeros',
  parseNoaaKp1mLatest([
    { time_tag: 'a', kp_index: 4, estimated_kp: 3.67 },
    { time_tag: 'b', kp_index: 0, estimated_kp: 0 },
  ]).value,
  4,
);

const noaaWins = pickCurrentKp({
  noaa1m: [{ time_tag: 'n', kp_index: 3 }],
  noaaHistory: fromObjects,
  gfzPoints,
});
check('current prefers NOAA 1-min', noaaWins.source, 'NOAA 1-min');

const gfzWins = pickCurrentKp({
  noaa1m: [],
  noaaHistory: fromObjects,
  gfzPoints,
});
check('current falls back to GFZ before NOAA 3-day', gfzWins.source, 'GFZ Potsdam');
check('current GFZ value', gfzWins.value, 2.667);

const histNoaa = pickKpHistory(fromObjects, gfzPoints);
check('history prefers NOAA when present', histNoaa.source, 'NOAA');
const histGfz = pickKpHistory([], gfzPoints);
check('history uses GFZ when NOAA 3-day empty', histGfz.source, 'GFZ Potsdam');
check('empty both', pickKpHistory([], []).source, null);

console.log(failures === 0 ? '\nAll kp-index checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
