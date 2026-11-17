/**
 * DEMO-MODUS
 * ==========
 * Solange in config.ts keine apiUrl steht, läuft das ECHTE Backend (apps-script/Code.gs)
 * hier im Browser – mit nachgebildeten Google-Diensten (gasMock.js). Die Tabelle liegt im
 * localStorage dieses Geräts. So verhält sich die Demo genau wie die echte App.
 *
 * Demo-Zugänge (Name / PIN):
 *   Demo Admin       123456   Admin
 *   Rita Regional    222222   Regionalleiterin LK München
 *   Max Muster       111111   Mitglied LK München
 *   Mia Helfer       333333   Mitglied LK München + LK Freising
 *   Vera Veterinär   444444   Veterinäramt LK München
 */
import code from '../../../apps-script/Code.gs?raw';
import { backendLaden, gasDienste, neueTabelle } from './gasMock.js';

const KEY = 'sos.demo.v4';
const KEY_DATEIEN = 'sos.demo.dateien';

export const DEMO_ZUGAENGE = [
  { name: 'Demo Admin', pin: '123456', rolle: 'Admin' },
  { name: 'Rita Regional', pin: '222222', rolle: 'Regionalleiterin' },
  { name: 'Max Muster', pin: '111111', rolle: 'Mitglied' },
  { name: 'Vera Veterinär', pin: '444444', rolle: 'Behörde' },
];

/** Ungefähre Koordinaten für die Demo-Karte */
const ORTE: Record<string, [number, number]> = {
  '85737': [48.2262, 11.6745], '85748': [48.2497, 11.6513], '85716': [48.2807, 11.5772], '85774': [48.1876, 11.7107],
  '85540': [48.1381, 11.7266], '80331': [48.1374, 11.5755], '81675': [48.1351, 11.6014], '85354': [48.4029, 11.7488],
  '85356': [48.3874, 11.7621], '85560': [48.0777, 11.9706], '85567': [48.0436, 11.9442],
};

function geocoder(text: string) {
  const plz = /\b(\d{5})\b/.exec(text)?.[1];
  const p = plz && ORTE[plz];
  if (!p) return null;
  // kleine Abweichung je Straße, damit Marker nicht übereinanderliegen
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return { lat: p[0] + (h - 500) / 60000, lon: p[1] + ((h * 7) % 1000 - 500) / 40000 };
}

type Zustand = Record<string, unknown[][]>;
let backend: ReturnType<typeof backendLaden> | null = null;
let zustand: Zustand = {};
let dateien: Record<string, { name: string; mime: string; data: string; ordner: string; papierkorb?: boolean }> = {};

function speichern() {
  try {
    localStorage.setItem(KEY, JSON.stringify(zustand));
  } catch {
    /* Speicher voll – Demo läuft trotzdem weiter */
  }
  try {
    localStorage.setItem(KEY_DATEIEN, JSON.stringify(dateien));
  } catch {
    /* Fotos zu groß für den Gerätespeicher – sie bleiben bis zum Neuladen erhalten */
  }
}

function laden() {
  try { localStorage.removeItem('sos.demo.v1'); localStorage.removeItem('sos.demo.v2'); localStorage.removeItem('sos.demo.v3'); } catch { /* alte Demo-Daten */ }
  let gespeichert: Zustand | null = null;
  try {
    gespeichert = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    gespeichert = null;
  }
  zustand = gespeichert ?? {};
  try {
    dateien = (gespeichert && JSON.parse(localStorage.getItem(KEY_DATEIEN) || '{}')) || {};
  } catch {
    dateien = {};
  }
  const tabelle = neueTabelle(zustand);
  const props: Record<string, string> = { SHEET_ID: 'demo', ERSTER_ADMIN: 'Demo;Admin;123456' };
  backend = backendLaden(code, gasDienste({ tabelle, props, geocoder, dateien }));
  if (!gespeichert) beispieldaten();
  speichern();
}

function ok<T>(r: { ok: boolean; daten?: unknown; fehler?: string }): T {
  if (!r.ok) throw new Error('Demo-Daten: ' + r.fehler);
  return r.daten as T;
}

