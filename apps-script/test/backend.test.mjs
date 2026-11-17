// Ablauftest des Apps-Script-Backends mit nachgebildeten Google-Diensten.
// Start (vom Repo-Hauptordner): node apps-script/test/backend.test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { backendLaden, gasDienste, neueTabelle, sha256 } from '../../app/src/lib/gasMock.js';
import crypto from 'node:crypto';

// SHA-256 der Nachbildung gegen Node prüfen
for (const t of ['', 'abc', 'äöü – SOS Hund', 'x'.repeat(200)]) {
  assert.equal(Buffer.from(sha256(t)).toString('hex'), crypto.createHash('sha256').update(t).digest('hex'), 'sha256: ' + t.slice(0, 10));
}

const code = fs.readFileSync(new URL('../Code.gs', import.meta.url), 'utf8');
const tabelle = neueTabelle();
const props = { SHEET_ID: 'x', ERSTER_ADMIN: 'Ada;Admin;654321', FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'p', client_email: 'a@b', private_key: 'k' }) };
const mails = [];
const pushes = [];
const dienste = gasDienste({ tabelle, props, mails, pushes, geocoder: (t) => (t.includes('85737') ? { lat: 48.22, lon: 11.68 } : null) });
dienste.Utilities.computeRsaSha256Signature = () => [1, 2, 3];
const { aufruf, intern } = backendLaden(code, dienste);

const ok = (r) => { assert.ok(r.ok, r.fehler); return r.daten; };
const nein = (r, text) => { assert.equal(r.ok, false, text); return r; };
const pushText = () => pushes.filter((p) => p.url.includes('fcm')).map((p) => JSON.parse(p.o.payload).message);
const pushAn = (token) => pushText().filter((m) => m.token === token);

// ---------------------------------------------------------------- Setup & Admin
intern.setup();
assert.equal(tabelle.blaetter.Mitglieder.rows.length, 2, 'erster Admin angelegt');
const admin = ok(aufruf('login', { name: 'Ada Admin', pin: '654321' }));
assert.equal(admin.rolle, 'admin');
nein(aufruf('login', { name: 'Ada Admin', pin: '000000' }), 'falscher PIN');

// ---------------------------------------------------------------- Regionen
const muc = ok(aufruf('region_speichern', { name: 'LK München', plz: '85737, 857*, 80331-80339' }, admin.token)).id;
const ebe = ok(aufruf('region_speichern', { name: 'LK Ebersberg', plz: '855*', nachbarn: [muc] }, admin.token)).id;
ok(aufruf('region_speichern', { id: muc, name: 'LK München', plz: '85737, 857*, 80331-80339', nachbarn: [ebe] }, admin.token));
nein(aufruf('region_speichern', { name: 'Kaputt', plz: '12a' }, admin.token), 'ungültige PLZ');
assert.equal(intern.regionFuerPlz_('85737'), muc);
assert.equal(intern.regionFuerPlz_('85748'), muc);
assert.equal(intern.regionFuerPlz_('80335'), muc);
assert.equal(intern.regionFuerPlz_('85560'), ebe);
assert.equal(intern.regionFuerPlz_('10115'), '');
assert.equal(ok(aufruf('regionen', {})).length, 2, 'öffentliche Regionenliste');

// ---------------------------------------------------------------- Einladungen & Registrierung
const einl = ok(aufruf('einladung_erstellen', { rolle: 'regionalleiter', regionen: [muc], notiz: 'Rita' }, admin.token));
assert.match(einl.code, /^[A-Z2-9]{8}$/);
nein(aufruf('einladung_pruefen', { code: 'FALSCH12' }), 'unbekannter Code');
const pr = ok(aufruf('einladung_pruefen', { code: einl.code.toLowerCase() }));
assert.equal(pr.rolle, 'regionalleiter');
nein(aufruf('registrieren', { code: einl.code, vorname: 'Rita', nachname: 'Leiter', telefon: '0170 1', datenschutz: false }), 'Datenschutz fehlt');
ok(aufruf('registrieren', { code: einl.code, vorname: 'Rita', nachname: 'Leiter', telefon: '0170 1111', datenschutz: true }));
nein(aufruf('registrieren', { code: einl.code, vorname: 'X', nachname: 'Y', telefon: '1', datenschutz: true }), 'Code nur einmal');
let reg = ok(aufruf('registrierungen_liste', {}, admin.token));
assert.equal(reg.length, 1);
const ritaFrei = ok(aufruf('registrierung_freigeben', { id: reg[0].id }, admin.token));
assert.match(ritaFrei.pin, /^\d{6}$/);
assert.equal(ritaFrei.telefon, '0170 1111');
const rita = ok(aufruf('login', { name: 'Rita Leiter', pin: ritaFrei.pin }));
assert.equal(rita.rolle, 'regionalleiter');
assert.deepEqual(rita.regionen, [muc]);

