/**
 * Nachbildung der Google-Apps-Script-Dienste.
 * Wird für zwei Dinge benutzt:
 *   1. Demo-Modus der App: Das ECHTE Backend (apps-script/Code.gs) läuft im Browser,
 *      die Tabelle liegt im localStorage. Demo und Backend können so nie auseinanderlaufen.
 *   2. Ablauftests des Backends in Node (apps-script/test/backend.test.mjs).
 * Reines JavaScript ohne Abhängigkeiten, damit es in beiden Umgebungen läuft.
 */

// ------------------------------------------------------------------ SHA-256 (synchron)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 eines UTF-8-Texts, Ergebnis als Byte-Array (0–255) */
/** HMAC-SHA256 (für Utilities.computeHmacSha256Signature), liefert Bytes 0–255 */
export function hmacSha256(wert, schluessel) {
  let k = new TextEncoder().encode(String(schluessel));
  if (k.length > 64) k = Uint8Array.from(sha256(k));
  const block = new Uint8Array(64); block.set(k);
  const innen = Uint8Array.from(block, (b) => b ^ 0x36), aussen = Uint8Array.from(block, (b) => b ^ 0x5c);
  const msg = new TextEncoder().encode(String(wert));
  const h1 = sha256([...innen, ...msg]);
  return sha256([...aussen, ...h1]);
}

export function sha256(text) {
  const daten = typeof text === 'string' || typeof text === 'number' ? new TextEncoder().encode(String(text)) : Uint8Array.from(text);
  const laenge = daten.length;
  const bloecke = Math.ceil((laenge + 9) / 64);
  const m = new Uint8Array(bloecke * 64);
  m.set(daten);
  m[laenge] = 0x80;
  const bits = laenge * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(m.length - 4, bits >>> 0);
  dv.setUint32(m.length - 8, Math.floor(bits / 2 ** 32));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < bloecke; b++) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = [];
  for (const x of h) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}

function base64Bytes(text) {
  const t = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
  if (t.length % 4 !== 0) throw new Error('Ungültiges Base64');
  const out = [];
  for (let i = 0; i < t.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (t[i + k] === '=' ? 0 : B64.indexOf(t[i + k])));
    if (n.some((x) => x < 0)) throw new Error('Ungültiges Base64');
    const v = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    out.push((v >> 16) & 255);
    if (t[i + 2] !== '=') out.push((v >> 8) & 255);
    if (t[i + 3] !== '=') out.push(v & 255);
  }
  return out.map((b) => (b > 127 ? b - 256 : b));
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// ------------------------------------------------------------------ Tabelle
/** Tabellenblätter als einfache Zeilen-Arrays. zustand: { [blatt]: Zeile[] } */
export function neueTabelle(zustand = {}) {
  const ohneHochkomma = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  const blaetter = {};
  const sheet = (name) => {
    const rows = (zustand[name] = zustand[name] || []);
    return {
      name,
      rows,
      appendRow: (r) => rows.push(r.map(ohneHochkomma)),
      setFrozenRows: () => {},
      getLastColumn: () => Math.max(0, ...rows.map((r) => r.length)),
      getRange: (r, c, nr, nc) => ({
        getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map((z) => Array.from({ length: nc || 1 }, (_, i) => z[c - 1 + i] ?? '')),
        setFontWeight: () => {},
        setValue: (v) => {
          while (rows.length < r) rows.push([]);
          rows[r - 1][c - 1] = ohneHochkomma(v);
        },
      }),
      getDataRange: () => ({
        getValues: () => {
          const w = Math.max(0, ...rows.map((r) => r.length));
          return rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? ''));
        },
      }),
      getLastRow: () => rows.length,
      deleteRow: (i) => rows.splice(i - 1, 1),
    };
  };
  Object.keys(zustand).forEach((n) => (blaetter[n] = sheet(n)));
  return {
    getSheetByName: (n) => blaetter[n] || null,
    insertSheet: (n) => (blaetter[n] = sheet(n)),
    blaetter,
    zustand,
  };
}

// ------------------------------------------------------------------ Dienste
/**
 * Erzeugt die globalen Apps-Script-Objekte.
 * optionen: { tabelle, props, geocoder(text) -> {lat,lon}|null, mails: [], pushes: [], dateien: {} }
 * dateien = Ablage der „Drive“-Dateien: { [id]: { name, mime, data (Base64), ordner, papierkorb } }
 */
