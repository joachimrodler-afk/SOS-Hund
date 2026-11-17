import { useState, type ReactNode } from 'react';
import { klassen } from '../lib/helfer';
import type { AnfrageEingabe, Dringlichkeit } from '../lib/model';
import { Feld, Hinweis, Knopf } from './ui';
import { Icon } from './Icon';

export const LEERE_ANFRAGE: AnfrageEingabe = {
  dringlichkeit: 'normal',
  beschreibung: '',
  vorfall: '',
  hund: { rasse: '', groesse: '', farbe: '', alter: '', geschlecht: '', merkmale: '', name: '', anzahl: 1 },
  adresse: { halter: '', strasse: '', plz: '', ort: '', hinweis: '', lat: null, lon: null },
  auftraggeber: { name: '', organisation: '', telefon: '', email: '', erreichbar: '', istHalter: false },
};

const GROESSEN = ['klein', 'mittel', 'groß', 'sehr groß'];

function Abschnitt({ nr, titel, children }: { nr: number; titel: string; children: ReactNode }) {
  return (
    <fieldset className="karte space-y-3 p-4">
      <legend className="sr-only">{titel}</legend>
      <h2 className="flex items-center gap-2 font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-himmel-700 text-sm text-white">{nr}</span>
        {titel}
      </h2>
      {children}
    </fieldset>
  );
}

export interface FormularErgebnis extends AnfrageEingabe {
  datenschutz?: boolean;
  website?: string;
}

/**
 * Formular für eine SOS-Anfrage. Wird für öffentliche Meldungen, neue Anfragen von Mitgliedern
 * und Behörden sowie zum Bearbeiten benutzt.
 */
