/**
 * SOS Hund – Backend (Google Apps Script)
 * ======================================
 * Läuft als Web-App im Google-Konto des Netzwerks und übernimmt:
 *   - Anmeldung mit persönlichen PINs (nur als Hash gespeichert)
 *   - Einladungen, Registrierungen und Freigaben
 *   - Regionen mit PLZ-Zuordnung
 *   - SOS-Anfragen: anlegen, öffentliche Meldungen prüfen, übernehmen, Helfer, Status, Verlauf
 *   - Push-Nachrichten über Firebase Cloud Messaging, Eskalation an Nachbarregionen
 *   - Datenschutz: Sichtbarkeit je Rolle/Region, Zugriffsprotokoll, automatische Anonymisierung
 *
 * Aufbau und Hilfsfunktionen stammen aus der MGI-Vereins-App (joachimrodler-afk/MGI-App).
 * Einrichtung: siehe README.md. Alle Geheimnisse stehen in den Script Properties, NICHT hier.
 *
 * Script Properties:
 *   SHEET_ID              ID der Google-Tabelle (Datenbank)
 *   ERSTER_ADMIN          "Vorname;Nachname;PIN" – wird bei setup() angelegt, danach löschen!
 *   FCM_SERVICE_ACCOUNT   JSON des Firebase-Service-Accounts (optional, für Push)
 *   APP_URL               Adresse der App (für Links in Push-Nachrichten und E-Mails)
 *   SUPER_ADMIN           Mitglieds-ID des Super-Admins (kann von anderen Admins nicht geändert werden)
 *   FOTO_ORDNER_ID        wird beim ersten Foto automatisch angelegt (Drive-Ordner „SOS Hund – Fotos“)
 */

var TZ = 'Europe/Berlin';
var SITZUNG_UNBEGRENZT = 0;
var MAX_FEHLVERSUCHE = 5;
var SPERRE_MIN = 10;
var HASH_RUNDEN = 300;

var ROLLEN = ['mitglied', 'regionalleiter', 'admin', 'behoerde'];
var ROLLEN_NAME = { mitglied: 'Mitglied', regionalleiter: 'Regionalleiter', admin: 'Admin', behoerde: 'Behörde' };
var STATUS = ['ungeprueft', 'offen', 'uebernommen', 'vor_ort', 'gesichert', 'abgeschlossen', 'abgebrochen', 'verworfen'];
var STATUS_NAME = {
  ungeprueft: 'ungeprüft', offen: 'offen', uebernommen: 'übernommen', vor_ort: 'vor Ort', gesichert: 'gesichert',
  abgeschlossen: 'abgeschlossen', abgebrochen: 'abgebrochen', verworfen: 'verworfen',
};
var STATUS_ENDE = ['abgeschlossen', 'abgebrochen', 'verworfen'];
var DRINGLICHKEIT = ['normal', 'dringend', 'akut'];

var BLAETTER = {
  Mitglieder: ['id', 'vorname', 'nachname', 'rolle', 'regionen', 'telefon', 'email', 'organisation', 'salt', 'hash', 'aktiv',
    'verfuegbar', 'profil', 'erstellt', 'letzteAnmeldung'],
  Sitzungen: ['token', 'mitgliedId', 'ablauf'],
  Einstellungen: ['schluessel', 'wert'],
  Regionen: ['id', 'name', 'plz', 'nachbarn', 'aktiv'],
  Einladungen: ['code', 'rolle', 'regionen', 'notiz', 'erstelltVon', 'erstellt', 'ablauf', 'genutzt'],
  Registrierungen: ['id', 'code', 'vorname', 'nachname', 'telefon', 'email', 'organisation', 'rolle', 'regionen', 'nachricht',
    'erstellt', 'status', 'bearbeitet'],
  Anfragen: ['id', 'nummer', 'region', 'status', 'dringlichkeit', 'quelle', 'erstellt', 'erstelltVon', 'uebernommenVon',
    'uebernommenName', 'uebernommenAm', 'helfer', 'eskaliertAn', 'eskaliertAm', 'geaendert', 'abgeschlossenAm', 'anonymisiert', 'json'],
  Verlauf: ['id', 'anfrageId', 'zeit', 'mitgliedId', 'name', 'aktion', 'status', 'notiz'],
  Protokoll: ['zeit', 'mitgliedId', 'name', 'aktion', 'anfrageId'],
  PushAbos: ['fcmToken', 'mitgliedId', 'einstellungen', 'erstellt'],
};

// =====================================================================
// Einstiegspunkte
// =====================================================================

function doGet() {
  return json_({ ok: true, daten: 'SOS-Hund-API läuft' });
}

/**
 * Alle Anfragen kommen als POST mit Content-Type text/plain (kein CORS-Preflight).
 * Body: { aktion: "...", token: "...", daten: {...} }
 */
function doPost(e) {
  var anfrage;
  try {
    anfrage = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, fehler: 'Ungültige Anfrage' });
  }
  try {
    var aktion = AKTIONEN[anfrage.aktion];
    if (!aktion) throw fehler_('Unbekannte Aktion: ' + anfrage.aktion);
    var sitzung = anfrage.token ? sitzungPruefen_(anfrage.token) : null;
    if (aktion.recht !== 'offen' && !sitzung) throw fehler_('Bitte anmelden', 401);
    if (aktion.recht === 'helfer' && !istHelfer_(sitzung)) throw fehler_('Nur für Mitglieder des Netzwerks', 403);
    if (aktion.recht === 'leitung' && !istLeitung_(sitzung)) throw fehler_('Nur für Regionalleiter und Admins', 403);
    if (aktion.recht === 'admin' && sitzung.rolle !== 'admin') throw fehler_('Nur für Admins', 403);
    var daten = aktion.fn(anfrage.daten || {}, sitzung);
    return json_({ ok: true, daten: daten });
  } catch (err) {
    if (!err.status) console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, fehler: err.status ? err.message : 'Interner Fehler: ' + err.message, status: err.status || 500 });
  }
}

/**
 * Rechte: offen = ohne Anmeldung · angemeldet = jede Rolle · helfer = Mitglied, Regionalleiter, Admin
 *         leitung = Regionalleiter, Admin · admin = nur Admin
 */
var AKTIONEN = {
  // Anmeldung & Konto
  login: { recht: 'offen', fn: login_ },
  logout: { recht: 'angemeldet', fn: logout_ },
  ich: { recht: 'angemeldet', fn: ich_ },
  pin_aendern: { recht: 'angemeldet', fn: pinAendern_ },
  profil_speichern: { recht: 'angemeldet', fn: profilSpeichern_ },
  // Öffentlich
  start: { recht: 'offen', fn: start_ },
  einstellungen: { recht: 'offen', fn: function (d, s) { return einstellungenFuer_(s); } },
  regionen: { recht: 'offen', fn: regionenOeffentlich_ },
  melden: { recht: 'offen', fn: melden_ },
  einladung_pruefen: { recht: 'offen', fn: einladungPruefen_ },
  registrieren: { recht: 'offen', fn: registrieren_ },
  // Anfragen
  anfragen_liste: { recht: 'angemeldet', fn: anfragenListe_ },
  anfrage_detail: { recht: 'angemeldet', fn: anfrageDetail_ },
  anfrage_fotos: { recht: 'angemeldet', fn: anfrageFotos_ },
  anfrage_anlegen: { recht: 'angemeldet', fn: anfrageAnlegen_ },
  anfrage_bearbeiten: { recht: 'angemeldet', fn: anfrageBearbeiten_ },
  anfrage_uebernehmen: { recht: 'helfer', fn: anfrageUebernehmen_ },
  anfrage_zurueckgeben: { recht: 'helfer', fn: anfrageZurueckgeben_ },
  anfrage_helfen: { recht: 'helfer', fn: anfrageHelfen_ },
  anfrage_status: { recht: 'angemeldet', fn: anfrageStatus_ },
  anfrage_pruefen: { recht: 'leitung', fn: anfragePruefen_ },
  export: { recht: 'angemeldet', fn: export_ },
  // Verwaltung
  einladungen_liste: { recht: 'leitung', fn: einladungenListe_ },
  einladung_erstellen: { recht: 'leitung', fn: einladungErstellen_ },
  einladung_loeschen: { recht: 'leitung', fn: einladungLoeschen_ },
  registrierungen_liste: { recht: 'leitung', fn: registrierungenListe_ },
  registrierung_freigeben: { recht: 'leitung', fn: registrierungFreigeben_ },
  registrierung_ablehnen: { recht: 'leitung', fn: registrierungAblehnen_ },
  mitglieder_liste: { recht: 'leitung', fn: mitgliederListe_ },
  mitglied_anlegen: { recht: 'admin', fn: mitgliedAnlegen_ },
  mitglied_aendern: { recht: 'leitung', fn: mitgliedAendern_ },
  mitglied_loeschen: { recht: 'admin', fn: mitgliedLoeschen_ },
  pin_zuruecksetzen: { recht: 'leitung', fn: pinZuruecksetzen_ },
  regionen_verwaltung: { recht: 'leitung', fn: regionenVerwaltung_ },
  region_speichern: { recht: 'admin', fn: regionSpeichern_ },
  einstellungen_speichern: { recht: 'admin', fn: einstellungenSpeichern_ },
  mitteilung_senden: { recht: 'leitung', fn: mitteilungSenden_ },
  protokoll: { recht: 'admin', fn: protokollListe_ },
  // Push
  push_abo: { recht: 'angemeldet', fn: pushAbo_ },
  push_abo_loeschen: { recht: 'offen', fn: pushAboLoeschen_ },
  push_test: { recht: 'angemeldet', fn: pushTest_ },
};

// =====================================================================
// Setup & Trigger
// =====================================================================

/** Einmalig im Editor ausführen: legt Tabellenblätter, ersten Admin und Trigger an. */
function setup() {
  var ss = SpreadsheetApp.openById(prop_('SHEET_ID', true));
  Object.keys(BLAETTER).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(BLAETTER[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, BLAETTER[name].length).setFontWeight('bold');
    }
  });
  var erster = prop_('ERSTER_ADMIN');
  if (erster) {
    var t = erster.split(';');
    if (t.length !== 3 || !/^\d{4,8}$/.test(t[2])) throw new Error('ERSTER_ADMIN muss "Vorname;Nachname;PIN" sein (PIN 4–8 Ziffern)');
    var vorhanden = zeilen_('Mitglieder').some(function (m) { return m.rolle === 'admin'; });
    if (!vorhanden) {
      mitgliedSchreiben_({ vorname: t[0].trim(), nachname: t[1].trim(), rolle: 'admin', regionen: '' }, t[2]);
      console.log('Erster Admin angelegt. Bitte ERSTER_ADMIN jetzt aus den Script Properties löschen!');
    }
  }
  ScriptApp.getProjectTriggers().forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('taeglich').timeBased().atHour(3).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('alleFuenfMinuten').timeBased().everyMinutes(5).create();
  console.log('Setup fertig.');
}

/** Täglich 3 Uhr: Anonymisieren und Aufräumen */
function taeglich() {
  try { anonymisieren_(); } catch (e) { console.error(e); }
  aufraeumen_();
}

