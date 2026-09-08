import {
  pointInPolygon,
  isTongaNamed,
  summarizeVolcanoSeismicity,
} from '../public/src/js/volcanoAnalytics.mjs';

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

const square = {
  type: 'Polygon',
  coordinates: [[[-176, -24], [-172, -24], [-172, -18], [-176, -18], [-176, -24]]],
};
check('point inside Tonga-like box', pointInPolygon(-174, -20, square), true);
check('point outside box', pointInPolygon(-160, -20, square), false);
check('Hunga name', isTongaNamed({ properties: { name: 'Hunga Tonga-Hunga Haapai' } }), true);

const summary = summarizeVolcanoSeismicity({
  tongaGeometry: square,
  volcanoes: [
    {
      geometry: { coordinates: [-175.4, -20.5] },
      properties: { name: 'Hunga Tonga-Hunga Haapai', class: 'active', vnum: '243040', lastEruptionYear: 2022 },
    },
    {
      geometry: { coordinates: [-152.25, 61.93] },
      properties: { name: 'Great Sitkin', class: 'unrest', vnum: '311120' },
    },
  ],
  earthquakes: [
    { mag: 5.4, lat: -20.6, lon: -175.3, place: 'Tonga Islands' },
    { mag: 4.8, lat: -20.4, lon: -175.5, place: 'Tonga' },
    { mag: 6.1, lat: 38, lon: 142, place: 'Japan' },
  ],
});

check('Tonga plate quakes', summary.tonga.quakeCount, 2);
check('Tonga quakes near volcano', summary.tonga.quakesNearVolcano, 2);
check('Hunga captured', summary.tonga.hungaName, 'Hunga Tonga-Hunga Haapai');
check('global near-volcano quakes exclude Japan', summary.quakesNearVolcano, 2);
check('unrest count', summary.unrestCount, 1);

console.log(failures === 0 ? '\nAll volcano-analytics checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
