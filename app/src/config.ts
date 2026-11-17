/**
 * ZENTRALE KONFIGURATION DER SOS-HUND-APP
 * =======================================
 * Alle Links und Werte, die sich ändern können, stehen hier.
 * Geheime Werte (PINs, Service-Account) gehören NICHT hierher,
 * sondern in die Script Properties des Apps Script.
 *
 * Werte, die mit "TODO" beginnen, müssen noch eingetragen werden.
 */

export const config = {
  /** Name für Titel und Druckansichten (im Backend unter Einstellungen änderbar) */
  name: 'SOS Hund',
  untertitel: 'Netzwerk zur Sicherung auffälliger Hunde',

  /**
   * Adresse der Apps-Script-Web-App (endet auf /exec).
   * Leer lassen = Demo-Modus: Das Backend läuft im Browser, Daten nur auf diesem Gerät.
   */
  // Für lokale Tests mit Beispieldaten: VITE_DEMO=1 npm run dev
  apiUrl: import.meta.env.VITE_DEMO ? '' : '',

  /** Karten-Startpunkt, wenn keine Anfrage Koordinaten hat (Mitte Bayern) */
  karte: { lat: 48.3, lon: 11.7, zoom: 9 },

  /**
   * Firebase Cloud Messaging für Push-Nachrichten.
   * Leer lassen = Push ist in der App als „noch nicht eingerichtet“ markiert.
   * Diese Werte sind öffentlich und dürfen im Frontend stehen.
   */
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    messagingSenderId: '',
    appId: '',
    vapidKey: '',
  },

  impressumUrl: 'TODO',
  datenschutzUrl: 'TODO',
} as const;

export const istDemo = !config.apiUrl;
export const pushKonfiguriert = !!(config.firebase.apiKey && config.firebase.vapidKey);
export function istGesetzt(v: string) {
  return !!v && !v.startsWith('TODO');
}
