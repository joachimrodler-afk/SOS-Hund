import { NurAngemeldet } from '../../components/Anmelden';
import { Seite, useLaden, Zeile } from '../../components/ui';
import { api } from '../../lib/api';
import type { StartDaten } from '../../lib/model';
import { useSitzung } from '../../lib/sitzung';

function Inhalt() {
  const s = useSitzung()!;
  const { daten } = useLaden(() => api<StartDaten>('start'), [s.token]);
  const admin = s.rolle === 'admin';
  const zahl = (n?: number) => (n ? <span className="rounded-full bg-sos-rot px-2.5 py-0.5 text-xs font-bold text-white">{n}</span> : undefined);
  return (
    <div className="space-y-4">
      <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        <Zeile zu="/anfragen" icon="liste" titel="Meldungen prüfen" text="Öffentliche Meldungen freigeben oder verwerfen" rechts={zahl(daten?.ungeprueft)} />
        <Zeile zu="/verwaltung/zugaenge" icon="einladung" titel="Einladungen & Registrierungen" text="Einladen, freigeben, PIN verschicken" rechts={zahl(daten?.registrierungen)} />
        <Zeile zu="/verwaltung/mitglieder" icon="personen" titel="Zugänge" text={admin ? 'Mitglieder, Regionalleiter, Behörden, Admins' : 'Mitglieder und Behörden deiner Regionen'} />
        <Zeile zu="/verwaltung/regionen" icon="karte" titel="Regionen" text={admin ? 'PLZ-Bereiche und Nachbarregionen' : 'Übersicht'} />
        {admin && <Zeile zu="/nachrichten" icon="sprechblase" titel="Nachrichten" text="Von Regionalleitern lesen und beantworten" rechts={zahl(daten?.nachrichten)} />}
        {admin && <Zeile zu="/verwaltung/karte" icon="karte" titel="Deutschlandkarte" text="Vergebene Gebiete, Regionalleiter, freie PLZ-Bereiche" />}
        <Zeile zu="/verwaltung/mitteilung" icon="glocke" titel="Mitteilung senden" text={admin ? 'Push an alle oder einzelne Regionen' : 'Push an deine Regionen'} />
        <Zeile zu="/export" icon="download" titel="Export" text="Anfragen als CSV oder PDF" />
        {admin && <Zeile zu="/verwaltung/einstellungen" icon="zahnrad" titel="Einstellungen" text="Texte, Eskalation, Datenschutz" />}
        {admin && <Zeile zu="/verwaltung/protokoll" icon="uhr" titel="Zugriffsprotokoll" text="Wer hat welche Anfrage angesehen oder geändert" />}
      </div>
      <div className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        {!admin && <Zeile zu="/verwaltung/admin-kontakt" icon="telefon" titel="Admin kontaktieren" text="Anrufen, E-Mail oder Nachricht an die Admins" rechts={zahl(daten?.nachrichten)} />}
        <Zeile zu="/konto" icon="person" titel="Mein Konto" text="Angaben, Push, PIN ändern, Abmelden" />
      </div>
    </div>
  );
}

export default function Verwaltung() {
  return (
    <Seite titel="Verwaltung" zurueck={false}>
      <NurAngemeldet rollen={['regionalleiter', 'admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
