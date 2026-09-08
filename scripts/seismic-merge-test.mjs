import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseFdsnEventText,
  mergeRankedSeismicProviders,
  seismicEventsMatch,
} = require('../lib/seismic-merge.cjs');

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

const sample = `#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
gfz2026rpzs|2026-09-08T16:08:35.39|29.276|84.022|10.0|||GFZ|gfz2026rpzs|mb|4.99||Xizang|earthquake
gfz2026skip|2026-09-08T16:00:00.00|10.0|20.0|5.0|||GFZ|gfz2026skip|mb|5.10||Somewhere|quarry blast
gfz2026bad|not-a-time|1|2|3|||GFZ|gfz2026bad|mb|4.50||Nowhere|earthquake
`;

const geofon = parseFdsnEventText(sample, 'GFZ GEOFON');
check('parses one earthquake row', geofon.length, 1);
check('skips quarry blast', geofon[0]?.id, 'gfz2026rpzs');
check('UTC time (not local)', geofon[0]?.properties.time, Date.parse('2026-09-08T16:08:35.390Z'));
check('mag from FDSN Magnitude column', geofon[0]?.properties.mag, 4.99);
check('keeps mb magType', geofon[0]?.properties.magType, 'mb');
check('place from EventLocationName', geofon[0]?.properties.place, 'Xizang');

const usgsTwin = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [84.05, 29.30, 12] },
  properties: {
    mag: 5.1,
    place: 'Xizang',
    time: Date.parse('2026-09-08T16:08:50.000Z'),
    source: 'USGS',
    sourceEventId: 'us7000twin',
  },
  id: 'us7000twin',
};

check(
  'matches USGS twin within ±120s / 0.5° / 0.4 mag',
  seismicEventsMatch(usgsTwin, geofon[0]),
  true,
);

const uniqueGeofon = parseFdsnEventText(
  'gfz2026only|2026-09-08T12:00:00.00|-16.1|-173.2|10.0|||GFZ|gfz2026only|Mw|5.40||Tonga Islands|earthquake\n',
  'GFZ GEOFON',
);

const merged = mergeRankedSeismicProviders([
  { source: 'GFZ GEOFON', features: [...geofon, ...uniqueGeofon] },
  { source: 'USGS', features: [usgsTwin] },
  { source: 'EMSC SeismicPortal', features: [] },
]);

check('merge keeps USGS over GEOFON twin', merged.length, 2);
check('preferred source is USGS', merged.find(f => f.id === 'us7000twin')?.properties.source, 'USGS');
check('GEOFON-only event remains', merged.some(f => f.id === 'gfz2026only'), true);
check('does not inflate twin into two events', merged.filter(f => seismicEventsMatch(f, usgsTwin)).length, 1);

console.log(failures === 0 ? '\nAll seismic-merge checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
