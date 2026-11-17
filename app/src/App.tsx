import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { Icon } from './components/Icon';
import { Laden } from './components/ui';
import { Fehlergrenze } from './components/Fehlergrenze';
import { config, istDemo } from './config';
import { klassen } from './lib/helfer';
import { useOnline, useSitzung } from './lib/sitzung';
import Start from './seiten/Start';
import Info from './seiten/Info';

// Seltener genutzte Seiten werden erst bei Bedarf geladen
const Melden = lazy(() => import('./seiten/Melden'));
const Anfragen = lazy(() => import('./seiten/Anfragen'));
const AnfrageDetail = lazy(() => import('./seiten/AnfrageDetail'));
const AnfrageNeu = lazy(() => import('./seiten/AnfrageNeu'));
const AnfrageBearbeiten = lazy(() => import('./seiten/AnfrageBearbeiten'));
const Konto = lazy(() => import('./seiten/Konto'));
const Einladung = lazy(() => import('./seiten/Einladung'));
const Export = lazy(() => import('./seiten/Export'));
const Verwaltung = lazy(() => import('./seiten/verwaltung/Verwaltung'));
const Zugaenge = lazy(() => import('./seiten/verwaltung/Zugaenge'));
const Mitglieder = lazy(() => import('./seiten/verwaltung/Mitglieder'));
const Regionen = lazy(() => import('./seiten/verwaltung/Regionen'));
const Gebietskarte = lazy(() => import('./seiten/verwaltung/Gebietskarte'));
const AdminKontakt = lazy(() => import('./seiten/verwaltung/AdminKontakt'));
const Nachrichten = lazy(() => import('./seiten/Nachrichten'));
const EinstellungenSeite = lazy(() => import('./seiten/verwaltung/Einstellungen'));
const Mitteilung = lazy(() => import('./seiten/verwaltung/Mitteilung'));
const Protokoll = lazy(() => import('./seiten/verwaltung/Protokoll'));

function Kopf() {
  const s = useSitzung();
  const online = useOnline();
  return (
    <header className="wolken sicher-oben nicht-drucken sticky top-0 z-30 text-white shadow-md">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
        <Link to="/" className="flex flex-1 items-center gap-2.5" aria-label="Startseite">
          <img src="icons/logo.png" alt="" className="h-11 w-11 rounded-full bg-white ring-2 ring-white/80" />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-tight">{config.name}</span>
            <span className="block text-[11px] font-medium opacity-90">{config.untertitel}</span>
          </span>
        </Link>
        <Link to="/konto" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label={s ? `Konto: ${s.name}` : 'Anmelden'}>
          <Icon name={s ? 'person' : 'schloss'} />
        </Link>
      </div>
      {(!online || istDemo) && (
        <div className={klassen('px-4 py-1 text-center text-xs font-semibold', !online ? 'bg-amber-400 text-amber-950' : 'bg-sonne text-tinte')}>
          {!online ? 'Offline – angezeigt wird der letzte bekannte Stand' : 'Demo-Modus – Beispieldaten, nur auf diesem Gerät gespeichert'}
        </div>
      )}
    </header>
  );
}

function Fuss() {
  const s = useSitzung();
  const punkte: { zu: string; icon: string; text: string; ende?: boolean; gross?: boolean }[] = [
    { zu: '/', icon: 'start', text: 'Start', ende: true },
    { zu: '/anfragen', icon: 'liste', text: 'Anfragen' },
    s ? { zu: '/anfragen/neu', icon: 'plus', text: 'Neu', gross: true } : { zu: '/melden', icon: 'notfall', text: 'Melden', gross: true },
    { zu: '/info', icon: 'info', text: 'Info' },
    s && s.rolle !== 'mitglied' && s.rolle !== 'behoerde' ? { zu: '/verwaltung', icon: 'zahnrad', text: 'Verwaltung' } : { zu: '/konto', icon: 'person', text: s ? 'Konto' : 'Anmelden' },
  ];
  return (
    <nav className="fussleiste sicher-unten nicht-drucken z-30 border-t border-himmel-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label="Hauptnavigation">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
        {punkte.map((p) => (
          <NavLink key={p.zu} to={p.zu} end={p.ende ?? p.zu === '/anfragen'}
            className={({ isActive }) => klassen('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
              isActive ? 'text-sos-rot' : 'text-slate-500 dark:text-slate-400')}>
            {p.gross ? (
              <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-sos-rot text-white shadow-lg ring-4 ring-white dark:ring-slate-900">
                <Icon name={p.icon} className="h-7 w-7" />
              </span>
            ) : (
              <Icon name={p.icon} />
            )}
            {p.text}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Rahmen({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh pb-24">
      <Kopf />
      <main>{children}</main>
      <Fuss />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Rahmen>
        <Fehlergrenze>
          <Suspense fallback={<Laden />}>
            <Routes>
              <Route path="/" element={<Start />} />
              <Route path="/info" element={<Info />} />
              <Route path="/melden" element={<Melden />} />
              <Route path="/anfragen" element={<Anfragen />} />
              <Route path="/anfragen/neu" element={<AnfrageNeu />} />
              <Route path="/anfragen/:id" element={<AnfrageDetail />} />
              <Route path="/anfragen/:id/bearbeiten" element={<AnfrageBearbeiten />} />
              <Route path="/konto" element={<Konto />} />
              <Route path="/einladung" element={<Einladung />} />
              <Route path="/einladung/:code" element={<Einladung />} />
              <Route path="/export" element={<Export />} />
              <Route path="/verwaltung" element={<Verwaltung />} />
              <Route path="/verwaltung/zugaenge" element={<Zugaenge />} />
              <Route path="/verwaltung/mitglieder" element={<Mitglieder />} />
              <Route path="/verwaltung/regionen" element={<Regionen />} />
              <Route path="/verwaltung/karte" element={<Gebietskarte />} />
              <Route path="/verwaltung/admin-kontakt" element={<AdminKontakt />} />
              <Route path="/nachrichten" element={<Nachrichten />} />
              <Route path="/verwaltung/einstellungen" element={<EinstellungenSeite />} />
              <Route path="/verwaltung/mitteilung" element={<Mitteilung />} />
              <Route path="/verwaltung/protokoll" element={<Protokoll />} />
              <Route path="*" element={<div className="p-8 text-center">Seite nicht gefunden. <Link className="underline" to="/">Zur Startseite</Link></div>} />
            </Routes>
          </Suspense>
        </Fehlergrenze>
      </Rahmen>
    </HashRouter>
  );
}
