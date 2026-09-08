import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyVolcano,
  mergeVolcanoCatalog,
  markNearQuakes,
  kmBetween,
} = require('../lib/volcanoes.cjs');

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

check('unrest from USGS ORANGE', classifyVolcano(1200, { color_code: 'ORANGE' }).class, 'unrest');
check('active since 1800', classifyVolcano(1960, null).class, 'active');
check('dormant Holocene', classifyVolcano(-8300, null).class, 'dormant');
check('year 0 is unknown', classifyVolcano(0, null).class, 'unknown');
check('missing year is unknown', classifyVolcano(null, null).class, 'unknown');
check('GREEN is not unrest', classifyVolcano(2000, { color_code: 'GREEN' }).class, 'active');

const catalog = mergeVolcanoCatalog({
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-152.25, 61.93] },
      properties: {
        Volcano_Number: 311120,
        Volcano_Name: 'Great Sitkin',
        Primary_Volcano_Type: 'Stratovolcano',
        Last_Eruption_Year: 2026,
        Country: 'United States',
        Geological_Summary: 'DROP THIS LONG TEXT',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [6.85, 50.17] },
      properties: {
        Volcano_Number: 210010,
        Volcano_Name: 'West Eifel Volcanic Field',
        Last_Eruption_Year: -8300,
        Country: 'Germany',
      },
    },
  ],
}, [
  { vnum: '311120', color_code: 'ORANGE', alert_level: 'WATCH', notice_url: 'https://example.test/sitkin' },
]);

check('merged count', catalog.features.length, 2);
check('Sitkin unrest', catalog.features.find(f => f.id === '311120').properties.class, 'unrest');
check('strips summary', catalog.features[0].properties.Geological_Summary, undefined);
check('Eifel dormant', catalog.features.find(f => f.id === '210010').properties.class, 'dormant');
check('counts unrest', catalog.metadata.counts.unrest, 1);
check('counts dormant', catalog.metadata.counts.dormant, 1);

const km = kmBetween(61.93, -152.25, 61.93, -152.25);
check('zero distance', km === 0, true);

const marked = markNearQuakes(catalog.features, [{ lat: 61.93, lon: -152.25, mag: 5 }]);
check('Sitkin near quake', marked.find(f => f.id === '311120').properties.nearQuake, true);
check('Eifel not near', marked.find(f => f.id === '210010').properties.nearQuake, false);

console.log(failures === 0 ? '\nAll volcanoes checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
