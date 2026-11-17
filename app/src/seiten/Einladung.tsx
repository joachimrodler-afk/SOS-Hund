import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Feld, Hinweis, Knopf, Seite } from '../components/ui';
import { api } from '../lib/api';
import { klassen } from '../lib/helfer';
import { ROLLEN_NAME, type Rolle } from '../lib/model';
import { useRegionen } from '../lib/regionen';

interface Pruefung { code: string; rolle: Rolle; regionen: string[]; ablauf: string }

/** Registrierung mit Einladungscode: Angaben eintragen, Leitung gibt frei und schickt den PIN */
export default function Einladung() {
  const { code: ausLink = '' } = useParams();
  const alle = useRegionen();
  const [code, setCode] = useState(ausLink.toUpperCase());
  const [e, setE] = useState<Pruefung | null>(null);
  const [f, setF] = useState({ vorname: '', nachname: '', telefon: '', email: '', organisation: '', nachricht: '' });
  const [regionen, setRegionen] = useState<string[]>([]);
  const [datenschutz, setDatenschutz] = useState(false);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fertig, setFertig] = useState(false);

  async function pruefen(c = code) {
    setLaedt(true); setFehler('');
    try {
      const r = await api<Pruefung>('einladung_pruefen', { code: c });
      setE(r);
      setRegionen(r.regionen);
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaedt(false);
    }
  }
  useEffect(() => { if (ausLink) void pruefen(ausLink); }, [ausLink]); // eslint-disable-line react-hooks/exhaustive-deps

  async function registrieren(ev: React.FormEvent) {
    ev.preventDefault();
    setLaedt(true); setFehler('');
    try {
      await api('registrieren', { ...f, code: e!.code, regionen, datenschutz });
      setFertig(true);
    } catch (err) {
      setFehler((err as Error).message);
    } finally {
      setLaedt(false);
    }
  }

  if (fertig) {
    return (
      <Seite titel="Registrierung gesendet">
        <div className="space-y-4">
          <Hinweis art="ok">Danke, {f.vorname}! Deine Angaben sind bei der Regionalleitung. Nach der Freigabe bekommst du deinen persönlichen PIN per WhatsApp, SMS oder E-Mail.</Hinweis>
          <Link to="/konto" className="block text-center font-semibold underline">Zur Anmeldung</Link>
        </div>
      </Seite>
    );
  }

  const feld = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Feld label={label}><input className="eingabe" value={f[k]} onChange={(x) => setF({ ...f, [k]: x.target.value })} {...extra} /></Feld>
  );

  return (
    <Seite titel="Einladung">
      {!e ? (
        <form onSubmit={(ev) => { ev.preventDefault(); void pruefen(); }} className="karte space-y-4 p-5">
          <p>Du wurdest in das Netzwerk eingeladen? Gib hier deinen Einladungscode ein.</p>
          <Feld label="Einladungscode">
            <input className="eingabe text-center font-mono text-2xl tracking-[0.3em] uppercase" value={code} maxLength={12} required autoCapitalize="characters"
              onChange={(x) => setCode(x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABCD2345" />
          </Feld>
          {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
          <Knopf type="submit" className="w-full" laedt={laedt}>Weiter</Knopf>
        </form>
      ) : (
        <form onSubmit={registrieren} className="space-y-4">
          <Hinweis art="ok">Einladung gültig: Zugang als <b>{ROLLEN_NAME[e.rolle]}</b>. Bitte trage deine Angaben ein.</Hinweis>
          <div className="karte space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              {feld('vorname', 'Vorname *', { required: true, autoComplete: 'given-name', maxLength: 40 })}
              {feld('nachname', 'Nachname *', { required: true, autoComplete: 'family-name', maxLength: 40 })}
            </div>
            {feld('telefon', 'Handynummer *', { required: true, type: 'tel', autoComplete: 'tel', maxLength: 40 })}
            {feld('email', 'E-Mail', { type: 'email', autoComplete: 'email', maxLength: 80 })}
            {e.rolle === 'behoerde' && feld('organisation', 'Behörde *', { required: true, maxLength: 80, placeholder: 'z. B. Veterinäramt LK München' })}
            {e.rolle === 'mitglied' && (
              <Feld label="In welchen Regionen kannst du helfen?">
                <div className="flex flex-wrap gap-2">
                  {alle.map((r) => {
                    const an = regionen.includes(r.id);
                    return (
                      <button type="button" key={r.id} aria-pressed={an} onClick={() => setRegionen(an ? regionen.filter((x) => x !== r.id) : [...regionen, r.id])}
                        className={klassen('min-h-10 rounded-full px-3 text-sm font-semibold ring-1', an ? 'bg-himmel-700 text-white ring-himmel-700' : 'ring-himmel-300')}>
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </Feld>
            )}
            {e.rolle === 'mitglied' && feld('nachricht', 'Erfahrung / Ausstattung (optional)', { maxLength: 300, placeholder: 'z. B. Hundetrainerin, Transportbox vorhanden' })}
          </div>
          <label className="karte flex items-start gap-3 p-4 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={datenschutz} onChange={(x) => setDatenschutz(x.target.checked)} />
            <span>Ich bin einverstanden, dass mein Name, meine Telefonnummer und meine Regionen im Netzwerk gespeichert und den Beteiligten einer Anfrage angezeigt werden. <Link to="/info#datenschutz" className="underline">Datenschutz</Link> *</span>
          </label>
          {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
          <Knopf type="submit" className="w-full" laedt={laedt} disabled={!datenschutz}>Registrieren</Knopf>
        </form>
      )}
    </Seite>
  );
}
