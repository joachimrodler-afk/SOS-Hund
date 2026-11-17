import { Link } from 'react-router-dom';
import { NurAngemeldet } from '../../components/Anmelden';
import { Fehler, Laden, Leer, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';

interface Eintrag { zeit: string; name: string; aktion: string; anfrageId: string }

function Inhalt() {
  const { daten, fehler, laedt, neu } = useLaden(() => api<Eintrag[]>('protokoll'));
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  if (!daten?.length) return <Leer>Noch keine Einträge.</Leer>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">Die letzten {daten.length} Zugriffe. Einträge werden mit den Anfragen nach der Anonymisierungsfrist gelöscht.</p>
      <div className="karte overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-himmel-100 dark:bg-slate-800"><tr><th className="px-3 py-2">Zeit</th><th className="px-3 py-2">Wer</th><th className="px-3 py-2">Aktion</th></tr></thead>
          <tbody>
            {daten.map((e, i) => (
              <tr key={i} className="border-t border-himmel-100 dark:border-slate-700">
                <td className="whitespace-nowrap px-3 py-1.5 text-xs">{new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-1.5">{e.name}</td>
                <td className="px-3 py-1.5">{e.anfrageId ? <Link to={`/anfragen/${e.anfrageId}`} className="underline">{e.aktion}</Link> : e.aktion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Protokoll() {
  return (
    <Seite titel="Zugriffsprotokoll">
      <NurAngemeldet rollen={['admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