function vorMinuten(id: string, min: number, feld = 'erstellt') {
  backend!.intern.aktualisiereZeile_('Anfragen', 'id', id, (r: Record<string, unknown>) => {
    r[feld] = new Date(Date.now() - min * 60000).toISOString();
    return r;
  });
}

/** Beispieldaten: 23 Regionen, 20 weitere Regionalleiter, fünf Zugänge, einige Anfragen in verschiedenen Zuständen */
function beispieldaten() {
  const { aufruf, intern } = backend!;
  intern.setup();
  const admin = ok<{ token: string }>(aufruf('login', { name: 'Demo Admin', pin: '123456' }));
  const t = admin.token;
  const muc = ok<{ id: string }>(aufruf('region_speichern', { name: 'LK München', plz: '857*, 85540, 80331-81929' }, t)).id;
  const fs = ok<{ id: string }>(aufruf('region_speichern', { name: 'LK Freising', plz: '853*, 854*' }, t)).id;
  const ebe = ok<{ id: string }>(aufruf('region_speichern', { name: 'LK Ebersberg', plz: '855*, 856*' }, t)).id;
  ok(aufruf('region_speichern', { id: muc, name: 'LK München', plz: '857*, 85540, 80331-81929', nachbarn: [fs, ebe] }, t));
  ok(aufruf('region_speichern', { id: fs, name: 'LK Freising', plz: '853*, 854*', nachbarn: [muc] }, t));
  ok(aufruf('region_speichern', { id: ebe, name: 'LK Ebersberg', plz: '855*, 856*', nachbarn: [muc] }, t));
  const adminId = ok<{ id: string }>(aufruf('ich', {}, t)).id;
  ok(aufruf('mitglied_aendern', { id: adminId, regionen: [muc] }, t));
  intern.aktualisiereZeile_('Mitglieder', 'id', adminId, (r: Record<string, unknown>) => {
    r.telefon = "'0170 9999999"; r.email = 'admin@example.org'; return r;
  });

  const neu = (vorname: string, nachname: string, rolle: string, regionen: string[], pin: string, extra: Record<string, string> = {}) =>
    intern.mitgliedSchreiben_({ vorname, nachname, rolle, regionen: regionen.join(','), telefon: extra.telefon ?? '0170 0000000', email: extra.email ?? '', organisation: extra.organisation ?? '' }, pin);
  neu('Rita', 'Regional', 'regionalleiter', [muc], '222222', { telefon: '0170 2222222' });
  neu('Max', 'Muster', 'mitglied', [muc], '111111', { telefon: '0171 1111111' });
  neu('Mia', 'Helfer', 'mitglied', [muc, fs], '333333', { telefon: '0172 3333333' });
  neu('Erik', 'Ebersberger', 'mitglied', [ebe], '555555', { telefon: '0173 5555555' });
  neu('Vera', 'Veterinär', 'behoerde', [muc], '444444', { organisation: 'Veterinäramt LK München', telefon: '089 6221-0', email: 'veterinaeramt@example.org' });

  // 20 Regionalleiter in ganz Deutschland, je mit eigener Region (für die Deutschlandkarte)
  const DEMO_REGIONEN: [string, string, string, string][] = [
    ['Hamburg', '20*, 21*, 22*', 'Hanna', 'Hansen'],
    ['Schleswig-Holstein', '23*, 24*, 25*', 'Kai', 'Kröger'],
    ['Vorpommern', '17*, 18*', 'Ole', 'Ostermann'],
    ['Berlin', '10*, 12*, 13*, 14*', 'Bettina', 'Brandt'],
    ['Bremen', '26*, 27*, 28*', 'Jan', 'Janssen'],
    ['Hannover', '30*, 31*', 'Nina', 'Niemeyer'],
    ['Magdeburg', '38*, 39*', 'Maik', 'Möller'],
    ['Dresden', '01*, 02*', 'Doreen', 'Dietrich'],
    ['Leipzig', '04*, 06*', 'Lars', 'Lehmann'],
    ['Münsterland', '48*', 'Greta', 'Hölscher'],
    ['Ruhrgebiet', '44*, 45*', 'Dennis', 'Kowalski'],
    ['Köln', '50*, 51*', 'Sabine', 'Krämer'],
    ['Kassel', '34*', 'Tobias', 'Kessler'],
    ['Erfurt', '99*', 'Ines', 'Engel'],
    ['Frankfurt', '60*, 61*, 63*', 'Felix', 'Fischer'],
    ['Saarland', '66*', 'Sophie', 'Schmitt'],
    ['Stuttgart', '70*, 71*', 'Stefan', 'Schwab'],
    ['Freiburg', '79*', 'Franziska', 'Faller'],
    ['Nürnberg', '90*, 91*', 'Norbert', 'Neubauer'],
    ['Regensburg', '93*', 'Rosa', 'Reindl'],
  ];
  DEMO_REGIONEN.forEach(([region, plz, vorname, nachname], i) => {
    const id = ok<{ id: string }>(aufruf('region_speichern', { name: region, plz }, t)).id;
    neu(vorname, nachname, 'regionalleiter', [id], String(700000 + i), { telefon: `0151 ${String(4000000 + i * 1111)}` });
  });

  const login = (name: string, pin: string) => ok<{ token: string }>(aufruf('login', { name, pin })).token;
  const vera = login('Vera Veterinär', '444444');
  const max = login('Max Muster', '111111');
  const mia = login('Mia Helfer', '333333');
  const rita = login('Rita Regional', '222222');

  const basis = (plz: string, ort: string, strasse: string) => ({ halter: '', strasse, plz, ort, hinweis: '' });
  // 1) Behörde: dringend, offen
  const a1 = ok<{ id: string }>(aufruf('anfrage_anlegen', {
    dringlichkeit: 'dringend',
    beschreibung: 'Hund nach Beißvorfall in Wohnung, Halter im Krankenhaus',
    vorfall: 'Die Halterin wurde am Vormittag ins Krankenhaus gebracht. Der Rüde verteidigt die Wohnung und lässt niemanden hinein. Nachbarn versorgen ihn bisher durch den Türspalt mit Wasser.',
    hund: { rasse: 'Malinois', groesse: 'groß', farbe: 'falb, schwarze Maske', alter: 'ca. 4 Jahre', geschlecht: 'Rüde, unkastriert', merkmale: 'rotes Halsband', name: 'Rocky', anzahl: 1 },
    adresse: { ...basis('85737', 'Ismaning', 'Schlossstraße 12'), halter: 'Frau B.', hinweis: '2. OG links, Schlüssel bei Nachbar Müller (EG)' },
    auftraggeber: { name: 'Vera Veterinär', organisation: '', telefon: '089 6221-0', email: 'veterinaeramt@example.org', erreichbar: 'Mo–Fr 8–16 Uhr' },
  }, vera)).id;
  vorMinuten(a1, 12);
  // 2) Öffentliche Meldung: akut, ungeprüft
  ok(aufruf('melden', {
    dringlichkeit: 'akut', datenschutz: true,
    beschreibung: 'Großer Hund ohne Halter läuft auf der Staatsstraße',
    vorfall: 'Seit etwa 20 Minuten, Autos müssen bremsen. Der Hund lässt sich nicht anfassen.',
    hund: { rasse: 'Schäferhund-Mix', groesse: 'groß', farbe: 'schwarz-braun', alter: '', geschlecht: '', merkmale: 'kein Halsband', name: '', anzahl: 1 },
    adresse: basis('85748', 'Garching', 'Höhe Ortsausgang Richtung Ismaning'),
    auftraggeber: { name: 'Peter Passant', organisation: '', telefon: '0151 2345678', email: '', erreichbar: 'jederzeit' },
  }));
  // 3) Mitglied: übernommen mit Helferin, vor Ort
  const a3 = ok<{ id: string }>(aufruf('anfrage_anlegen', {
    dringlichkeit: 'normal',
    beschreibung: 'Ängstliche Hündin aus Tierschutz entlaufen',
    vorfall: 'Seit zwei Tagen unterwegs, wird abends am Feldrand gesichtet. Lebendfalle wird benötigt.',
    hund: { rasse: 'Podenco', groesse: 'mittel', farbe: 'rot-weiß', alter: '2 Jahre', geschlecht: 'Hündin', merkmale: 'Sicherheitsgeschirr', name: 'Luna', anzahl: 1 },
    adresse: basis('85716', 'Unterschleißheim', 'Feldweg am Lohhofer See'),
    auftraggeber: { name: 'Tierschutzverein Nord', organisation: 'Tierschutzverein', telefon: '089 3333333', email: '', erreichbar: '' },
  }, rita)).id;
  ok(aufruf('anfrage_uebernehmen', { id: a3, notiz: 'Falle ist im Auto' }, max));
  ok(aufruf('anfrage_helfen', { id: a3 }, mia));
  ok(aufruf('anfrage_status', { id: a3, status: 'vor_ort', notiz: 'Falle aufgestellt, Futterstelle eingerichtet' }, max));
  vorMinuten(a3, 300);
  // 4) Abgeschlossen
  const a4 = ok<{ id: string }>(aufruf('anfrage_anlegen', {
    dringlichkeit: 'dringend',
    beschreibung: 'Zwei Hunde in verwahrloster Wohnung',
    vorfall: 'Sicherstellung durch das Veterinäramt angeordnet.',
    hund: { rasse: 'Labrador', groesse: 'groß', farbe: 'schwarz', alter: '8 und 10 Jahre', geschlecht: '', merkmale: '', name: '', anzahl: 2 },
    adresse: basis('85774', 'Unterföhring', 'Bahnhofstraße 5'),
    auftraggeber: { name: 'Vera Veterinär', organisation: '', telefon: '089 6221-0', email: '', erreichbar: '' },
  }, vera)).id;
  ok(aufruf('anfrage_uebernehmen', { id: a4 }, mia));
  ok(aufruf('anfrage_status', { id: a4, status: 'gesichert', notiz: 'Beide Hunde ruhig gesichert' }, mia));
  ok(aufruf('anfrage_status', { id: a4, status: 'abgeschlossen', notiz: 'Im Tierheim Riem abgegeben' }, mia));

  // Nachrichten zwischen Regionalleitern und Admin
  ok(aufruf('nachricht_an_admins', { titel: 'Transportbox gesucht', text: 'Unsere große Box ist kaputt. Kann das Netzwerk eine neue anschaffen?' }, rita));
  const adminT = login('Demo Admin', '123456');
  ok(aufruf('nachrichten_verlauf', { leiterId: ok<{ id: string }>(aufruf('ich', {}, rita)).id }, adminT));
  ok(aufruf('nachricht_antworten', { leiterId: ok<{ id: string }>(aufruf('ich', {}, rita)).id, text: 'Ja, bitte schick mir zwei Angebote, dann entscheiden wir.' }, adminT));
  const hanna = login('Hanna Hansen', '700000');
  ok(aufruf('nachricht_an_admins', { titel: 'Zweite Regionalleitung für Hamburg?', text: 'Die Region wächst, ich würde gern Kai als Vertretung vorschlagen.' }, hanna));

  // Offene Registrierung zum Ausprobieren
  const code = ok<{ code: string }>(aufruf('einladung_erstellen', { rolle: 'mitglied', regionen: [muc], notiz: 'Hundetrainerin Sandra' }, rita)).code;
  ok(aufruf('registrieren', { code, vorname: 'Sandra', nachname: 'Neu', telefon: '0176 1234567', email: 'sandra@example.org', datenschutz: true, nachricht: 'Hundetrainerin, habe eine Transportbox.' }));
  ok(aufruf('einladung_erstellen', { rolle: 'mitglied', regionen: [muc], notiz: 'zum Ausprobieren' }, rita));
}

export async function demoAufruf<T>(aktion: string, daten: Record<string, unknown>, token?: string) {
  if (!backend) laden();
  await new Promise((r) => setTimeout(r, 120)); // wie im Netz: kurz warten
  try {
    backend!.intern.alleFuenfMinuten(); // Eskalation wie der Zeit-Trigger
  } catch {
    /* ignorieren */
  }
  const r = backend!.aufruf(aktion, daten, token) as { ok: boolean; daten?: T; fehler?: string; status?: number };
  speichern();
  return r;
}

export function demoZuruecksetzen() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY_DATEIEN);
  backend = null;
}