/** Einmal im Editor ausführen: erteilt die Drive-Freigabe und legt den Foto-Ordner an */
function fotoOrdnerEinrichten() {
  console.log('Foto-Ordner „SOS Hund – Fotos“: ' + fotoOrdner_());
}

/** Alle 5 Minuten: nicht übernommene Anfragen an Nachbarregionen eskalieren */
function alleFuenfMinuten() {
  try { eskalieren_(); } catch (e) { console.error(e); }
}

function aufraeumen_() {
  var ids = {};
  zeilen_('Mitglieder').forEach(function (m) { if (String(m.aktiv) === 'true') ids[m.id] = true; });
  loescheZeilen_('Sitzungen', function (r) { return !ids[r.mitgliedId]; });
  var jetzt = Date.now();
  // abgelaufene, nicht genutzte Einladungen nach 30 Tagen entfernen
  loescheZeilen_('Einladungen', function (r) { return !r.genutzt && r.ablauf && new Date(r.ablauf).getTime() < jetzt - 30 * 86400000; });
}

// =====================================================================
// Rollen & Rechte
// =====================================================================

function istHelfer_(s) { return !!s && (s.rolle === 'mitglied' || s.rolle === 'regionalleiter' || s.rolle === 'admin'); }
function istLeitung_(s) { return !!s && (s.rolle === 'regionalleiter' || s.rolle === 'admin'); }
function liste_(csv) { return String(csv || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function schnitt_(a, b) { return a.some(function (x) { return b.indexOf(x) >= 0; }); }

/** Leitet die Region: Admin überall, Regionalleiter in seinen Regionen */
function leitetRegion_(s, region) {
  if (!s) return false;
  if (s.rolle === 'admin') return true;
  return s.rolle === 'regionalleiter' && !!region && s.regionen.indexOf(region) >= 0;
}

/** Darf die Sitzung diese Anfrage sehen? (Zeile aus dem Blatt Anfragen) */
function darfSehen_(a, s) {
  if (!s) return false;
  if (s.rolle === 'admin') return true;
  var regionen = [a.region].concat(liste_(a.eskaliertAn));
  var inRegion = !!a.region && s.regionen.indexOf(a.region) >= 0;
  if (s.rolle === 'behoerde') return a.erstelltVon === s.mitgliedId || (inRegion && a.status !== 'ungeprueft' && a.status !== 'verworfen');
  if (s.rolle === 'regionalleiter' && inRegion) return true;
  if (a.status === 'ungeprueft' || a.status === 'verworfen') return false;
  return schnitt_(regionen.filter(Boolean), s.regionen);
}

/** Darf die Sitzung Status und Notizen der Anfrage ändern? */
function darfBearbeiten_(a, s) {
  if (leitetRegion_(s, a.region)) return true;
  if (a.uebernommenVon === s.mitgliedId) return true;
  if (helferListe_(a).some(function (h) { return h.id === s.mitgliedId; })) return true;
  return s.rolle === 'behoerde' && a.erstelltVon === s.mitgliedId;
}

// =====================================================================
// Anmeldung & Sitzungen
// =====================================================================

function login_(d) {
  var name = String(d.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  var pin = String(d.pin || '').trim();
  if (!name || !pin) throw fehler_('Name und PIN eingeben', 400);
  var mitglieder = zeilen_('Mitglieder').filter(function (m) { return String(m.aktiv) === 'true'; });
  var treffer = mitglieder.filter(function (m) {
    var voll = (m.vorname + ' ' + m.nachname).toLowerCase();
    return voll === name || (m.nachname + ' ' + m.vorname).toLowerCase() === name;
  });
  if (!treffer.length) {
    treffer = mitglieder.filter(function (m) { return String(m.nachname).toLowerCase() === name; });
    if (treffer.length > 1) throw fehler_('Name nicht eindeutig – bitte Vor- und Nachname eingeben', 400);
  }
  globaleBremse_();
  if (!treffer.length) throw fehler_('Name oder PIN falsch', 401);
  var m = treffer[0];
  var cache = CacheService.getScriptCache();
  var key = 'fehl_' + m.id;
  var fehl = Number(cache.get(key) || 0);
  if (fehl >= MAX_FEHLVERSUCHE) throw fehler_('Zu viele Fehlversuche – bitte in ' + SPERRE_MIN + ' Minuten erneut versuchen', 429);
  if (pinHash_(pin, m.salt) !== m.hash) {
    cache.put(key, String(fehl + 1), SPERRE_MIN * 60);
    throw fehler_('Name oder PIN falsch', 401);
  }
  cache.remove(key);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  zeileAnhaengen_('Sitzungen', [token, m.id, SITZUNG_UNBEGRENZT]);
  try {
    aktualisiereZeile_('Mitglieder', 'id', m.id, function (r) { r.letzteAnmeldung = txt_(jetzt_()); return r; });
  } catch (e) { console.error(e); }
  return sitzungObjekt_(token, m, SITZUNG_UNBEGRENZT);
}

function globaleBremse_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('logins') || 0);
  if (n > 60) throw fehler_('Zu viele Anmeldeversuche – bitte später erneut versuchen', 429);
  cache.put('logins', String(n + 1), 600);
}

function sitzungObjekt_(token, m, ablauf) {
  return {
    token: token, mitgliedId: m.id, name: m.vorname + ' ' + m.nachname, rolle: m.rolle,
    regionen: liste_(m.regionen), organisation: m.organisation || '', ablauf: Number(ablauf),
  };
}

function sitzungPruefen_(token) {
  var cache = CacheService.getScriptCache();
  var c = cache.get('s_' + token);
  if (c) return JSON.parse(c);
  var s = zeilen_('Sitzungen').filter(function (r) { return r.token === token; })[0];
  if (!s) throw fehler_('Abgemeldet – bitte neu anmelden', 401);
  var m = mitgliedNachId_(s.mitgliedId);
  if (!m || String(m.aktiv) !== 'true') throw fehler_('Zugang deaktiviert', 401);
  var obj = sitzungObjekt_(token, m, s.ablauf);
  cache.put('s_' + token, JSON.stringify(obj), 600);
  return obj;
}

function sitzungenEntfernen_(mitgliedId) {
  var cache = CacheService.getScriptCache();
  loescheZeilen_('Sitzungen', function (r) {
    if (r.mitgliedId === mitgliedId) { cache.remove('s_' + r.token); return true; }
    return false;
  });
}

/** Sitzungen behalten, aber zwischengespeicherte Rechte/Regionen neu laden */
function sitzungCacheLeeren_(mitgliedId) {
  var cache = CacheService.getScriptCache();
  zeilen_('Sitzungen').forEach(function (r) { if (r.mitgliedId === mitgliedId) cache.remove('s_' + r.token); });
}

function logout_(d, s) {
  CacheService.getScriptCache().remove('s_' + s.token);
  loescheZeilen_('Sitzungen', function (r) { return r.token === s.token; });
  return true;
}

function ich_(d, s) {
  var m = mitgliedNachId_(s.mitgliedId);
  var o = mitgliedOeffentlich_(m);
  o.token = s.token;
  o.name = s.name;
  o.ablauf = s.ablauf;
  return o;
}

function pinHash_(pin, salt) {
  var h = salt + ':' + pin;
  for (var i = 0; i < HASH_RUNDEN; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + ':' + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function neuerPin_() {
  var pin = '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  for (var i = 0; i < 6; i++) pin += String(((bytes[i] % 256) + 256) % 10);
  if (/^(\d)\1+$/.test(pin) || pin === '123456') return neuerPin_();
  return pin;
}

function pinAendern_(d, s) {
  var m = mitgliedNachId_(s.mitgliedId);
  if (pinHash_(String(d.alt || ''), m.salt) !== m.hash) throw fehler_('Bisheriger PIN ist falsch', 400);
  var neu = String(d.neu || '');
  if (!/^\d{6,8}$/.test(neu)) throw fehler_('Der neue PIN muss 6–8 Ziffern haben', 400);
  setzePin_(m.id, neu);
  return true;
}

/** Eigenes Profil: Kontakt, Verfügbarkeit, Ausstattung; Mitglieder dürfen ihre Regionen selbst wählen */
function profilSpeichern_(d, s) {
  var regionenGueltig = regionenAlle_().map(function (r) { return r.id; });
  mitSperre_(function () {
    aktualisiereZeile_('Mitglieder', 'id', s.mitgliedId, function (r) {
      if (d.telefon !== undefined) r.telefon = txt_(String(d.telefon).slice(0, 40));
      if (d.email !== undefined) r.email = String(d.email).slice(0, 80);
      if (d.verfuegbar !== undefined) r.verfuegbar = d.verfuegbar ? 'true' : 'false';
      if (d.profil !== undefined) {
        var p = d.profil || {};
        r.profil = JSON.stringify({
          qualifikation: String(p.qualifikation || '').slice(0, 300),
          fahrzeug: !!p.fahrzeug, box: !!p.box, fanggeraet: !!p.fanggeraet,
        });
      }
      if (d.regionen !== undefined && s.rolle === 'mitglied') {
        r.regionen = (d.regionen || []).filter(function (x) { return regionenGueltig.indexOf(x) >= 0; }).join(',');
      }
      return r;
    });
  });
  sitzungCacheLeeren_(s.mitgliedId);
  return ich_(d, sitzungObjekt_(s.token, mitgliedNachId_(s.mitgliedId), s.ablauf));
}

// =====================================================================
// Mitglieder (Mitglieder, Regionalleiter, Admins und Behörden-Zugänge)
// =====================================================================

function mitgliedNachId_(id) {
  return zeilen_('Mitglieder').filter(function (m) { return m.id === id; })[0];
}

function profil_(m) {
  try { return JSON.parse(m.profil || '{}'); } catch (e) { return {}; }
}

function mitgliedOeffentlich_(m, mitSitzung) {
  var su = superAdmin_();
  var o = {
    id: m.id, vorname: m.vorname, nachname: m.nachname, rolle: m.rolle, regionen: liste_(m.regionen),
    telefon: zelle_(m.telefon), email: m.email || '', organisation: m.organisation || '',
    aktiv: String(m.aktiv) === 'true', verfuegbar: String(m.verfuegbar) !== 'false', profil: profil_(m),
    superAdmin: !!su && m.id === su, letzteAnmeldung: zelle_(m.letzteAnmeldung),
  };
  if (mitSitzung) o.angemeldet = !!o.letzteAnmeldung || !!mitSitzung[m.id];
  return o;
}

function superAdmin_() { return String(prop_('SUPER_ADMIN') || '').trim(); }

function superSchutz_(zielId, s) {
  var su = superAdmin_();
  if (su && zielId === su && (!s || s.mitgliedId !== su)) throw fehler_('Der Super-Admin kann nur von sich selbst geändert werden', 403);
}

/** Regionalleiter sehen nur Mitglieder und Behörden ihrer Regionen */
function darfMitgliedVerwalten_(m, s) {
  if (s.rolle === 'admin') return true;
  if (m.rolle === 'admin' || m.rolle === 'regionalleiter') return false;
  return schnitt_(liste_(m.regionen), s.regionen);
}

function mitgliederListe_(d, s) {
  var sitzung = {};
  zeilen_('Sitzungen').forEach(function (r) { sitzung[r.mitgliedId] = true; });
  return zeilen_('Mitglieder')
    .filter(function (m) { return s.rolle === 'admin' || darfMitgliedVerwalten_(m, s) || m.id === s.mitgliedId; })
    .map(function (m) { return mitgliedOeffentlich_(m, sitzung); })
    .sort(function (a, b) { return (a.nachname + a.vorname).localeCompare(b.nachname + b.vorname, 'de'); });
}

function mitgliedSchreiben_(m, pin) {
  var salt = Utilities.getUuid();
  var id = 'm' + Utilities.getUuid().slice(0, 8);
  zeileAnhaengen_('Mitglieder', [id, m.vorname, m.nachname, m.rolle, m.regionen || '', txt_(m.telefon || ''), m.email || '',
    m.organisation || '', salt, pinHash_(pin, salt), 'true', 'true', '{}', txt_(jetzt_()), '']);
  return id;
}

function rolleGueltig_(rolle) {
  if (ROLLEN.indexOf(rolle) < 0) throw fehler_('Unbekannte Rolle', 400);
  return rolle;
}

function mitgliedAnlegen_(d) {
  var vorname = String(d.vorname || '').trim();
  var nachname = String(d.nachname || '').trim();
  if (!vorname || !nachname) throw fehler_('Vor- und Nachname angeben', 400);
  var doppelt = zeilen_('Mitglieder').some(function (m) {
    return (m.vorname + ' ' + m.nachname).toLowerCase() === (vorname + ' ' + nachname).toLowerCase();
  });
  if (doppelt) throw fehler_('Ein Zugang mit diesem Namen existiert schon', 400);
  var pin = neuerPin_();
  var id = mitSperre_(function () {
    return mitgliedSchreiben_({
      vorname: vorname, nachname: nachname, rolle: rolleGueltig_(d.rolle || 'mitglied'), regionen: (d.regionen || []).join(','),
      telefon: d.telefon, email: d.email, organisation: d.organisation,
    }, pin);
  });
  return { id: id, pin: pin };
}

function mitgliedAendern_(d, s) {
  superSchutz_(d.id, s);
  var m = mitgliedNachId_(d.id);
  if (!m) throw fehler_('Zugang nicht gefunden', 404);
  if (!darfMitgliedVerwalten_(m, s)) throw fehler_('Keine Berechtigung für diesen Zugang', 403);
  if (d.id === s.mitgliedId && ((d.rolle && d.rolle !== s.rolle) || d.aktiv === false)) {
    throw fehler_('Du kannst dir nicht selbst die Rolle ändern oder dich deaktivieren', 400);
  }
  var admin = s.rolle === 'admin';
  mitSperre_(function () {
    aktualisiereZeile_('Mitglieder', 'id', d.id, function (r) {
      if (admin && d.rolle) r.rolle = rolleGueltig_(d.rolle);
      if (d.regionen) {
        // Regionalleiter dürfen nur ihre eigenen Regionen vergeben oder entziehen
        var neu = d.regionen.slice();
        if (!admin) {
          var fremd = liste_(r.regionen).filter(function (x) { return s.regionen.indexOf(x) < 0; });
          neu = fremd.concat(neu.filter(function (x) { return s.regionen.indexOf(x) >= 0; }));
        }
        r.regionen = neu.join(',');
      }
      if (d.aktiv !== undefined) r.aktiv = d.aktiv ? 'true' : 'false';
      if (d.vorname) r.vorname = d.vorname;
      if (d.nachname) r.nachname = d.nachname;
      if (d.telefon !== undefined) r.telefon = txt_(d.telefon);
      if (d.email !== undefined) r.email = d.email;
      if (d.organisation !== undefined) r.organisation = d.organisation;
      return r;
    });
  });
  if (d.aktiv === false) sitzungenEntfernen_(d.id);
  else sitzungCacheLeeren_(d.id);
  return true;
}

function mitgliedLoeschen_(d, s) {
  superSchutz_(d.id, s);
  if (d.id === s.mitgliedId) throw fehler_('Du kannst dich nicht selbst löschen', 400);
  var m = mitgliedNachId_(d.id);
  if (!m) throw fehler_('Zugang nicht gefunden', 404);
  if (String(m.aktiv) === 'true') throw fehler_('Bitte den Zugang zuerst deaktivieren', 400);
  mitSperre_(function () {
    loescheZeilen_('Mitglieder', function (r) { return r.id === d.id; });
    loescheZeilen_('Sitzungen', function (r) { return r.mitgliedId === d.id; });
    loescheZeilen_('PushAbos', function (r) { return r.mitgliedId === d.id; });
  });
  return true;
}

function setzePin_(id, pin) {
  mitSperre_(function () {
    aktualisiereZeile_('Mitglieder', 'id', id, function (r) {
      r.salt = Utilities.getUuid();
      r.hash = pinHash_(pin, r.salt);
      return r;
    });
  });
}

function pinZuruecksetzen_(d, s) {
  superSchutz_(d.id, s);
  var m = mitgliedNachId_(d.id);
  if (!m || !darfMitgliedVerwalten_(m, s)) throw fehler_('Keine Berechtigung für diesen Zugang', 403);
  var pin = neuerPin_();
  setzePin_(d.id, pin);
  sitzungenEntfernen_(d.id);
  aktualisiereZeile_('Mitglieder', 'id', d.id, function (r) { r.letzteAnmeldung = ''; return r; });
  return { pin: pin, telefon: zelle_(m.telefon), email: m.email || '' };
}

// =====================================================================
// Regionen
// =====================================================================

function regionenAlle_() {
  return zeilen_('Regionen').map(function (r) {
    return { id: r.id, name: r.name, plz: zelle_(r.plz), nachbarn: liste_(r.nachbarn), aktiv: String(r.aktiv) !== 'false' };
  });
}

function regionenOeffentlich_() {
  return regionenAlle_().filter(function (r) { return r.aktiv; }).map(function (r) { return { id: r.id, name: r.name }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
}

function regionenVerwaltung_() {
  var mitglieder = zeilen_('Mitglieder').filter(function (m) { return String(m.aktiv) === 'true'; });
  return regionenAlle_().map(function (r) {
    r.mitglieder = mitglieder.filter(function (m) { return m.rolle !== 'behoerde' && liste_(m.regionen).indexOf(r.id) >= 0; }).length;
    return r;
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
}

/** Region speichern (neu, wenn keine id). PLZ: "85737, 857*, 80331-80339" */
function regionSpeichern_(d) {
  var name = String(d.name || '').trim();
  if (!name) throw fehler_('Name der Region fehlt', 400);
  var plz = String(d.plz || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  plz.forEach(function (p) {
    if (!/^\d{1,5}\*?$/.test(p) && !/^\d{5}-\d{5}$/.test(p)) throw fehler_('Ungültige PLZ-Angabe: ' + p, 400);
  });
  var nachbarn = (d.nachbarn || []).filter(function (x) { return x && x !== d.id; }).join(',');
  var aktiv = d.aktiv === false ? 'false' : 'true';
  return mitSperre_(function () {
    if (d.id) {
      var gef = aktualisiereZeile_('Regionen', 'id', d.id, function (r) {
        r.name = name; r.plz = txt_(plz.join(', ')); r.nachbarn = nachbarn; r.aktiv = aktiv; return r;
      });
      if (!gef) throw fehler_('Region nicht gefunden', 404);
      return { id: d.id };
    }
    var id = 'r' + Utilities.getUuid().slice(0, 6);
    zeileAnhaengen_('Regionen', [id, name, txt_(plz.join(', ')), nachbarn, aktiv]);
    return { id: id };
  });
}

/** Region zu einer PLZ: die genaueste passende Angabe gewinnt (85737 vor 857* vor 8*) */
function regionFuerPlz_(plz) {
  plz = String(plz || '').trim();
  if (!/^\d{5}$/.test(plz)) return '';
  var beste = '', guete = -1;
  regionenAlle_().forEach(function (r) {
    if (!r.aktiv) return;
    liste_(String(r.plz).replace(/[;\s]+/g, ',')).forEach(function (p) {
      var g = -1;
      if (p === plz) g = 10;
      else if (/^\d{5}-\d{5}$/.test(p)) { var t = p.split('-'); if (plz >= t[0] && plz <= t[1]) g = 6; }
      else if (/\*$/.test(p) && plz.indexOf(p.slice(0, -1)) === 0) g = p.length - 1;
      if (g > guete) { guete = g; beste = r.id; }
    });
  });
  return beste;
}

function regionName_(id) {
  var r = regionenAlle_().filter(function (x) { return x.id === id; })[0];
  return r ? r.name : '';
}

// =====================================================================
// Einladungen & Registrierung
// =====================================================================

var CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function neuerCode_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  var c = '';
  for (var i = 0; i < 8; i++) c += CODE_ZEICHEN.charAt(((bytes[i] % 256) + 256) % CODE_ZEICHEN.length);
  return c;
}

function einladungObjekt_(r) {
  var ablauf = zelle_(r.ablauf);
  return {
    code: r.code, rolle: r.rolle, regionen: liste_(r.regionen), notiz: r.notiz || '', erstelltVon: r.erstelltVon,
    erstellt: zelle_(r.erstellt), ablauf: ablauf, genutzt: r.genutzt || '',
    gueltig: !r.genutzt && (!ablauf || new Date(ablauf).getTime() > Date.now()),
  };
}

function einladungenListe_(d, s) {
  return zeilen_('Einladungen').map(einladungObjekt_)
    .filter(function (e) { return s.rolle === 'admin' || schnitt_(e.regionen, s.regionen) || e.erstelltVon === s.name; })
    .sort(function (a, b) { return b.erstellt.localeCompare(a.erstellt); });
}

function einladungErstellen_(d, s) {
  var rolle = rolleGueltig_(d.rolle || 'mitglied');
  var regionen = (d.regionen || []).filter(Boolean);
  if (s.rolle !== 'admin') {
    if (rolle === 'admin' || rolle === 'regionalleiter') throw fehler_('Regionalleiter können nur Mitglieder und Behörden einladen', 403);
    if (!regionen.length || regionen.some(function (r) { return s.regionen.indexOf(r) < 0; })) {
      throw fehler_('Bitte nur eigene Regionen auswählen', 403);
    }
  }
  var tage = Math.min(60, Math.max(1, Number(d.tage) || 14));
  var code = neuerCode_();
  var ablauf = new Date(Date.now() + tage * 86400000).toISOString();
  mitSperre_(function () {
    zeileAnhaengen_('Einladungen', [code, rolle, regionen.join(','), String(d.notiz || '').slice(0, 100), s.name, txt_(jetzt_()), txt_(ablauf), '']);
  });
  var appUrl = prop_('APP_URL') || '';
  return { code: code, ablauf: ablauf, link: appUrl ? appUrl + '#/einladung/' + code : '' };
}

function einladungLoeschen_(d, s) {
  var e = zeilen_('Einladungen').filter(function (r) { return r.code === d.code; })[0];
  if (!e) throw fehler_('Einladung nicht gefunden', 404);
  if (s.rolle !== 'admin' && !schnitt_(liste_(e.regionen), s.regionen)) throw fehler_('Keine Berechtigung', 403);
  mitSperre_(function () { loescheZeilen_('Einladungen', function (r) { return r.code === d.code; }); });
  return true;
}

function gueltigeEinladung_(code) {
  code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('codeversuche') || 0);
  if (n > 50) throw fehler_('Zu viele Versuche – bitte später erneut versuchen', 429);
  cache.put('codeversuche', String(n + 1), 600);
  var e = zeilen_('Einladungen').filter(function (r) { return r.code === code; })[0];
  if (!e) throw fehler_('Einladungscode unbekannt', 404);
  var o = einladungObjekt_(e);
  if (o.genutzt) throw fehler_('Diese Einladung wurde bereits verwendet', 400);
  if (!o.gueltig) throw fehler_('Diese Einladung ist abgelaufen – bitte eine neue anfordern', 400);
  return o;
}

function einladungPruefen_(d) {
  var e = gueltigeEinladung_(d.code);
  return { code: e.code, rolle: e.rolle, rolleName: ROLLEN_NAME[e.rolle], regionen: e.regionen, ablauf: e.ablauf };
}

function registrieren_(d) {
  var e = gueltigeEinladung_(d.code);
  var vorname = String(d.vorname || '').trim().slice(0, 40);
  var nachname = String(d.nachname || '').trim().slice(0, 40);
  var telefon = String(d.telefon || '').trim().slice(0, 40);
  if (!vorname || !nachname) throw fehler_('Bitte Vor- und Nachname angeben', 400);
  if (!telefon) throw fehler_('Bitte eine Telefonnummer angeben – darüber bekommst du deinen PIN', 400);
  if (!d.datenschutz) throw fehler_('Bitte der Datenschutzerklärung zustimmen', 400);
  if (e.rolle === 'behoerde' && !String(d.organisation || '').trim()) throw fehler_('Bitte die Behörde angeben', 400);
  var gueltig = regionenAlle_().map(function (r) { return r.id; });
  var regionen = (d.regionen && d.regionen.length && e.rolle === 'mitglied' ? d.regionen : e.regionen)
    .filter(function (x) { return gueltig.indexOf(x) >= 0; });
  if (!regionen.length && e.rolle !== 'admin') throw fehler_('Bitte mindestens eine Region wählen', 400);
  var voll = (vorname + ' ' + nachname).toLowerCase();
  if (zeilen_('Mitglieder').some(function (m) { return (m.vorname + ' ' + m.nachname).toLowerCase() === voll; })) {
    throw fehler_('Ein Zugang mit diesem Namen existiert schon. PIN vergessen? Bitte beim Regionalleiter melden.', 400);
  }
  var id = 'g' + Utilities.getUuid().slice(0, 8);
  mitSperre_(function () {
    if (zeilen_('Einladungen').some(function (r) { return r.code === e.code && r.genutzt; })) throw fehler_('Diese Einladung wurde bereits verwendet', 400);
    zeileAnhaengen_('Registrierungen', [id, e.code, vorname, nachname, txt_(telefon), String(d.email || '').trim().slice(0, 80),
      String(d.organisation || '').trim().slice(0, 80), e.rolle, regionen.join(','), String(d.nachricht || '').slice(0, 300),
      txt_(jetzt_()), 'offen', '']);
    aktualisiereZeile_('Einladungen', 'code', e.code, function (r) { r.genutzt = id; return r; });
  });
  pushAnLeitung_(regionen, 'Neue Registrierung', vorname + ' ' + nachname + ' (' + ROLLEN_NAME[e.rolle] + ') wartet auf Freigabe.', '#/verwaltung/zugaenge');
  return { ok: true };
}

function registrierungObjekt_(r) {
  return {
    id: r.id, code: r.code, vorname: r.vorname, nachname: r.nachname, telefon: zelle_(r.telefon), email: r.email || '',
    organisation: r.organisation || '', rolle: r.rolle, regionen: liste_(r.regionen), nachricht: r.nachricht || '',
    erstellt: zelle_(r.erstellt), status: r.status,
  };
}

function registrierungenListe_(d, s) {
  return zeilen_('Registrierungen').filter(function (r) {
    return r.status === 'offen' && (s.rolle === 'admin' || schnitt_(liste_(r.regionen), s.regionen));
  }).map(registrierungObjekt_);
}

function registrierungHolen_(id, s) {
  var r = zeilen_('Registrierungen').filter(function (x) { return x.id === id && x.status === 'offen'; })[0];
  if (!r) throw fehler_('Registrierung nicht gefunden', 404);
  if (s.rolle !== 'admin' && !schnitt_(liste_(r.regionen), s.regionen)) throw fehler_('Keine Berechtigung', 403);
  if (s.rolle !== 'admin' && (r.rolle === 'admin' || r.rolle === 'regionalleiter')) throw fehler_('Nur Admins können diese Rolle freigeben', 403);
  return r;
}

function registrierungFreigeben_(d, s) {
  var r = registrierungHolen_(d.id, s);
  var erg = mitgliedAnlegen_({
    vorname: r.vorname, nachname: r.nachname, rolle: r.rolle, regionen: liste_(r.regionen),
    telefon: zelle_(r.telefon), email: r.email, organisation: r.organisation,
  });
  mitSperre_(function () {
    aktualisiereZeile_('Registrierungen', 'id', r.id, function (x) { x.status = 'freigegeben'; x.bearbeitet = s.name + ' ' + jetzt_(); return x; });
  });
  return { id: erg.id, pin: erg.pin, vorname: r.vorname, nachname: r.nachname, telefon: zelle_(r.telefon), email: r.email || '' };
}

function registrierungAblehnen_(d, s) {
  var r = registrierungHolen_(d.id, s);
  mitSperre_(function () {
    aktualisiereZeile_('Registrierungen', 'id', r.id, function (x) { x.status = 'abgelehnt'; x.bearbeitet = s.name + ' ' + jetzt_(); return x; });
  });
  return true;
}

// =====================================================================
// Einstellungen
// =====================================================================

var STANDARD_EINSTELLUNGEN = {
  netzwerkName: 'SOS Hund',
  info:
    '## Wer wir sind\nSOS Hund ist ein Netzwerk erfahrener Hundeleute, die **auffällige, entlaufene oder herrenlose Hunde** sichern – auf Anfrage von Veterinärämtern, Polizei, Tierheimen und Privatpersonen.\n\n## Was tun, wenn ein Hund auffällig ist?\n- **Abstand halten**, den Hund nicht bedrängen, nicht anstarren und nicht hinterherlaufen\n- Kinder und andere Hunde in Sicherheit bringen\n- Bei Gefahr für Menschen sofort **112** oder **110** anrufen\n- Ort, Uhrzeit und Aussehen des Hundes merken\n- Danach über **„Hund melden“** eine Meldung schicken',
  notfall: '- **Notruf:** [112](tel:112)\n- **Polizei:** [110](tel:110)',
  datenschutz:
    'Wir verarbeiten die Angaben einer Meldung nur, um den Hund zu sichern. Sie sind nur für die zuständigen Mitglieder des Netzwerks und die zuständige Behörde sichtbar. Namen, Adressen und Telefonnummern werden nach Abschluss automatisch gelöscht (anonymisiert).',
  eskalationAktiv: true,
  eskalationMin: 30,
  eskalationAkutMin: 10,
  anonymMonate: 12,
  auftraggeberMail: true,
};
var OEFFENTLICHE_EINSTELLUNGEN = ['netzwerkName', 'info', 'notfall', 'datenschutz', 'anonymMonate'];

function einstellungenLesen_() {
  var erg = JSON.parse(JSON.stringify(STANDARD_EINSTELLUNGEN));
  zeilen_('Einstellungen').forEach(function (r) {
    try { erg[r.schluessel] = JSON.parse(r.wert); } catch (e) { erg[r.schluessel] = r.wert; }
  });
  return erg;
}

function einstellungenFuer_(s) {
  var alle = einstellungenLesen_();
  if (s && s.rolle === 'admin') return alle;
  var o = {};
  OEFFENTLICHE_EINSTELLUNGEN.forEach(function (k) { o[k] = alle[k]; });
  return o;
}

function einstellungenSpeichern_(d) {
  mitSperre_(function () {
    Object.keys(STANDARD_EINSTELLUNGEN).forEach(function (k) {
      if (d[k] === undefined) return;
      var wert = JSON.stringify(d[k]);
      var gefunden = aktualisiereZeile_('Einstellungen', 'schluessel', k, function (r) { r.wert = wert; return r; });
      if (!gefunden) zeileAnhaengen_('Einstellungen', [k, wert]);
    });
  });
  return einstellungenLesen_();
}

// =====================================================================
// Startseite
// =====================================================================

function start_(d, s) {
  var einst = einstellungenFuer_(s);
  var o = { einstellungen: einst, regionen: regionenOeffentlich_().length };
  if (!s) return o;
  var anfragen = zeilen_('Anfragen').filter(function (a) { return darfSehen_(a, s); });
  o.offen = anfragen.filter(function (a) { return a.status === 'offen'; }).length;
  o.akut = anfragen.filter(function (a) { return a.status === 'offen' && a.dringlichkeit === 'akut'; }).length;
  o.meine = anfragen.filter(function (a) {
    return STATUS_ENDE.indexOf(a.status) < 0 && (a.uebernommenVon === s.mitgliedId || a.erstelltVon === s.mitgliedId ||
      helferListe_(a).some(function (h) { return h.id === s.mitgliedId; }));
  }).length;
  if (istLeitung_(s)) {
    o.ungeprueft = anfragen.filter(function (a) { return a.status === 'ungeprueft'; }).length;
    o.registrierungen = registrierungenListe_(d, s).length;
  }
  var m = mitgliedNachId_(s.mitgliedId);
  o.verfuegbar = m ? String(m.verfuegbar) !== 'false' : true;
  return o;
}

// =====================================================================
// SOS-Anfragen
// =====================================================================

function helferListe_(a) {
  try { return JSON.parse(a.helfer || '[]'); } catch (e) { return []; }
}

function details_(a) {
  try { return JSON.parse(a.json || '{}'); } catch (e) { return {}; }
}

function txtFeld_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }

/** Eingaben einer Anfrage prüfen und säubern */
function anfrageDaten_(d) {
  var h = d.hund || {}, ad = d.adresse || {}, ag = d.auftraggeber || {};
  var o = {
    beschreibung: txtFeld_(d.beschreibung, 200),
    vorfall: txtFeld_(d.vorfall, 2000),
    hund: {
      rasse: txtFeld_(h.rasse, 80), groesse: txtFeld_(h.groesse, 20), farbe: txtFeld_(h.farbe, 80),
      alter: txtFeld_(h.alter, 30), geschlecht: txtFeld_(h.geschlecht, 20), merkmale: txtFeld_(h.merkmale, 300),
      name: txtFeld_(h.name, 40), anzahl: Math.max(1, Math.min(20, Number(h.anzahl) || 1)),
    },
    adresse: {
      halter: txtFeld_(ad.halter, 80), halterTelefon: txtFeld_(ad.halterTelefon, 40), halterEmail: txtFeld_(ad.halterEmail, 80),
      strasse: txtFeld_(ad.strasse, 100), plz: txtFeld_(ad.plz, 5), ort: txtFeld_(ad.ort, 60),
      hinweis: txtFeld_(ad.hinweis, 300), lat: Number(ad.lat) || null, lon: Number(ad.lon) || null,
    },
    auftraggeber: {
      name: txtFeld_(ag.name, 80), organisation: txtFeld_(ag.organisation, 80), telefon: txtFeld_(ag.telefon, 40),
      email: txtFeld_(ag.email, 80), erreichbar: txtFeld_(ag.erreichbar, 120),
      strasse: txtFeld_(ag.strasse, 100), plz: txtFeld_(ag.plz, 5), ort: txtFeld_(ag.ort, 60),
      istHalter: ag.istHalter === true,
    },
  };
  // Melder ist selbst der Hundehalter: Name, Telefon und E-Mail des Halters gelten auch als Kontakt
  // (fehlende Angaben auf einer Seite werden von der anderen ergänzt), die Adresse gilt für beide
  if (o.auftraggeber.istHalter) {
    var ag2 = o.auftraggeber, ad2 = o.adresse;
    ag2.name = ad2.halter || ag2.name; ag2.telefon = ad2.halterTelefon || ag2.telefon; ag2.email = ad2.halterEmail || ag2.email;
    ad2.halter = ag2.name; ad2.halterTelefon = ag2.telefon; ad2.halterEmail = ag2.email;
    ag2.strasse = ad2.strasse; ag2.plz = ad2.plz; ag2.ort = ad2.ort;
  }
  if (o.auftraggeber.plz && !/^\d{5}$/.test(o.auftraggeber.plz)) throw fehler_('Bitte eine gültige Postleitzahl des Auftraggebers angeben', 400);
  if (!o.beschreibung) throw fehler_('Bitte kurz beschreiben, was los ist', 400);
  if (!/^\d{5}$/.test(o.adresse.plz)) throw fehler_('Bitte eine gültige Postleitzahl angeben', 400);
  if (!o.adresse.ort) throw fehler_('Bitte den Ort angeben', 400);
  if (!o.auftraggeber.name || !o.auftraggeber.telefon) throw fehler_('Bitte Name und Telefonnummer des Auftraggebers angeben', 400);
  return o;
}

/** Koordinaten für die Karte (Google Maps Geocoder, falls verfügbar) */
function geokodieren_(adr) {
  if (adr.lat && adr.lon) return adr;
  try {
    var text = [adr.strasse, adr.plz + ' ' + adr.ort, 'Deutschland'].filter(Boolean).join(', ');
    var r = Maps.newGeocoder().setRegion('de').setLanguage('de').geocode(text);
    if (r && r.status === 'OK' && r.results.length) {
      adr.lat = r.results[0].geometry.location.lat;
      adr.lon = r.results[0].geometry.location.lng;
    }
  } catch (e) { console.warn('Geokodierung fehlgeschlagen: ' + e); }
  return adr;
}

function naechsteNummer_() {
  var jahr = String(new Date().getFullYear());
  var max = 0;
  zeilen_('Anfragen').forEach(function (a) {
    var m = /^SOS-(\d{4})-(\d+)$/.exec(a.nummer || '');
    if (m && m[1] === jahr) max = Math.max(max, Number(m[2]));
  });
  return 'SOS-' + jahr + '-' + ('000' + (max + 1)).slice(-4);
}

/** Kurzfassung für Liste und Karte */
function anfrageKurz_(a, s) {
  var d = details_(a);
  return {
    id: a.id, nummer: a.nummer, region: a.region, regionName: regionName_(a.region), status: a.status, dringlichkeit: a.dringlichkeit,
    quelle: a.quelle, erstellt: zelle_(a.erstellt), geaendert: zelle_(a.geaendert), beschreibung: d.beschreibung || '',
    ort: d.adresse ? (d.adresse.plz + ' ' + d.adresse.ort) : '', lat: d.adresse && d.adresse.lat, lon: d.adresse && d.adresse.lon,
    hund: d.hund ? [d.hund.rasse, d.hund.groesse, d.hund.farbe].filter(Boolean).join(', ') : '',
    uebernommenVon: a.uebernommenVon || '', uebernommenName: a.uebernommenName || '', uebernommenAm: zelle_(a.uebernommenAm),
    helfer: helferListe_(a), eskaliert: !!a.eskaliertAm, eskaliertBeiMir: !!s && liste_(a.eskaliertAn).some(function (r) { return s.regionen.indexOf(r) >= 0; }),
    meine: !!s && (a.uebernommenVon === s.mitgliedId || a.erstelltVon === s.mitgliedId || helferListe_(a).some(function (h) { return h.id === s.mitgliedId; })),
    anonymisiert: String(a.anonymisiert) === 'true',
    fotos: (d.fotos || []).length,
  };
}

function anfragenListe_(d, s) {
  var filter = d.filter || 'aktiv';
  return zeilen_('Anfragen').filter(function (a) { return darfSehen_(a, s); })
    .filter(function (a) {
      var ende = STATUS_ENDE.indexOf(a.status) >= 0;
      if (filter === 'aktiv') return !ende;
      if (filter === 'erledigt') return ende;
      return true;
    })
    .map(function (a) { return anfrageKurz_(a, s); })
    .sort(function (a, b) {
      var rang = function (x) { return x.status === 'ungeprueft' ? 0 : x.status === 'offen' ? (x.dringlichkeit === 'akut' ? 1 : x.dringlichkeit === 'dringend' ? 2 : 3) : 4; };
      return rang(a) - rang(b) || b.erstellt.localeCompare(a.erstellt);
    });
}

function anfrageHolen_(id) {
  var a = zeilen_('Anfragen').filter(function (x) { return x.id === id; })[0];
  if (!a) throw fehler_('Anfrage nicht gefunden', 404);
  return a;
}

function anfrageDetail_(d, s) {
  var a = anfrageHolen_(d.id);
  if (!darfSehen_(a, s)) throw fehler_('Keine Berechtigung für diese Anfrage', 403);
  protokoll_(s, 'angesehen', a.id);
  var o = anfrageKurz_(a, s);
  o.details = details_(a);
  o.verlauf = zeilen_('Verlauf').filter(function (v) { return v.anfrageId === a.id; }).map(function (v) {
    return { zeit: zelle_(v.zeit), name: v.name, aktion: v.aktion, status: v.status, notiz: v.notiz };
  }).sort(function (x, y) { return x.zeit.localeCompare(y.zeit); });
  o.rechte = {
    bearbeiten: darfBearbeiten_(a, s),
    leiten: leitetRegion_(s, a.region),
    uebernehmen: istHelfer_(s) && a.status === 'offen',
    helfen: istHelfer_(s) && ['uebernommen', 'vor_ort'].indexOf(a.status) >= 0 && a.uebernommenVon !== s.mitgliedId,
    zurueckgeben: (a.uebernommenVon === s.mitgliedId || leitetRegion_(s, a.region)) && ['uebernommen', 'vor_ort'].indexOf(a.status) >= 0,
    aendern: leitetRegion_(s, a.region) || (a.erstelltVon === s.mitgliedId && ['ungeprueft', 'offen'].indexOf(a.status) >= 0),
    eigene: a.erstelltVon === s.mitgliedId,
  };
  // Kontakte des Teams für die Zusammenarbeit
  var team = [a.uebernommenVon].concat(helferListe_(a).map(function (h) { return h.id; })).filter(Boolean);
  o.team = zeilen_('Mitglieder').filter(function (m) { return team.indexOf(m.id) >= 0; }).map(function (m) {
    return { id: m.id, name: m.vorname + ' ' + m.nachname, telefon: zelle_(m.telefon), rolle: m.id === a.uebernommenVon ? 'verantwortlich' : 'Helfer' };
  });
  return o;
}

function verlauf_(anfrageId, s, aktion, status, notiz) {
  zeileAnhaengen_('Verlauf', ['v' + Utilities.getUuid().slice(0, 8), anfrageId, txt_(jetzt_()), s ? s.mitgliedId : '',
    s ? s.name : 'Öffentliche Meldung', aktion, status || '', String(notiz || '').slice(0, 500)]);
}

function protokoll_(s, aktion, anfrageId) {
  try {
    zeileAnhaengen_('Protokoll', [txt_(jetzt_()), s ? s.mitgliedId : '', s ? s.name : 'öffentlich', aktion, anfrageId || '']);
  } catch (e) { console.error(e); }
}

/** Neue Anfrage speichern (gemeinsam für Mitglieder, Behörden und öffentliche Meldungen) */
function anfrageSpeichern_(daten, dringlichkeit, quelle, status, s, fotos) {
  daten.adresse = geokodieren_(daten.adresse);
  var region = regionFuerPlz_(daten.adresse.plz);
  var id = 'a' + Utilities.getUuid().slice(0, 8);
  var nummer;
  // Fotos vor der Sperre hochladen (Drive ist langsam), Dateiname = interne ID
  daten.fotos = fotosSpeichern_(fotosPruefen_(fotos), id);
  mitSperre_(function () {
    nummer = naechsteNummer_();
    zeileAnhaengen_('Anfragen', [id, nummer, region, status, dringlichkeit, quelle, txt_(jetzt_()), s ? s.mitgliedId : '',
      '', '', '', '[]', '', '', txt_(jetzt_()), '', 'false', JSON.stringify(daten)]);
    verlauf_(id, s, quelle === 'oeffentlich' ? 'Meldung eingegangen' : 'Anfrage angelegt', status);
  });
  protokoll_(s, 'angelegt', id);
  return { id: id, nummer: nummer, region: region };
}

function dringlichkeit_(v) { return DRINGLICHKEIT.indexOf(v) >= 0 ? v : 'normal'; }

function anfrageAnlegen_(d, s) {
  var daten = anfrageDaten_(d);
  if (s.rolle === 'behoerde' && !daten.auftraggeber.organisation) daten.auftraggeber.organisation = s.organisation;
  var erg = anfrageSpeichern_(daten, dringlichkeit_(d.dringlichkeit), s.rolle === 'behoerde' ? 'behoerde' : 'mitglied', 'offen', s, d.fotos);
  erg.benachrichtigt = sosPush_(anfrageHolen_(erg.id), 'neu', s.mitgliedId);
  if (!erg.region) pushAnLeitung_([], 'Anfrage ohne Region', erg.nummer + ': PLZ ' + daten.adresse.plz + ' gehört zu keiner Region.', '#/anfragen/' + erg.id);
  return erg;
}

/** Öffentliche Meldung: landet als „ungeprüft“ bei Regionalleitung und Admins */
function melden_(d) {
  if (d.website) return { ok: true }; // Honigtopf-Feld: von Bots ausgefüllt, still verwerfen
  if (!d.datenschutz) throw fehler_('Bitte der Datenschutzerklärung zustimmen', 400);
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('meldungen') || 0);
  if (n > 30) throw fehler_('Gerade gehen sehr viele Meldungen ein – bitte später erneut versuchen oder 112 anrufen', 429);
  cache.put('meldungen', String(n + 1), 3600);
  var daten = anfrageDaten_(d);
  var erg = anfrageSpeichern_(daten, dringlichkeit_(d.dringlichkeit), 'oeffentlich', 'ungeprueft', null, d.fotos);
  pushAnLeitung_(erg.region ? [erg.region] : [], 'Neue Meldung prüfen', erg.nummer + ' · ' + daten.adresse.ort + ': ' + daten.beschreibung, '#/anfragen/' + erg.id);
  return { nummer: erg.nummer };
}

function anfrageBearbeiten_(d, s) {
  var a = anfrageHolen_(d.id);
  var leitung = leitetRegion_(s, a.region);
  if (!leitung && !(a.erstelltVon === s.mitgliedId && ['ungeprueft', 'offen'].indexOf(a.status) >= 0)) throw fehler_('Keine Berechtigung', 403);
  var daten = anfrageDaten_(d);
  var alt = details_(a);
  daten.fotos = alt.fotos || []; // Fotos bleiben beim Bearbeiten erhalten
  if (alt.adresse && alt.adresse.plz === daten.adresse.plz && alt.adresse.strasse === daten.adresse.strasse && !daten.adresse.lat) {
    daten.adresse.lat = alt.adresse.lat; daten.adresse.lon = alt.adresse.lon;
  }
  daten.adresse = geokodieren_(daten.adresse);
  var neueRegion = a.region;
  if (leitung && d.region !== undefined) {
    neueRegion = d.region;
    if (s.rolle !== 'admin' && neueRegion && s.regionen.indexOf(neueRegion) < 0) throw fehler_('Nur eigene Regionen auswählbar', 403);
  } else if (alt.adresse && alt.adresse.plz !== daten.adresse.plz) {
    neueRegion = regionFuerPlz_(daten.adresse.plz) || a.region;
  }
  mitSperre_(function () {
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
      r.json = JSON.stringify(daten);
      r.dringlichkeit = dringlichkeit_(d.dringlichkeit || r.dringlichkeit);
      r.region = neueRegion;
      r.geaendert = txt_(jetzt_());
      return r;
    });
    verlauf_(a.id, s, neueRegion !== a.region ? 'Region geändert: ' + (regionName_(neueRegion) || 'keine') : 'Angaben geändert', '');
  });
  protokoll_(s, 'bearbeitet', a.id);
  if (neueRegion !== a.region && a.status === 'offen') sosPush_(anfrageHolen_(a.id), 'neu', s.mitgliedId);
  return anfrageDetail_({ id: a.id }, s);
}

function anfragePruefen_(d, s) {
  var a = anfrageHolen_(d.id);
  if (!leitetRegion_(s, a.region)) throw fehler_('Nur die Leitung der Region kann Meldungen prüfen', 403);
  if (a.status !== 'ungeprueft') throw fehler_('Die Meldung wurde bereits geprüft', 409);
  var freigeben = !!d.freigeben;
  if (freigeben && !a.region) throw fehler_('Bitte zuerst eine Region zuordnen', 400);
  mitSperre_(function () {
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
      r.status = freigeben ? 'offen' : 'verworfen';
      if (!freigeben) r.abgeschlossenAm = txt_(jetzt_());
      if (freigeben) r.erstellt = txt_(jetzt_()); // Eskalationszeit ab Freigabe
      r.geaendert = txt_(jetzt_());
      return r;
    });
    verlauf_(a.id, s, freigeben ? 'Meldung geprüft und freigegeben' : 'Meldung verworfen', freigeben ? 'offen' : 'verworfen', d.notiz);
  });
  protokoll_(s, freigeben ? 'freigegeben' : 'verworfen', a.id);
  var erg = { status: freigeben ? 'offen' : 'verworfen' };
  if (freigeben) erg.benachrichtigt = sosPush_(anfrageHolen_(a.id), 'neu', s.mitgliedId);
  return erg;
}

