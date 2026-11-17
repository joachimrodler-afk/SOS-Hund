import { useEffect, useState } from 'react';
import { LoginFormular } from '../components/Anmelden';
import { Icon } from '../components/Icon';
import { Feld, Fehler, Hinweis, Knopf, Laden, Schalter, Seite, useLaden } from '../components/ui';
import { istDemo } from '../config';
import { api, speichereSitzung } from '../lib/api';
import { klassen } from '../lib/helfer';
import { ROLLEN_NAME, istHelfer, istLeitung, type Mitglied, type PushEinstellungen } from '../lib/model';
import { regionenNamen, useRegionen } from '../lib/regionen';
import { erlaubnisHilfe, pushAuffrischen, pushAusschalten, pushEinschalten, pushEinstellungenSpeichern, pushErlaubnis, pushMoeglich, pushStatus, pushTesten, STANDARD_PUSH } from '../lib/push';
import { useSitzung } from '../lib/sitzung';

const PUSH_ANLAESSE: { key: keyof PushEinstellungen; name: string; text: string; nur?: 'helfer' | 'leitung' }[] = [
  { key: 'sos', name: 'Neue Anfragen', text: 'in deinen Regionen und von Nachbarregionen, wenn niemand übernimmt', nur: 'helfer' },
  { key: 'uebernahme', name: 'Übernahmen', text: 'wenn jemand eine Anfrage übernimmt oder mithilft' },
  { key: 'status', name: 'Statusänderungen', text: 'bei Anfragen, an denen du beteiligt bist' },
  { key: 'mitteilungen', name: 'Mitteilungen', text: 'Nachrichten der Regionalleitung und Admins' },
  { key: 'verwaltung', name: 'Verwaltung', text: 'neue Registrierungen und Meldungen zum Prüfen', nur: 'leitung' },
];

