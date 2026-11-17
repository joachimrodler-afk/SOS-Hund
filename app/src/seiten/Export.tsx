import { useState } from 'react';
import { NurAngemeldet } from '../components/Anmelden';
import { Icon } from '../components/Icon';
import { Feld, Hinweis, Knopf, Seite } from '../components/ui';
import { api } from '../lib/api';
import { herunterladen } from '../lib/helfer';

type ExportZeile = Record<string, string>;

const SPALTEN: [string, string][] = [
  ['nummer', 'Nummer'], ['erstellt', 'Erstellt'], ['region', 'Region'], ['status', 'Status'], ['dringlichkeit', 'Dringlichkeit'],
  ['quelle', 'Quelle'], ['beschreibung', 'Beschreibung'], ['hund', 'Hund'], ['alter', 'Alter'], ['ort', 'Ort'], ['strasse', 'Straße'],
  ['halter', 'Halter'], ['auftraggeber', 'Auftraggeber'], ['uebernommen', 'Übernommen von'], ['helfer', 'Helfer'], ['abgeschlossen', 'Abgeschlossen'],
];

const datum = (iso: string) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '');

function Inhalt() {
  const heute = new Date().toISOString().slice(0, 10);
  const [von, setVon] = useState(`${new Date().getFullYear()}-01-01`);
  const [bis, setBis] = useState(heute);
  const [zeilen, setZeilen] = useState<ExportZeile[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);

  async function laden() {
    setLaedt(true); setFehler('');
    try { setZeilen(await api<ExportZeile[]>('export', { von, bis })); } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }

  function csv() {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const text = [SPALTEN.map(([, n]) => esc(n)).join(';'),
      ...zeilen!.map((z) => SPALTEN.map(([k]) => esc(k === 'erstellt' || k === 'abgeschlossen' ? datum(z[k]) : z[k])).join(';'))].join('\r\n');
    herunterladen(`sos-hund_${von}_${bis}.csv`, '﻿' + text, 'text/csv;charset=utf-8');
  }

  return (
    <div className="space-y-4">
      <div className="karte nicht-drucken space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Von"><input type="date" className="eingabe" value={von} onChange={(e) => setVon(e.target.value)} /></Feld>
          <Feld label="Bis"><input type="date" className="eingabe" value={bis} onChange={(e) => setBis(e.target.value)} /></Feld>
        </div>
        <Knopf className="w-full" onClick={laden} laedt={laedt}>Anfragen laden</Knopf>
        {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      </div>
      {zeilen && (
        <>
          <div className="nicht-drucken grid grid-cols-2 gap-2">
            <Knopf art="sekundaer" onClick={csv} disabled={!zeilen.length}><Icon name="download" className="h-5 w-5" /> CSV (Excel)</Knopf>
            <Knopf art="sekundaer" onClick={() => window.print()} disabled={!zeilen.length}><Icon name="drucker" className="h-5 w-5" /> Drucken / PDF</Knopf>
          </div>
          <p className="text-sm text-slate-500">{zeilen.length} Anfragen vom {new Date(von).toLocaleDateString('de-DE')} bis {new Date(bis).toLocaleDateString('de-DE')}. Der Export wird protokolliert.</p>
          <div className="karte overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-himmel-100 dark:bg-slate-800">
                <tr>{SPALTEN.filter(([k]) => !['quelle', 'strasse', 'halter', 'alter'].includes(k)).map(([k, n]) => <th key={k} className="px-2 py-2">{n}</th>)}</tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.nummer} className="border-t border-himmel-100 align-top dark:border-slate-700">
                    {SPALTEN.filter(([k]) => !['quelle', 'strasse', 'halter', 'alter'].includes(k)).map(([k]) => (
                      <td key={k} className="px-2 py-1.5">{k === 'erstellt' || k === 'abgeschlossen' ? datum(z[k]) : z[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function Export() {
  return (
    <Seite titel="Export">
      <NurAngemeldet rollen={['behoerde', 'regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