/** „Ich übernehme“ – mit Sperre, damit nie zwei Personen gleichzeitig übernehmen */
function anfrageUebernehmen_(d, s) {
  var ergebnis = mitSperre_(function () {
    var a = anfrageHolen_(d.id);
    if (!darfSehen_(a, s)) throw fehler_('Keine Berechtigung für diese Anfrage', 403);
    if (a.status !== 'offen') {
      throw fehler_(a.uebernommenName ? 'Schon übernommen von ' + a.uebernommenName : 'Die Anfrage ist nicht mehr offen', 409);
    }
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
      r.status = 'uebernommen';
      r.uebernommenVon = s.mitgliedId;
      r.uebernommenName = s.name;
      r.uebernommenAm = txt_(jetzt_());
      r.helfer = JSON.stringify(helferListe_(r).filter(function (h) { return h.id !== s.mitgliedId; }));
      r.geaendert = txt_(jetzt_());
      return r;
    });
    verlauf_(a.id, s, 'übernommen', 'uebernommen', d.notiz);
    return a;
  });
  protokoll_(s, 'übernommen', d.id);
  var a = anfrageHolen_(d.id);
  sosPush_(a, 'uebernommen', s.mitgliedId);
  auftraggeberInformieren_(a, s);
  return anfrageDetail_({ id: d.id }, s);
}