function PushBereich({ helfer, leitung }: { helfer: boolean; leitung: boolean }) {
  const [st, setSt] = useState(pushStatus);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [test, setTest] = useState('');
  const moeglich = pushMoeglich();
  const erlaubnis = moeglich.ok ? pushErlaubnis() : 'fehlt';
  const aktiv = !!st.token && erlaubnis === 'granted';

  // Abo beim Öffnen prüfen (neues Token nach iOS-Update, Erlaubnis entzogen …)
  useEffect(() => { void pushAuffrischen().then(() => setSt(pushStatus())).catch(() => undefined); }, []);

  async function an() {
    setLaedt(true); setFehler(''); setTest('');
    try { await pushEinschalten(st.einstellungen); setSt(pushStatus()); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }
  async function aus() {
    setLaedt(true); setTest('');
    await pushAusschalten();
    setSt(pushStatus());
    setLaedt(false);
  }
  async function testen() {
    setLaedt(true); setFehler(''); setTest('');
    try {
      const n = await pushTesten();
      setTest(n ? `Test-Nachricht an ${n} ${n === 1 ? 'Gerät' : 'Geräte'} gesendet – sie sollte in wenigen Sekunden erscheinen.` : 'Für dich ist kein Gerät registriert. Bitte Push aus- und wieder einschalten.');
    } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }
  async function setze(k: keyof PushEinstellungen, v: boolean) {
    const e = { ...st.einstellungen, [k]: v };
    setSt({ ...st, einstellungen: e });
    await pushEinstellungenSpeichern(e).catch((x) => setFehler((x as Error).message));
  }

  return (
    <div className="karte overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <Icon name="glocke" className="h-6 w-6 text-himmel-600" />
        <h2 className="flex-1 font-bold">Push-Nachrichten</h2>
        <span className={klassen('rounded-full px-2.5 py-0.5 text-xs font-bold', aktiv ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')}>
          {aktiv ? 'an' : 'aus'}
        </span>
      </div>
      {!moeglich.ok ? (
        <div className="px-4 pb-4"><Hinweis>{moeglich.grund}</Hinweis></div>
      ) : !aktiv ? (
        <div className="space-y-3 px-4 pb-4">
          {erlaubnis === 'denied'
            ? <Hinweis art="warnung">{erlaubnisHilfe()}</Hinweis>
            : <Hinweis>Push ist auf diesem Gerät noch <b>aus</b>. Tippe auf „Push einschalten“ und erlaube in der Abfrage „Mitteilungen“.</Hinweis>}
          {fehler && <Fehler fehler={fehler} />}
          <Knopf className="w-full" onClick={an} laedt={laedt}><Icon name="glocke" className="h-5 w-5" /> Push einschalten</Knopf>
        </div>
      ) : (
        <>
          <div className="divide-y divide-himmel-100 border-t border-himmel-100 dark:divide-slate-700 dark:border-slate-700">
            {PUSH_ANLAESSE.filter((a) => !a.nur || (a.nur === 'helfer' ? helfer : leitung)).map((a) => (
              <Schalter key={a.key} an={st.einstellungen[a.key] ?? STANDARD_PUSH[a.key] ?? false} onChange={(v) => setze(a.key, v)} label={a.name} text={a.text} />
            ))}
          </div>
          <div className="space-y-2 p-4">
            {fehler && <Fehler fehler={fehler} />}
            {test && <Hinweis art="ok">{test}</Hinweis>}
            <Knopf art="sekundaer" className="w-full" onClick={testen} laedt={laedt}><Icon name="glocke" className="h-5 w-5" /> Test-Nachricht senden</Knopf>
            <Knopf art="leise" className="w-full" onClick={aus} laedt={laedt}>Push auf diesem Gerät ausschalten</Knopf>
          </div>
        </>
      )}
    </div>
  );
}

function PinAendern() {
  const [offen, setOffen] = useState(false);
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [laedt, setLaedt] = useState(false);
  async function los(e: React.FormEvent) {
    e.preventDefault();
    if (neu !== neu2) return setMsg({ ok: false, text: 'Die beiden neuen PINs stimmen nicht überein.' });
    setLaedt(true);
    try {
      await api('pin_aendern', { alt, neu });
      setMsg({ ok: true, text: 'PIN geändert.' });
      setAlt(''); setNeu(''); setNeu2('');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setLaedt(false);
    }
  }
  const pin = (v: string, set: (s: string) => void, label: string, ac: string) => (
    <Feld label={label}><input className="eingabe tracking-[0.3em]" type="password" inputMode="numeric" autoComplete={ac} value={v} maxLength={8} required onChange={(e) => set(e.target.value.replace(/\D/g, ''))} /></Feld>
  );
  if (!offen) return <Knopf art="sekundaer" className="w-full" onClick={() => setOffen(true)}><Icon name="schloss" className="h-5 w-5" /> PIN ändern</Knopf>;
  return (
    <form onSubmit={los} className="karte space-y-3 p-4">
      <h2 className="font-bold">PIN ändern</h2>
      {pin(alt, setAlt, 'Bisheriger PIN', 'current-password')}
      {pin(neu, setNeu, 'Neuer PIN (6–8 Ziffern)', 'new-password')}
      {pin(neu2, setNeu2, 'Neuer PIN wiederholen', 'new-password')}
      {msg && <Hinweis art={msg.ok ? 'ok' : 'fehler'}>{msg.text}</Hinweis>}
      <div className="flex gap-2">
        <Knopf type="button" art="sekundaer" className="flex-1" onClick={() => setOffen(false)}>Schließen</Knopf>
        <Knopf type="submit" className="flex-1" laedt={laedt}>Ändern</Knopf>
      </div>
    </form>
  );
}

function ProfilBereich() {
  const s = useSitzung()!;
  const alle = useRegionen();
  const { daten, setDaten, laedt } = useLaden(() => api<Mitglied>('ich'), [s.token]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [speichert, setSpeichert] = useState(false);
  if (laedt && !daten) return <Laden />;
  if (!daten) return null;
  const m = daten;
  const setze = (x: Partial<Mitglied>) => setDaten({ ...m, ...x });
  const profil = (k: string, v: unknown) => setze({ profil: { ...m.profil, [k]: v } });

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setSpeichert(true); setMsg(null);
    try {
      const neu = await api<Mitglied>('profil_speichern', {
        telefon: m.telefon, email: m.email, verfuegbar: m.verfuegbar, profil: m.profil,
        ...(s.rolle === 'mitglied' ? { regionen: m.regionen } : {}),
      });
      setDaten(neu);
      speichereSitzung({ ...s, regionen: neu.regionen });
      setMsg({ ok: true, text: 'Gespeichert.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <form onSubmit={speichern} className="karte space-y-3 p-4">
      <h2 className="font-bold">Meine Angaben</h2>
      <div className="grid grid-cols-2 gap-3">
        <Feld label="Telefon" hilfe="sehen die Beteiligten einer Anfrage"><input className="eingabe" type="tel" value={m.telefon} onChange={(e) => setze({ telefon: e.target.value })} /></Feld>
        <Feld label="E-Mail"><input className="eingabe" type="email" value={m.email} onChange={(e) => setze({ email: e.target.value })} /></Feld>
      </div>
      {istHelfer(s) && (
        <>
          <div className="-mx-4 border-y border-himmel-100 dark:border-slate-700">
            <Schalter an={m.verfuegbar} onChange={(v) => setze({ verfuegbar: v })} label="Einsatzbereit" text="Aus = keine Push-Nachrichten zu neuen Anfragen" />
          </div>
          <Feld label={s.rolle === 'mitglied' ? 'Meine Regionen' : 'Meine Regionen (vergibt der Admin)'}>
            {s.rolle === 'mitglied' ? (
              <div className="flex flex-wrap gap-2">
                {alle.map((r) => {
                  const an = m.regionen.includes(r.id);
                  return (
                    <button type="button" key={r.id} aria-pressed={an} onClick={() => setze({ regionen: an ? m.regionen.filter((x) => x !== r.id) : [...m.regionen, r.id] })}
                      className={klassen('min-h-10 rounded-full px-3 text-sm font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'ring-himmel-300')}>
                      {r.name}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-sm">{regionenNamen(m.regionen, alle) || '–'}</p>}
          </Feld>
          <fieldset className="space-y-1">
            <legend className="label">Ausstattung</legend>
            {[['fahrzeug', 'Fahrzeug für Hundetransport'], ['box', 'Transportbox'], ['fanggeraet', 'Fanggeräte (Falle, Schlinge, Netz)']].map(([k, n]) => (
              <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!!m.profil[k as 'box']} onChange={(e) => profil(k, e.target.checked)} /> {n}
              </label>
            ))}
          </fieldset>
          <Feld label="Erfahrung / Qualifikation"><textarea className="eingabe min-h-20" maxLength={300} value={m.profil.qualifikation ?? ''} onChange={(e) => profil('qualifikation', e.target.value)} placeholder="z. B. Hundetrainerin, Sachkunde §11, Erfahrung mit Angsthunden" /></Feld>
        </>
      )}
      {msg && <Hinweis art={msg.ok ? 'ok' : 'fehler'}>{msg.text}</Hinweis>}
      <Knopf type="submit" className="w-full" laedt={speichert}>Speichern</Knopf>
    </form>
  );
}

function Thema() {
  const [w, setW] = useState(localStorage.getItem('sos.thema') ?? 'system');
  const setze = (x: string) => {
    if (x === 'system') localStorage.removeItem('sos.thema'); else localStorage.setItem('sos.thema', x);
    setW(x);
    window.dispatchEvent(new Event('sos-thema'));
  };
  return (
    <div className="karte p-4">
      <h2 className="mb-2 font-bold">Darstellung</h2>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-himmel-100 p-1 dark:bg-slate-800">
        {[['system', 'Automatisch'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(([k, n]) => (
          <button key={k} onClick={() => setze(k)} className={klassen('min-h-10 rounded-lg text-sm font-semibold', w === k ? 'bg-white shadow dark:bg-slate-700' : '')}>{n}</button>
        ))}
      </div>
    </div>
  );
}

export default function Konto() {
  const s = useSitzung();
  async function abmelden() {
    await api('logout').catch(() => undefined);
    speichereSitzung(null);
  }
  return (
    <Seite titel={s ? 'Mein Konto' : 'Anmelden'}>
      <div className="space-y-4">
        {!s ? (
          <LoginFormular />
        ) : (
          <>
            <div className="karte flex items-center gap-4 p-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-himmel-600 text-xl font-bold text-white">
                {s.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </span>
              <div className="flex-1">
                <p className="text-lg font-bold">{s.name}</p>
                <p className="text-sm text-slate-500">{ROLLEN_NAME[s.rolle]}{s.organisation ? ` · ${s.organisation}` : ''}</p>
              </div>
            </div>
            <ProfilBereich />
            <PushBereich helfer={istHelfer(s)} leitung={istLeitung(s)} />
            <PinAendern />
            <Knopf art="gefahr" className="w-full" onClick={abmelden}>Abmelden</Knopf>
          </>
        )}
        <Thema />
        {istDemo && (
          <Knopf art="leise" className="w-full" onClick={async () => { (await import('../lib/demo')).demoZuruecksetzen(); speichereSitzung(null); location.reload(); }}>
            Demo-Daten zurücksetzen
          </Knopf>
        )}
      </div>
    </Seite>
  );
}
