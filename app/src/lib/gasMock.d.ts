/* Typen für die Apps-Script-Nachbildung (gasMock.js) */
type Zeile = Record<string, unknown>;
export function sha256(text: string | ArrayLike<number>): number[];
export function hmacSha256(wert: string, schluessel: string): number[];
export function neueTabelle(zustand?: Record<string, unknown[][]>): unknown;
export function gasDienste(o: {
  tabelle: unknown;
  props?: Record<string, string>;
  geocoder?: (text: string) => { lat: number; lon: number } | null;
  mails?: unknown[];
  pushes?: unknown[];
  dateien?: Record<string, { name: string; mime: string; data: string; ordner: string; papierkorb?: boolean }>;
  cache?: Record<string, string>;
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
    zeileAnhaengen_: (blatt: string, werte: unknown[]) => void;
    regionenNachPlzAnlegen_: () => { neu: number; vorhanden: number; gesamt: number };
    aktualisiereZeile_: (blatt: string, spalte: string, wert: string, fn: (r: Zeile) => Zeile) => boolean;
    [k: string]: unknown;
  };
};
