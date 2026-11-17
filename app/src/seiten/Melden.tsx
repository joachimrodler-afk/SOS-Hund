import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnfrageFormular, LEERE_ANFRAGE } from '../components/AnfrageFormular';
import { Hinweis, Seite } from '../components/ui';
import { api } from '../lib/api';
import { useSitzung } from '../lib/sitzung';

/** Öffentliche Meldung: ohne Anmeldung, landet „ungeprüft“ bei der Regionalleitung */
export default function Melden() {
  const s = useSitzung();
  const [nummer, setNummer] = useState('');

  if (nummer) {
    return (
      <Seite titel="Danke!">
        <div className="space-y-4">
          <Hinweis art="ok">
            Ihre Meldung ist eingegangen{nummer ? <> (Nummer <b>{nummer}</b>)</> : ''}. Die Regionalleitung prüft sie und informiert die Helfer in der Nähe.
            Wir melden uns bei Ihnen unter der angegebenen Telefonnummer.
          </Hinweis>
          <Hinweis art="warnung">Bitte halten Sie Abstand zum Hund und versuchen Sie nicht, ihn selbst einzufangen. Bei Gefahr für Menschen: <a className="font-bold underline" href="tel:112">112</a>.</Hinweis>
          <Link to="/" className="block text-center font-semibold text-himmel-700 underline dark:text-himmel-300">Zur Startseite</Link>
        </div>
      </Seite>
    );
  }

  return (
    <Seite titel="Hund melden">
      <div className="space-y-4">
        {s && <Hinweis>Du bist angemeldet. <Link to="/anfragen/neu" className="font-semibold underline">Als Anfrage anlegen</Link> – dann werden die Helfer sofort benachrichtigt.</Hinweis>}
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Je genauer Ihre Angaben, desto schneller kann geholfen werden. Pflichtfelder sind mit * markiert.
          Die Meldung wird geprüft und dann an die Helfer in Ihrer Region weitergegeben.
        </p>
        <AnfrageFormular start={LEERE_ANFRAGE} oeffentlich knopf="Meldung absenden"
          senden={async (d) => { const r = await api<{ nummer?: string }>('melden', { ...d }); setNummer(r.nummer ?? ' '); window.scrollTo(0, 0); }} />
        <p className="text-center text-xs text-slate-500"><Link to="/info#datenschutz" className="underline">Datenschutzhinweis</Link></p>
      </div>
    </Seite>
  );
}
