import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ExternerLink, Laden, Seite, useLaden } from '../components/ui';
import { config, istGesetzt } from '../config';
import { api, erinnere, merke } from '../lib/api';
import { markdown } from '../lib/helfer';
import type { Einstellungen } from '../lib/model';

/** Öffentliche Infoseite: wer wir sind, Verhalten, Notfallnummern, Datenschutz. Funktioniert auch offline (letzter Stand). */
export default function Info() {
  const { daten, laedt } = useLaden(async () => {
    try {
      const e = await api<Einstellungen>('einstellungen');
      merke('einstellungen', e);
      return e;
    } catch (err) {
      const alt = erinnere<Einstellungen>('einstellungen');
      if (alt) return alt;
      throw err;
    }
  });
  return (
    <Seite titel="Info & Notfall" zurueck={false}>
      <div className="space-y-4">
        <div className="karte overflow-hidden">
          <div className="flex items-center gap-3 bg-sos-rot p-4 text-white">
            <Icon name="notfall" className="h-7 w-7" />
            <h2 className="text-lg font-bold">Notfall</h2>
          </div>
          <div className="p-4">
            <p>Bei Gefahr für Menschen sofort den Notruf wählen.</p>
            {/* außerhalb von .md, sonst färbt die Link-Regel die Schrift der Knöpfe blau */}
            <div className="my-3 grid grid-cols-2 gap-2">
              <a href="tel:112" className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-sos-rot text-xl font-extrabold text-white"><Icon name="telefon" /> 112</a>
              <a href="tel:110" className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-himmel-700 text-xl font-extrabold text-white"><Icon name="telefon" /> 110</a>
            </div>
            {daten?.notfall && <div className="md" dangerouslySetInnerHTML={{ __html: markdown(daten.notfall) }} />}
          </div>
        </div>
        <Link to="/melden" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-sos-rot text-lg font-bold text-white shadow">
          <Icon name="pfote" /> Hund melden
        </Link>
        {laedt && !daten ? <Laden /> : daten && (
          <>
            <div className="karte md p-4" dangerouslySetInnerHTML={{ __html: markdown(daten.info) }} />
            <div className="karte md p-4" id="datenschutz">
              <h2>Datenschutz</h2>
              <div dangerouslySetInnerHTML={{ __html: markdown(daten.datenschutz) }} />
              <p className="text-sm text-slate-500">Angaben zu abgeschlossenen Anfragen werden nach {daten.anonymMonate} Monaten anonymisiert.</p>
            </div>
          </>
        )}
        <div className="flex justify-center gap-4 text-sm text-slate-500">
          {istGesetzt(config.impressumUrl) && <ExternerLink href={config.impressumUrl} className="underline">Impressum</ExternerLink>}
          {istGesetzt(config.datenschutzUrl) && <ExternerLink href={config.datenschutzUrl} className="underline">Datenschutzerklärung</ExternerLink>}
          <span>Version {__APP_VERSION__}</span>
        </div>
      </div>
    </Seite>
  );
}