/** Wieder freigeben: die Anfrage ist danach erneut offen und die Region wird benachrichtigt */
function anfrageZurueckgeben_(d, s) {
  mitSperre_(function () {
    var a = anfrageHolen_(d.id);
    if (!(a.uebernommenVon === s.mitgliedId || leitetRegion_(s, a.region))) throw fehler_('Keine Berechtigung', 403);
    if (['uebernommen', 'vor_ort'].indexOf(a.status) < 0) throw fehler_('Die Anfrage ist gerade nicht übernommen', 409);
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
      r.status = 'offen'; r.uebernommenVon = ''; r.uebernommenName = ''; r.uebernommenAm = '';
      r.erstellt = txt_(jetzt_()); r.eskaliertAm = ''; r.eskaliertAn = ''; r.geaendert = txt_(jetzt_());
      return r;
    });
    verlauf_(a.id, s, 'wieder freigegeben', 'offen', d.notiz);
  });
  protokoll_(s, 'zurückgegeben', d.id);
  var a = anfrageHolen_(d.id);
  sosPush_(a, 'wieder', s.mitgliedId);
  // Nach der Rückgabe aus einer Nachbarregion ist die Anfrage dort evtl. nicht mehr sichtbar
  return darfSehen_(a, s) ? anfrageDetail_({ id: d.id }, s) : { id: a.id, status: a.status, nichtMehrSichtbar: true };
}

