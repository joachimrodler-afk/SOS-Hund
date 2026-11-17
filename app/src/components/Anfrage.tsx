import { Link } from 'react-router-dom';
import { klassen, vorZeit } from '../lib/helfer';
import { DRINGLICHKEIT_NAME, STATUS_NAME, type AnfrageKurz, type Dringlichkeit, type Status } from '../lib/model';
import { Icon } from './Icon';

const STATUS_STIL: Record<Status, string> = {
  ungeprueft: 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-100',
  offen: 'bg-sos-rot text-white ring-sos-rot',
  uebernommen: 'bg-himmel-100 text-himmel-900 ring-himmel-300 dark:bg-himmel-900/50 dark:text-himmel-100',
  vor_ort: 'bg-indigo-100 text-indigo-900 ring-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-100',
  gesichert: 'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100',
  abgeschlossen: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300',
  abgebrochen: 'bg-slate-100 text-slate-500 ring-slate-300 dark:bg-slate-800 dark:text-slate-400',
  verworfen: 'bg-slate-100 text-slate-500 ring-slate-300 dark:bg-slate-800 dark:text-slate-400',
};

export const STATUS_FARBE: Record<Status, string> = {
  ungeprueft: '#d97706', offen: '#d7262b', uebernommen: '#1e6fd9', vor_ort: '#4f46e5', gesichert: '#059669',
  abgeschlossen: '#64748b', abgebrochen: '#94a3b8', verworfen: '#94a3b8',
};

export function StatusMarke({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={klassen('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', STATUS_STIL[status], className)}>
      {STATUS_NAME[status]}
    </span>
  );
}

export function DringlichkeitMarke({ d }: { d: Dringlichkeit }) {
  if (d === 'normal') return null;
  return (
    <span className={klassen('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide',
      d === 'akut' ? 'animate-pulse bg-sos-rot text-white' : 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100')}>
      {d === 'akut' && <Icon name="notfall" className="h-3.5 w-3.5" />}
      {DRINGLICHKEIT_NAME[d]}
    </span>
  );
}

export function AnfrageZeile({ a }: { a: AnfrageKurz }) {
  return (
    <Link to={`/anfragen/${a.id}`} className={klassen('karte block p-4 transition hover:ring-himmel-300',
      a.status === 'offen' && a.dringlichkeit === 'akut' && 'ring-2 ring-sos-rot')}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <StatusMarke status={a.status} />
        <DringlichkeitMarke d={a.dringlichkeit} />
        {a.eskaliertBeiMir && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">Nachbarregion</span>}
        {a.meine && <span className="rounded-full bg-himmel-600 px-2 py-0.5 text-xs font-bold text-white">meine</span>}
        <span className="ml-auto text-xs text-slate-500">{a.nummer}</span>
      </div>
      <p className="font-semibold leading-snug">{a.beschreibung}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1"><Icon name="ort" className="h-4 w-4" />{a.ort}</span>
        {a.hund && <span className="inline-flex items-center gap-1"><Icon name="pfote" className="h-4 w-4" />{a.hund}</span>}
        {a.fotos > 0 && <span className="inline-flex items-center gap-1"><Icon name="kamera" className="h-4 w-4" />{a.fotos}</span>}
        <span className="inline-flex items-center gap-1"><Icon name="uhr" className="h-4 w-4" />{vorZeit(a.erstellt)}</span>
      </p>
      {a.uebernommenName && (
        <p className="mt-1.5 text-sm font-semibold text-himmel-700 dark:text-himmel-300">
          Übernommen von {a.uebernommenName}{a.helfer.length ? ` + ${a.helfer.length} Helfer` : ''}
        </p>
      )}
    </Link>
  );
}

/** Telefonnummer als anrufbarer Link */
export function TelLink({ nummer, className }: { nummer?: string; className?: string }) {
  if (!nummer) return null;
  return (
    <a href={`tel:${nummer.replace(/[^\d+]/g, '')}`} className={klassen('inline-flex items-center gap-1.5 font-semibold text-himmel-700 underline dark:text-himmel-300', className)}>
      <Icon name="telefon" className="h-4 w-4" />{nummer}
    </a>
  );
}
