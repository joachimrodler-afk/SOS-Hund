import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { config } from '../config';
import { STATUS_NAME, type AnfrageKurz } from '../lib/model';
import { STATUS_FARBE } from './Anfrage';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Karte mit allen Anfragen, die Koordinaten haben (OpenStreetMap). Antippen öffnet die Anfrage. */
export default function Karte({ anfragen, hoehe = 'h-[60vh]' }: { anfragen: AnfrageKurz[]; hoehe?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!el.current) return;
    const karte = L.map(el.current, { zoomControl: true }).setView([config.karte.lat, config.karte.lon], config.karte.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(karte);
    const punkte: L.LatLngExpression[] = [];
    anfragen.filter((a) => a.lat && a.lon).forEach((a) => {
      const p: L.LatLngExpression = [a.lat!, a.lon!];
      punkte.push(p);
      const m = L.circleMarker(p, {
        radius: a.dringlichkeit === 'akut' ? 12 : 9, color: '#fff', weight: 2, fillColor: STATUS_FARBE[a.status], fillOpacity: 0.95,
      }).addTo(karte);
      m.bindTooltip(`<b>${esc(a.nummer)}</b> · ${esc(STATUS_NAME[a.status])}<br>${esc(a.beschreibung)}`, { direction: 'top' });
      m.on('click', () => nav(`/anfragen/${a.id}`));
    });
    if (punkte.length === 1) karte.setView(punkte[0], 13);
    else if (punkte.length > 1) karte.fitBounds(L.latLngBounds(punkte), { padding: [30, 30], maxZoom: 14 });
    return () => { karte.remove(); };
  }, [anfragen, nav]);

  return <div ref={el} className={`${hoehe} w-full overflow-hidden rounded-2xl ring-1 ring-himmel-200 dark:ring-slate-700`} role="region" aria-label="Karte der Anfragen" />;
}
