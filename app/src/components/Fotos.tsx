import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { Hinweis, Laden } from './ui';

interface FotoDaten { id: string; mime?: string; data?: string; fehlt?: boolean }

/** Fotos einer Anfrage: werden erst beim Öffnen geladen (nicht öffentlich, Zugriff wird protokolliert) */
export function AnfrageFotos({ id, anzahl }: { id: string; anzahl: number }) {
  const [fotos, setFotos] = useState<FotoDaten[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [gross, setGross] = useState<number | null>(null);

  useEffect(() => {
    if (!anzahl) return;
    api<FotoDaten[]>('anfrage_fotos', { id }).then(setFotos).catch((e) => setFehler((e as Error).message));
  }, [id, anzahl]);

  useEffect(() => {
    if (gross === null) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGross(null);
      if (e.key === 'ArrowRight') setGross((g) => (g === null ? g : (g + 1) % anzahl));
      if (e.key === 'ArrowLeft') setGross((g) => (g === null ? g : (g - 1 + anzahl) % anzahl));
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [gross, anzahl]);

  if (!anzahl) return null;
  const url = (f: FotoDaten) => `data:${f.mime};base64,${f.data}`;
  const sichtbar = (fotos ?? []).filter((f) => !f.fehlt);

  return (
    <section className="karte p-4">
      <h3 className="mb-2 flex items-center gap-2 font-bold"><Icon name="kamera" className="h-5 w-5 text-sos-rot" /> Fotos ({anzahl})</h3>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      {!fotos && !fehler && <Laden text="Fotos laden …" />}
      {fotos && (
        <div className="grid grid-cols-3 gap-2">
          {sichtbar.map((f, i) => (
            <button key={f.id} type="button" onClick={() => setGross(i)} className="aspect-square overflow-hidden rounded-xl ring-1 ring-himmel-200 dark:ring-slate-600" aria-label={`Foto ${i + 1} vergrößern`}>
              <img src={url(f)} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {fotos && sichtbar.length < fotos.length && <p className="mt-2 text-xs text-slate-500">{fotos.length - sichtbar.length} Foto(s) nicht mehr vorhanden.</p>}
      {gross !== null && sichtbar[gross] && createPortal(
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black" role="dialog" aria-label="Foto groß">
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">{gross + 1} / {sichtbar.length}</span>
            <button onClick={() => setGross(null)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15" aria-label="Schließen"><Icon name="x" /></button>
          </div>
          <button className="flex flex-1 items-center justify-center p-2" onClick={() => setGross((gross + 1) % sichtbar.length)} aria-label="Nächstes Foto">
            <img src={url(sichtbar[gross])} alt={`Foto ${gross + 1}`} className="max-h-full max-w-full object-contain" />
          </button>
        </div>,
        document.body,
      )}
    </section>
  );
}
