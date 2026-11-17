/**
 * Erzeugt app/public/karten/plz2.json: die 2-stelligen PLZ-Bereiche Deutschlands als GeoJSON.
 *
 * Quellen:
 *  - PLZ-Mittelpunkte: WZBSocialScienceCenter/plz_geocoord (Apache-2.0)
 *  - Landesgrenze: Natural Earth über das npm-Paket world-atlas (gemeinfrei)
 *
 * Verfahren: Voronoi-Zellen um alle PLZ-Mittelpunkte, je Leitbereich (erste zwei Ziffern)
 * vereinigt und an der Landesgrenze abgeschnitten. Die Grenzen sind damit eine Näherung –
 * für die Übersicht der Regionen reicht das. Jedes Gebiet enthält die Liste seiner PLZ,
 * damit die App ausrechnen kann, wie viel davon einer Region zugeordnet ist.
 *
 * Aufruf: node plz-gebiete.mjs <plz_geocoord.csv> <ausgabe.json>
 * Abhängigkeiten: world-atlas topojson-client d3-delaunay polygon-clipping @turf/simplify @turf/helpers
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { Delaunay } from 'd3-delaunay';
import pc from 'polygon-clipping';
import simplify from '@turf/simplify';

const require = createRequire(import.meta.url);
const [csv, ziel] = process.argv.slice(2);

const welt = require('world-atlas/countries-10m.json');
const de = feature(welt, welt.objects.countries).features.find((f) => f.id === '276');
const grenze = de.geometry.type === 'Polygon' ? [de.geometry.coordinates] : de.geometry.coordinates;

const punkte = fs.readFileSync(csv, 'utf8').trim().split('\n').slice(1).map((z) => {
  const [plz, lat, lng] = z.split(',');
  return { plz, lat: +lat, lon: +lng };
}).filter((p) => /^\d{5}$/.test(p.plz) && p.lat > 47 && p.lat < 55.2 && p.lon > 5.5 && p.lon < 15.2);

const rahmen = [5.5, 47.0, 15.5, 55.2];
const vor = Delaunay.from(punkte, (p) => p.lon, (p) => p.lat).voronoi(rahmen);

const gruppen = new Map();
punkte.forEach((p, i) => {
  const b = p.plz.slice(0, 2);
  if (!gruppen.has(b)) gruppen.set(b, { zellen: [], plz: [], lat: 0, lon: 0 });
  const g = gruppen.get(b);
  const zelle = vor.cellPolygon(i);
  if (zelle) g.zellen.push([zelle]);
  g.plz.push(p.plz);
  g.lat += p.lat; g.lon += p.lon;
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const features = [...gruppen.entries()].sort().map(([b, g]) => {
  if (!g.zellen.length) return null;
  const flaeche = pc.intersection(pc.union(...g.zellen), grenze);
  let f = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: flaeche } };
  f = simplify(f, { tolerance: 0.006, highQuality: true });
  f.geometry.coordinates = f.geometry.coordinates
    .map((poly) => poly.map((ring) => ring.map(([x, y]) => [r3(x), r3(y)])))
    .filter((poly) => poly[0].length >= 4);
  f.properties = { bereich: b, plz: g.plz.sort(), lat: r3(g.lat / g.plz.length), lon: r3(g.lon / g.plz.length) };
  return f;
}).filter(Boolean);

fs.writeFileSync(ziel, JSON.stringify({
  type: 'FeatureCollection',
  hinweis: 'Näherung aus PLZ-Mittelpunkten (WZBSocialScienceCenter/plz_geocoord, Apache-2.0) und Natural Earth (gemeinfrei)',
  features,
}));
console.log(features.length, 'Bereiche,', punkte.length, 'PLZ,', (fs.statSync(ziel).size / 1024).toFixed(0), 'KB');
