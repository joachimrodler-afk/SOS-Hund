/* Typen für die Apps-Script-Nachbildung (gasMock.js) */
type Zeile = Record<string, unknown>;
export function sha256(text: string): number[];
export function neueTabelle(zustand?: Record<string, unknown[][]>): unknown;
export function gasDienste(o: {
  tabelle: unknown;
  props?: Record<string, string>;
  geocoder?: (text: string) => { lat: number; lon: number } | null;
  mails?: unknown[];
  pushes?: unknown[];
  dateien?: Record<string, { name: string; mime: string; data: string; ordner: string; papierkorb?: boolean }>;
}): Record<string, unknown>;
export function backendLaden(
  code: string,
  dienste: Record<string, unknown>,
): {
  aufruf: (aktion: string, daten?: Record<string, unknown>, token?: string) => { ok: boolean; daten?: unknown; fehler?: string; status?: number };
  intern: {
    setup: () => void;
    alleFuenfMinuten: () => void;
    mitgliedSchreiben_: (m: Zeile, pin: string) => string;
    aktualisiereZeile_: (blatt: string, spalte: string, wert: string, fn: (r: Zeile) => Zeile) => boolean;
    [k: string]: unknown;
  };
};
