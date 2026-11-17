import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NurAngemeldet } from '../components/Anmelden';
import { AnfrageFormular, LEERE_ANFRAGE } from '../components/AnfrageFormular';
import { Hinweis, Knopf, Laden, Seite, useLaden } from '../components/ui';
import { api } from '../lib/api';
import type { AnfrageEingabe, Mitglied } from '../lib/model';
import { useSitzung } from '../lib/sitzung';

function Inhalt() {
  const s = useSitzung()!;
  const nav = useNavigate();
  const ich = useLaden(() => api<Mitglied>('ich'), [s.token]);
  const [ergebnis, setErgebnis] = useState<{ id: string; nummer: string; region: string; benachrichtigt: number } | null>(null);

  if (ergebnis) {
    return (
      <div className="space-y-3">
        <Hinweis art="ok">
          Anfrage <b>{ergebnis.nummer}</b> ist angelegt.{' '}
          {ergebnis.region ? `${ergebnis.benachrichtigt} Helfer in der Region wurden benachrichtigt.` : 'Die PLZ gehört zu keiner Region – die Admins wurden informiert und ordnen sie zu.'}
        </Hinweis>
        <Knopf className="w-full" onClick={() => nav(`/anfragen/${ergebnis.id}`, { replace: true })}>Zur Anfrage</Knopf>
        <Link to="/anfragen" className="block text-center font-semibold underline">Alle Anfragen</Link>
      </div>
    );
  }
  if (ich.laedt && !ich.daten) return <Laden />;

  const m = ich.daten;
  const start: AnfrageEingabe = s.rolle === 'behoerde' && m
    ? { ...LEERE_ANFRAGE, auftraggeber: { name: `${m.vorname} ${m.nachname}`, organisation: m.organisation, telefon: m.telefon, email: m.email, erreichbar: '' } }
    : LEERE_ANFRAGE;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Die Anfrage wird über die PLZ einer Region zugeordnet. Alle einsatzbereiten Helfer dort bekommen sofort eine Push-Nachricht (ohne Adresse).
      </p>
      <AnfrageFormular start={start} knopf="Anfrage senden" senden={async (d) => {
        const r = await api<{ id: string; nummer: string; region: string; benachrichtigt: number }>('anfrage_anlegen', { ...d });
        setErgebnis(r);
        window.scrollTo(0, 0);
      }} />
    </div>
  );
}

export default function AnfrageNeu() {
  return (
    <Seite titel="Neue Anfrage">
      <NurAngemeldet text="Bitte anmelden, um eine Anfrage anzulegen. Ohne Zugang können Sie einen Hund unter „Melden“ melden.">
        <Inhalt />
      </NurAngemeldet>
    </Seite>
  );
}