// Regionalleiterin lädt Mitglieder und eine Behörde ein – nur für eigene Regionen
nein(aufruf('einladung_erstellen', { rolle: 'mitglied', regionen: [ebe] }, rita.token), 'fremde Region');
nein(aufruf('einladung_erstellen', { rolle: 'admin', regionen: [muc] }, rita.token), 'keine Admins einladen');
const neu = (rolle, regionen, vorname, nachname, extra = {}) => {
  const c = ok(aufruf('einladung_erstellen', { rolle, regionen }, rolle === 'mitglied' && regionen[0] === ebe ? admin.token : rita.token)).code;
  ok(aufruf('registrieren', { code: c, vorname, nachname, telefon: '0171 ' + vorname, datenschutz: true, ...extra }));
  const r = ok(aufruf('registrierungen_liste', {}, admin.token)).find((x) => x.vorname === vorname);
  const f = ok(aufruf('registrierung_freigeben', { id: r.id }, rolle === 'mitglied' && regionen[0] === ebe ? admin.token : rita.token));
  return ok(aufruf('login', { name: vorname + ' ' + nachname, pin: f.pin }));
};
const max = neu('mitglied', [muc], 'Max', 'Muster');
const mia = neu('mitglied', [muc], 'Mia', 'Helfer');
const eva = neu('mitglied', [ebe], 'Eva', 'Ebers');
nein(aufruf('registrieren', { code: ok(aufruf('einladung_erstellen', { rolle: 'behoerde', regionen: [muc] }, rita.token)).code, vorname: 'Vera', nachname: 'Amt', telefon: '1', datenschutz: true }), 'Behörde braucht Organisation');
const vet = neu('behoerde', [muc], 'Vera', 'Veterinär', { organisation: 'Veterinäramt LK München' });
assert.equal(vet.organisation, 'Veterinäramt LK München');

// Rita sieht nur Zugänge ihrer Region
const ritasListe = ok(aufruf('mitglieder_liste', {}, rita.token)).map((m) => m.vorname).sort();
assert.deepEqual(ritasListe, ['Max', 'Mia', 'Rita', 'Vera']);
nein(aufruf('pin_zuruecksetzen', { id: eva.mitgliedId }, rita.token), 'fremde Region');

// Push-Abos (Geräte)
for (const [s, t] of [[admin, 'T-admin'], [rita, 'T-rita'], [max, 'T-max'], [mia, 'T-mia'], [eva, 'T-eva'], [vet, 'T-vet']]) {
  ok(aufruf('push_abo', { fcmToken: t, einstellungen: { sos: true, uebernahme: true, status: true, verwaltung: true, mitteilungen: true } }, s.token));
}

