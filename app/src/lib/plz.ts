import type { Region } from './model';

/** Güte einer PLZ-Angabe für eine PLZ – gleiche Regel wie regionFuerPlz_ im Backend (-1 = passt nicht) */
export function guete(angabe: string, plz: string): number {
  if (angabe === plz) return 10;
  if (/^\d{5}-\d{5}$/.test(angabe)) {
    const [von, bis] = angabe.split('-');
    return plz >= von && plz <= bis ? 6 : -1;
  }
  if (/\*$/.test(angabe) && plz.startsWith(angabe.slice(0, -1))) return angabe.length - 1;
  return -1;
}

const angaben = (r: Region) => String(r.plz ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export interface Zuordnung {
  /** Region, die die PLZ bekommt ('' = nicht vergeben) */
  region: string;
  /** weitere Regionen mit gleich genauer Angabe – echte Überschneidung */
  konflikt: string[];
}

/** Ordnet alle PLZ den aktiven Regionen zu (genaueste Angabe gewinnt, wie im Backend) */
export function zuordnen(plzListe: string[], regionen: Region[]): Map<string, Zuordnung> {
  const aktiv = regionen.filter((r) => r.aktiv !== false).map((r) => ({ id: r.id, angaben: angaben(r) }));
  const ergebnis = new Map<string, Zuordnung>();
  for (const plz of plzListe) {
    let beste = -1;
    let region = '';
    let gleich: string[] = [];
    for (const r of aktiv) {
      let g = -1;
      for (const a of r.angaben) g = Math.max(g, guete(a, plz));
      if (g < 0) continue;
      if (g > beste) { beste = g; region = r.id; gleich = []; }
      else if (g === beste && r.id !== region) gleich.push(r.id);
    }
    ergebnis.set(plz, { region, konflikt: gleich });
  }
  return ergebnis;
}

/** Gut unterscheidbare Farben für die Regionen */
export const REGION_FARBEN = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#ea580c', '#4f46e5', '#0d9488', '#be123c', '#a16207', '#9333ea', '#0284c7', '#15803d',
];