/** Als Helfer eintragen oder austragen */
function anfrageHelfen_(d, s) {
  mitSperre_(function () {
    var a = anfrageHolen_(d.id);
    if (!darfSehen_(a, s)) throw fehler_('Keine Berechtigung für diese Anfrage', 403);
    if (a.uebernommenVon === s.mitgliedId) throw fehler_('Du bist bereits verantwortlich', 400);
    var liste = helferListe_(a);
    var dabei = liste.some(function (h) { return h.id === s.mitgliedId; });
    if (d.dabei === false) {
      if (!dabei) return;
      liste = liste.filter(function (h) { return h.id !== s.mitgliedId; });
    } else {
      if (dabei) return;
      if (['uebernommen', 'vor_ort'].indexOf(a.status) < 0) throw fehler_('Helfen ist möglich, sobald jemand die Anfrage übernommen hat', 409);
      liste.push({ id: s.mitgliedId, name: s.name });
    }
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) { r.helfer = JSON.stringify(liste); r.geaendert = txt_(jetzt_()); return r; });
    verlauf_(a.id, s, d.dabei === false ? 'hilft nicht mehr mit' : 'hilft mit', '', d.notiz);
    if (d.dabei !== false && a.uebernommenVon) {
      pushSenden_('uebernahme', 'Hilfe kommt', s.name + ' hilft bei ' + a.nummer + ' mit.', '#/anfragen/' + a.id, null, [a.uebernommenVon]);
    }
  });
  return anfrageDetail_({ id: d.id }, s);
}

