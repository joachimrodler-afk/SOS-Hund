import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { TelLink } from '../../components/Anfrage';
import { Icon } from '../../components/Icon';
import { Fehler, Feld, Hinweis, Knopf, Laden, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';
import { datumKurz, klassen } from '../../lib/helfer';
import { ROLLEN_NAME, type Mitglied, type Rolle } from '../../lib/model';
import { regionenNamen, useRegionen } from '../../lib/regionen';
import { useSitzung } from '../../lib/sitzung';
import { PinAnzeige } from './Zugaenge';

const ROLLEN: Rolle[] = ['mitglied', 'regionalleiter', 'behoerde', 'admin'];

function Eintrag({ m, neu, onPin }: { m: Mitglied; neu: () => void; onPin: (p: { name: string; pin: string; telefon: string; email: string }) => void }) {
  const s = useSitzung()!;
  const alle = useRegionen();
  const admin = s.rolle === 'admin';
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const ich = m.id === s.mitgliedId;
  const darf = admin || (!ich && (m.rolle === 'mitglied' || m.rolle === 'behoerde'));
  const waehlbar = admin ? alle : alle.filter((r) => s.regionen.includes(r.id));

  async function aendern(d: Partial<Mitglied>) {
    setArbeitet(true); setFehler('');
    try { await api('mitglied_aendern', { id: m.id, ...d }); neu(); } catch (e) { setFehler((e as Error).message); } finally { setArbeitet(false); }
  }
  async function pin() {
    if (!confirm(`Neuen PIN für ${m.vorname} ${m.nachname} erzeugen? Der alte PIN gilt dann nicht mehr und alle Geräte werden abgemeldet.`)) return;
    try {
      const r = await api<{ pin: string; telefon: string; email: string }>('pin_zuruecksetzen', { id: m.id });
      onPin({ name: `${m.vorname} ${m.nachname}`, ...r });
      neu();
    } catch (e) { setFehler((e as Error).message); }
  }
  async function loeschen() {
    if (!confirm(`${m.vorname} ${m.nachname} endgültig löschen?`)) return;
    try { await api('mitglied_loeschen', { id: m.id }); neu(); } catch (e) { setFehler((e as Error).message); }
  }

  return (
    <div className={klassen('px-4 py-3', !m.aktiv && 'opacity-60')}>
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span className="flex-1">
          <span className="block font-semibold">{m.vorname} {m.nachname}{ich && ' (du)'}</span>
          <span className="block text-xs text-slate-500">
            {ROLLEN_NAME[m.rolle]}{m.organisation && ` · ${m.organisation}`} · {regionenNamen(m.regionen, alle) || 'keine Region'}
            {!m.aktiv && ' · deaktiviert'}{m.aktiv && m.rolle !== 'behoerde' && !m.verfuegbar && ' · nicht verfügbar'}{!m.angemeldet && ' · noch nie angemeldet'}
          </span>
        </span>
        <Icon name={offen ? 'x' : 'rechts'} className="h-5 w-5 text-slate-400" />
      </button>
      {offen && (
        <div className="mt-3 space-y-3 rounded-xl bg-himmel-50 p-3 text-sm dark:bg-slate-800">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <TelLink nummer={m.telefon} />
            {m.email && <a href={`mailto:${m.email}`} className="underline">{m.email}</a>}
            {m.letzteAnmeldung && <span className="text-slate-500">zuletzt angemeldet {datumKurz(m.letzteAnmeldung)}</span>}
          </div>
          {(m.profil.fahrzeug || m.profil.box || m.profil.fanggeraet || m.profil.qualifikation) && (
            <p>{[m.profil.fahrzeug && 'Fahrzeug', m.profil.box && 'Transportbox', m.profil.fanggeraet && 'Fanggeräte'].filter(Boolean).join(', ')}{m.profil.qualifikation && <> · {m.profil.qualifikation}</>}</p>
          )}
          {darf && (
            <>
              {admin && !ich && (
                <Feld label="Rolle">
                  <select className="eingabe" value={m.rolle} disabled={arbeitet} onChange={(e) => aendern({ rolle: e.target.value as Rolle })}>
                    {ROLLEN.map((r) => <option key={r} value={r}>{ROLLEN_NAME[r]}</option>)}
                  </select>
                </Feld>
              )}
              <Feld label="Regionen">
                <div className="flex flex-wrap gap-2">
                  {waehlbar.map((r) => {
                    const an = m.regionen.includes(r.id);
                    return (
                      <button type="button" key={r.id} disabled={arbeitet} aria-pressed={an}
                        onClick={() => aendern({ regionen: an ? m.regionen.filter((x) => x !== r.id) : [...m.regionen, r.id] })}
                        className={klassen('min-h-9 rounded-full px-3 text-xs font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'bg-white ring-himmel-300 dark:bg-slate-900')}>{r.name}</button>
                    );
                  })}
                </div>
              </Feld>
              {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
              <div className="flex flex-wrap gap-2">
                {!ich && <Knopf art="sekundaer" onClick={pin}><Icon name="schloss" className="h-4 w-4" /> Neuer PIN</Knopf>}
                {!ich && <Knopf art={m.aktiv ? 'gefahr' : 'sekundaer'} laedt={arbeitet} onClick={() => aendern({ aktiv: !m.aktiv })}>{m.aktiv ? 'Deaktivieren' : 'Aktivieren'}</Knopf>}
                {admin && !m.aktiv && !ich && <Knopf art="gefahr" onClick={loeschen}><Icon name="muell" className="h-4 w-4" /> Löschen</Knopf>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Anlegen({ fertig }: { fertig: (p: { name: string; pin: string; telefon: string; email: string }) => void }) {
  const alle = useRegionen();
  const [offen, setOffen] = useState(false);
  const [d, setD] = useState({ vorname: '', nachname: '', telefon: '', email: '', organisation: '', rolle: 'mitglied' as Rolle, regionen: [] as string[] });
  const [fehler, setFehler] = useState('');
  if (!offen) return <Knopf art="sekundaer" className="w-full" onClick={() => setOffen(true)}><Icon name="plus" className="h-5 w-5" /> Zugang direkt anlegen</Knopf>;
  async function los(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ pin: string }>('mitglied_anlegen', d);
      fertig({ name: `${d.vorname} ${d.nachname}`, pin: r.pin, telefon: d.telefon, email: d.email });
      setOffen(false);
    } catch (err) { setFehler((err as Error).message); }
  }
  return (
    <form onSubmit={los} className="karte space-y-3 p-4">
      <h2 className="font-bold">Zugang anlegen</h2>
      <div className="grid grid-cols-2 gap-3">
        <Feld label="Vorname"><input className="eingabe" required value={d.vorname} onChange={(e) => setD({ ...d, vorname: e.target.value })} /></Feld>
        <Feld label="Nachname"><input className="eingabe" required value={d.nachname} onChange={(e) => setD({ ...d, nachname: e.target.value })} /></Feld>
        <Feld label="Telefon"><input className="eingabe" type="tel" value={d.telefon} onChange={(e) => setD({ ...d, telefon: e.target.value })} /></Feld>
        <Feld label="E-Mail"><input className="eingabe" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></Feld>
        <Feld label="Rolle">
          <select className="eingabe" value={d.rolle} onChange={(e) => setD({ ...d, rolle: e.target.value as Rolle })}>{ROLLEN.map((r) => <option key={r} value={r}>{ROLLEN_NAME[r]}</option>)}</select>
        </Feld>
        {d.rolle === 'behoerde' && <Feld label="Behörde"><input className="eingabe" value={d.organisation} onChange={(e) => setD({ ...d, organisation: e.target.value })} /></Feld>}
      </div>
      <Feld label="Regionen">
        <div className="flex flex-wrap gap-2">
          {alle.map((r) => {
            const an = d.regionen.includes(r.id);
            return <button type="button" key={r.id} onClick={() => setD({ ...d, regionen: an ? d.regionen.filter((x) => x !== r.id) : [...d.regionen, r.id] })}
              className={klassen('min-h-9 rounded-full px-3 text-xs font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'ring-himmel-300')}>{r.name}</button>;
          })}
        </div>
      </Feld>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <div className="flex gap-2">
        <Knopf type="button" art="sekundaer" className="flex-1" onClick={() => setOffen(false)}>Abbrechen</Knopf>
        <Knopf type="submit" className="flex-1">Anlegen</Knopf>
      </div>
    </form>
  );
}

function Inhalt() {
  const s = useSitzung()!;
  const { daten, fehler, laedt, neu } = useLaden(() => api<Mitglied[]>('mitglieder_liste'));
  const [pin, setPin] = useState<{ name: string; pin: string; telefon: string; email: string } | null>(null);
  const [suche, setSuche] = useState('');
  const [rolle, setRolle] = useState<Rolle | ''>('');
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  const liste = (daten ?? []).filter((m) => (!rolle || m.rolle === rolle) && `${m.vorname} ${m.nachname} ${m.organisation}`.toLowerCase().includes(suche.toLowerCase()));
  return (
    <div className="space-y-3">
      {pin && <PinAnzeige {...pin} schliessen={() => setPin(null)} />}
      {s.rolle === 'admin' && <Anlegen fertig={(p) => { setPin(p); void neu(); }} />}
      <div className="flex gap-2">
        <input className="eingabe" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select className="eingabe w-40" value={rolle} onChange={(e) => setRolle(e.target.value as Rolle | '')}>
          <option value="">alle Rollen</option>
          {ROLLEN.map((r) => <option key={r} value={r}>{ROLLEN_NAME[r]}</option>)}
        </select>
      </div>
      <p className="text-sm text-slate-500">{liste.length} Zugänge · {liste.filter((m) => m.aktiv && m.rolle !== 'behoerde' && m.verfuegbar).length} einsatzbereit</p>
      <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        {liste.map((m) => <Eintrag key={m.id} m={m} neu={() => void neu()} onPin={setPin} />)}
      </div>
    </div>
  );
}

export default function Mitglieder() {
  return (
    <Seite titel="Zugänge">
      <NurAngemeldet rollen={['regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