// ---------------------------------------------------------------- Anfrage einer Behörde
const anfrage = {
  dringlichkeit: 'dringend',
  beschreibung: 'Hund nach Beißvorfall sichern',
  vorfall: 'Halter ins Krankenhaus, Hund bewacht die Wohnung.',
  hund: { rasse: 'Malinois', groesse: 'groß', farbe: 'falb', alter: '4 Jahre', geschlecht: 'Rüde' },
  adresse: { halter: 'Herr Beispiel', strasse: 'Musterweg 1', plz: '85737', ort: 'Ismaning' },
  auftraggeber: { name: 'Vera Veterinär', telefon: '089 123', email: 'vet@example.org' },
};
nein(aufruf('anfrage_anlegen', { ...anfrage, adresse: { ...anfrage.adresse, plz: '857' } }, vet.token), 'PLZ prüfen');
pushes.length = 0;
const a1 = ok(aufruf('anfrage_anlegen', anfrage, vet.token));
assert.match(a1.nummer, /^SOS-\d{4}-0001$/);
assert.equal(a1.region, muc);
assert.equal(a1.benachrichtigt, 3, 'Helfer der Region: Rita, Max, Mia (Admins ohne Region und Behörden nicht)');
assert.equal(pushAn('T-max').length, 1, 'Max bekommt Push');
assert.equal(pushAn('T-eva').length, 0, 'Eva (andere Region) nicht');
assert.ok(!JSON.stringify(pushAn('T-max')).includes('Musterweg'), 'keine Adresse im Push');

// Sichtbarkeit
assert.equal(ok(aufruf('anfragen_liste', {}, max.token)).length, 1);
assert.equal(ok(aufruf('anfragen_liste', {}, eva.token)).length, 0, 'andere Region sieht nichts');
nein(aufruf('anfrage_detail', { id: a1.id }, eva.token), 'Detail für fremde Region gesperrt');
nein(aufruf('anfrage_detail', { id: a1.id }), 'nicht öffentlich');
const det = ok(aufruf('anfrage_detail', { id: a1.id }, max.token));
assert.equal(det.details.adresse.strasse, 'Musterweg 1');
assert.equal(det.details.adresse.lat, 48.22, 'geokodiert');
assert.equal(det.details.auftraggeber.organisation, 'Veterinäramt LK München', 'Behörde automatisch eingetragen');
assert.equal(det.rechte.uebernehmen, true);

// ---------------------------------------------------------------- Übernehmen
nein(aufruf('anfrage_uebernehmen', { id: a1.id }, vet.token), 'Behörde übernimmt nicht');
pushes.length = 0;
const u = ok(aufruf('anfrage_uebernehmen', { id: a1.id }, max.token));
assert.equal(u.status, 'uebernommen');
assert.equal(u.uebernommenName, 'Max Muster');
const zweiter = nein(aufruf('anfrage_uebernehmen', { id: a1.id }, mia.token), 'nicht doppelt übernehmen');
assert.match(zweiter.fehler, /Max Muster/);
assert.equal(zweiter.status, 409);
assert.ok(pushAn('T-vet').some((m) => m.data.titel.startsWith('Übernommen')), 'Behörde erfährt Übernahme');
assert.equal(mails.length, 1, 'Mail an Auftraggeber');
assert.match(mails[0].subject, /übernommen/);

// Helfer
const h = ok(aufruf('anfrage_helfen', { id: a1.id }, mia.token));
assert.deepEqual(h.helfer.map((x) => x.name), ['Mia Helfer']);
assert.equal(h.team.length, 2);
ok(aufruf('anfrage_helfen', { id: a1.id }, mia.token)); // doppelt ändert nichts
assert.equal(ok(aufruf('anfrage_detail', { id: a1.id }, max.token)).helfer.length, 1);

// Status
nein(aufruf('anfrage_status', { id: a1.id, status: 'gesichert' }, eva.token), 'fremde Region');
nein(aufruf('anfrage_status', { id: a1.id, status: 'offen' }, max.token), 'ungültiger Status');
ok(aufruf('anfrage_status', { id: a1.id, status: 'vor_ort', notiz: 'Bin da' }, max.token));
ok(aufruf('anfrage_status', { id: a1.id, notiz: 'Hund ruhig, Futter hilft' }, mia.token));
nein(aufruf('anfrage_status', { id: a1.id, status: 'gesichert' }, vet.token), 'Behörde kann nur zurückziehen');
const fertig = ok(aufruf('anfrage_status', { id: a1.id, status: 'abgeschlossen', notiz: 'Im Tierheim' }, max.token));
assert.equal(fertig.status, 'abgeschlossen');
assert.ok(fertig.verlauf.length >= 6);
nein(aufruf('anfrage_status', { id: a1.id, status: 'abgebrochen' }, max.token), 'beendet bleibt beendet');
assert.equal(ok(aufruf('anfragen_liste', {}, max.token)).length, 0, 'aktiv-Liste leer');
assert.equal(ok(aufruf('anfragen_liste', { filter: 'erledigt' }, max.token)).length, 1);

