import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { Icon } from '../../components/Icon';
import { Fehler, Feld, Hinweis, Knopf, Laden, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';
import { klassen } from '../../lib/helfer';
import type { Region } from '../../lib/model';
import { regionenNeuLaden } from '../../lib/regionen';
import { useSitzung } from '../../lib/sitzung';

function Formular({ r, alle, fertig }: { r: Partial<Region>; alle: Region[]; fertig: () => void }) {
  const [d, setD] = useState({ id: r.id, name: r.name ?? '', plz: r.plz ?? '', nachbarn: r.nachbarn ?? [], aktiv: r.aktiv !== false });
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);
  async function los(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true); setFehler('');
    try { await api('region_speichern', d); regionenNeuLaden(); fertig(); } catch (err) { setFehler((err as Error).message); } finally { setLaedt(false); }
  }
  return (
    <form onSubmit={los} className="space-y-3 rounded-xl bg-himmel-50 p-3 dark:bg-slate-800">
      <Feld label="Name"><input className="eingabe" required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="z. B. LK München" /></Feld>
      <Feld label="Postleitzahlen" hilfe="Kommagetrennt: einzelne PLZ (85737), Anfang mit * (857*) oder Bereich (80331-81929). Die genaueste Angabe gewinnt.">
        <textarea className="eingabe min-h-20 font-mono" value={d.plz} onChange={(e) => setD({ ...d, plz: e.target.value })} placeholder="857*, 85540, 80331-81929" />
      </Feld>
      <Feld label="Nachbarregionen" hilfe="Bekommen eine Push-Nachricht, wenn niemand rechtzeitig übernimmt">
        <div className="flex flex-wrap gap-2">
          {alle.filter((x) => x.id !== d.id).map((x) => {
            const an = d.nachbarn.includes(x.id);
            return <button type="button" key={x.id} onClick={() => setD({ ...d, nachbarn: an ? d.nachbarn.filter((y) => y !== x.id) : [...d.nachbarn, x.id] })}
              className={klassen('min-h-9 rounded-full px-3 text-xs font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'bg-white ring-himmel-300 dark:bg-slate-900')}>{x.name}</button>;
          })}
        </div>
      </Feld>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={d.aktiv} onChange={(e) => setD({ ...d, aktiv: e.target.checked })} /> aktiv</label>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <div className="flex gap-2">
        <Knopf type="button" art="sekundaer" className="flex-1" onClick={fertig}>Abbrechen</Knopf>
        <Knopf type="submit" className="flex-1" laedt={laedt}>Speichern</Knopf>
      </div>
    </form>
  );
}

function Inhalt() {
  const s = useSitzung()!;
  const admin = s.rolle === 'admin';
  const { daten, fehler, laedt, neu } = useLaden(() => api<Region[]>('regionen_verwaltung'));
  const [bearbeitet, setBearbeitet] = useState<string | null>(null);
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  const alle = daten ?? [];
  const name = (id: string) => alle.find((x) => x.id === id)?.name ?? '?';
  const fertig = () => { setBearbeitet(null); void neu(); };
  return (
    <div className="space-y-3">
      {!alle.length && <Hinweis art="warnung">Noch keine Regionen angelegt. Ohne Region kann keine Anfrage zugeordnet werden.</Hinweis>}
      {admin && (bearbeitet === 'neu' ? <div className="karte p-3"><Formular r={{}} alle={alle} fertig={fertig} /></div> : (
        <Knopf art="sekundaer" className="w-full" onClick={() => setBearbeitet('neu')}><Icon name="plus" className="h-5 w-5" /> Neue Region</Knopf>
      ))}
      <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        {alle.map((r) => (
          <div key={r.id} className={klassen('px-4 py-3', !r.aktiv && 'opacity-60')}>
            {bearbeitet === r.id ? <Formular r={r} alle={alle} fertig={fertig} /> : (
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="font-semibold">{r.name}{!r.aktiv && ' (inaktiv)'}{s.regionen.includes(r.id) && <span className="ml-2 rounded-full bg-himmel-100 px-2 py-0.5 text-xs text-himmel-900">meine</span>}</p>
                  <p className="font-mono text-xs text-slate-500">{r.plz || 'keine PLZ'}</p>
                  <p className="text-xs text-slate-500">{r.mitglieder} Helfer{r.nachbarn?.length ? ` · Nachbarn: ${r.nachbarn.map(name).join(', ')}` : ''}</p>
                </div>
                {admin && <button onClick={() => setBearbeitet(r.id)} aria-label={`${r.name} bearbeiten`} className="p-2 text-himmel-700"><Icon name="stift" className="h-5 w-5" /></button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Regionen() {
  return (
    <Seite titel="Regionen">
      <NurAngemeldet rollen={['regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