export function AnfrageFormular({ start, oeffentlich = false, knopf, senden, zusatz }: {
  start: AnfrageEingabe;
  oeffentlich?: boolean;
  knopf: string;
  senden: (d: FormularErgebnis) => Promise<void>;
  zusatz?: ReactNode;
}) {
  const [d, setD] = useState<AnfrageEingabe>(start);
  const [datenschutz, setDatenschutz] = useState(false);
  const [website, setWebsite] = useState('');
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [ortSucht, setOrtSucht] = useState(false);

  const hund = (k: keyof AnfrageEingabe['hund'], v: string | number) => setD({ ...d, hund: { ...d.hund, [k]: v } });
  // Ändert sich die Adresse, passen die alten Koordinaten nicht mehr – das Backend sucht sie neu
  const adr = (k: keyof AnfrageEingabe['adresse'], v: string | number | null) =>
    setD({ ...d, adresse: { ...d.adresse, [k]: v, ...(['strasse', 'plz', 'ort'].includes(k) ? { lat: null, lon: null } : {}) } });
  const ag = (k: keyof AnfrageEingabe['auftraggeber'], v: string) =>
    setD({ ...d, auftraggeber: { ...d.auftraggeber, [k]: v }, ...(k === 'name' && d.auftraggeber.istHalter ? { adresse: { ...d.adresse, halter: v } } : {}) });
  // „Ich bin selbst der Hundehalter“: Name wird Halter, die Adresse aus Abschnitt 3 gilt für beide
  const setzeHalter = (an: boolean) =>
    setD({ ...d, auftraggeber: { ...d.auftraggeber, istHalter: an }, adresse: { ...d.adresse, halter: an ? d.auftraggeber.name : '' } });
  const halterAdresse = [d.adresse.strasse, `${d.adresse.plz} ${d.adresse.ort}`.trim()].filter(Boolean).join(', ');

  function standort() {
    if (!navigator.geolocation) return setFehler('Dieses Gerät kann den Standort nicht bestimmen.');
    setOrtSucht(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setD((x) => ({ ...x, adresse: { ...x.adresse, lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) } })); setOrtSucht(false); },
      () => { setFehler('Standort nicht verfügbar – bitte die Adresse eintragen.'); setOrtSucht(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function los(e: React.FormEvent) {
    e.preventDefault();
    setFehler('');
    if (oeffentlich && !datenschutz) return setFehler('Bitte der Datenschutzerklärung zustimmen.');
    setLaedt(true);
    try {
      await senden({ ...d, datenschutz, website });
    } catch (err) {
      setFehler((err as Error).message);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } finally {
      setLaedt(false);
    }
  }

  return (
    <form onSubmit={los} className="space-y-4">
      <Abschnitt nr={1} titel="Was ist los?">
        <Feld label="Wie dringend?">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-himmel-100 p-1 dark:bg-slate-800">
            {(['normal', 'dringend', 'akut'] as Dringlichkeit[]).map((k) => (
              <button key={k} type="button" onClick={() => setD({ ...d, dringlichkeit: k })} aria-pressed={d.dringlichkeit === k}
                className={klassen('min-h-11 rounded-lg text-sm font-bold capitalize',
                  d.dringlichkeit === k ? (k === 'akut' ? 'bg-sos-rot text-white shadow' : k === 'dringend' ? 'bg-orange-500 text-white shadow' : 'bg-white shadow dark:bg-slate-700') : '')}>
                {k}
              </button>
            ))}
          </div>
        </Feld>
        {d.dringlichkeit === 'akut' && <Hinweis art="warnung">Besteht Gefahr für Menschen? Dann bitte zuerst <a className="font-bold underline" href="tel:112">112</a> oder <a className="font-bold underline" href="tel:110">110</a> anrufen.</Hinweis>}
        <Feld label="Kurzbeschreibung *" hilfe="Ein Satz, erscheint in der Push-Nachricht">
          <input className="eingabe" required maxLength={200} value={d.beschreibung} onChange={(e) => setD({ ...d, beschreibung: e.target.value })}
            placeholder="z. B. Hund nach Beißvorfall in Wohnung, Halter im Krankenhaus" />
        </Feld>
        <Feld label="Was ist passiert?">
          <textarea className="eingabe min-h-28" maxLength={2000} value={d.vorfall} onChange={(e) => setD({ ...d, vorfall: e.target.value })}
            placeholder="Seit wann, wie verhält sich der Hund, wer ist vor Ort …" />
        </Feld>
      </Abschnitt>

      <Abschnitt nr={2} titel="Welcher Hund?">
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Rasse / Typ"><input className="eingabe" maxLength={80} value={d.hund.rasse} onChange={(e) => hund('rasse', e.target.value)} placeholder="z. B. Schäferhund-Mix" /></Feld>
          <Feld label="Alter (ca.)"><input className="eingabe" maxLength={30} value={d.hund.alter} onChange={(e) => hund('alter', e.target.value)} placeholder="z. B. 3 Jahre" /></Feld>
          <Feld label="Größe">
            <select className="eingabe" value={d.hund.groesse} onChange={(e) => hund('groesse', e.target.value)}>
              <option value="">unbekannt</option>
              {GROESSEN.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Feld>
          <Feld label="Geschlecht">
            <select className="eingabe" value={d.hund.geschlecht} onChange={(e) => hund('geschlecht', e.target.value)}>
              <option value="">unbekannt</option>
              <option>Rüde</option><option>Hündin</option>
            </select>
          </Feld>
          <Feld label="Farbe"><input className="eingabe" maxLength={80} value={d.hund.farbe} onChange={(e) => hund('farbe', e.target.value)} /></Feld>
          <Feld label="Anzahl Hunde"><input className="eingabe" type="number" min={1} max={20} value={d.hund.anzahl} onChange={(e) => hund('anzahl', Number(e.target.value) || 1)} /></Feld>
        </div>
        <Feld label="Name des Hundes (falls bekannt)"><input className="eingabe" maxLength={40} value={d.hund.name} onChange={(e) => hund('name', e.target.value)} /></Feld>
        <Feld label="Besondere Merkmale"><input className="eingabe" maxLength={300} value={d.hund.merkmale} onChange={(e) => hund('merkmale', e.target.value)} placeholder="Halsband, Geschirr, Verletzungen, Maulkorb …" /></Feld>
      </Abschnitt>

      <Abschnitt nr={3} titel="Wo ist der Hund? (Adresse Hundehalter)">
        {!oeffentlich && (
          <Feld label="Name Hundehalter" hilfe={d.auftraggeber.istHalter ? 'Übernommen aus den Kontaktdaten (Auftraggeber ist Hundehalter)' : undefined}>
            <input className="eingabe" maxLength={80} value={d.adresse.halter} disabled={d.auftraggeber.istHalter} onChange={(e) => adr('halter', e.target.value)} />
          </Feld>
        )}
        <Feld label="Straße und Hausnummer bzw. Ort"><input className="eingabe" maxLength={100} value={d.adresse.strasse} onChange={(e) => adr('strasse', e.target.value)} autoComplete="street-address" /></Feld>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Feld label="PLZ *"><input className="eingabe" required inputMode="numeric" pattern="\d{5}" maxLength={5} value={d.adresse.plz} onChange={(e) => adr('plz', e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" /></Feld>
          <Feld label="Ort *"><input className="eingabe" required maxLength={60} value={d.adresse.ort} onChange={(e) => adr('ort', e.target.value)} autoComplete="address-level2" /></Feld>
        </div>
        <Feld label="Hinweis zum Ort"><input className="eingabe" maxLength={300} value={d.adresse.hinweis} onChange={(e) => adr('hinweis', e.target.value)} placeholder="z. B. 2. OG, Schlüssel bei Nachbar, Feldweg hinter dem Sportplatz" /></Feld>
        <div className="flex flex-wrap items-center gap-2">
          <Knopf type="button" art="sekundaer" onClick={standort} laedt={ortSucht}><Icon name="ort" className="h-5 w-5" /> Meinen Standort verwenden</Knopf>
          {d.adresse.lat && <span className="text-sm text-emerald-700 dark:text-emerald-300">Standort übernommen ({d.adresse.lat}, {d.adresse.lon})</span>}
        </div>
      </Abschnitt>

      <Abschnitt nr={4} titel={oeffentlich ? 'Ihre Kontaktdaten' : 'Auftraggeber'}>
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Name *"><input className="eingabe" required maxLength={80} value={d.auftraggeber.name} onChange={(e) => ag('name', e.target.value)} autoComplete="name" /></Feld>
          <Feld label="Organisation / Behörde"><input className="eingabe" maxLength={80} value={d.auftraggeber.organisation} onChange={(e) => ag('organisation', e.target.value)} autoComplete="organization" /></Feld>
          <Feld label="Telefon *"><input className="eingabe" required type="tel" maxLength={40} value={d.auftraggeber.telefon} onChange={(e) => ag('telefon', e.target.value)} autoComplete="tel" /></Feld>
          <Feld label="E-Mail"><input className="eingabe" type="email" maxLength={80} value={d.auftraggeber.email} onChange={(e) => ag('email', e.target.value)} autoComplete="email" /></Feld>
        </div>
        <Feld label="Erreichbar"><input className="eingabe" maxLength={120} value={d.auftraggeber.erreichbar} onChange={(e) => ag('erreichbar', e.target.value)} placeholder="z. B. jederzeit, Mo–Fr 8–16 Uhr" /></Feld>
        <label className={klassen('flex min-h-12 items-start gap-3 rounded-xl p-3 text-sm ring-1',
          d.auftraggeber.istHalter ? 'bg-himmel-50 ring-himmel-300 dark:bg-slate-800' : 'ring-himmel-200 dark:ring-slate-600')}>
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={!!d.auftraggeber.istHalter} onChange={(e) => setzeHalter(e.target.checked)} />
          <span>
            <b>{oeffentlich ? 'Ich bin selbst der Hundehalter' : 'Auftraggeber ist der Hundehalter'}</b>
            <span className="block text-slate-500">
              {d.auftraggeber.istHalter
                ? `Adresse übernommen: ${halterAdresse || 'bitte oben unter „Wo ist der Hund?“ eintragen'}`
                : 'Dann gilt die Adresse aus „Wo ist der Hund?“ auch als Ihre Adresse.'}
            </span>
          </span>
        </label>
      </Abschnitt>

      {zusatz}

      {oeffentlich && (
        <>
          {/* Honigtopf gegen Bots: für Menschen unsichtbar */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
          <label className="karte flex items-start gap-3 p-4 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={datenschutz} onChange={(e) => setDatenschutz(e.target.checked)} />
            <span>Ich bin einverstanden, dass meine Angaben an die zuständigen Helfer und die zuständige Behörde weitergegeben werden, um den Hund zu sichern. (siehe Datenschutzhinweis unten) *</span>
          </label>
        </>
      )}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <Knopf type="submit" laedt={laedt} className="w-full text-lg"><Icon name="notfall" className="h-5 w-5" /> {knopf}</Knopf>
    </form>
  );
}