// ---------------------------------------------------------------- Öffentliche Meldung
nein(aufruf('melden', { ...anfrage, datenschutz: false }), 'Datenschutz');
assert.deepEqual(ok(aufruf('melden', { ...anfrage, website: 'spam' })), { ok: true }, 'Honigtopf');
pushes.length = 0;
const m = ok(aufruf('melden', { ...anfrage, dringlichkeit: 'akut', beschreibung: 'Streunender Hund am Spielplatz', adresse: { strasse: '', plz: '85748', ort: 'Garching' }, auftraggeber: { name: 'Petra Passant', telefon: '0151 2' }, datenschutz: true }));
assert.match(m.nummer, /0002$/);
assert.equal(pushAn('T-max').length, 0, 'ungeprüft: noch kein Push an Helfer');
assert.equal(pushAn('T-rita').length, 1, 'Regionalleitung wird informiert');
assert.equal(pushAn('T-admin').length, 1, 'Admins auch');
const liste = ok(aufruf('anfragen_liste', {}, rita.token));
const meldung = liste.find((x) => x.status === 'ungeprueft');
assert.ok(meldung);
assert.equal(ok(aufruf('anfragen_liste', {}, max.token)).length, 0, 'Mitglieder sehen Ungeprüftes nicht');
nein(aufruf('anfrage_pruefen', { id: meldung.id, freigeben: true }, max.token), 'nur Leitung');
pushes.length = 0;
const gepr = ok(aufruf('anfrage_pruefen', { id: meldung.id, freigeben: true }, rita.token));
assert.equal(gepr.status, 'offen');
assert.equal(pushAn('T-max').length, 1, 'nach Freigabe Push an Helfer');
assert.match(pushAn('T-max')[0].data.titel, /AKUT/);
nein(aufruf('anfrage_pruefen', { id: meldung.id, freigeben: true }, rita.token), 'nicht doppelt prüfen');

// ---------------------------------------------------------------- Eskalation
pushes.length = 0;
assert.equal(intern.eskalieren_(), 0, 'noch zu früh');
intern.aktualisiereZeile_('Anfragen', 'id', meldung.id, (r) => { r.erstellt = new Date(Date.now() - 11 * 60000).toISOString(); return r; });
assert.equal(intern.eskalieren_(), 1, 'akut nach 10 Min.');
assert.equal(pushAn('T-eva').length, 1, 'Nachbarregion benachrichtigt');
assert.equal(intern.eskalieren_(), 0, 'nur einmal eskalieren');
const evaSieht = ok(aufruf('anfragen_liste', {}, eva.token));
assert.equal(evaSieht.length, 1, 'Nachbarregion sieht eskalierte Anfrage');
assert.equal(evaSieht[0].eskaliertBeiMir, true);
ok(aufruf('anfrage_uebernehmen', { id: meldung.id }, eva.token));
ok(aufruf('anfrage_zurueckgeben', { id: meldung.id, notiz: 'Auto kaputt' }, eva.token));
const wieder = ok(aufruf('anfrage_detail', { id: meldung.id }, rita.token));
assert.equal(wieder.status, 'offen');
assert.equal(wieder.eskaliert, false, 'Eskalation beginnt neu');

// ---------------------------------------------------------------- Meldung verwerfen
const m2 = ok(aufruf('melden', { ...anfrage, beschreibung: 'Test', auftraggeber: { name: 'X', telefon: '1' }, datenschutz: true }));
const m2id = ok(aufruf('anfragen_liste', {}, rita.token)).find((x) => x.nummer === m2.nummer).id;
assert.equal(ok(aufruf('anfrage_pruefen', { id: m2id, freigeben: false, notiz: 'Doppelt' }, rita.token)).status, 'verworfen');

