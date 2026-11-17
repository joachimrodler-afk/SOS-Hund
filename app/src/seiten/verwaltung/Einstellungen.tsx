import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { Fehler, Feld, Hinweis, Knopf, Laden, Schalter, Seite, useLaden } from '../../components/ui';
import { api, merke } from '../../lib/api';
import type { Einstellungen } from '../../lib/model';

function Inhalt() {
  const { daten, setDaten, fehler, neu } = useLaden(() => api<Einstellungen>('einstellungen'));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [laedt, setLaedt] = useState(false);
  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (!daten) return <Laden />;
  const e = daten;
  const setze = (x: Partial<Einstellungen>) => setDaten({ ...e, ...x });

  async function speichern(ev: React.FormEvent) {
    ev.preventDefault();
    setLaedt(true); setMsg(null);
    try {
      const r = await api<Einstellungen>('einstellungen_speichern', { ...e });
      setDaten(r);
      merke('einstellungen', r);
      setMsg({ ok: true, text: 'Gespeichert.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setLaedt(false);
    }
  }

  return (
    <form onSubmit={speichern} className="space-y-4">
      <div className="karte space-y-3 p-4">
        <h2 className="font-bold">Texte (öffentlich)</h2>
        <Feld label="Name des Netzwerks"><input className="eingabe" value={e.netzwerkName} onChange={(x) => setze({ netzwerkName: x.target.value })} /></Feld>
        <Feld label="Info-Seite" hilfe="Markdown: ## Überschrift, - Liste, **fett**, [Text](https://…)">
          <textarea className="eingabe min-h-48 font-mono text-sm" value={e.info} onChange={(x) => setze({ info: x.target.value })} />
        </Feld>
        <Feld label="Notfall-Kontakte" hilfe="z. B. - **Tierheim:** [089 123](tel:089123)">
          <textarea className="eingabe min-h-24 font-mono text-sm" value={e.notfall} onChange={(x) => setze({ notfall: x.target.value })} />
        </Feld>
        <Feld label="Datenschutzhinweis">
          <textarea className="eingabe min-h-28 text-sm" value={e.datenschutz} onChange={(x) => setze({ datenschutz: x.target.value })} />
        </Feld>
      </div>
      <div className="karte space-y-3 p-4">
        <h2 className="font-bold">Eskalation</h2>
        <div className="-mx-4 border-y border-himmel-100 dark:border-slate-700">
          <Schalter an={!!e.eskalationAktiv} onChange={(v) => setze({ eskalationAktiv: v })} label="Nachbarregionen benachrichtigen" text="wenn eine Anfrage nicht rechtzeitig übernommen wird" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Feld label="nach Minuten (normal/dringend)"><input className="eingabe" type="number" min={5} max={720} value={e.eskalationMin} onChange={(x) => setze({ eskalationMin: Number(x.target.value) })} /></Feld>
          <Feld label="nach Minuten (akut)"><input className="eingabe" type="number" min={5} max={720} value={e.eskalationAkutMin} onChange={(x) => setze({ eskalationAkutMin: Number(x.target.value) })} /></Feld>
        </div>
        <p className="text-xs text-slate-500">Geprüft wird alle 5 Minuten. Die Regionalleitung wird zusätzlich informiert.</p>
      </div>
      <div className="karte space-y-3 p-4">
        <h2 className="font-bold">Datenschutz & Auftraggeber</h2>
        <Feld label="Anonymisieren nach (Monaten)" hilfe="Abgeschlossene Anfragen: Namen, Adressen, Telefonnummern und Notizen werden gelöscht, Hund, Ort und Datum bleiben für die Statistik.">
          <input className="eingabe" type="number" min={1} max={120} value={e.anonymMonate} onChange={(x) => setze({ anonymMonate: Number(x.target.value) })} />
        </Feld>
        <div className="-mx-4 border-t border-himmel-100 dark:border-slate-700">
          <Schalter an={!!e.auftraggeberMail} onChange={(v) => setze({ auftraggeberMail: v })} label="Auftraggeber per E-Mail informieren" text="wenn jemand die Anfrage übernimmt (nur wenn eine E-Mail angegeben ist)" />
        </div>
      </div>
      {msg && <Hinweis art={msg.ok ? 'ok' : 'fehler'}>{msg.text}</Hinweis>}
      <Knopf type="submit" className="w-full" laedt={laedt}>Speichern</Knopf>
    </form>
  );
}

export default function EinstellungenSeite() {
  return (
    <Seite titel="Einstellungen">
      <NurAngemeldet rollen={['admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
