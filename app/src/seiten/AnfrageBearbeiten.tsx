import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NurAngemeldet } from '../components/Anmelden';
import { AnfrageFormular, LEERE_ANFRAGE } from '../components/AnfrageFormular';
import { Fehler, Feld, Hinweis, Laden, Seite, useLaden } from '../components/ui';
import { api } from '../lib/api';
import type { AnfrageDetail, AnfrageEingabe } from '../lib/model';
import { useRegionen } from '../lib/regionen';
import { useSitzung } from '../lib/sitzung';

function Inhalt({ id }: { id: string }) {
  const s = useSitzung()!;
  const nav = useNavigate();
  const alle = useRegionen();
  const { daten: a, fehler, neu } = useLaden(() => api<AnfrageDetail>('anfrage_detail', { id }), [id]);
  const [region, setRegion] = useState<string | null>(null);

  if (fehler) return <Fehler fehler={fehler} nochmal={neu} />;
  if (!a) return <Laden />;
  if (!a.rechte.aendern) return <Hinweis art="warnung">Diese Anfrage kannst du nicht mehr bearbeiten.</Hinweis>;

  const d = a.details;
  const start: AnfrageEingabe = {
    dringlichkeit: a.dringlichkeit,
    beschreibung: d.beschreibung ?? '',
    vorfall: d.vorfall ?? '',
    hund: { ...LEERE_ANFRAGE.hund, ...d.hund },
    adresse: { ...LEERE_ANFRAGE.adresse, ...d.adresse },
    auftraggeber: { ...LEERE_ANFRAGE.auftraggeber, ...d.auftraggeber },
  };
  const waehlbar = s.rolle === 'admin' ? alle : alle.filter((r) => s.regionen.includes(r.id));
  const aktuell = region ?? a.region;

  return (
    <AnfrageFormular start={start} knopf="Änderungen speichern"
      zusatz={a.rechte.leiten && (
        <div className="karte p-4">
          <Feld label="Region" hilfe="Wird sonst automatisch über die PLZ bestimmt. Bei Änderung einer offenen Anfrage wird die neue Region benachrichtigt.">
            <select className="eingabe" value={aktuell} onChange={(e) => setRegion(e.target.value)}>
              <option value="">– keine –</option>
              {waehlbar.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              {aktuell && !waehlbar.some((r) => r.id === aktuell) && <option value={aktuell}>{a.regionName}</option>}
            </select>
          </Feld>
        </div>
      )}
      senden={async (x) => {
        await api('anfrage_bearbeiten', { ...x, id, ...(a.rechte.leiten && region !== null ? { region } : {}) });
        nav(`/anfragen/${id}`, { replace: true });
      }} />
  );
}

export default function AnfrageBearbeiten() {
  const { id = '' } = useParams();
  return (
    <Seite titel="Anfrage bearbeiten">
      <NurAngemeldet><Inhalt id={id} /></NurAngemeldet>
    </Seite>
  );
}
