import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NurAngemeldet } from '../components/Anmelden';
import { DringlichkeitMarke, StatusMarke, TelLink } from '../components/Anfrage';
import { Icon } from '../components/Icon';
import { Fehler, Hinweis, Knopf, Laden, Seite, useLaden } from '../components/ui';
import { api } from '../lib/api';
import { klassen, vorZeit } from '../lib/helfer';
import { STATUS_NAME, type Adresse, type AnfrageDetail as Detail, type Auftraggeber, type Hund, type Status } from '../lib/model';
import { useSitzung } from '../lib/sitzung';

const Karte = lazy(() => import('../components/Karte'));

const zeit = (iso: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function routeLink(a: Detail) {
  const ad: Partial<Adresse> = a.details.adresse ?? {};
  const ziel = ad.lat && ad.lon ? `${ad.lat},${ad.lon}` : [ad.strasse, `${ad.plz ?? ''} ${ad.ort ?? ''}`].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ziel)}`;
}

const NAECHSTER: Partial<Record<Status, Status[]>> = {
  uebernommen: ['vor_ort', 'gesichert', 'abgeschlossen', 'abgebrochen'],
  vor_ort: ['gesichert', 'abgeschlossen', 'abgebrochen'],
  gesichert: ['abgeschlossen'],
};

function Inhalt({ id }: { id: string }) {
  const s = useSitzung()!;
  const { daten: a, setDaten, fehler, laedt, neu } = useLaden(() => api<Detail>('anfrage_detail', { id }), [id]);
  const [arbeitet, setArbeitet] = useState('');
  const [fehler2, setFehler2] = useState('');
  const [meldung, setMeldung] = useState('');
  const [notiz, setNotiz] = useState('');

  async function aktion(name: string, aufruf: string, daten: Record<string, unknown> = {}, frage?: string) {
    if (frage && !confirm(frage)) return;
    setArbeitet(name); setFehler2(''); setMeldung('');
    try {
      const r = await api<Detail & { benachrichtigt?: number; nichtMehrSichtbar?: boolean }>(aufruf, { id, ...daten });
      if (r.nichtMehrSichtbar) { setDaten(null); setMeldung('Danke – die Anfrage ist wieder offen und liegt jetzt wieder bei der zuständigen Region.'); return; }
      if (r.verlauf) setDaten(r); else await neu();
      setNotiz('');
      if (aufruf === 'anfrage_uebernehmen') setMeldung('Du hast die Anfrage übernommen. Bitte jetzt den Auftraggeber anrufen und dich abstimmen.');
      if (aufruf === 'anfrage_pruefen') setMeldung(daten.freigeben ? `Freigegeben – ${r.benachrichtigt ?? 0} Helfer benachrichtigt.` : 'Meldung verworfen.');
    } catch (e) {
      setFehler2((e as Error).message);
      void neu();
    } finally {
      setArbeitet('');
    }
  }

  if (fehler && !a) return <Fehler fehler={fehler} nochmal={neu} />;
  if (!a && meldung) return <div className="space-y-3"><Hinweis art="ok">{meldung}</Hinweis><Link to="/anfragen" className="block text-center font-semibold underline">Zu den Anfragen</Link></div>;
  if (laedt && !a) return <Laden />;
  if (!a) return null;

  const d = a.details;
  const ad: Partial<Adresse> = d.adresse ?? {};
  const ag: Partial<Auftraggeber> = d.auftraggeber ?? {};
  const h: Partial<Hund> = d.hund ?? {};
  const ichHelfe = a.helfer.some((x) => x.id === s.mitgliedId);
  const ichVerantwortlich = a.uebernommenVon === s.mitgliedId;
  const naechste = a.rechte.bearbeiten && s.rolle !== 'behoerde' ? NAECHSTER[a.status] ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="karte space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusMarke status={a.status} />
          <DringlichkeitMarke d={a.dringlichkeit} />
          {a.eskaliert && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">an Nachbarregionen</span>}
          {a.anonymisiert && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">anonymisiert</span>}
        </div>
        <h2 className="text-xl font-bold leading-snug">{d.beschreibung}</h2>
        <p className="text-sm text-slate-500">
          {a.regionName || 'ohne Region'} · {a.quelle === 'oeffentlich' ? 'öffentliche Meldung' : a.quelle === 'behoerde' ? 'Behörde' : 'Netzwerk'} · {vorZeit(a.erstellt)}
        </p>
        {a.uebernommenName && (
          <p className="rounded-xl bg-himmel-100 px-3 py-2 text-sm font-semibold text-himmel-900 dark:bg-himmel-900/40 dark:text-himmel-100">
            Übernommen von {a.uebernommenName} · {zeit(a.uebernommenAm)}
            {a.helfer.length > 0 && <span className="block font-normal">Helfer: {a.helfer.map((x) => x.name).join(', ')}</span>}
          </p>
        )}
      </div>

      {meldung && <Hinweis art="ok">{meldung}</Hinweis>}
      {fehler2 && <Hinweis art="fehler">{fehler2}</Hinweis>}

      {/* Aktionen */}
      <div className="space-y-2">
        {a.status === 'ungeprueft' && a.rechte.leiten && (
          <div className="karte space-y-2 p-4 ring-2 ring-amber-300">
            <p className="font-semibold">Öffentliche Meldung prüfen</p>
            <p className="text-sm text-slate-500">Bitte kurz beim Melder anrufen und prüfen, ob die Angaben stimmen. Erst nach der Freigabe bekommen die Helfer eine Push-Nachricht.</p>
            {!a.region && <Hinweis art="warnung">Die PLZ gehört zu keiner Region. Bitte zuerst über „Bearbeiten“ eine Region zuordnen.</Hinweis>}
            <div className="grid grid-cols-2 gap-2">
              <Knopf art="gefahr" laedt={arbeitet === 'verwerfen'} onClick={() => aktion('verwerfen', 'anfrage_pruefen', { freigeben: false, notiz: prompt('Grund (optional):') ?? '' })}>Verwerfen</Knopf>
              <Knopf laedt={arbeitet === 'freigeben'} disabled={!a.region} onClick={() => aktion('freigeben', 'anfrage_pruefen', { freigeben: true })}><Icon name="haken" className="h-5 w-5" /> Freigeben</Knopf>
            </div>
          </div>
        )}
        {a.rechte.uebernehmen && (
          <Knopf className="min-h-16 w-full text-lg" laedt={arbeitet === 'uebernehmen'} onClick={() => aktion('uebernehmen', 'anfrage_uebernehmen', {}, 'Du übernimmst die Verantwortung für diese Anfrage. Fortfahren?')}>
            <Icon name="haken" /> Ich übernehme
          </Knopf>
        )}
        {a.rechte.helfen && !ichHelfe && (
          <Knopf art="sekundaer" className="w-full" laedt={arbeitet === 'helfen'} onClick={() => aktion('helfen', 'anfrage_helfen', { dabei: true })}>
            <Icon name="personen" className="h-5 w-5" /> Ich helfe mit
          </Knopf>
        )}
        {ichHelfe && !['abgeschlossen', 'abgebrochen'].includes(a.status) && (
          <Knopf art="leise" className="w-full" laedt={arbeitet === 'helfen'} onClick={() => aktion('helfen', 'anfrage_helfen', { dabei: false })}>Ich helfe doch nicht mit</Knopf>
        )}
        {naechste.length > 0 && (
          <div className="karte space-y-2 p-4">
            <p className="text-sm font-semibold">Status setzen</p>
            <div className="grid grid-cols-2 gap-2">
              {naechste.map((st) => (
                <Knopf key={st} art={st === 'abgebrochen' ? 'gefahr' : st === 'abgeschlossen' ? 'primaer' : 'sekundaer'} laedt={arbeitet === st}
                  onClick={() => aktion(st, 'anfrage_status', { status: st, notiz }, st === 'abgebrochen' ? 'Anfrage wirklich abbrechen?' : undefined)}>
                  {STATUS_NAME[st]}
                </Knopf>
              ))}
            </div>
          </div>
        )}
        {s.rolle === 'behoerde' && a.rechte.eigene && !['abgeschlossen', 'abgebrochen', 'verworfen'].includes(a.status) && (
          <Knopf art="gefahr" className="w-full" laedt={arbeitet === 'abgebrochen'}
            onClick={() => aktion('abgebrochen', 'anfrage_status', { status: 'abgebrochen', notiz: prompt('Grund für das Zurückziehen:') ?? '' }, 'Anfrage zurückziehen?')}>
            Anfrage zurückziehen
          </Knopf>
        )}
        <div className="flex flex-wrap gap-2">
          {a.rechte.zurueckgeben && (
            <Knopf art="leise" laedt={arbeitet === 'zurueck'} onClick={() => aktion('zurueck', 'anfrage_zurueckgeben', { notiz: prompt('Warum gibst du die Anfrage zurück?') ?? '' }, 'Anfrage wieder freigeben? Die Region wird erneut benachrichtigt.')}>
              {ichVerantwortlich ? 'Ich kann doch nicht – zurückgeben' : 'Übernahme aufheben'}
            </Knopf>
          )}
          {a.rechte.aendern && !a.anonymisiert && <Link to={`/anfragen/${a.id}/bearbeiten`} className="inline-flex min-h-12 items-center gap-1 rounded-xl px-4 font-semibold text-himmel-700 hover:bg-himmel-100 dark:text-himmel-200"><Icon name="stift" className="h-5 w-5" /> Bearbeiten</Link>}
          <button onClick={() => window.print()} className="nicht-drucken inline-flex min-h-12 items-center gap-1 rounded-xl px-4 font-semibold text-himmel-700 hover:bg-himmel-100 dark:text-himmel-200"><Icon name="drucker" className="h-5 w-5" /> Drucken</button>
        </div>
      </div>

      {/* Ort */}
      <section className="karte p-4">
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Icon name="ort" className="h-5 w-5 text-sos-rot" /> Ort</h3>
        <dl>
          <Zeile label="Halter">{ad.halter}</Zeile>
          <Zeile label="Telefon Halter">{ad.halterTelefon && <TelLink nummer={ad.halterTelefon} />}</Zeile>
          <Zeile label="E-Mail Halter">{ad.halterEmail && <a className="underline" href={`mailto:${ad.halterEmail}`}>{ad.halterEmail}</a>}</Zeile>
          <Zeile label="Adresse">{[ad.strasse, `${ad.plz ?? ''} ${ad.ort ?? ''}`.trim()].filter(Boolean).join(', ')}</Zeile>
          <Zeile label="Hinweis">{ad.hinweis}</Zeile>
        </dl>
        {!a.anonymisiert && (
          <a href={routeLink(a)} target="_blank" rel="noopener noreferrer" className="nicht-drucken mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-himmel-700 font-semibold text-white">
            <Icon name="route" className="h-5 w-5" /> Route starten
          </a>
        )}
        {ad.lat && ad.lon && (
          <div className="nicht-drucken mt-3">
            <Suspense fallback={<Laden text="Karte lädt …" />}><Karte anfragen={[a]} hoehe="h-56" /></Suspense>
          </div>
        )}
      </section>

      {/* Hund & Vorfall */}
      <section className="karte p-4">
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Icon name="pfote" className="h-5 w-5 text-sos-rot" /> Hund</h3>
        <dl>
          <Zeile label="Rasse / Typ">{h.rasse}</Zeile>
          <Zeile label="Name">{h.name}</Zeile>
          <Zeile label="Alter">{h.alter}</Zeile>
          <Zeile label="Größe">{h.groesse}</Zeile>
          <Zeile label="Geschlecht">{h.geschlecht}</Zeile>
          <Zeile label="Farbe">{h.farbe}</Zeile>
          <Zeile label="Anzahl">{h.anzahl && h.anzahl > 1 ? h.anzahl : ''}</Zeile>
          <Zeile label="Merkmale">{h.merkmale}</Zeile>
        </dl>
        {d.vorfall && (
          <>
            <h4 className="mb-1 mt-3 font-semibold">Was ist passiert?</h4>
            <p className="whitespace-pre-line text-sm">{d.vorfall}</p>
          </>
        )}
      </section>

      {/* Kontakte */}
      <section className="karte p-4">
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Icon name="telefon" className="h-5 w-5 text-sos-rot" /> Auftraggeber</h3>
        <dl>
          <Zeile label="Name">{ag.name}</Zeile>
          <Zeile label="Organisation">{ag.organisation}</Zeile>
          <Zeile label="Adresse">{[ag.strasse, `${ag.plz ?? ''} ${ag.ort ?? ''}`.trim()].filter(Boolean).join(', ')}</Zeile>
          <Zeile label="Telefon">{ag.telefon && <TelLink nummer={ag.telefon} />}</Zeile>
          <Zeile label="E-Mail">{ag.email && <a className="underline" href={`mailto:${ag.email}?subject=${encodeURIComponent(a.nummer)}`}>{ag.email}</a>}</Zeile>
          <Zeile label="Erreichbar">{ag.erreichbar}</Zeile>
          <Zeile label="Hundehalter">{ag.istHalter ? 'ja – der Auftraggeber ist selbst der Halter' : ''}</Zeile>
        </dl>
        {a.team.length > 0 && (
          <>
            <h4 className="mb-1 mt-3 font-semibold">Team</h4>
            <ul className="space-y-1 text-sm">
              {a.team.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2"><b>{t.name}</b><span className="text-slate-500">({t.rolle})</span><TelLink nummer={t.telefon} /></li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Verlauf */}
      <section className="karte p-4">
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Icon name="uhr" className="h-5 w-5 text-sos-rot" /> Verlauf</h3>
        <ol className="relative space-y-3 border-l-2 border-himmel-200 pl-4 dark:border-slate-700">
          {a.verlauf.map((v, i) => (
            <li key={i} className="text-sm">
              <span className={klassen('absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full', v.status ? 'bg-sos-rot' : 'bg-himmel-300')} />
              <p><b>{v.aktion}</b> · {v.name}</p>
              <p className="text-xs text-slate-500">{zeit(v.zeit)}</p>
              {v.notiz && <p className="mt-0.5 whitespace-pre-line rounded-lg bg-himmel-50 px-2 py-1 dark:bg-slate-800">{v.notiz}</p>}
            </li>
          ))}
        </ol>
        {a.rechte.bearbeiten && !['abgeschlossen', 'abgebrochen', 'verworfen'].includes(a.status) && (
          <form className="nicht-drucken mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void aktion('notiz', 'anfrage_status', { notiz }); }}>
            <input className="eingabe" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz hinzufügen …" maxLength={500} />
            <Knopf type="submit" art="sekundaer" laedt={arbeitet === 'notiz'} disabled={!notiz.trim()} aria-label="Notiz speichern"><Icon name="plus" className="h-5 w-5" /></Knopf>
          </form>
        )}
      </section>
    </div>
  );
}

export default function AnfrageDetail() {
  const { id = '' } = useParams();
  return (
    <Seite titel="Anfrage">
      <NurAngemeldet><Inhalt id={id} /></NurAngemeldet>
    </Seite>
  );
}
