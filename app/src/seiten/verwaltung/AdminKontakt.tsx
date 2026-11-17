import { NurAngemeldet } from '../../components/Anmelden';
import { TelLink } from '../../components/Anfrage';
import { Icon } from '../../components/Icon';
import { NachrichtenVerlauf } from '../../components/Nachrichten';
import { Fehler, Laden, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';

interface Admin { id: string; name: string; telefon: string; email: string }

function Inhalt() {
  const { daten, fehler, laedt, neu } = useLaden(() => api<Admin[]>('admins_kontakt'));
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

      <section className="space-y-2">
        <h2 className="font-bold">Nachrichten mit den Admins</h2>
        <p className="text-sm text-slate-500">Die Admins sehen deine Nachricht in der App und bekommen sie zusätzlich per Push bzw. E-Mail. Antworten erscheinen hier.</p>
        <NachrichtenVerlauf admin={false} kopf={false} />
      </section>
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