var STATUS_SETZBAR = ['vor_ort', 'gesichert', 'abgeschlossen', 'abgebrochen'];

/** Status ändern und/oder Notiz zum Verlauf hinzufügen */
function anfrageStatus_(d, s) {
  var neu = d.status || '';
  var a = anfrageHolen_(d.id);
  if (!darfBearbeiten_(a, s)) throw fehler_('Keine Berechtigung', 403);
  if (neu && STATUS_SETZBAR.indexOf(neu) < 0) throw fehler_('Ungültiger Status', 400);
  if (s.rolle === 'behoerde' && neu && neu !== 'abgebrochen' && !leitetRegion_(s, a.region)) throw fehler_('Behörden können eine Anfrage nur zurückziehen', 403);
  if (neu && STATUS_ENDE.indexOf(a.status) >= 0) throw fehler_('Die Anfrage ist bereits beendet', 409);
  if ((neu === 'vor_ort' || neu === 'gesichert') && ['uebernommen', 'vor_ort', 'gesichert'].indexOf(a.status) < 0) {
    throw fehler_('Bitte die Anfrage zuerst übernehmen', 409);
  }
  if (!neu && !String(d.notiz || '').trim()) throw fehler_('Bitte eine Notiz eingeben', 400);
  mitSperre_(function () {
    aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
      if (neu) r.status = neu;
      if (neu && STATUS_ENDE.indexOf(neu) >= 0) r.abgeschlossenAm = txt_(jetzt_());
      r.geaendert = txt_(jetzt_());
      return r;
    });
    verlauf_(a.id, s, neu ? 'Status: ' + STATUS_NAME[neu] : 'Notiz', neu, d.notiz);
  });
  protokoll_(s, neu ? 'Status ' + neu : 'Notiz', a.id);
  if (neu) {
    var a2 = anfrageHolen_(a.id);
    var beteiligte = [a2.erstelltVon, a2.uebernommenVon].concat(helferListe_(a2).map(function (h) { return h.id; }))
      .filter(function (x) { return x && x !== s.mitgliedId; });
    if (beteiligte.length) {
      pushSenden_('status', a2.nummer + ': ' + STATUS_NAME[neu], s.name + (d.notiz ? ': ' + String(d.notiz).slice(0, 120) : ''), '#/anfragen/' + a2.id, null, beteiligte);
    }
  }
  return anfrageDetail_({ id: a.id }, s);
}

