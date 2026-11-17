import { useState } from 'react';
import { NurAngemeldet } from '../../components/Anmelden';
import { Icon } from '../../components/Icon';
import { Feld, Hinweis, Knopf, Seite } from '../../components/ui';
import { api } from '../../lib/api';
import { klassen } from '../../lib/helfer';
import { useRegionen } from '../../lib/regionen';
import { useSitzung } from '../../lib/sitzung';

function Inhalt() {
  const s = useSitzung()!;
  const alle = useRegionen();
  const admin = s.rolle === 'admin';
  const waehlbar = admin ? alle : alle.filter((r) => s.regionen.includes(r.id));
  const [regionen, setRegionen] = useState<string[]>(admin ? [] : s.regionen);
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function senden(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm('Mitteilung jetzt als Push-Nachricht senden?')) return;
    setLaedt(true); setMsg(null);
    try {
      const r = await api<{ gesendet: number }>('mitteilung_senden', { titel, text, regionen });
      setMsg({ ok: true, text: `Gesendet an ${r.gesendet} Geräte.` });
      setTitel(''); setText('');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setLaedt(false);
    }
  }

  return (
    <form onSubmit={senden} className="karte space-y-3 p-4">
      <Feld label={admin ? 'An (keine Auswahl = alle)' : 'An'}>
        <div className="flex flex-wrap gap-2">
          {waehlbar.map((r) => {
            const an = regionen.includes(r.id);
            return <button type="button" key={r.id} onClick={() => setRegionen(an ? regionen.filter((x) => x !== r.id) : [...regionen, r.id])}
              className={klassen('min-h-10 rounded-full px-3 text-sm font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'ring-himmel-300')}>{r.name}</button>;
          })}
        </div>
      </Feld>
      <Feld label="Titel"><input className="eingabe" required maxLength={60} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Treffen am Samstag" /></Feld>
      <Feld label="Text"><textarea className="eingabe min-h-24" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></Feld>
      {msg && <Hinweis art={msg.ok ? 'ok' : 'fehler'}>{msg.text}</Hinweis>}
      <Knopf type="submit" className="w-full" laedt={laedt} disabled={!admin && !regionen.length}><Icon name="glocke" className="h-5 w-5" /> Senden</Knopf>
    </form>
  );
}

export default function Mitteilung() {
  return (
    <Seite titel="Mitteilung senden">
      <NurAngemeldet rollen={['regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
