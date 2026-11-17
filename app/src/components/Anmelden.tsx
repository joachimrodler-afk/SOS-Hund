import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, speichereSitzung } from '../lib/api';
import type { Rolle, Sitzung } from '../lib/model';
import { useSitzung } from '../lib/sitzung';
import { istDemo } from '../config';
import { Feld, Hinweis, Knopf } from './ui';
import { Icon } from './Icon';

function DemoZugaenge({ waehle }: { waehle: (name: string, pin: string) => void }) {
  const zugaenge = [
    ['Demo Admin', '123456', 'Admin'],
    ['Rita Regional', '222222', 'Regionalleiterin'],
    ['Max Muster', '111111', 'Mitglied'],
    ['Vera Veterinär', '444444', 'Behörde'],
  ];
  return (
    <Hinweis>
      <p className="mb-2 font-semibold">Demo – zum Ausprobieren antippen:</p>
      <div className="grid grid-cols-2 gap-2">
        {zugaenge.map(([n, p, r]) => (
          <button key={n} type="button" onClick={() => waehle(n, p)} className="rounded-lg bg-white/70 px-2 py-1.5 text-left text-xs dark:bg-slate-800">
            <b className="block">{n}</b>{r} · PIN {p}
          </button>
        ))}
      </div>
    </Hinweis>
  );
}

export function LoginFormular({ text }: { text?: string }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);

  async function anmelden(n: string, p: string) {
    setLaedt(true);
    setFehler('');
    try {
      const s = await api<Sitzung>('login', { name: n, pin: p });
      speichereSitzung(s);
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void anmelden(name, pin); }} className="karte space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-himmel-100 text-himmel-700 dark:bg-slate-800">
          <Icon name="schloss" />
        </span>
        <div>
          <h2 className="font-bold">Anmelden</h2>
          <p className="text-sm text-slate-500">{text ?? 'Einmal mit Namen und persönlichem PIN – danach bleibst du auf diesem Gerät angemeldet.'}</p>
        </div>
      </div>
      <Feld label="Vor- und Nachname">
        <input className="eingabe" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required placeholder="z. B. Max Muster" />
      </Feld>
      <Feld label="PIN">
        <input className="eingabe tracking-[0.4em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
          type="password" autoComplete="current-password" required maxLength={8} placeholder="••••••" />
      </Feld>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      {istDemo && <DemoZugaenge waehle={(n, p) => { setName(n); setPin(p); void anmelden(n, p); }} />}
      <Knopf type="submit" laedt={laedt} className="w-full">Anmelden</Knopf>
      <div className="border-t border-himmel-100 pt-3 text-center dark:border-slate-700">
        <p className="text-sm text-slate-500">Zugang nur auf Einladung.</p>
        <Link to="/einladung" className="mt-1 inline-flex min-h-11 items-center font-semibold text-sos-rot">Ich habe einen Einladungscode</Link>
      </div>
      <p className="text-center text-xs text-slate-500">PIN vergessen? Bitte bei deiner Regionalleitung melden – sie kann ihn zurücksetzen.</p>
    </form>
  );
}

/**
 * Zeigt den Inhalt nur angemeldeten Zugängen, optional nur bestimmten Rollen.
 */
export function NurAngemeldet({ children, rollen, text }: { children: ReactNode; rollen?: Rolle[]; text?: string }) {
  const s = useSitzung();
  if (!s) return <LoginFormular text={text} />;
  if (rollen && !rollen.includes(s.rolle)) return <Hinweis art="warnung">Dieser Bereich ist für deine Rolle nicht freigegeben.</Hinweis>;
  return <>{children}</>;
}
