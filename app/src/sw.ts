/// <reference lib="webworker" />
/**
 * Service Worker: Offline-Fähigkeit und Push-Nachrichten.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// App-Shell auch offline öffnen (wichtig für den Notfall-Bereich)
// Die Demo unter …/demo/ hat ihren eigenen Service Worker – hier nicht abfangen
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/demo(\/|$)/] }));

// Kartenkacheln (OpenStreetMap): einmal geladene Kacheln auch offline anzeigen
registerRoute(({ url }) => url.hostname.endsWith('tile.openstreetmap.org'), new CacheFirst({
  cacheName: 'karte',
  plugins: [{ cacheWillUpdate: async ({ response }) => (response && (response.ok || response.status === 0) ? response : null) }],
}));

// ---------------------------------------------------------------- Push
self.addEventListener('push', (event) => {
  let d: { titel?: string; text?: string; url?: string } = {};
  // vibrate/renotify sind nicht in allen TS-DOM-Typen enthalten
  try {
    const j = event.data?.json() ?? {};
    // FCM liefert die Daten unter "data" (unsere Nachrichten) oder "notification"
    d = j.data ?? { titel: j.notification?.title, text: j.notification?.body };
  } catch {
    d = { titel: 'SOS Hund', text: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(d.titel || 'SOS Hund', <NotificationOptions>{
      body: d.text || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: d.url || './' },
      lang: 'de',
      tag: d.url || undefined,
      renotify: true,
      requireInteraction: /AKUT/.test(d.titel || ''),
      vibrate: [200, 100, 200, 100, 400],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      for (const c of liste) {
        if ('focus' in c) {
          void (c as WindowClient).navigate(url).catch(() => undefined);
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
