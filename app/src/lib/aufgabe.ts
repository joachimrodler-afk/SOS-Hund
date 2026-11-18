/**
 * Rechenaufgabe des Meldeformulars (Prinzip wie ALTCHA): Das Backend stellt eine signierte Aufgabe,
 * der Browser sucht die Zahl n mit sha256(salt + n) = challenge. Für ein Handy dauert das etwa eine
 * Sekunde und läuft im Hintergrund, während das Formular ausgefüllt wird.
 */
import { api } from './api';
import { sha256 } from './gasMock.js';

export interface Aufgabe {
  algorithm: string;
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}
export type GeloesteAufgabe = Aufgabe & { number: number };

const hex = (b: ArrayBuffer | number[]) => Array.from(b instanceof ArrayBuffer ? new Uint8Array(b) : b, (x) => x.toString(16).padStart(2, '0')).join('');

async function loesen(a: Aufgabe): Promise<GeloesteAufgabe> {
  const enc = new TextEncoder();
  const subtle = globalThis.crypto?.subtle;
  for (let n = 0; n <= a.maxnumber; n++) {
    const h = subtle ? hex(await subtle.digest('SHA-256', enc.encode(a.salt + n))) : hex(sha256(a.salt + n));
    if (h === a.challenge) return { ...a, number: n };
    if (!subtle && n % 2000 === 0) await new Promise((r) => setTimeout(r)); // Oberfläche nicht blockieren
  }
  throw new Error('Sicherheitsprüfung fehlgeschlagen – bitte die Seite neu laden');
}

/** Holt eine Aufgabe und löst sie; das Ergebnis wird beim Absenden mitgeschickt */
export function aufgabeStarten(): Promise<GeloesteAufgabe> {
  return api<Aufgabe>('melden_aufgabe').then(loesen);
}