/** Export für Behörden, Regionalleiter und Admins (alle sichtbaren Anfragen im Zeitraum) */
function export_(d, s) {
  if (!(istLeitung_(s) || s.rolle === 'behoerde')) throw fehler_('Export nur für Behörden, Regionalleiter und Admins', 403);
  var von = String(d.von || '0000'), bis = String(d.bis || '9999') + 'T99';
  var zeilen = zeilen_('Anfragen').filter(function (a) { return darfSehen_(a, s); }).filter(function (a) {
    var e = zelle_(a.erstellt);
    return e >= von && e <= bis;
  }).map(function (a) {
    var k = anfrageKurz_(a, s), dt = details_(a);
    return {
      nummer: k.nummer, erstellt: k.erstellt, region: k.regionName, status: STATUS_NAME[k.status] || k.status, dringlichkeit: k.dringlichkeit,
      quelle: k.quelle, beschreibung: k.beschreibung, hund: k.hund, alter: (dt.hund || {}).alter || '', ort: k.ort,
      strasse: (dt.adresse || {}).strasse || '',
      halter: [(dt.adresse || {}).halter, (dt.adresse || {}).halterTelefon, (dt.adresse || {}).halterEmail].filter(Boolean).join(', '),
      auftraggeber: [(dt.auftraggeber || {}).name, (dt.auftraggeber || {}).organisation, (dt.auftraggeber || {}).strasse,
        [(dt.auftraggeber || {}).plz, (dt.auftraggeber || {}).ort].filter(Boolean).join(' '), (dt.auftraggeber || {}).istHalter ? 'Hundehalter' : ''].filter(Boolean).join(', '),
      uebernommen: k.uebernommenName, helfer: k.helfer.map(function (h) { return h.name; }).join(', '),
      abgeschlossen: zelle_(a.abgeschlossenAm),
    };
  });
  protokoll_(s, 'Export ' + zeilen.length + ' Anfragen', '');
  return zeilen;
}

/** E-Mail an den Auftraggeber, wenn jemand die Anfrage übernimmt (falls eingeschaltet und E-Mail vorhanden) */
function auftraggeberInformieren_(a, s) {
  try {
    if (!einstellungenLesen_().auftraggeberMail) return;
    var dt = details_(a);
    var mail = (dt.auftraggeber || {}).email;
    if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return;
    var name = einstellungenLesen_().netzwerkName;
    MailApp.sendEmail({
      to: mail,
      subject: name + ': Ihre Anfrage ' + a.nummer + ' wurde übernommen',
      body: 'Guten Tag ' + (dt.auftraggeber.name || '') + ',\n\nIhre Anfrage ' + a.nummer + ' (' + (dt.beschreibung || '') + ') wurde von '
        + s.name + ' übernommen. Wir melden uns bei Ihnen unter ' + (dt.auftraggeber.telefon || 'der angegebenen Nummer') + '.\n\n'
        + 'Viele Grüße\n' + name + '\n\n(Diese Nachricht wurde automatisch erstellt.)',
    });
  } catch (e) { console.warn('Mail an Auftraggeber fehlgeschlagen: ' + e); }
}

// =====================================================================
// Fotos (Google Drive, Ordner „SOS Hund – Fotos“, nicht öffentlich)
// =====================================================================

var FOTO_MAX = 5;
var FOTO_MAX_BYTES = 3 * 1024 * 1024;
var FOTO_TYPEN = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Prüft die mitgeschickten Fotos ({mime, data: Base64}) und wandelt sie in Bytes */
function fotosPruefen_(fotos) {
  if (!fotos || !fotos.length) return [];
  if (fotos.length > FOTO_MAX) throw fehler_('Bitte höchstens ' + FOTO_MAX + ' Fotos anhängen', 400);
  return fotos.map(function (f) {
    var mime = String((f && f.mime) || '');
    if (!FOTO_TYPEN[mime]) throw fehler_('Fotos bitte als JPG, PNG oder WebP', 400);
    var bytes;
    try { bytes = Utilities.base64Decode(String(f.data || '')); } catch (e) { throw fehler_('Ein Foto ist beschädigt', 400); }
    if (!bytes.length || bytes.length > FOTO_MAX_BYTES) throw fehler_('Ein Foto ist zu groß (höchstens 3 MB)', 400);
    return { mime: mime, bytes: bytes };
  });
}

/*
 * Drive-Zugriff über die Drive-API (erweiterter Dienst „Drive“, v3) mit dem Scope drive.file:
 * Das Script sieht nur Ordner und Dateien, die es selbst angelegt hat – nicht das übrige Drive.
 */
function fotoOrdner_() {
  var id = prop_('FOTO_ORDNER_ID');
  if (id) {
    try {
      var f = Drive.Files.get(id, { fields: 'id,trashed' });
      if (f && !f.trashed) return f.id;
    } catch (e) { console.warn('Foto-Ordner nicht gefunden, lege neu an'); }
  }
  var ordner = Drive.Files.create({ name: 'SOS Hund – Fotos', mimeType: 'application/vnd.google-apps.folder' });
  PropertiesService.getScriptProperties().setProperty('FOTO_ORDNER_ID', ordner.id);
  return ordner.id;
}

function fotosSpeichern_(geprueft, name) {
  if (!geprueft.length) return [];
  var ordnerId = fotoOrdner_();
  return geprueft.map(function (f, i) {
    var dateiname = name + '-' + (i + 1) + '.' + FOTO_TYPEN[f.mime];
    var blob = Utilities.newBlob(f.bytes, f.mime, dateiname);
    return Drive.Files.create({ name: dateiname, mimeType: f.mime, parents: [ordnerId] }, blob, { fields: 'id' }).id;
  });
}

function fotoLaden_(fid) {
  var r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fid) + '?alt=media', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('Foto ' + fid + ': HTTP ' + r.getResponseCode());
  return r.getBlob();
}

/** Fotos einer Anfrage – nur für alle, die die Anfrage sehen dürfen */
function anfrageFotos_(d, s) {
  var a = anfrageHolen_(d.id);
  if (!darfSehen_(a, s)) throw fehler_('Keine Berechtigung für diese Anfrage', 403);
  var ids = details_(a).fotos || [];
  if (ids.length) protokoll_(s, 'Fotos angesehen', a.id);
  return ids.map(function (fid) {
    try {
      var b = fotoLaden_(fid);
      return { id: fid, mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
    } catch (e) {
      return { id: fid, fehlt: true };
    }
  });
}

function fotosLoeschen_(ids) {
  (ids || []).forEach(function (fid) {
    try { Drive.Files.update({ trashed: true }, fid); } catch (e) { console.warn('Foto ' + fid + ' nicht gelöscht: ' + e); }
  });
}

// =====================================================================
// Eskalation & Anonymisierung (zeitgesteuert)
// =====================================================================

function eskalieren_() {
  var e = einstellungenLesen_();
  if (!e.eskalationAktiv) return 0;
  var regionen = regionenAlle_();
  var jetzt = Date.now();
  var anzahl = 0;
  zeilen_('Anfragen').forEach(function (a) {
    if (a.status !== 'offen' || a.eskaliertAm || !a.region) return;
    var minuten = a.dringlichkeit === 'akut' ? Number(e.eskalationAkutMin) || 10 : Number(e.eskalationMin) || 30;
    if (jetzt - new Date(zelle_(a.erstellt)).getTime() < minuten * 60000) return;
    var r = regionen.filter(function (x) { return x.id === a.region; })[0];
    var nachbarn = r ? r.nachbarn.filter(function (n) { return regionen.some(function (x) { return x.id === n && x.aktiv; }); }) : [];
    mitSperre_(function () {
      aktualisiereZeile_('Anfragen', 'id', a.id, function (z) {
        if (z.status !== 'offen') return z;
        z.eskaliertAn = nachbarn.join(','); z.eskaliertAm = txt_(jetzt_()); return z;
      });
      verlauf_(a.id, null, 'Nach ' + minuten + ' Min. nicht übernommen – ' + (nachbarn.length ? 'Nachbarregionen benachrichtigt' : 'Regionalleitung benachrichtigt'), '');
    });
    var a2 = anfrageHolen_(a.id);
    var dt = details_(a2);
    var text = (a2.dringlichkeit === 'akut' ? 'AKUT · ' : '') + (dt.adresse ? dt.adresse.ort : '') + ': ' + (dt.beschreibung || '');
    if (nachbarn.length) pushSenden_('sos', 'Hilfe gesucht: ' + a2.nummer, text, '#/anfragen/' + a2.id, null, regionsHelfer_(nachbarn));
    pushAnLeitung_([a2.region], 'Noch nicht übernommen: ' + a2.nummer, text, '#/anfragen/' + a2.id);
    anzahl++;
  });
  return anzahl;
}

function anonymisieren_() {
  var monate = Number(einstellungenLesen_().anonymMonate) || 12;
  var grenze = Date.now() - monate * 30.4 * 86400000;
  var ids = [];
  mitSperre_(function () {
    zeilen_('Anfragen').forEach(function (a) {
      if (String(a.anonymisiert) === 'true' || STATUS_ENDE.indexOf(a.status) < 0) return;
      var ende = new Date(zelle_(a.abgeschlossenAm) || zelle_(a.geaendert)).getTime();
      if (!(ende < grenze)) return;
      aktualisiereZeile_('Anfragen', 'id', a.id, function (r) {
        var d = details_(r);
        d.beschreibung = '[anonymisiert]';
        d.vorfall = '';
        d.hund = { rasse: (d.hund || {}).rasse || '', groesse: (d.hund || {}).groesse || '', alter: (d.hund || {}).alter || '' };
        d.adresse = { plz: (d.adresse || {}).plz || '', ort: (d.adresse || {}).ort || '' };
        d.auftraggeber = { organisation: (d.auftraggeber || {}).organisation || '' };
        fotosLoeschen_(d.fotos);
        d.fotos = [];
        r.json = JSON.stringify(d);
        r.anonymisiert = 'true';
        return r;
      });
      ids.push(a.id);
    });
    if (ids.length) {
      // Notizen im Verlauf können Namen und Adressen enthalten
      var sh = blatt_('Verlauf');
      var werte = sh.getDataRange().getValues();
      var kopf = werte[0], iA = kopf.indexOf('anfrageId'), iN = kopf.indexOf('notiz');
      for (var i = 1; i < werte.length; i++) {
        if (ids.indexOf(String(werte[i][iA])) >= 0 && werte[i][iN]) sh.getRange(i + 1, iN + 1).setValue('');
      }
    }
    loescheZeilen_('Protokoll', function (r) { return new Date(r.zeit).getTime() < grenze; });
  });
  return ids.length;
}

function protokollListe_(d) {
  var alle = zeilen_('Protokoll').map(function (r) {
    return { zeit: zelle_(r.zeit), name: r.name, aktion: r.aktion, anfrageId: r.anfrageId };
  });
  if (d.anfrageId) alle = alle.filter(function (r) { return r.anfrageId === d.anfrageId; });
  return alle.reverse().slice(0, 500);
}

// =====================================================================
// Push-Nachrichten (Firebase Cloud Messaging, HTTP v1)
// =====================================================================

/** Aktive, verfügbare Helfer (Mitglieder, Regionalleiter, Admins) in den Regionen */
function regionsHelfer_(regionen) {
  return zeilen_('Mitglieder').filter(function (m) {
    return String(m.aktiv) === 'true' && String(m.verfuegbar) !== 'false' && m.rolle !== 'behoerde' && schnitt_(liste_(m.regionen), regionen);
  }).map(function (m) { return m.id; });
}

/** Regionalleiter der Regionen und alle Admins */
function leitung_(regionen) {
  return zeilen_('Mitglieder').filter(function (m) {
    if (String(m.aktiv) !== 'true') return false;
    return m.rolle === 'admin' || (m.rolle === 'regionalleiter' && schnitt_(liste_(m.regionen), regionen));
  }).map(function (m) { return m.id; });
}

function pushAnLeitung_(regionen, titel, text, pfad, ausser) {
  return pushSenden_('verwaltung', titel, text, pfad, ausser, leitung_(regionen));
}

/**
 * Push zu einer Anfrage an die Helfer der Region (und eskalierter Nachbarregionen).
 * art: neu | wieder | uebernommen. Gibt die Zahl der benachrichtigten Personen zurück.
 */
function sosPush_(a, art, ausser) {
  var dt = details_(a);
  var regionen = [a.region].concat(liste_(a.eskaliertAn)).filter(Boolean);
  var empfaenger = regionsHelfer_(regionen).filter(function (id) { return id !== ausser; });
  var ort = dt.adresse ? dt.adresse.plz + ' ' + dt.adresse.ort : '';
  var pfad = '#/anfragen/' + a.id;
  if (art === 'uebernommen') {
    var mit = empfaenger.concat([a.erstelltVon]).filter(function (x) { return x && x !== ausser; });
    pushSenden_('uebernahme', 'Übernommen: ' + a.nummer, a.uebernommenName + ' kümmert sich · ' + ort, pfad, null, mit);
    return mit.length;
  }
  var titel = (a.dringlichkeit === 'akut' ? '🚨 AKUT: ' : a.dringlichkeit === 'dringend' ? 'Dringend: ' : 'SOS: ') + ort;
  var text = (art === 'wieder' ? 'Wieder offen – ' : '') + (dt.beschreibung || '') + (dt.hund && dt.hund.rasse ? ' · ' + dt.hund.rasse : '');
  pushSenden_('sos', titel, text, pfad, null, empfaenger);
  return empfaenger.length;
}

function pushAbo_(d, s) {
  if (!d.fcmToken) throw fehler_('Kein Push-Token', 400);
  var einst = JSON.stringify(d.einstellungen || {});
  mitSperre_(function () {
    var gef = aktualisiereZeile_('PushAbos', 'fcmToken', d.fcmToken, function (r) { r.mitgliedId = s.mitgliedId; r.einstellungen = einst; return r; });
    if (!gef) zeileAnhaengen_('PushAbos', [d.fcmToken, s.mitgliedId, einst, txt_(jetzt_())]);
  });
  return true;
}

function pushTest_(d, s) {
  if (!prop_('FCM_SERVICE_ACCOUNT')) throw fehler_('Push ist im Backend nicht eingerichtet', 400);
  return { gesendet: pushSenden_('test', 'SOS Hund – Test', 'Push-Nachrichten funktionieren auf diesem Gerät.', '#/konto', null, s.mitgliedId) };
}

function pushAboLoeschen_(d) {
  if (d.fcmToken) mitSperre_(function () { loescheZeilen_('PushAbos', function (r) { return r.fcmToken === d.fcmToken; }); });
  return true;
}

/** Mitteilung an alle oder an Regionen (Regionalleiter nur an eigene Regionen) */
function mitteilungSenden_(d, s) {
  var titel = String(d.titel || '').trim();
  if (!titel) throw fehler_('Titel fehlt', 400);
  var regionen = (d.regionen || []).filter(Boolean);
  if (s.rolle !== 'admin') {
    if (!regionen.length) regionen = s.regionen.slice();
    if (regionen.some(function (r) { return s.regionen.indexOf(r) < 0; })) throw fehler_('Nur an eigene Regionen', 403);
  }
  var nur = regionen.length
    ? zeilen_('Mitglieder').filter(function (m) { return String(m.aktiv) === 'true' && schnitt_(liste_(m.regionen), regionen); }).map(function (m) { return m.id; })
    : null;
  return { gesendet: pushSenden_('mitteilungen', titel, String(d.text || ''), '#/', null, nur), empfaenger: nur ? nur.length : -1 };
}

/**
 * Sendet eine Push-Nachricht an alle Abos, die den Anlass eingeschaltet haben.
 * ausser: Mitglied-ID, die nichts bekommt; nur: Mitglied-ID oder Liste von IDs.
 */
function pushSenden_(anlass, titel, text, pfad, ausser, nur) {
  var sa = prop_('FCM_SERVICE_ACCOUNT');
  if (!sa) return 0;
  if (Array.isArray(nur) && !nur.length) return 0;
  var konto = JSON.parse(sa);
  var zugriff = fcmZugriffstoken_(konto);
  var appUrl = prop_('APP_URL') || '';
  var ungueltig = [];
  var gesendet = 0;
  zeilen_('PushAbos').forEach(function (r) {
    if (ausser && r.mitgliedId === ausser) return;
    if (nur && (Array.isArray(nur) ? nur.indexOf(r.mitgliedId) < 0 : r.mitgliedId !== nur)) return;
    var e = {};
    try { e = JSON.parse(r.einstellungen || '{}'); } catch (x) { /* leer */ }
    if (e[anlass] === false) return;
    var dringend = anlass === 'sos' || anlass === 'mitteilungen' || anlass === 'test' || anlass === 'verwaltung';
    var nachricht = {
      message: {
        token: r.fcmToken,
        data: { titel: titel, text: text, url: appUrl + pfad, anlass: anlass },
        webpush: {
          headers: { Urgency: dringend ? 'high' : 'normal', TTL: anlass === 'sos' ? '7200' : '86400' },
          notification: { title: titel, body: text },
        },
      },
    };
    if (/^https:\/\//.test(appUrl)) nachricht.message.webpush.fcm_options = { link: appUrl + pfad };
    var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + konto.project_id + '/messages:send', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + zugriff },
      payload: JSON.stringify(nachricht),
      muteHttpExceptions: true,
    });
    var code = res.getResponseCode();
    if (code === 200) gesendet++;
    else if (code === 404 || (code === 400 && /registration token|UNREGISTERED/i.test(res.getContentText()))) ungueltig.push(r.fcmToken);
    else console.warn('FCM ' + code + ': ' + res.getContentText().slice(0, 200));
  });
  if (ungueltig.length) loescheZeilen_('PushAbos', function (r) { return ungueltig.indexOf(r.fcmToken) >= 0; });
  return gesendet;
}

