import { useRef, useState, type ReactNode } from 'react';
import { FOTO_MAX, verkleinern, type Foto } from '../lib/bilder';
import { klassen } from '../lib/helfer';
import type { AnfrageEingabe, Dringlichkeit } from '../lib/model';
import { Feld, Hinweis, Knopf } from './ui';
import { Icon } from './Icon';

export const LEERE_ANFRAGE: AnfrageEingabe = {
  dringlichkeit: 'normal',
  beschreibung: '',
  vorfall: '',
  hund: { rasse: '', groesse: '', farbe: '', alter: '', geschlecht: '', merkmale: '', name: '', anzahl: 1 },
  adresse: { halter: '', halterTelefon: '', halterEmail: '', strasse: '', plz: '', ort: '', hinweis: '', lat: null, lon: null },
  auftraggeber: { name: '', organisation: '', telefon: '', email: '', erreichbar: '', strasse: '', plz: '', ort: '', istHalter: false },
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
  fotos?: { mime: string; data: string }[];
}

/** Fotos aufnehmen oder auswählen – werden im Browser verkleinert */
function FotoAuswahl({ fotos, setFotos, fehler }: { fotos: Foto[]; setFotos: (f: Foto[]) => void; fehler: (t: string) => void }) {
  const kamera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const voll = fotos.length >= FOTO_MAX;

  async function dazu(liste: FileList | null) {
    if (!liste?.length) return;
    setLaedt(true);
    const neu: Foto[] = [];
    for (const datei of Array.from(liste).slice(0, FOTO_MAX - fotos.length)) {
      try { neu.push(await verkleinern(datei)); } catch (e) { fehler((e as Error).message); }
    }
    if (liste.length > FOTO_MAX - fotos.length) fehler(`Höchstens ${FOTO_MAX} Fotos – die übrigen wurden nicht übernommen.`);
    setFotos([...fotos, ...neu]);
    setLaedt(false);
    if (kamera.current) kamera.current.value = '';
    if (galerie.current) galerie.current.value = '';
  }

  return (
    <div className="space-y-2">
      <p className="label">Fotos <span className="font-normal text-slate-500">(optional, bis zu {FOTO_MAX})</span></p>
      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {fotos.map((f, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-himmel-200 dark:ring-slate-600">
              <img src={f.vorschau} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => setFotos(fotos.filter((_, k) => k !== i))} aria-label={`Foto ${i + 1} entfernen`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Knopf type="button" art="sekundaer" disabled={voll} laedt={laedt} onClick={() => kamera.current?.click()}>
          <Icon name="kamera" className="h-5 w-5" /> Foto machen
        </Knopf>
        <Knopf type="button" art="sekundaer" disabled={voll || laedt} onClick={() => galerie.current?.click()}>
          <Icon name="hochladen" className="h-5 w-5" /> Foto hochladen
        </Knopf>
      </div>
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void dazu(e.target.files)} />
      <input ref={galerie} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void dazu(e.target.files)} />
    </div>
  );
}

/**
 * Formular für eine SOS-Anfrage. Wird für öffentliche Meldungen, neue Anfragen von Mitgliedern
 * und Behörden sowie zum Bearbeiten benutzt.
 */
export function AnfrageFormular({ start, oeffentlich = false, knopf, senden, zusatz, mitFotos = true }: {
  start: AnfrageEingabe;
  oeffentlich?: boolean;
  knopf: string;
  senden: (d: FormularErgebnis) => Promise<void>;
  zusatz?: ReactNode;
  /** beim Bearbeiten aus: vorhandene Fotos bleiben, neue kommen nicht dazu */
  mitFotos?: boolean;
}) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [d, setD] = useState<AnfrageEingabe>(start);
  const [datenschutz, setDatenschutz] = useState(false);
  const [website, setWebsite] = useState('');
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [ortSucht, setOrtSucht] = useState(false);

  const hund = (k: keyof AnfrageEingabe['hund'], v: string | number) => setD({ ...d, hund: { ...d.hund, [k]: v } });
  // Halterfeld → Kontaktfeld, solange „Ich bin selbst der Hundehalter“ gesetzt ist
  const UEBERTRAG = { halter: 'name', halterTelefon: 'telefon', halterEmail: 'email', strasse: 'strasse', plz: 'plz', ort: 'ort' } as const;
  // Ändert sich die Adresse, passen die alten Koordinaten nicht mehr – das Backend sucht sie neu
  const adr = (k: keyof AnfrageEingabe['adresse'], v: string | number | null) => {
    const ziel = UEBERTRAG[k as keyof typeof UEBERTRAG];
    setD({
      ...d,
      adresse: { ...d.adresse, [k]: v, ...(['strasse', 'plz', 'ort'].includes(k) ? { lat: null, lon: null } : {}) },
      ...(ziel && d.auftraggeber.istHalter ? { auftraggeber: { ...d.auftraggeber, [ziel]: v } } : {}),
    });
  };
  const ag = (k: keyof AnfrageEingabe['auftraggeber'], v: string) => setD({ ...d, auftraggeber: { ...d.auftraggeber, [k]: v } });
  // „Ich bin selbst der Hundehalter“: Name, Telefon und E-Mail des Halters werden nach unten übernommen
  const setzeHalter = (an: boolean) =>
    setD({
      ...d,
      auftraggeber: an
        ? { ...d.auftraggeber, istHalter: true, name: d.adresse.halter, telefon: d.adresse.halterTelefon, email: d.adresse.halterEmail,
            strasse: d.adresse.strasse, plz: d.adresse.plz, ort: d.adresse.ort }
        : { ...d.auftraggeber, istHalter: false },
    });
  const istHalter = !!d.auftraggeber.istHalter;

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
      await senden({ ...d, datenschutz, website, ...(mitFotos ? { fotos: fotos.map((f) => ({ mime: f.mime, data: f.data })) } : {}) });
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
        {mitFotos && <FotoAuswahl fotos={fotos} setFotos={setFotos} fehler={setFehler} />}
      </Abschnitt>

      <Abschnitt nr={3} titel="Wo ist der Hund? (Adresse Hundehalter)">
        <Feld label={istHalter ? 'Name Hundehalter *' : 'Name Hundehalter'}>
          <input className="eingabe" maxLength={80} required={istHalter} value={d.adresse.halter} onChange={(e) => adr('halter', e.target.value)} placeholder="falls bekannt" />
        </Feld>
        <div className="grid grid-cols-2 gap-3">
          <Feld label={istHalter ? 'Telefon Hundehalter *' : 'Telefon Hundehalter'}>
            <input className="eingabe" type="tel" maxLength={40} required={istHalter} value={d.adresse.halterTelefon} onChange={(e) => adr('halterTelefon', e.target.value)} />
          </Feld>
          <Feld label="E-Mail Hundehalter">
            <input className="eingabe" type="email" maxLength={80} value={d.adresse.halterEmail} onChange={(e) => adr('halterEmail', e.target.value)} />
          </Feld>
        </div>
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
        <label className={klassen('flex min-h-12 items-start gap-3 rounded-xl p-3 text-sm ring-1',
          d.auftraggeber.istHalter ? 'bg-himmel-50 ring-himmel-300 dark:bg-slate-800' : 'ring-himmel-200 dark:ring-slate-600')}>
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={!!d.auftraggeber.istHalter} onChange={(e) => setzeHalter(e.target.checked)} />
          <span>
            <b>{oeffentlich ? 'Ich bin selbst der Hundehalter' : 'Auftraggeber ist der Hundehalter'}</b>
            <span className="block text-slate-500">
              {istHalter
                ? 'Name, Telefon, E-Mail und Adresse wurden aus „Wo ist der Hund?“ übernommen.'
                : 'Dann werden Name, Telefon, E-Mail und Adresse aus „Wo ist der Hund?“ übernommen.'}
            </span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Name *"><input className="eingabe" required maxLength={80} value={d.auftraggeber.name} disabled={istHalter} onChange={(e) => ag('name', e.target.value)} autoComplete="name" /></Feld>
          <Feld label="Organisation / Behörde"><input className="eingabe" maxLength={80} value={d.auftraggeber.organisation} onChange={(e) => ag('organisation', e.target.value)} autoComplete="organization" /></Feld>
          <Feld label="Telefon *"><input className="eingabe" required type="tel" maxLength={40} value={d.auftraggeber.telefon} disabled={istHalter} onChange={(e) => ag('telefon', e.target.value)} autoComplete="tel" /></Feld>
          <Feld label="E-Mail"><input className="eingabe" type="email" maxLength={80} value={d.auftraggeber.email} disabled={istHalter} onChange={(e) => ag('email', e.target.value)} autoComplete="email" /></Feld>
        </div>
        <Feld label="Straße und Hausnummer"><input className="eingabe" maxLength={100} value={d.auftraggeber.strasse ?? ''} disabled={istHalter} onChange={(e) => ag('strasse', e.target.value)} autoComplete="street-address" /></Feld>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Feld label="PLZ"><input className="eingabe" inputMode="numeric" pattern="\d{5}" maxLength={5} value={d.auftraggeber.plz ?? ''} disabled={istHalter} onChange={(e) => ag('plz', e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" /></Feld>
          <Feld label="Ort"><input className="eingabe" maxLength={60} value={d.auftraggeber.ort ?? ''} disabled={istHalter} onChange={(e) => ag('ort', e.target.value)} autoComplete="address-level2" /></Feld>
        </div>
        <Feld label="Erreichbar"><input className="eingabe" maxLength={120} value={d.auftraggeber.erreichbar} onChange={(e) => ag('erreichbar', e.target.value)} placeholder="z. B. jederzeit, Mo–Fr 8–16 Uhr" /></Feld>
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
