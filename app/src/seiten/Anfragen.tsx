import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { NurAngemeldet } from '../components/Anmelden';
import { AnfrageZeile } from '../components/Anfrage';
import { Icon } from '../components/Icon';
import { Fehler, Laden, Leer, Seite, useLaden, Zeile } from '../components/ui';
import { api, erinnere, merke } from '../lib/api';
import { klassen } from '../lib/helfer';
import { istLeitung, type AnfrageKurz, type StartDaten } from '../lib/model';
import { useSitzung } from '../lib/sitzung';

const Karte = lazy(() => import('../components/Karte'));

type Filter = 'aktiv' | 'erledigt' | 'alle';

function Inhalt() {
  const s = useSitzung()!;
  const [filter, setFilter] = useState<Filter>('aktiv');
  const [ansicht, setAnsicht] = useState<'liste' | 'karte'>('liste');
  const [nurMeine, setNurMeine] = useState(false);
  const schluessel = `anfragen-${filter}-${s.mitgliedId}`;
  const { daten, fehler, laedt, neu } = useLaden(async () => {
    try {
      const x = await api<AnfrageKurz[]>('anfragen_liste', { filter });
      merke(schluessel, x);
      return x;
    } catch (e) {
      const alt = erinnere<AnfrageKurz[]>(schluessel);
      if (alt) return alt;
      throw e;
    }
  }, [filter, s.token]);

  const start = useLaden(() => (s.rolle === 'admin' ? api<StartDaten>('start') : Promise.resolve(null)), [s.token]);
  const ungelesen = start.daten?.nachrichten ?? 0;
  const liste = (daten ?? []).filter((a) => !nurMeine || a.meine);
  const pruefen = liste.filter((a) => a.status === 'ungeprueft');

  async function alleVerwerfen(n: number) {
    if (!confirm(`Alle ${n} ungeprüften Meldungen verwerfen? Das ist für Spam gedacht – echte Meldungen bitte einzeln prüfen.`)) return;
    const sperren = confirm('Zusätzlich die Telefonnummern der Melder sperren? Weitere Meldungen von diesen Nummern werden dann still verworfen.');
    try {
      const r = await api<{ verworfen: number; gesperrt: number }>('meldungen_verwerfen', { ids: pruefen.map((a) => a.id), sperren, notiz: 'Sammelweise verworfen' });
      alert(`${r.verworfen} Meldung${r.verworfen === 1 ? '' : 'en'} verworfen${r.gesperrt ? `, ${r.gesperrt} Nummer${r.gesperrt === 1 ? '' : 'n'} gesperrt` : ''}.`);
    } catch (e) {
      alert((e as Error).message);
    }
    await neu();
  }
  const rest = liste.filter((a) => a.status !== 'ungeprueft');

  return (
    <div className="space-y-3">
      {s.rolle === 'admin' && (
        <div className="karte overflow-hidden">
          <Zeile zu="/nachrichten" icon="sprechblase" titel="Nachrichten" text={ungelesen ? `${ungelesen} ungelesen von Regionalleitern` : 'Nachrichten von Regionalleitern lesen und beantworten'}
            rechts={ungelesen ? <span className="rounded-full bg-sos-rot px-2.5 py-0.5 text-xs font-bold text-white">{ungelesen}</span> : undefined} />
        </div>
      )}
      <div className="flex gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1 rounded-xl bg-himmel-100 p-1 dark:bg-slate-800">
          {([['aktiv', 'Laufend'], ['erledigt', 'Erledigt'], ['alle', 'Alle']] as [Filter, string][]).map(([k, n]) => (
            <button key={k} onClick={() => setFilter(k)} className={klassen('min-h-10 rounded-lg text-sm font-semibold', filter === k && 'bg-white shadow dark:bg-slate-700')}>{n}</button>
          ))}
        </div>
        <button onClick={() => setAnsicht(ansicht === 'liste' ? 'karte' : 'liste')} aria-label={ansicht === 'liste' ? 'Karte zeigen' : 'Liste zeigen'}
          className="flex min-h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-himmel-200 dark:bg-slate-800 dark:ring-slate-600">
          <Icon name={ansicht === 'liste' ? 'karte' : 'liste'} />
        </button>
        <button onClick={() => void neu()} aria-label="Aktualisieren" className="flex min-h-12 w-12 items-center justify-center rounded-xl bg-white ring-1 ring-himmel-200 dark:bg-slate-800 dark:ring-slate-600">
          <Icon name="aktualisieren" className={klassen('h-5 w-5', laedt && 'animate-spin')} />
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={nurMeine} onChange={(e) => setNurMeine(e.target.checked)} /> Nur meine
      </label>

      {fehler && !daten && <Fehler fehler={fehler} nochmal={neu} />}
      {laedt && !daten ? <Laden /> : ansicht === 'karte' ? (
        <Suspense fallback={<Laden text="Karte lädt …" />}>
          <Karte anfragen={liste} />
          <p className="text-xs text-slate-500">{liste.filter((a) => a.lat).length} von {liste.length} Anfragen mit Standort. Punkt antippen öffnet die Anfrage.</p>
        </Suspense>
      ) : !liste.length ? (
        <Leer>{filter === 'aktiv' ? 'Keine laufenden Anfragen in deinen Regionen.' : 'Keine Anfragen.'}</Leer>
      ) : (
        <>
          {istLeitung(s) && pruefen.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-amber-800 dark:text-amber-300">Öffentliche Meldungen prüfen ({pruefen.length})</h2>
                {pruefen.length > 1 && <button type="button" className="rounded-lg px-2 py-1 text-sm font-semibold text-sos-rot underline" onClick={() => void alleVerwerfen(pruefen.length)}>Alle verwerfen</button>}
              </div>
              {pruefen.map((a) => <AnfrageZeile key={a.id} a={a} />)}
            </section>
          )}
          <section className="space-y-2">
            {istLeitung(s) && pruefen.length > 0 && <h2 className="font-bold">Anfragen</h2>}
            {rest.map((a) => <AnfrageZeile key={a.id} a={a} />)}
          </section>
        </>
      )}
    </div>
  );
}

export default function Anfragen() {
  const s = useSitzung();
  return (
    <Seite titel="Anfragen" zurueck={false} aktion={s && (
      <Link to="/anfragen/neu" className="flex min-h-11 items-center gap-1 rounded-xl bg-sos-rot px-3 font-semibold text-white"><Icon name="plus" className="h-5 w-5" /> Neu</Link>
    )}>
      <NurAngemeldet text="Anfragen sehen nur Mitglieder des Netzwerks und Behörden. Einen Hund melden kann jeder unter „Melden“.">
        <Inhalt />
      </NurAngemeldet>
    </Seite>
  );
}
