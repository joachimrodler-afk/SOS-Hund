import { beforeAll, describe, expect, it } from 'vitest';

// localStorage für Node nachbilden
beforeAll(() => {
  const speicher: Record<string, string> = {};
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => speicher[k] ?? null,
    setItem: (k: string, v: string) => { speicher[k] = v; },
    removeItem: (k: string) => { delete speicher[k]; },
    clear: () => {},
    key: () => null,
    length: 0,
  };
});

type Antwort<T> = { ok: boolean; daten?: T; fehler?: string };

async function aufruf<T>(aktion: string, daten: Record<string, unknown> = {}, token?: string): Promise<T> {
  const { demoAufruf } = await import('./demo');
  const r = (await demoAufruf<T>(aktion, daten, token)) as Antwort<T>;
  if (!r.ok) throw new Error(r.fehler);
  return r.daten as T;
}

describe('Demo-Modus (echtes Backend im Browser)', () => {
  it('legt Beispieldaten an und alle Demo-Zugänge können sich anmelden', async () => {
    const { DEMO_ZUGAENGE } = await import('./demo');
    for (const z of DEMO_ZUGAENGE) {
      const s = await aufruf<{ token: string; name: string }>('login', { name: z.name, pin: z.pin });
      expect(s.name).toBe(z.name);
    }
  });

  it('zeigt jeder Rolle die passenden Anfragen', async () => {
    const login = (name: string, pin: string) => aufruf<{ token: string }>('login', { name, pin }).then((s) => s.token);
    const rita = await login('Rita Regional', '222222');
    const max = await login('Max Muster', '111111');
    const ritaListe = await aufruf<{ status: string }[]>('anfragen_liste', { filter: 'alle' }, rita);
    const maxListe = await aufruf<{ status: string }[]>('anfragen_liste', { filter: 'alle' }, max);
    expect(ritaListe.some((a) => a.status === 'ungeprueft')).toBe(true);
    expect(maxListe.some((a) => a.status === 'ungeprueft')).toBe(false);
    expect(maxListe.length).toBe(ritaListe.length - 1);
    expect(await aufruf<unknown[]>('registrierungen_liste', {}, rita)).toHaveLength(1);
  });

  it('verhindert eine doppelte Übernahme', async () => {
    const login = (name: string, pin: string) => aufruf<{ token: string }>('login', { name, pin }).then((s) => s.token);
    const max = await login('Max Muster', '111111');
    const mia = await login('Mia Helfer', '333333');
    const offen = (await aufruf<{ id: string; status: string }[]>('anfragen_liste', {}, max)).find((a) => a.status === 'offen')!;
    await aufruf('anfrage_uebernehmen', { id: offen.id }, max);
    await expect(aufruf('anfrage_uebernehmen', { id: offen.id }, mia)).rejects.toThrow(/Max Muster/);
  });
});
