import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { Icon } from '../../components/Icon';
import { Fehler, Feld, Hinweis, Knopf, Laden, Leer, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';
import { datumKurz, klassen } from '../../lib/helfer';
import { ROLLEN_NAME, type Einladung, type Registrierung, type Rolle } from '../../lib/model';
import { regionenNamen, useRegionen } from '../../lib/regionen';
import { useSitzung } from '../../lib/sitzung';

const appLink = () => `${location.origin}${location.pathname}`;
const waNummer = (t: string) => t.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^0/, '49');

/** Neuer PIN: einmal anzeigen und per WhatsApp, SMS oder E-Mail weitergeben (wie in der MGI-App) */
export function PinAnzeige({ name, pin, telefon, email, schliessen }: { name: string; pin: string; telefon?: string; email?: string; schliessen: () => void }) {
  const text =
    `Hallo ${name.split(' ')[0]}, hier ist dein Zugang zur App „SOS Hund“:\n\n` +
    `👉 ${appLink()}\n\n` +
    `Name: ${name}\nPIN: ${pin}\n\n` +
    `So geht's:\n` +
    `1. Link öffnen und die App auf den Startbildschirm legen\n` +
    `   – Android: Menü ⋮ → „App installieren“\n` +
    `   – iPhone: Teilen-Symbol → „Zum Home-Bildschirm“\n` +
    `2. App öffnen, oben aufs Schloss tippen, Name und PIN eingeben – du bleibst dann angemeldet.\n` +
    `3. Unter „Konto“ Push-Nachrichten einschalten und den PIN ändern.`;
  return (
    <div className="karte space-y-3 border-2 border-sonne p-4">
      <p className="font-bold">PIN für {name}</p>
      <p className="rounded-xl bg-himmel-50 py-3 text-center font-mono text-4xl font-extrabold tracking-[0.3em] dark:bg-slate-800">{pin}</p>
      <Hinweis art="warnung">Der PIN wird nur jetzt angezeigt und nirgends im Klartext gespeichert. Bitte direkt weitergeben.</Hinweis>
      <div className="grid grid-cols-3 gap-2">
        <a href={`https://wa.me/${telefon ? waNummer(telefon) : ''}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 font-semibold text-white">WhatsApp</a>
        <a href={`sms:${telefon ?? ''}?&body=${encodeURIComponent(text)}`} className="flex min-h-12 items-center justify-center rounded-xl bg-slate-600 font-semibold text-white">SMS</a>
        <a href={`mailto:${email ?? ''}?subject=${encodeURIComponent('Dein Zugang zu SOS Hund')}&body=${encodeURIComponent(text)}`} className="flex min-h-12 items-center justify-center rounded-xl bg-himmel-600 font-semibold text-white">E-Mail</a>
      </div>
      <Knopf art="leise" className="w-full" onClick={schliessen}>Fertig</Knopf>
    </div>
  );
}

function Registrierungen({ onPin }: { onPin: (p: { name: string; pin: string; telefon: string; email: string }) => void }) {
  const alle = useRegionen();
  const { daten, fehler, laedt, neu } = useLaden(() => api<Registrierung[]>('registrierungen_liste'));
  const [arbeitet, setArbeitet] = useState('');
  const [fehler2, setFehler2] = useState('');
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;

  async function freigeben(r: Registrierung) {
    setArbeitet(r.id); setFehler2('');
    try {
      const x = await api<{ pin: string; vorname: string; nachname: string; telefon: string; email: string }>('registrierung_freigeben', { id: r.id });
      onPin({ name: `${x.vorname} ${x.nachname}`, pin: x.pin, telefon: x.telefon, email: x.email });
      void neu();
    } catch (e) { setFehler2((e as Error).message); } finally { setArbeitet(''); }
  }
  async function ablehnen(r: Registrierung) {
    if (!confirm(`Registrierung von ${r.vorname} ${r.nachname} ablehnen?`)) return;
    setArbeitet(r.id);
    try { await api('registrierung_ablehnen', { id: r.id }); void neu(); } catch (e) { setFehler2((e as Error).message); } finally { setArbeitet(''); }
  }

  return (
    <section className="space-y-2">
      <h2 className="font-bold">Warten auf Freigabe</h2>
      {fehler2 && <Hinweis art="fehler">{fehler2}</Hinweis>}
      {!daten?.length ? <p className="karte p-4 text-center text-sm text-slate-500">Keine offenen Registrierungen.</p> : daten.map((r) => (
        <div key={r.id} className="karte space-y-2 p-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <b className="text-lg">{r.vorname} {r.nachname}</b>
            <span className="rounded-full bg-himmel-100 px-2 py-0.5 text-xs font-bold text-himmel-900">{ROLLEN_NAME[r.rolle]}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {r.organisation && <>{r.organisation} · </>}{r.telefon}{r.email && <> · {r.email}</>}<br />
            Regionen: {regionenNamen(r.regionen, alle) || '–'} · {datumKurz(r.erstellt)}
          </p>
          {r.nachricht && <p className="rounded-lg bg-himmel-50 px-3 py-2 text-sm dark:bg-slate-800">{r.nachricht}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Knopf art="gefahr" onClick={() => ablehnen(r)} laedt={arbeitet === r.id}>Ablehnen</Knopf>
            <Knopf onClick={() => freigeben(r)} laedt={arbeitet === r.id}><Icon name="haken" className="h-5 w-5" /> Freigeben</Knopf>
          </div>
        </div>
      ))}
    </section>
  );
}

function EinladungTeilen({ code, schliessen }: { code: string; schliessen: () => void }) {
  const link = `${appLink()}#/einladung/${code}`;
  const text = `Hallo! Du bist eingeladen, beim Netzwerk „SOS Hund“ mitzumachen.\n\nHier registrieren:\n👉 ${link}\n\n(Einladungscode: ${code})`;
  return (
    <div className="karte space-y-3 border-2 border-sonne p-4">
      <p className="font-bold">Einladung erstellt</p>
      <p className="rounded-xl bg-himmel-50 py-3 text-center font-mono text-3xl font-extrabold tracking-[0.25em] dark:bg-slate-800">{code}</p>
      <p className="break-all text-center text-xs text-slate-500">{link}</p>
      <div className="grid grid-cols-3 gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 font-semibold text-white">WhatsApp</a>
        <a href={`mailto:?subject=${encodeURIComponent('Einladung zu SOS Hund')}&body=${encodeURIComponent(text)}`} className="flex min-h-12 items-center justify-center rounded-xl bg-himmel-600 font-semibold text-white">E-Mail</a>
        <button onClick={() => void navigator.clipboard?.writeText(text)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-slate-600 font-semibold text-white"><Icon name="kopieren" className="h-5 w-5" />Kopieren</button>
      </div>
      <Knopf art="leise" className="w-full" onClick={schliessen}>Fertig</Knopf>
    </div>
  );
}

function Einladungen() {
  const s = useSitzung()!;
  const alle = useRegionen();
  const admin = s.rolle === 'admin';
  const waehlbar = admin ? alle : alle.filter((r) => s.regionen.includes(r.id));
  const { daten, fehler, neu } = useLaden(() => api<Einladung[]>('einladungen_liste'));
  const [rolle, setRolle] = useState<Rolle>('mitglied');
  const [regionen, setRegionen] = useState<string[]>(admin ? [] : s.regionen);
  const [notiz, setNotiz] = useState('');
  const [tage, setTage] = useState(14);
  const [neuer, setNeuer] = useState('');
  const [fehler2, setFehler2] = useState('');
  const [laedt, setLaedt] = useState(false);

  async function erstellen(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true); setFehler2('');
    try {
      const r = await api<{ code: string }>('einladung_erstellen', { rolle, regionen, notiz, tage });
      setNeuer(r.code); setNotiz(''); void neu();
    } catch (err) { setFehler2((err as Error).message); } finally { setLaedt(false); }
  }
  async function loeschen(c: string) {
    if (!confirm('Einladung löschen? Der Code funktioniert dann nicht mehr.')) return;
    await api('einladung_loeschen', { code: c }).catch((e) => setFehler2((e as Error).message));
    void neu();
  }
  const rollen: Rolle[] = admin ? ['mitglied', 'behoerde', 'regionalleiter', 'admin'] : ['mitglied', 'behoerde'];

  return (
    <section className="space-y-2">
      <h2 className="font-bold">Einladen</h2>
      {neuer ? <EinladungTeilen code={neuer} schliessen={() => setNeuer('')} /> : (
        <form onSubmit={erstellen} className="karte space-y-3 p-4">
          <Feld label="Rolle">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-himmel-100 p-1 sm:grid-cols-4 dark:bg-slate-800">
              {rollen.map((r) => (
                <button type="button" key={r} onClick={() => setRolle(r)} className={klassen('min-h-10 rounded-lg text-sm font-semibold', rolle === r && 'bg-white shadow dark:bg-slate-700')}>{ROLLEN_NAME[r]}</button>
              ))}
            </div>
          </Feld>
          <Feld label="Regionen" hilfe={rolle === 'mitglied' ? 'Vorauswahl – Mitglieder können ihre Regionen bei der Registrierung ändern' : undefined}>
            <div className="flex flex-wrap gap-2">
              {waehlbar.map((r) => {
                const an = regionen.includes(r.id);
                return (
                  <button type="button" key={r.id} aria-pressed={an} onClick={() => setRegionen(an ? regionen.filter((x) => x !== r.id) : [...regionen, r.id])}
                    className={klassen('min-h-10 rounded-full px-3 text-sm font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'ring-himmel-300')}>{r.name}</button>
                );
              })}
            </div>
          </Feld>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Feld label="Notiz (für dich)"><input className="eingabe" value={notiz} maxLength={100} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Name der Person" /></Feld>
            <Feld label="Gültig (Tage)"><input className="eingabe" type="number" min={1} max={60} value={tage} onChange={(e) => setTage(Number(e.target.value))} /></Feld>
          </div>
          {fehler2 && <Hinweis art="fehler">{fehler2}</Hinweis>}
          <Knopf type="submit" className="w-full" laedt={laedt}><Icon name="einladung" className="h-5 w-5" /> Einladung erstellen</Knopf>
        </form>
      )}
      {fehler && <Fehler fehler={fehler} nochmal={neu} />}
      {daten && daten.length > 0 && (
        <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
          {daten.map((e) => (
            <div key={e.code} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="font-mono font-bold">{e.code}</span>
              <span className="flex-1">
                {ROLLEN_NAME[e.rolle]} · {regionenNamen(e.regionen, alle) || '–'}{e.notiz && <> · {e.notiz}</>}
                <span className="block text-xs text-slate-500">
                  {e.genutzt ? 'verwendet' : e.gueltig ? `gültig bis ${datumKurz(e.ablauf)}` : 'abgelaufen'} · von {e.erstelltVon}
                </span>
              </span>
              {!e.genutzt && <button onClick={() => loeschen(e.code)} aria-label="Einladung löschen" className="p-2 text-slate-400 hover:text-sos-rot"><Icon name="muell" className="h-5 w-5" /></button>}
            </div>
          ))}
        </div>
      )}
      {daten && !daten.length && <Leer>Noch keine Einladungen.</Leer>}
    </section>
  );
}

function Inhalt() {
  const [pin, setPin] = useState<{ name: string; pin: string; telefon: string; email: string } | null>(null);
  return (
    <div className="space-y-6">
      {pin && <PinAnzeige {...pin} schliessen={() => setPin(null)} />}
      <Registrierungen onPin={setPin} />
      <Einladungen />
    </div>
  );
}

export default function Zugaenge() {
  return (
    <Seite titel="Einladungen">
      <NurAngemeldet rollen={['regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
