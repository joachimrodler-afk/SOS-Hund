import { useEffect, useRef, useState } from 'react';
import { TelLink } from './Anfrage';
import { Icon } from './Icon';
import { Fehler, Hinweis, Knopf, Laden, useLaden } from './ui';
import { api } from '../lib/api';
import { klassen } from '../lib/helfer';

export interface Nachricht {
  id: string;
  leiterId: string;
  vonId: string;
  vonName: string;
  betreff: string;
  text: string;
  erstellt: string;
  vonAdmin: boolean;
}

export interface Verlauf {
  leiterId: string;
  name: string;
  regionen: string[];
  telefon: string;
  email: string;
  nachrichten: Nachricht[];
}

const zeit = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(+d)) return '';
  const heute = new Date().toDateString() === d.toDateString();
  return heute
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * Nachrichtenverlauf zwischen einem Regionalleiter und den Admins.
 * admin = true: Sicht des Admins (leiterId nötig, Antwort über nachricht_antworten).
 * admin = false: Sicht des Regionalleiters (eigener Verlauf, Senden über nachricht_an_admins).
 */
export function NachrichtenVerlauf({ admin, leiterId, kopf = true }: { admin: boolean; leiterId?: string; kopf?: boolean }) {
  const { daten, fehler, laedt, neu } = useLaden(() => api<Verlauf>('nachrichten_verlauf', admin ? { leiterId } : {}), [leiterId]);
  const [text, setText] = useState('');
  const [sendet, setSendet] = useState(false);
  const [msg, setMsg] = useState<{ art: 'ok' | 'warnung' | 'fehler'; text: string } | null>(null);
  const ende = useRef<HTMLDivElement>(null);

  useEffect(() => { ende.current?.scrollIntoView({ block: 'nearest' }); }, [daten?.nachrichten.length]);

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSendet(true); setMsg(null);
    try {
      const r = admin
        ? await api<{ push: number; mails: number }>('nachricht_antworten', { leiterId, text })
        : await api<{ push: number; mails: number }>('nachricht_an_admins', { text });
      setText('');
      if (!r.push && !r.mails) setMsg({ art: 'warnung', text: 'Gespeichert. Benachrichtigt wurde niemand (kein Push-Gerät, keine E-Mail) – die Nachricht erscheint beim nächsten Öffnen der App.' });
      await neu();
    } catch (err) {
      setMsg({ art: 'fehler', text: (err as Error).message });
    } finally {
      setSendet(false);
    }
  }

  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  const v = daten!;

  return (
    <div className="space-y-3">
      {kopf && admin && (
        <div className="karte space-y-1 p-4">
          <p className="text-lg font-bold">{v.name || 'Regionalleiter'}</p>
          {v.regionen.length > 0 && <p className="text-sm text-slate-500">Regionalleitung {v.regionen.join(', ')}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {v.telefon && <TelLink nummer={v.telefon} />}
            {v.email && <a href={`mailto:${v.email}`} className="underline">{v.email}</a>}
          </div>
        </div>
      )}

      <div className="karte max-h-[55vh] space-y-2 overflow-y-auto p-3" aria-live="polite">
        {!v.nachrichten.length && <p className="p-2 text-center text-sm text-slate-500">Noch keine Nachrichten.</p>}
        {v.nachrichten.map((n) => {
          const eigene = admin ? n.vonAdmin : !n.vonAdmin;
          return (
            <div key={n.id} className={klassen('flex', eigene ? 'justify-end' : 'justify-start')}>
              <div className={klassen('max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                eigene ? 'rounded-br-md bg-himmel-700 text-white' : 'rounded-bl-md bg-himmel-50 text-slate-900 ring-1 ring-himmel-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600')}>
                {!eigene && <p className="mb-0.5 text-xs font-bold opacity-80">{n.vonName}</p>}
                {n.betreff && <p className="font-semibold">{n.betreff}</p>}
                {n.text && <p className="whitespace-pre-wrap">{n.text}</p>}
                <p className={klassen('mt-1 text-right text-[11px]', eigene ? 'text-white/75' : 'text-slate-500')}>{zeit(n.erstellt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={ende} />
      </div>

      <form onSubmit={senden} className="flex items-end gap-2">
        <textarea className="eingabe min-h-12 flex-1" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={admin ? 'Antwort schreiben …' : 'Nachricht an die Admins …'} aria-label="Nachricht" />
        <Knopf type="submit" laedt={sendet} disabled={!text.trim()} aria-label="Senden" className="min-h-12 px-4"><Icon name="flieger" className="h-5 w-5" /></Knopf>
      </form>
      {msg && <Hinweis art={msg.art}>{msg.text}</Hinweis>}
    </div>
  );
}
