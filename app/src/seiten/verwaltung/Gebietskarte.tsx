import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { NurAngemeldet } from '../../components/Anmelden';
import { Fehler, Hinweis, Laden, Seite, useLaden } from '../../components/ui';
import { api } from '../../lib/api';
import type { Region } from '../../lib/model';
import { REGION_FARBEN, zuordnen } from '../../lib/plz';

interface Bereich {
  type: 'Feature';
  properties: { bereich: string; plz: string[]; lat: number; lon: number };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

interface Auswertung {
  bereich: string;
  gesamt: number;
  /** PLZ je Region-ID ('' = nicht vergeben) */
  anteile: Map<string, number>;
  konflikte: number;
  haupt: string;
  /** Helfer (eindeutig), die für PLZ in diesem Bereich zuständig sind */
  helfer: Set<string>;
  bereit: Set<string>;
  /** mindestens eine Region im Bereich ohne Regionalleitung */
  ohneLeitung: boolean;
}

type Modus = 'leiter' | 'helfer';

/** Farbstufen der Helfer-Karte: 0 (Lücke), 1–2, 3–5, 6–10, mehr als 10 */
const HELFER_STUFEN = [
  { ab: 11, farbe: '#172554', text: 'mehr als 10' },
  { ab: 6, farbe: '#1d4ed8', text: '6–10' },
  { ab: 3, farbe: '#3b82f6', text: '3–5' },
  { ab: 1, farbe: '#93c5fd', text: '1–2' },
];
const KEINE_HELFER = '#ef4444';
const helferFarbe = (n: number) => HELFER_STUFEN.find((x) => n >= x.ab)?.farbe ?? KEINE_HELFER;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const prozent = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const FREI = '#94a3b8';

async function bereicheLaden(): Promise<Bereich[]> {
  const r = await fetch(`${import.meta.env.BASE_URL}karten/plz2.json`);
  if (!r.ok) throw new Error('Kartendaten konnten nicht geladen werden');
  return (await r.json()).features;
}

function Inhalt() {
  const regionen = useLaden(() => api<Region[]>('regionen_verwaltung'));
  const flaechen = useLaden(bereicheLaden);
  const el = useRef<HTMLDivElement>(null);
  const karteRef = useRef<L.Map | null>(null);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const modus: Modus = params.get('modus') === 'helfer' ? 'helfer' : 'leiter';
  const setModus = (m: Modus) => setParams(m === 'helfer' ? { modus: 'helfer' } : {}, { replace: true });

  const alle = useMemo(() => regionen.daten ?? [], [regionen.daten]);
  const farbe = useMemo(() => {
    const m = new Map<string, string>();
    alle.forEach((r, i) => m.set(r.id, REGION_FARBEN[i % REGION_FARBEN.length]));
    return m;
  }, [alle]);
  const name = (id: string) => (id ? alle.find((r) => r.id === id)?.name ?? '?' : 'nicht vergeben');

  const auswertung = useMemo(() => {
    const bereiche = flaechen.daten ?? [];
    const zu = zuordnen(bereiche.flatMap((b) => b.properties.plz), alle);
    const proRegion = new Map<string, number>();
    const konfliktPlz: { plz: string; regionen: string[] }[] = [];
    const proBereich = new Map<string, Auswertung>();
    for (const b of bereiche) {
      const anteile = new Map<string, number>();
      let konflikte = 0;
      for (const plz of b.properties.plz) {
        const z = zu.get(plz)!;
        anteile.set(z.region, (anteile.get(z.region) ?? 0) + 1);
        if (z.region) proRegion.set(z.region, (proRegion.get(z.region) ?? 0) + 1);
        if (z.konflikt.length) { konflikte++; konfliktPlz.push({ plz, regionen: [z.region, ...z.konflikt] }); }
      }
      const vergeben = [...anteile.entries()].filter(([id]) => id).sort((x, y) => y[1] - x[1]);
      const regs = vergeben.map(([id]) => alle.find((x) => x.id === id)).filter(Boolean) as Region[];
      proBereich.set(b.properties.bereich, {
        bereich: b.properties.bereich, gesamt: b.properties.plz.length, anteile, konflikte, haupt: vergeben[0]?.[0] ?? '',
        helfer: new Set(regs.flatMap((x) => x.helferIds ?? [])),
        bereit: new Set(regs.flatMap((x) => x.bereitIds ?? [])),
        ohneLeitung: regs.some((x) => !x.leiter?.length),
      });
    }
    const gesamt = bereiche.reduce((n, b) => n + b.properties.plz.length, 0);
    const vergeben = [...proRegion.values()].reduce((n, x) => n + x, 0);
    const werte = [...proBereich.values()];
    const aktive = alle.filter((x) => x.aktiv !== false);
    return {
      proBereich, proRegion, konfliktPlz, gesamt, vergeben,
      helferGesamt: new Set(aktive.flatMap((x) => x.helferIds ?? [])).size,
      bereitGesamt: new Set(aktive.flatMap((x) => x.bereitIds ?? [])).size,
      ohneHelfer: werte.filter((w) => w.haupt && !w.helfer.size).length,
      voll: werte.filter((w) => !w.anteile.get('')).length,
      teil: werte.filter((w) => w.anteile.get('') && w.anteile.get('')! < w.gesamt).length,
      frei: werte.filter((w) => w.anteile.get('') === w.gesamt).length,
    };
  }, [flaechen.daten, alle]);

  // Karte einmal anlegen; beim Umschalten wird nur die Flächen-Ebene ausgetauscht (Ausschnitt bleibt)
  useEffect(() => {
    if (!el.current || !flaechen.daten || !regionen.daten) return;
    const karte = L.map(el.current, { zoomSnap: 0.25 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · PLZ-Bereiche genähert',
    }).addTo(karte);
    karte.fitBounds(L.geoJSON(flaechen.daten as unknown as GeoJSON.FeatureCollection).getBounds(), { padding: [8, 8] });
    karteRef.current = karte;
    return () => { karte.remove(); karteRef.current = null; };
  }, [flaechen.daten, regionen.daten]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const karte = karteRef.current;
    if (!karte || !flaechen.daten) return;
    const leiterLink = (r: Region) => r.leiter?.length
      ? r.leiter.map((n, i) => r.leiterIds?.[i]
        ? `<a href="#/verwaltung/mitglieder?id=${encodeURIComponent(r.leiterIds[i])}" style="color:#1d4ed8;text-decoration:underline">${esc(n)}</a>`
        : esc(n)).join(', ')
      : '<span style="color:#b91c1c">keine Regionalleitung</span>';
    const ebene = L.geoJSON(flaechen.daten as unknown as GeoJSON.FeatureCollection, {
      style: (f) => {
        const w = auswertung.proBereich.get(f!.properties.bereich)!;
        if (modus === 'helfer') {
          return {
            color: '#ffffff', weight: 1,
            fillColor: w.haupt ? helferFarbe(w.helfer.size) : FREI,
            fillOpacity: w.haupt ? (w.helfer.size ? 0.7 : 0.45) : 0.2,
          };
        }
        const anteil = 1 - (w.anteile.get('') ?? 0) / w.gesamt;
        return {
          color: w.konflikte ? '#b91c1c' : w.ohneLeitung ? '#d97706' : '#ffffff',
          weight: w.konflikte || w.ohneLeitung ? 2.5 : 1,
          dashArray: w.konflikte || w.ohneLeitung ? '4 3' : undefined,
          fillColor: w.haupt ? farbe.get(w.haupt) : FREI,
          fillOpacity: w.haupt ? 0.25 + 0.5 * anteil : 0.25,
        };
      },
      onEachFeature: (f, layer) => {
        const w = auswertung.proBereich.get(f.properties.bereich)!;
        const kopf = `<b style="font-size:15px">PLZ-Bereich ${f.properties.bereich}xxx</b><br><span style="color:#64748b">${w.gesamt} Postleitzahlen</span>`;
        const eintraege = [...w.anteile.entries()].sort((x, y) => y[1] - x[1]);
        if (modus === 'helfer') {
          const zeilen = eintraege.map(([id, n]) => {
            if (!id) return `<div style="margin-top:4px;color:#64748b">nicht vergeben: ${n} PLZ</div>`;
            const r = alle.find((x) => x.id === id)!;
            const h = r.helferIds?.length ?? 0, bereit = r.bereitIds?.length ?? 0;
            return `<div style="margin-top:4px"><b>${esc(r.name)}</b> (${n} PLZ): ${h ? `${h} Helfer, ${bereit} einsatzbereit` : '<span style="color:#b91c1c">keine Helfer</span>'}<br><span style="color:#64748b">Leitung: ${leiterLink(r)}</span></div>`;
          }).join('');
          const summe = w.haupt ? `<div style="margin-top:6px;font-size:14px"><b>${w.helfer.size} Helfer</b>, davon ${w.bereit.size} einsatzbereit</div>` : '';
          layer.bindPopup(`<div style="min-width:220px">${kopf}${summe}${zeilen}</div>`);
          layer.bindTooltip(w.haupt ? `${f.properties.bereich}<br>${w.helfer.size}` : f.properties.bereich, { permanent: true, direction: 'center', className: 'plz-marke' });
          return;
        }
        const zeilen = eintraege.map(([id, n]) => {
          const r = alle.find((x) => x.id === id);
          const punkt = `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${id ? farbe.get(id) : FREI}"></span>`;
          return `<div style="margin-top:4px">${punkt}<b>${esc(name(id))}</b>: ${n} PLZ (${prozent(n, w.gesamt)} %)${r ? `<br><span style="color:#64748b">Leitung: ${leiterLink(r)}</span>` : ''}</div>`;
        }).join('');
        const konflikt = w.konflikte ? `<div style="margin-top:6px;color:#b91c1c">⚠ ${w.konflikte} PLZ passen gleich genau zu mehreren Regionen</div>` : '';
        const inhalt = `<div style="min-width:200px">${kopf}${zeilen}${konflikt}</div>`;
        // Genau ein Regionalleiter im Bereich → direkt zu seinem Profil, sonst Auswahl im Fenster
        const leiterIds = [...new Set([...w.anteile.keys()].filter(Boolean)
          .flatMap((id) => alle.find((x) => x.id === id)?.leiterIds ?? []))];
        layer.on('click', (e: L.LeafletMouseEvent) => {
          if (leiterIds.length === 1) nav(`/verwaltung/mitglieder?id=${encodeURIComponent(leiterIds[0])}`);
          else L.popup().setLatLng(e.latlng).setContent(inhalt).openOn(karte);
        });
        layer.bindTooltip(f.properties.bereich, { permanent: true, direction: 'center', className: 'plz-marke' });
      },
    }).addTo(karte);
    return () => { ebene.remove(); karte.closePopup(); };
  }, [modus, flaechen.daten, auswertung, farbe, alle, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  if (regionen.fehler || flaechen.fehler) return <Fehler fehler={regionen.fehler || flaechen.fehler} nochmal={() => { void regionen.neu(); void flaechen.neu(); }} />;
  if (!regionen.daten || !flaechen.daten) return <Laden text="Karte laden …" />;
  const a = auswertung;

  const umschalter = (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-himmel-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Kartenansicht">
      {([['leiter', 'Regionalleiter'], ['helfer', 'Helfer']] as const).map(([m, t]) => (
        <button key={m} type="button" role="tab" aria-selected={modus === m} onClick={() => setModus(m)}
          className={`rounded-xl py-2 text-sm font-semibold ${modus === m ? 'bg-white text-himmel-800 shadow dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{t}</button>
      ))}
    </div>
  );
  const kachel = (zahl: React.ReactNode, text: string, rot = false) => (
    <div className="karte p-3"><p className={`text-2xl font-bold ${rot ? 'text-sos-rot' : 'text-himmel-800 dark:text-himmel-200'}`}>{zahl}</p><p className="text-xs text-slate-500">{text}</p></div>
  );
  const ohneLeitung = alle.filter((r) => r.aktiv !== false && !r.leiter?.length).length;
  const nachHelfern = [...alle].sort((x, y) => (y.helferIds?.length ?? 0) - (x.helferIds?.length ?? 0));

  return (
    <div className="space-y-4">
      {umschalter}
      {modus === 'leiter' ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          {kachel(`${prozent(a.vergeben, a.gesamt)} %`, 'der PLZ vergeben')}
          {kachel(<>{a.voll}<span className="text-base font-normal text-slate-500"> / {a.teil}</span></>, 'Bereiche ganz / teilweise')}
          {kachel(ohneLeitung, 'Regionen ohne Leitung', ohneLeitung > 0)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          {kachel(a.helferGesamt, 'Helfer')}
          {kachel(a.bereitGesamt, 'einsatzbereit')}
          {kachel(a.ohneHelfer, 'Bereiche ohne Helfer', a.ohneHelfer > 0)}
        </div>
      )}

      <div ref={el} className="h-[70vh] w-full overflow-hidden rounded-2xl ring-1 ring-himmel-200 dark:ring-slate-700" role="region" aria-label={modus === 'helfer' ? 'Deutschlandkarte der Helfer' : 'Deutschlandkarte der Regionalleiter'} />

      {modus === 'leiter' ? (
        <p className="text-xs text-slate-500">
          Farbe = Region mit den meisten PLZ im Bereich, kräftiger = höherer Anteil vergeben, grau = frei.
          Orange gestrichelt = eine Region im Bereich hat keine Regionalleitung, rot gestrichelt = Überschneidung.
          Gebiet antippen: mit einem Regionalleiter geht es direkt zu seinem Profil, sonst erscheinen die Details. Die Grenzen der 2-stelligen PLZ-Bereiche sind genähert.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {[...HELFER_STUFEN].reverse().map((x) => (
              <span key={x.ab} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: x.farbe }} />{x.text}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: KEINE_HELFER }} />keine Helfer</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: FREI }} />keine Region</span>
          </div>
          <p className="text-xs text-slate-500">
            Zahl = Helfer, die für PLZ im Bereich zuständig sind (Mitglieder und Regionalleiter, jeder nur einmal gezählt). Gebiet antippen zeigt die Aufteilung nach Regionen und wie viele einsatzbereit sind.
          </p>
        </div>
      )}

      {modus === 'leiter' && a.konfliktPlz.length > 0 && (
        <Hinweis art="warnung">
          {a.konfliktPlz.length} PLZ passen gleich genau zu mehreren Regionen, z. B.{' '}
          {a.konfliktPlz.slice(0, 3).map((k) => `${k.plz} (${k.regionen.map(name).join(' / ')})`).join(', ')}.
          Unter Regionen die PLZ-Angaben anpassen.
        </Hinweis>
      )}

      <section className="karte divide-y divide-himmel-100 overflow-hidden dark:divide-slate-700">
        <h3 className="px-4 py-3 font-bold">{modus === 'helfer' ? 'Regionen nach Helfern' : 'Regionen'}</h3>
        {!alle.length && <p className="px-4 py-3 text-sm text-slate-500">Noch keine Regionen angelegt.</p>}
        {(modus === 'helfer' ? nachHelfern : alle).map((r) => {
          const h = r.helferIds?.length ?? 0;
          return (
            <div key={r.id} className={`flex items-start gap-3 px-4 py-3 ${r.aktiv === false ? 'opacity-60' : ''}`}>
              <span className="mt-1 h-4 w-4 shrink-0 rounded" style={{ background: modus === 'helfer' ? helferFarbe(h) : farbe.get(r.id) }} />
              <div className="flex-1">
                <p className="font-semibold">{r.name}{r.aktiv === false && ' (inaktiv, nicht auf der Karte)'}</p>
                {modus === 'helfer' && (
                  <p className="text-sm">{h ? <><b>{h}</b> Helfer, davon {r.bereitIds?.length ?? 0} einsatzbereit</> : <span className="text-sos-rot">keine Helfer</span>}</p>
                )}
                <p className="text-sm">{r.leiter?.length ? (
                  <>Leitung: {r.leiter.map((n, i) => (
                    <span key={n + i}>{i > 0 && ', '}{r.leiterIds?.[i]
                      ? <Link to={`/verwaltung/mitglieder?id=${encodeURIComponent(r.leiterIds[i])}`} className="font-medium text-himmel-700 underline dark:text-himmel-300">{n}</Link>
                      : n}</span>
                  ))}</>
                ) : <span className="text-sos-rot">keine Regionalleitung</span>}</p>
                <p className="text-xs text-slate-500">{a.proRegion.get(r.id) ?? 0} PLZ{modus === 'leiter' && <> · {h} Helfer</>} · <span className="font-mono">{r.plz || 'keine PLZ'}</span></p>
              </div>
            </div>
          );
        })}
        {modus === 'leiter' && (
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="mt-1 h-4 w-4 shrink-0 rounded" style={{ background: FREI }} />
            <p className="flex-1 text-sm">Nicht vergeben: {a.gesamt - a.vergeben} von {a.gesamt} PLZ</p>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-400">PLZ-Daten: WZB plz_geocoord (Apache-2.0), Landesgrenze: Natural Earth.</p>
    </div>
  );
}

export default function Gebietskarte() {
  return (
    <Seite titel="Deutschlandkarte">
      <NurAngemeldet rollen={['admin']}><Inhalt /></NurAngemeldet>
    </Seite>
  );
}
