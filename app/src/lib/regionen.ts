import { useEffect, useState } from 'react';
import { api, erinnere, merke } from './api';
import type { Region } from './model';

let speicher: Region[] | null = null;

/** Liste der aktiven Regionen (id + Name), einmal geladen und zwischengespeichert */
export function useRegionen(): Region[] {
  const [r, setR] = useState<Region[]>(speicher ?? erinnere<Region[]>('regionen') ?? []);
  useEffect(() => {
    if (speicher) return;
    api<Region[]>('regionen').then((x) => { speicher = x; merke('regionen', x); setR(x); }).catch(() => undefined);
  }, []);
  return r;
}

export function regionenNeuLaden() {
  speicher = null;
}

export function regionenNamen(ids: string[], alle: Region[]) {
  return ids.map((id) => alle.find((r) => r.id === id)?.name ?? '?').join(', ');
}