function fcmZugriffstoken_(konto) {
  var cache = CacheService.getScriptCache();
  var c = cache.get('fcm_token');
  if (c) return c;
  var jetzt = Math.floor(Date.now() / 1000);
  var b64 = function (o) { return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, ''); };
  var kopf = b64({ alg: 'RS256', typ: 'JWT' });
  var inhalt = b64({
    iss: konto.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: jetzt,
    exp: jetzt + 3600,
  });
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(kopf + '.' + inhalt, konto.private_key)).replace(/=+$/, '');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: kopf + '.' + inhalt + '.' + sig },
  });
  var token = JSON.parse(res.getContentText()).access_token;
  cache.put('fcm_token', token, 3000);
  return token;
}

// =====================================================================
// Hilfsfunktionen: Tabelle (aus der MGI-App)
// =====================================================================

var _ss = null;
function blatt_(name) {
  if (!_ss) _ss = SpreadsheetApp.openById(prop_('SHEET_ID', true));
  var sh = _ss.getSheetByName(name);
  if (!sh && BLAETTER[name]) {
    sh = _ss.insertSheet(name);
    sh.appendRow(BLAETTER[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, BLAETTER[name].length).setFontWeight('bold');
  }
  if (!sh) throw new Error('Tabellenblatt "' + name + '" fehlt – bitte setup() ausführen');
  spaltenErgaenzen_(sh, name);
  return sh;
}

var _spaltenGeprueft = {};
function spaltenErgaenzen_(sh, name) {
  if (_spaltenGeprueft[name] || !BLAETTER[name]) return;
  _spaltenGeprueft[name] = true;
  var breite = sh.getLastColumn();
  var kopf = breite ? sh.getRange(1, 1, 1, breite).getValues()[0].map(String) : [];
  BLAETTER[name].forEach(function (k) {
    if (kopf.indexOf(k) < 0) {
      kopf.push(k);
      sh.getRange(1, kopf.length).setValue(k);
      sh.getRange(1, kopf.length).setFontWeight('bold');
    }
  });
}

function zeileAnhaengen_(name, werte) {
  var sh = blatt_(name);
  var soll = BLAETTER[name];
  var breite = sh.getLastColumn();
  var kopf = breite ? sh.getRange(1, 1, 1, breite).getValues()[0].map(String) : soll;
  var zeile = kopf.map(function () { return ''; });
  soll.forEach(function (k, i) {
    var j = kopf.indexOf(k);
    if (j >= 0 && i < werte.length) zeile[j] = werte[i] === undefined || werte[i] === null ? '' : werte[i];
  });
  sh.appendRow(zeile);
}

function zeilen_(name) {
  var sh = blatt_(name);
  var werte = sh.getDataRange().getValues();
  var kopf = werte.shift() || BLAETTER[name];
  return werte.map(function (z) {
    var o = {};
    kopf.forEach(function (k, i) { o[k] = z[i] instanceof Date ? z[i] : z[i] === '' ? '' : String(z[i]); });
    return o;
  });
}

function aktualisiereZeile_(name, spalte, wert, fn) {
  var sh = blatt_(name);
  var werte = sh.getDataRange().getValues();
  var kopf = werte[0];
  var idx = kopf.indexOf(spalte);
  for (var i = 1; i < werte.length; i++) {
    if (String(werte[i][idx]) === String(wert)) {
      var o = {}, alt = {};
      kopf.forEach(function (k, j) { o[k] = werte[i][j]; alt[k] = werte[i][j]; });
      var neu = fn(o);
      kopf.forEach(function (k, j) {
        var v = neu[k] === undefined ? '' : neu[k];
        if (v !== alt[k]) sh.getRange(i + 1, j + 1).setValue(v);
      });
      return true;
    }
  }
  return false;
}

function loescheZeilen_(name, pruef) {
  var sh = blatt_(name);
  var werte = sh.getDataRange().getValues();
  var kopf = werte[0];
  for (var i = werte.length - 1; i >= 1; i--) {
    var o = {};
    kopf.forEach(function (k, j) { o[k] = werte[i][j] instanceof Date ? werte[i][j].toISOString() : String(werte[i][j]); });
    if (pruef(o)) sh.deleteRow(i + 1);
  }
}

var _sperreAktiv = false;
function mitSperre_(fn) {
  if (_sperreAktiv) return fn(); // verschachtelt: Sperre wird schon gehalten
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fehler_('Server ist gerade beschäftigt – bitte nochmal versuchen', 503);
  _sperreAktiv = true;
  try { return fn(); } finally { _sperreAktiv = false; lock.releaseLock(); }
}

// =====================================================================
// Sonstiges
// =====================================================================

function zelle_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === undefined || v === null ? '' : String(v);
}
function txt_(v) { return "'" + String(v === undefined || v === null ? '' : v); } // als Text speichern (keine Datums-Umwandlung)
function jetzt_() { return new Date().toISOString(); }

function prop_(name, pflicht) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (pflicht && !v) throw new Error('Script Property "' + name + '" fehlt – siehe README');
  return v;
}

function fehler_(msg, status) {
  var e = new Error(msg);
  e.status = status || 400;
  return e;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
