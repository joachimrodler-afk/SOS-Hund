/**
 * Verbindung zum Apps-Script-Backend.
 * Ohne konfigurierte apiUrl läuft die App im Demo-Modus (siehe demo.ts):
 * dann läuft dasselbe Backend (Code.gs) im Browser.
 */
import { config, istDemo, SPEICHER } from '../config';
import type { Sitzung } from './model';

const SITZUNG_KEY = SPEICHER + 'sitzung';

export class ApiFehler extends Error {
  constructor(msg: string, public status = 500) {
    super(msg);
  }
}

/** Anmeldung im Arbeitsspeicher – falls der Gerätespeicher voll oder gesperrt ist, gilt sie bis zum Neuladen */
let sitzungImSpeicher: Sitzung | null = null;

/** Gerätespeicher voll? Dann zuerst den Zwischenspeicher (Offline-Kopien) leeren und noch einmal versuchen */
export function sicherSchreiben(key: string, wert: string) {
  try {
    localStorage.setItem(key, wert);
    return true;
  } catch {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(SPEICHER + 'cache.')).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, wert);
      return true;
    } catch {
      return false;
    }
  }
}

export function ladeSitzung(): Sitzung | null {
  if (sitzungImSpeicher) return sitzungImSpeicher;
  try {
    const s = JSON.parse(localStorage.getItem(SITZUNG_KEY) || 'null') as Sitzung | null;
    // Anmeldungen laufen nicht ab – nur Abmelden, neuer PIN oder Deaktivieren beenden sie
    if (s && s.token) return s;
  } catch {
    /* kein Speicher verfügbar */
  }
  return null;
}

export function speichereSitzung(s: Sitzung | null) {
  sitzungImSpeicher = null;
  if (s) {
    if (!sicherSchreiben(SITZUNG_KEY, JSON.stringify(s))) sitzungImSpeicher = s;
  } else {
    try { localStorage.removeItem(SITZUNG_KEY); } catch { /* ignorieren */ }
  }
  window.dispatchEvent(new Event('sos-sitzung'));
}

/** Ruft eine Aktion im Backend auf. */
export async function api<T = unknown>(aktion: string, daten: Record<string, unknown> = {}): Promise<T> {
  const token = ladeSitzung()?.token;
  let json: { ok: boolean; daten?: T; fehler?: string; status?: number };
  if (istDemo) {
    const { demoAufruf } = await import('./demo');
    json = await demoAufruf<T>(aktion, daten, token);
  } else {
    json = await netz<T>(aktion, daten, token);
  }
  if (!json.ok) {
    if (json.status === 401 && token) speichereSitzung(null);
    throw new ApiFehler(json.fehler || 'Fehler', json.status);
  }
  return json.daten as T;
}

async function netz<T>(aktion: string, daten: Record<string, unknown>, token?: string) {
  let res: Response;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      // text/plain verhindert den CORS-Preflight, den Apps Script nicht beantwortet
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ aktion, token, daten }),
    });
  } catch {
    throw new ApiFehler('Keine Verbindung – bist du online?', 0);
  }
  try {
    return (await res.json()) as { ok: boolean; daten?: T; fehler?: string; status?: number };
  } catch {
    throw new ApiFehler('Unerwartete Antwort vom Server', res.status);
  }
}

/** Einfacher Speicher für „letzter bekannter Wert“ (Offline-Anzeige) */
export function merke<T>(key: string, wert: T) {
  try {
    localStorage.setItem(SPEICHER + 'cache.' + key, JSON.stringify(wert));
  } catch {
    /* ignorieren */
  }
}
export function erinnere<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(SPEICHER + 'cache.' + key) || 'null');
  } catch {
    return null;
  }
}
