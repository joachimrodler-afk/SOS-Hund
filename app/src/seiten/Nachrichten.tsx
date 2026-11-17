import { useSearchParams } from 'react-router-dom';
import { NurAngemeldet } from '../components/Anmelden';
import { NachrichtenVerlauf, type Nachricht } from '../components/Nachrichten';
import { Fehler, Laden, Leer, Seite, useLaden, Zeile } from '../components/ui';
import { api } from '../lib/api';

interface Uebersicht {
  leiterId: string;
  name: string;
  regionen: string[];
  ungelesen: number;
  anzahl: number;
  letzte: Nachricht;
}

function Liste() {
  const { daten, fehler, laedt, neu } = useLaden(() => api<Uebersicht[]>('nachrichten_uebersicht'));
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  const liste = daten ?? [];
  if (!liste.length) return <Leer>Noch keine Nachrichten von Regionalleitern.</Leer>;
  return (
    <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
      {liste.map((v) => (
        <Zeile key={v.leiterId} zu={`/nachrichten?leiter=${encodeURIComponent(v.leiterId)}`} icon="sprechblase"
          titel={`${v.name}${v.regionen.length ? ` · ${v.regionen.join(', ')}` : ''}`}
          text={`${v.letzte.vonAdmin ? 'Du: ' : ''}${v.letzte.betreff || v.letzte.text}`.slice(0, 90)}
          rechts={v.ungelesen ? <span className="rounded-full bg-sos-rot px-2.5 py-0.5 text-xs font-bold text-white">{v.ungelesen}</span> : undefined} />
      ))}
    </div>
  );
}

export default function Nachrichten() {
  const [params] = useSearchParams();
  const leiter = params.get('leiter');
  return (
    <Seite titel={leiter ? 'Nachrichtenverlauf' : 'Nachrichten'}>
      <NurAngemeldet rollen={['admin']}>
        {leiter ? <NachrichtenVerlauf admin leiterId={leiter} /> : <Liste />}
      </NurAngemeldet>
    </Seite>
  );
}
