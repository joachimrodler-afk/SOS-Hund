/** Datentypen – entsprechen den Antworten des Backends (apps-script/Code.gs) */

export type Rolle = 'mitglied' | 'regionalleiter' | 'admin' | 'behoerde';
export type Status = 'ungeprueft' | 'offen' | 'uebernommen' | 'vor_ort' | 'gesichert' | 'abgeschlossen' | 'abgebrochen' | 'verworfen';
export type Dringlichkeit = 'normal' | 'dringend' | 'akut';

export interface Sitzung {
  token: string;
  mitgliedId: string;
  name: string;
  rolle: Rolle;
  regionen: string[];
  organisation: string;
  /** 0 = unbegrenzt gültig */
  ablauf: number;
}

export interface Profil {
  qualifikation?: string;
  fahrzeug?: boolean;
  box?: boolean;
  fanggeraet?: boolean;
}

export interface Mitglied {
  id: string;
  vorname: string;
  nachname: string;
  rolle: Rolle;
  regionen: string[];
  telefon: string;
  email: string;
  organisation: string;
  aktiv: boolean;
  verfuegbar: boolean;
  profil: Profil;
  superAdmin: boolean;
  letzteAnmeldung: string;
  angemeldet?: boolean;
}

export interface Region {
  id: string;
  name: string;
  plz?: string;
  nachbarn?: string[];
  aktiv?: boolean;
  mitglieder?: number;
  /** Namen der Regionalleiter (nur in der Verwaltung) */
  leiter?: string[];
  /** IDs der Regionalleiter, gleiche Reihenfolge wie leiter */
  leiterIds?: string[];
  /** IDs der Helfer (Mitglieder + Regionalleiter) bzw. der einsatzbereiten – für die Helfer-Karte */
  helferIds?: string[];
  bereitIds?: string[];
  helferListe?: { id: string; name: string; bereit: boolean; leiter: boolean }[];
}

export interface Hund {
  rasse: string;
  groesse: string;
  farbe: string;
  alter: string;
  geschlecht: string;
  merkmale: string;
  name: string;
  anzahl: number;
}

export interface Adresse {
  halter: string;
  halterTelefon: string;
  halterEmail: string;
  strasse: string;
  plz: string;
  ort: string;
  hinweis: string;
  lat: number | null;
  lon: number | null;
}

export interface Auftraggeber {
  name: string;
  organisation: string;
  telefon: string;
  email: string;
  erreichbar: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  /** Der Melder ist selbst der Hundehalter – Name, Telefon, E-Mail und Adresse kommen aus „Wo ist der Hund?“ */
  istHalter?: boolean;
}

export interface AnfrageEingabe {
  dringlichkeit: Dringlichkeit;
  beschreibung: string;
  vorfall: string;
  hund: Hund;
  adresse: Adresse;
  auftraggeber: Auftraggeber;
}

export interface AnfrageKurz {
  id: string;
  nummer: string;
  region: string;
  regionName: string;
  status: Status;
  dringlichkeit: Dringlichkeit;
  quelle: 'mitglied' | 'behoerde' | 'oeffentlich';
  erstellt: string;
  geaendert: string;
  beschreibung: string;
  ort: string;
  lat?: number | null;
  lon?: number | null;
  hund: string;
  uebernommenVon: string;
  uebernommenName: string;
  uebernommenAm: string;
  helfer: { id: string; name: string }[];
  eskaliert: boolean;
  eskaliertBeiMir: boolean;
  meine: boolean;
  anonymisiert: boolean;
  fotos: number;
}

export interface VerlaufEintrag {
  zeit: string;
  name: string;
  aktion: string;
  status: string;
  notiz: string;
}

export interface AnfrageDetail extends AnfrageKurz {
  details: Partial<Omit<AnfrageEingabe, 'dringlichkeit'>> & { hund?: Partial<Hund>; adresse?: Partial<Adresse>; auftraggeber?: Partial<Auftraggeber> };
  verlauf: VerlaufEintrag[];
  rechte: { bearbeiten: boolean; leiten: boolean; uebernehmen: boolean; helfen: boolean; zurueckgeben: boolean; aendern: boolean; eigene: boolean };
  team: { id: string; name: string; telefon: string; rolle: string }[];
}

export interface Einladung {
  code: string;
  rolle: Rolle;
  regionen: string[];
  notiz: string;
  erstelltVon: string;
  erstellt: string;
  ablauf: string;
  genutzt: string;
  gueltig: boolean;
}

export interface Registrierung {
  id: string;
  code: string;
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
  organisation: string;
  rolle: Rolle;
  regionen: string[];
  nachricht: string;
  erstellt: string;
  status: string;
}

export interface Einstellungen {
  netzwerkName: string;
  info: string;
  notfall: string;
  datenschutz: string;
  anonymMonate: number;
  eskalationAktiv?: boolean;
  eskalationMin?: number;
  eskalationAkutMin?: number;
  auftraggeberMail?: boolean;
  /** Notschalter: öffentliches Meldeformular an/aus */
  meldenAktiv?: boolean;
  /** nur Admin: Telefonnummern, deren Meldungen still verworfen werden */
  gesperrteNummern?: string[];
}

export interface StartDaten {
  einstellungen: Einstellungen;
  regionen: number;
  offen?: number;
  akut?: number;
  meine?: number;
  ungeprueft?: number;
  registrierungen?: number;
  /** ungelesene Nachrichten zwischen Regionalleitern und Admins */
  nachrichten?: number;
  verfuegbar?: boolean;
}

export interface PushEinstellungen {
  /** neue Anfragen in meinen Regionen (und Eskalationen) */
  sos: boolean;
  /** jemand hat übernommen / hilft mit */
  uebernahme: boolean;
  /** Statusänderungen an Anfragen, an denen ich beteiligt bin */
  status: boolean;
  mitteilungen: boolean;
  /** Leitung: neue Registrierungen und Meldungen zum Prüfen */
  verwaltung?: boolean;
}

export const ROLLEN_NAME: Record<Rolle, string> = {
  mitglied: 'Mitglied',
  regionalleiter: 'Regionalleiter',
  admin: 'Admin',
  behoerde: 'Behörde',
};

export const STATUS_NAME: Record<Status, string> = {
  ungeprueft: 'ungeprüft',
  offen: 'offen',
  uebernommen: 'übernommen',
  vor_ort: 'vor Ort',
  gesichert: 'gesichert',
  abgeschlossen: 'abgeschlossen',
  abgebrochen: 'abgebrochen',
  verworfen: 'verworfen',
};

export const DRINGLICHKEIT_NAME: Record<Dringlichkeit, string> = { normal: 'normal', dringend: 'dringend', akut: 'akut' };

export const istHelfer = (s: Sitzung | null) => !!s && s.rolle !== 'behoerde';
export const istLeitung = (s: Sitzung | null) => !!s && (s.rolle === 'regionalleiter' || s.rolle === 'admin');