// ---------------------------------------------------------------- Ohne Region
const ohne = ok(aufruf('anfrage_anlegen', { ...anfrage, adresse: { plz: '10115', ort: 'Berlin' } }, max.token));
assert.equal(ohne.region, '');
assert.equal(ok(aufruf('anfragen_liste', {}, rita.token)).some((x) => x.id === ohne.id), false, 'ohne Region nur für Admins');
assert.equal(ok(aufruf('anfragen_liste', {}, max.token)).some((x) => x.id === ohne.id), false);
assert.equal(ok(aufruf('anfragen_liste', {}, admin.token)).some((x) => x.id === ohne.id), true);
const zugeordnet = ok(aufruf('anfrage_bearbeiten', { ...anfrage, id: ohne.id, adresse: { plz: '10115', ort: 'Berlin' }, region: muc }, admin.token));
assert.equal(zugeordnet.region, muc);

// ---------------------------------------------------------------- Startseite, Export, Profil
const st = ok(aufruf('start', {}, rita.token));
assert.equal(st.offen, 2);
assert.equal(st.akut, 1);
assert.equal(ok(aufruf('start', {})).offen, undefined, 'öffentlich keine Zahlen');
assert.equal(ok(aufruf('einstellungen', {})).eskalationMin, undefined, 'interne Einstellungen nicht öffentlich');
const exp = ok(aufruf('export', {}, vet.token));
assert.ok(exp.length >= 3);
nein(aufruf('export', {}, max.token), 'Mitglieder exportieren nicht');
ok(aufruf('profil_speichern', { verfuegbar: false, telefon: '0170 9', profil: { fahrzeug: true, box: true } }, mia.token));
pushes.length = 0;
const ohneMia = ok(aufruf('anfrage_anlegen', anfrage, vet.token));
assert.equal(pushAn('T-mia').length, 0, 'nicht verfügbar: kein Push');
assert.ok(ohneMia.benachrichtigt >= 2);
ok(aufruf('profil_speichern', { regionen: [muc, ebe] }, max.token));
assert.deepEqual(ok(aufruf('ich', {}, max.token)).regionen, [muc, ebe], 'Mitglied wählt Regionen selbst');
ok(aufruf('profil_speichern', { regionen: [] }, rita.token));
assert.deepEqual(ok(aufruf('ich', {}, rita.token)).regionen, [muc], 'Regionalleiter ändert Regionen nicht selbst');

// Mitteilung
pushes.length = 0;
const mit = ok(aufruf('mitteilung_senden', { titel: 'Treffen', text: 'Samstag 10 Uhr' }, rita.token));
assert.ok(mit.gesendet >= 3);
assert.equal(pushAn('T-eva').length, 0, 'Rita schreibt nur an ihre Region');

// ---------------------------------------------------------------- Deaktivieren
ok(aufruf('mitglied_aendern', { id: mia.mitgliedId, aktiv: false }, rita.token));
nein(aufruf('ich', {}, mia.token), 'deaktiviert');
nein(aufruf('mitglied_aendern', { id: admin.mitgliedId, aktiv: false }, rita.token), 'Admins nicht durch Regionalleiter');

// ---------------------------------------------------------------- Anonymisierung
intern.aktualisiereZeile_('Anfragen', 'id', a1.id, (r) => { r.abgeschlossenAm = new Date(Date.now() - 400 * 86400000).toISOString(); return r; });
assert.equal(intern.anonymisieren_(), 1);
const anon = ok(aufruf('anfrage_detail', { id: a1.id }, admin.token));
assert.equal(anon.anonymisiert, true);
assert.equal(anon.details.adresse.strasse, undefined);
assert.equal(anon.details.auftraggeber.name, undefined);
assert.equal(anon.details.adresse.plz, '85737', 'PLZ bleibt für Statistik');
assert.ok(anon.verlauf.every((v) => !v.notiz), 'Notizen gelöscht');
assert.equal(intern.anonymisieren_(), 0, 'nur einmal');

// Protokoll
assert.ok(ok(aufruf('protokoll', {}, admin.token)).some((p) => p.aktion === 'angesehen'));
nein(aufruf('protokoll', {}, rita.token), 'Protokoll nur Admins');

console.log('Backend-Ablauftest: alles ok');
