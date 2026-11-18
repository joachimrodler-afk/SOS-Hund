import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnfrageFormular, LEERE_ANFRAGE, type FormularErgebnis } from '../components/AnfrageFormular';
import { Hinweis, Seite, useLaden } from '../components/ui';
import { api } from '../lib/api';
import { markdown } from '../lib/helfer';
import { aufgabeStarten, type GeloesteAufgabe } from '../lib/aufgabe';
import type { Einstellungen } from '../lib/model';
import { useSitzung } from '../lib/sitzung';

/** Öffentliche Meldung: ohne Anmeldung, landet „ungeprüft“ bei der Regionalleitung */
export default function Melden() {
  const s = useSitzung();
  const [nummer, setNummer] = useState('');
  const einst = useLaden(() => api<Einstellungen>('einstellungen'));
  // Sicherheitsprüfung startet beim Öffnen und läuft im Hintergrund
  const aufgabe = useRef<Promise<GeloesteAufgabe> | null>(null);
  useEffect(() => {
    aufgabe.current = aufgabeStarten();
    aufgabe.current.catch(() => { /* wird beim Absenden gemeldet */ });
  }, []);

  async function senden(d: FormularErgebnis) {
    if (!aufgabe.current) aufgabe.current = aufgabeStarten();
    const geloest = await aufgabe.current;
    try {
      const r = await api<{ nummer?: string }>('melden', { ...d, aufgabe: geloest });
      setNummer(r.nummer ?? ' ');
      window.scrollTo(0, 0);
    } catch (err) {
      // abgelaufen oder schon benutzt: für den nächsten Versuch eine neue Aufgabe holen
      if (/Sicherheitsprüfung|bereits gesendet/.test((err as Error).message)) aufgabe.current = aufgabeStarten();
      throw err;
    }
  }

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
        {einst.daten?.meldenAktiv === false ? (
          <div className="space-y-3">
            <Hinweis art="warnung">Das Meldeformular ist gerade abgeschaltet. Bei Gefahr für Menschen bitte sofort den Notruf wählen.</Hinweis>
            <div className="flex gap-3">
              <a href="tel:112" className="flex-1 rounded-2xl bg-sos-rot py-4 text-center text-2xl font-bold text-white">112</a>
              <a href="tel:110" className="flex-1 rounded-2xl bg-himmel-800 py-4 text-center text-2xl font-bold text-white">110</a>
            </div>
            {einst.daten.notfall && <div className="karte md p-4" dangerouslySetInnerHTML={{ __html: markdown(einst.daten.notfall) }} />}
          </div>
        ) : (
          <AnfrageFormular start={LEERE_ANFRAGE} oeffentlich knopf="Meldung absenden" senden={senden} />
        )}
        <p className="text-center text-xs text-slate-500"><Link to="/info#datenschutz" className="underline">Datenschutzhinweis</Link></p>
      </div>
    </Seite>
  );
}
