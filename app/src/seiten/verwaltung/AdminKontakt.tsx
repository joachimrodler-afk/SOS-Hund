import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { TelLink } from '../../components/Anfrage';
import { Icon } from '../../components/Icon';
import { Fehler, Feld, Hinweis, Knopf, Laden, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';

interface Admin { id: string; name: string; telefon: string; email: string }

function Inhalt() {
  const { daten, fehler, laedt, neu } = useLaden(() => api<Admin[]>('admins_kontakt'));
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ art: 'ok' | 'warnung' | 'fehler'; text: string } | null>(null);
  const [sendet, setSendet] = useState(false);

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    setSendet(true); setMsg(null);
    try {
      const r = await api<{ push: number; mails: number; admins: number }>('nachricht_an_admins', { titel, text });
      const wege = [r.push ? `Push an ${r.push} Gerät${r.push === 1 ? '' : 'e'}` : '', r.mails ? `E-Mail an ${r.mails} Admin${r.mails === 1 ? '' : 's'}` : ''].filter(Boolean);
      if (wege.length) {
        setMsg({ art: 'ok', text: `Gesendet: ${wege.join(' und ')}.` });
        setTitel(''); setText('');
      } else {
        setMsg({ art: 'warnung', text: 'Die Nachricht konnte nicht zugestellt werden (kein Push-Gerät und keine E-Mail hinterlegt). Bitte ruf den Admin an.' });
      }
    } catch (err) {
      setMsg({ art: 'fehler', text: (err as Error).message });
    } finally {
      setSendet(false);
    }
  }

  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (laedt && !daten) return <Laden />;
  const admins = daten ?? [];

  return (
    <div className="space-y-4">
      <section className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        <h2 className="px-4 py-3 font-bold">Admins</h2>
        {!admins.length && <p className="px-4 py-3 text-sm text-slate-500">Kein Admin gefunden.</p>}
        {admins.map((a) => (
          <div key={a.id} className="space-y-1 px-4 py-3">
            <p className="font-semibold">{a.name}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {a.telefon ? <TelLink nummer={a.telefon} /> : <span className="text-slate-500">kein Telefon hinterlegt</span>}
              {a.email && <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 underline"><Icon name="sprechblase" className="h-4 w-4" />{a.email}</a>}
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={senden} className="karte space-y-3 p-4">
        <h2 className="font-bold">Nachricht an die Admins</h2>
        <p className="text-sm text-slate-500">Geht als Push-Nachricht an alle Admins und zusätzlich per E-Mail, falls sie eine E-Mail-Adresse hinterlegt haben. Deine Telefonnummer und E-Mail werden mitgeschickt.</p>
        <Feld label="Betreff"><input className="eingabe" required maxLength={80} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Neue Helfer für die Region" /></Feld>
        <Feld label="Nachricht"><textarea className="eingabe min-h-28" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></Feld>
        {msg && <Hinweis art={msg.art}>{msg.text}</Hinweis>}
        <Knopf type="submit" className="w-full" laedt={sendet} disabled={!admins.length}><Icon name="flieger" className="h-5 w-5" /> Senden</Knopf>
      </form>
    </div>
  );
}

export default function AdminKontakt() {
  return (
    <Seite titel="Admin kontaktieren">
      <NurAngemeldet rollen={['regionalleiter']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
