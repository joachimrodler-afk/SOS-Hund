import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Fehler, Laden, Schalter, useLaden } from '../components/ui';
import { AnfrageZeile } from '../components/Anfrage';
import { config } from '../config';
import { api, erinnere, merke } from '../lib/api';
import { klassen, markdown } from '../lib/helfer';
import { ROLLEN_NAME, istHelfer, istLeitung, type AnfrageKurz, type StartDaten } from '../lib/model';
import { useSitzung } from '../lib/sitzung';
import { pushAuffrischen } from '../lib/push';

function Kachel({ zu, zahl, text, rot }: { zu: string; zahl: number; text: string; rot?: boolean }) {
  return (
    <Link to={zu} className={klassen('karte flex flex-col items-center justify-center p-3 text-center',
      rot && zahl > 0 && 'bg-sos-rot text-white ring-sos-rot dark:bg-sos-rot')}>
      <span className="text-3xl font-extrabold tabular-nums">{zahl}</span>
      <span className={klassen('text-xs font-semibold', !(rot && zahl > 0) && 'text-slate-500')}>{text}</span>
    </Link>
  );
}

/** Ansicht für angemeldete Zugänge: Zahlen, Verfügbarkeit, offene Anfragen */
function Angemeldet({ d, neu }: { d: StartDaten; neu: () => void }) {
  const s = useSitzung()!;
  const [verfuegbar, setVerfuegbar] = useState(d.verfuegbar !== false);
  const liste = useLaden(() => api<AnfrageKurz[]>('anfragen_liste', { filter: 'aktiv' }), [s.token]);
  useEffect(() => { void pushAuffrischen().catch(() => undefined); }, []);

  async function setzeVerfuegbar(v: boolean) {
    setVerfuegbar(v);
    await api('profil_speichern', { verfuegbar: v }).catch(() => setVerfuegbar(!v));
    neu();
  }

  const offene = (liste.daten ?? []).filter((a) => a.status === 'offen' || a.status === 'ungeprueft');
  const meine = (liste.daten ?? []).filter((a) => a.meine && a.status !== 'offen');
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">Hallo</p>
        <h1 className="text-2xl font-bold">{s.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">{ROLLEN_NAME[s.rolle]}{s.organisation ? ` · ${s.organisation}` : ''}</p>
      </div>

      <div className={klassen('grid gap-2', istLeitung(s) ? 'grid-cols-3' : 'grid-cols-2')}>
        <Kachel zu="/anfragen" zahl={d.offen ?? 0} text="offen" rot />
        <Kachel zu="/anfragen" zahl={d.meine ?? 0} text={s.rolle === 'behoerde' ? 'meine laufenden' : 'meine Einsätze'} />
        {istLeitung(s) && <Kachel zu="/anfragen" zahl={d.ungeprueft ?? 0} text="zu prüfen" rot />}
      </div>

      {istLeitung(s) && (d.registrierungen ?? 0) > 0 && (
        <Link to="/verwaltung/zugaenge" className="karte flex items-center gap-3 p-4 ring-2 ring-sonne">
          <Icon name="einladung" className="h-6 w-6 text-himmel-700" />
          <span className="flex-1 font-semibold">{d.registrierungen} Registrierung{d.registrierungen === 1 ? '' : 'en'} warten auf Freigabe</span>
          <Icon name="rechts" className="h-5 w-5 text-slate-400" />
        </Link>
      )}

      {istHelfer(s) && (
        <div className="karte overflow-hidden">
          <Schalter an={verfuegbar} onChange={setzeVerfuegbar} label={verfuegbar ? 'Ich bin einsatzbereit' : 'Ich bin gerade nicht verfügbar'}
            text={verfuegbar ? 'Du bekommst Push-Nachrichten zu neuen Anfragen.' : 'Keine Push-Nachrichten zu neuen Anfragen (z. B. Urlaub).'} />
        </div>
      )}

      {s.rolle === 'behoerde' && (
        <div className="space-y-2">
          <Link to="/anfragen/neu" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-sos-rot text-lg font-bold text-white shadow">
            <Icon name="plus" /> Neue Anfrage stellen
          </Link>
          <Link to="/export" className="karte flex min-h-12 items-center justify-center gap-2 font-semibold"><Icon name="download" className="h-5 w-5" /> Export (CSV / PDF)</Link>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center justify-between font-bold">
          <span>Offene Anfragen</span>
          <Link to="/anfragen" className="text-sm font-semibold text-himmel-700 dark:text-himmel-300">Alle & Karte</Link>
        </h2>
        {liste.laedt && !liste.daten ? <Laden /> : liste.fehler ? <Fehler fehler={liste.fehler} nochmal={liste.neu} /> : offene.length ? (
          offene.slice(0, 5).map((a) => <AnfrageZeile key={a.id} a={a} />)
        ) : (
          <p className="karte p-4 text-center text-sm text-slate-500">Gerade keine offenen Anfragen in deinen Regionen. 🐾</p>
        )}
      </section>

      {meine.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Meine laufenden Anfragen</h2>
          {meine.map((a) => <AnfrageZeile key={a.id} a={a} />)}
        </section>
      )}
    </div>
  );
}

/** Öffentliche Startseite */
function Oeffentlich({ d }: { d: StartDaten | null }) {
  return (
    <div className="space-y-4">
      <div className="karte overflow-hidden">
        <div className="wolken p-5 text-white">
          <h1 className="text-2xl font-extrabold">{d?.einstellungen.netzwerkName ?? config.name}</h1>
          <p className="opacity-90">{config.untertitel}</p>
        </div>
        <div className="space-y-3 p-4">
          <p>Sie haben einen auffälligen, entlaufenen oder herrenlosen Hund gesehen? Melden Sie ihn hier – erfahrene Helfer in Ihrer Region werden informiert.</p>
          <Link to="/melden" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-sos-rot text-lg font-bold text-white shadow">
            <Icon name="notfall" /> Hund melden
          </Link>
          <p className="rounded-xl bg-sonne-hell p-3 text-sm text-amber-950">
            <b>Gefahr für Menschen?</b> Bitte sofort <a href="tel:112" className="font-bold underline">112</a> oder <a href="tel:110" className="font-bold underline">110</a> anrufen.
          </p>
        </div>
      </div>
      {d?.einstellungen.info && <div className="karte md p-4" dangerouslySetInnerHTML={{ __html: markdown(d.einstellungen.info) }} />}
      <div className="grid grid-cols-2 gap-2">
        <Link to="/konto" className="karte flex min-h-16 items-center justify-center gap-2 p-3 font-semibold"><Icon name="schloss" /> Anmelden</Link>
        <Link to="/einladung" className="karte flex min-h-16 items-center justify-center gap-2 p-3 font-semibold"><Icon name="einladung" /> Einladung</Link>
      </div>
    </div>
  );
}

export default function Start() {
  const s = useSitzung();
  const [d, setD] = useState<StartDaten | null>(() => erinnere<StartDaten>(s ? 'start-' + s.mitgliedId : 'start'));
  const [fehler, setFehler] = useState('');
  const laden = () => {
    api<StartDaten>('start').then((x) => { setD(x); merke(s ? 'start-' + s.mitgliedId : 'start', x); setFehler(''); })
      .catch((e) => setFehler((e as Error).message));
  };
  useEffect(() => {
    document.title = config.name;
    laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.token]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-4">
      {fehler && !d && <Fehler fehler={fehler} nochmal={laden} />}
      {s ? (d ? <Angemeldet d={d} neu={laden} /> : <Laden />) : <Oeffentlich d={d} />}
    </div>
  );
}