export function gasDienste({ tabelle, props = {}, geocoder, mails = [], pushes = [], dateien = {}, cache = {} }) {
  const blob = (bytes, mime, name) => ({
    getBytes: () => bytes, getContentType: () => mime, getName: () => name,
  });
  /** Nachbildung der Drive-API v3 (erweiterter Dienst „Drive“) */
  const ordnerListe = {};
  const neueId = () => 'f' + uuid().slice(0, 12);
  const Drive = {
    Files: {
      create: (meta, b) => {
        const id = neueId();
        if (b) dateien[id] = { name: meta.name, mime: b.getContentType(), data: base64(b.getBytes().map((x) => (x + 256) % 256)), ordner: (meta.parents || [])[0] };
        else ordnerListe[id] = { name: meta.name };
        return { id };
      },
      get: (id) => {
        const f = dateien[id] || ordnerListe[id];
        if (!f) throw new Error('File not found: ' + id);
        return { id, trashed: !!f.papierkorb };
      },
      update: (meta, id) => {
        const f = dateien[id];
        if (!f) throw new Error('File not found: ' + id);
        if ('trashed' in meta) f.papierkorb = !!meta.trashed;
        return { id };
      },
    },
  };
  const DRIVE_MEDIA = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media$/;
  return {
    console,
    SpreadsheetApp: { openById: () => tabelle, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
    CacheService: {
      getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => (cache[k] = String(v)), remove: (k) => delete cache[k] }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: {
      getOAuthToken: () => 'token',
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => {
        const kette = { timeBased: () => kette, atHour: () => kette, everyDays: () => kette, everyHours: () => kette, everyMinutes: () => kette, inTimezone: () => kette, create: () => {} };
        return kette;
      },
    },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Utilities: {
      getUuid: uuid,
      computeDigest: (_alg, s) => sha256(s).map((b) => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (wert, schluessel) => hmacSha256(wert, schluessel).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (b) => base64(b.map((x) => (x + 256) % 256)),
      base64Decode: (t) => base64Bytes(t),
      newBlob: (bytes, mime, name) => blob(bytes, mime, name),
      base64EncodeWebSafe: (s) => base64([...new TextEncoder().encode(String(s))]).replace(/\+/g, '-').replace(/\//g, '_'),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
    },
    Maps: {
      newGeocoder: () => {
        const g = {
          setRegion: () => g,
          setLanguage: () => g,
          geocode: (text) => {
            const p = geocoder ? geocoder(text) : null;
            return p ? { status: 'OK', results: [{ geometry: { location: { lat: p.lat, lng: p.lon } } }] } : { status: 'ZERO_RESULTS', results: [] };
          },
        };
        return g;
      },
    },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Drive,
    UrlFetchApp: {
      fetch: (url, o) => {
        const m = DRIVE_MEDIA.exec(url);
        if (m) {
          const f = dateien[decodeURIComponent(m[1])];
          const ok = f && !f.papierkorb;
          return { getResponseCode: () => (ok ? 200 : 404), getBlob: () => blob(base64Bytes(f.data), f.mime, f.name) };
        }
        pushes.push({ url, o });
        return { getResponseCode: () => 200, getContentText: () => '{"access_token":"x"}' };
      },
    },
  };
}

/** Namen, die das Backend nach außen gibt (Aktionen + Trigger + Hilfsfunktionen für Tests/Demo) */
const EXPORTE = ['doPost', 'setup', 'taeglich', 'alleFuenfMinuten', 'eskalieren_', 'anonymisieren_', 'mitgliedSchreiben_',
  'regionSpeichern_', 'regionFuerPlz_', 'zeilen_', 'aktualisiereZeile_', 'zeileAnhaengen_', 'regionenNachPlzAnlegen_', 'BLAETTER'];

/**
 * Lädt den Text von Code.gs mit den nachgebildeten Diensten.
 * Gibt { aufruf(aktion, daten, token), intern } zurück.
 */
export function backendLaden(code, dienste) {
  const namen = Object.keys(dienste);
  // eslint-disable-next-line no-new-func
  const fabrik = new Function(...namen, `${code}\n;return {${EXPORTE.map((n) => `${n}: ${n}`).join(', ')}};`);
  const intern = fabrik(...namen.map((n) => dienste[n]));
  const aufruf = (aktion, daten = {}, token) => {
    const text = intern.doPost({ postData: { contents: JSON.stringify({ aktion, token, daten }) } });
    return JSON.parse(text);
  };
  return { aufruf, intern };
}
