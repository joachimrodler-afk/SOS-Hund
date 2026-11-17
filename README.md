# SOS Hund

App für ein Netzwerk zur Sicherung auffälliger Hunde. Die App ist eine Web-App (PWA): Sie läuft im Browser jedes Handys und lässt sich wie eine normale App auf den Startbildschirm legen. Ein App-Store wird dafür nicht gebraucht.

Technik und Aufbau stammen aus der [MGI-Vereins-App](https://github.com/joachimrodler-afk/MGI-App): React-Frontend auf GitHub Pages, Backend als Google Apps Script mit einer Google-Tabelle als Datenbank. Einen eigenen Server braucht das Netzwerk nicht.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Hund melden** (öffentlich) | Jeder kann ohne Anmeldung einen auffälligen Hund melden. Die Meldung ist zuerst „ungeprüft“ und geht nur an die Regionalleitung und die Admins. Erst nach der Freigabe bekommen die Helfer eine Push-Nachricht. Spam-Schutz über ein unsichtbares Feld und eine Mengenbremse |
| **SOS-Anfragen** | Kurzbeschreibung, Dringlichkeit (normal / dringend / akut), Hund (Rasse, Alter, Größe, Merkmale …), was passiert ist, Adresse des Hundehalters, Kontakt des Auftraggebers. Standort per GPS möglich |
| **Regionen** | Die Admins legen Regionen mit PLZ-Listen an (`85737`, `857*`, `80331-81929`). Jede Anfrage wird über die PLZ automatisch einer Region zugeordnet |
| **Push-Nachricht** | Alle einsatzbereiten Helfer der Region bekommen sofort eine Push-Nachricht. Sie enthält keine Adresse und keinen Namen |
| **Ich übernehme** | Wer zuerst übernimmt, wird markiert (Name und Uhrzeit). Eine Sperre im Backend verhindert eine doppelte Übernahme. Andere können sich als **Helfer** eintragen |
| **Status & Verlauf** | offen → übernommen → vor Ort → gesichert → abgeschlossen (oder abgebrochen). Jede Änderung steht mit Zeit und Notiz im Verlauf. Wer nicht mehr kann, gibt die Anfrage zurück, dann wird die Region erneut benachrichtigt |
| **Eskalation** | Übernimmt nach 30 Minuten niemand (bei „akut“ nach 10 Minuten), werden die Nachbarregionen und die Regionalleitung benachrichtigt. Die Zeiten sind einstellbar |
| **Liste & Karte** | Laufende und erledigte Anfragen, Filter „nur meine“, Karte (OpenStreetMap), „Route starten“ und Anrufen per Antippen |
| **Behörden** | Eigener Zugang (z. B. Veterinäramt) per Einladung: Anfragen anlegen, Status verfolgen, Anfrage zurückziehen, Export als CSV oder PDF |
| **Einladungen** | Zugang nur per Einladung: Ein Admin oder Regionalleiter erstellt einen Code bzw. Link (einmalig, mit Ablaufdatum). Die Person registriert sich, die Leitung gibt frei, der PIN geht per WhatsApp, SMS oder E-Mail raus |
| **Verwaltung** | Registrierungen freigeben, Zugänge und Regionen verwalten, Mitteilungen an alle oder einzelne Regionen, Einstellungen, Zugriffsprotokoll |
| **Datenschutz** | Adressen und Kontakte sehen nur die zuständige Region, die Behörde und die Admins. Jeder Zugriff wird protokolliert. Abgeschlossene Anfragen werden nach 12 Monaten automatisch anonymisiert (einstellbar) |

### Rollen

| Rolle | Rechte |
|---|---|
| **Öffentlich** | Info- und Notfallseite, Hund melden |
| **Mitglied** | Anfragen der eigenen Regionen (und eskalierte Anfragen der Nachbarregionen) sehen, übernehmen, helfen, Status pflegen; eigene Regionen, Verfügbarkeit und Ausstattung festlegen |
| **Behörde** | Anfragen anlegen; eigene Anfragen und alle Anfragen der eigenen Regionen sehen; zurückziehen; Export |
| **Regionalleiter** | Wie Mitglied, außerdem für die eigenen Regionen: öffentliche Meldungen prüfen, Mitglieder und Behörden einladen und freigeben, PINs zurücksetzen, Anfragen bearbeiten, Mitteilungen senden, Export |
| **Admin** | Alles, auch Regionen, Rollen, Einstellungen, Zugriffsprotokoll und Anfragen ohne Region |

Alle Rechte werden **im Backend** geprüft, nicht nur in der App ausgeblendet.

## Demo

Ohne `apiUrl` in `app/src/config.ts` – oder lokal mit `VITE_DEMO=1 npm run dev` – läuft die App im **Demo-Modus**. Dabei läuft das echte Backend (`apps-script/Code.gs`) direkt im Browser, und die Daten liegen nur auf dem jeweiligen Gerät. Demo und echte App verhalten sich deshalb gleich.

| Name | PIN | Rolle |
|---|---|---|
| Demo Admin | 123456 | Admin |
| Rita Regional | 222222 | Regionalleiterin LK München |
| Max Muster | 111111 | Mitglied LK München |
| Mia Helfer | 333333 | Mitglied LK München + LK Freising |
| Erik Ebersberger | 555555 | Mitglied LK Ebersberg (Nachbarregion) |
| Vera Veterinär | 444444 | Behörde (Veterinäramt LK München) |

## Aufbau

```
app/            Frontend: Vite + React + TypeScript + Tailwind, PWA (Service Worker in src/sw.ts)
  src/config.ts      ← alle Links und Einstellungen an einer Stelle
  src/lib/demo.ts    Demo-Modus: führt Code.gs im Browser aus
  src/lib/gasMock.js Nachbildung der Google-Dienste (für Demo und Tests)
apps-script/    Backend: Google Apps Script (Code.gs, appsscript.json) und Ablauftest
docs/           Anleitungen und Tabellenvorlage
```

---

## Einrichtung Schritt für Schritt

Am besten richtest du alles mit einem **eigenen Google-Konto für das Netzwerk** ein (z. B. `sos-hund.netzwerk@gmail.com`), nicht mit einem privaten Konto.

### 1. Google-Tabelle anlegen
1. Auf [sheets.google.com](https://sheets.google.com) eine neue, leere Tabelle anlegen, z. B. **„SOS Hund – Daten“**.
2. Die **ID** steht in der Adresszeile zwischen `/d/` und `/edit`. Kopiere sie für Schritt 3.
3. Die Tabelle **nicht teilen**. Welche Blätter es gibt, steht in [docs/Google-Sheet-Vorlage.md](docs/Google-Sheet-Vorlage.md).

### 2. Apps Script anlegen
1. In der Tabelle auf **Erweiterungen → Apps Script** gehen.
2. Den Inhalt von `apps-script/Code.gs` in die Datei `Code.gs` kopieren und dabei alles ersetzen.
3. Unter **Projekteinstellungen** (Zahnrad) **„Manifestdatei appsscript.json im Editor anzeigen“** anhaken und den Inhalt von `apps-script/appsscript.json` hineinkopieren.

### 3. Script-Attribute eintragen
Unter **Projekteinstellungen → Script-Attribute** anlegen:

| Attribut | Wert |
|---|---|
| `SHEET_ID` | ID der Tabelle aus Schritt 1 |
| `ERSTER_ADMIN` | `Vorname;Nachname;PIN`, z. B. `Joachim;Rodler;482913` (4–8 Ziffern). **Nach Schritt 4 wieder löschen!** |
| `APP_URL` | Adresse der fertigen App aus Schritt 6, z. B. `https://joachimrodler-afk.github.io/SOS-Hund/`. Für Links in Push-Nachrichten und Einladungen |
| `FCM_SERVICE_ACCOUNT` | Für Push-Nachrichten, siehe Schritt 7 |
| `SUPER_ADMIN` | optional: Mitglieds-ID, die andere Admins nicht ändern können |

### 4. `setup()` ausführen
1. Oben die Funktion **`setup`** auswählen und **Ausführen** klicken.
2. Berechtigungen erlauben: Konto wählen → **„Erweitert“ → „Zu … wechseln (unsicher)“ → „Zulassen“**. Die Warnung ist bei eigenen Scripts normal.
3. Danach gibt es alle Tabellenblätter, den ersten Admin, den täglichen Trigger (Anonymisierung, 3 Uhr) und den 5-Minuten-Trigger (Eskalation).
4. **`ERSTER_ADMIN` jetzt löschen.**

### 5. Als Web-App bereitstellen
1. **Bereitstellen → Neue Bereitstellung → Web-App**, „Ausführen als: Ich“, „Zugriff: Jeder“.
2. Die **Web-App-URL** (endet auf `/exec`) kopieren.
3. Bei späteren Änderungen an `Code.gs`: **Bereitstellungen verwalten → Bearbeiten → Version: Neue Version**. Die URL bleibt dann gleich.

### 6. App veröffentlichen (GitHub Pages)
1. In `app/src/config.ts` bei `apiUrl` die Web-App-URL eintragen, dazu `impressumUrl` und `datenschutzUrl`.
2. Auf `main` pushen. Im Repository **Settings → Pages → Source: „GitHub Actions“** einstellen.
3. Der Workflow testet, baut und veröffentlicht die App unter `https://joachimrodler-afk.github.io/SOS-Hund/`.
4. Diese Adresse als `APP_URL` in den Script-Attributen eintragen.

### 7. Push-Nachrichten (Firebase)
1. Auf [console.firebase.google.com](https://console.firebase.google.com) ein Projekt anlegen (ohne Analytics).
2. **Projekteinstellungen → Allgemein → Web-App hinzufügen**. Die Werte in `config.ts` unter `firebase` eintragen.
3. **Cloud Messaging → Web-Push-Zertifikate → Schlüsselpaar generieren**, als `vapidKey` eintragen.
4. **Dienstkonten → Neuen privaten Schlüssel generieren**. Den kompletten JSON-Inhalt als Script-Attribut `FCM_SERVICE_ACCOUNT` eintragen, die Datei danach löschen.
5. App neu veröffentlichen. Jedes Mitglied schaltet Push unter **Konto** ein. **iPhone:** Push funktioniert erst, wenn die App über *Teilen → Zum Home-Bildschirm* installiert ist (ab iOS 16.4).

### 8. Loslegen
1. Mit dem ersten Admin anmelden.
2. Unter **Verwaltung → Regionen** die Regionen mit PLZ und Nachbarregionen anlegen.
3. Unter **Verwaltung → Einstellungen** Info-Text, Notfallkontakte und Datenschutzhinweis anpassen.
4. Unter **Verwaltung → Einladungen** die Regionalleiter einladen, danach laden sie ihre Mitglieder und Behörden selbst ein.

## Offene Punkte

- [x] `apiUrl` in `app/src/config.ts` (Apps-Script-Projekt „SOS Hund – Backend“, Tabelle „SOS Hund – Daten“ in Drive unter Projects/SOS-Hund)
- [ ] `firebase`, `impressumUrl`, `datenschutzUrl` in `app/src/config.ts`
- [ ] Datenschutzerklärung (Auftragsverarbeitung Google, Rechtsgrundlage, Löschfristen) rechtlich prüfen lassen
- [ ] Fotos zu Anfragen (in einem nicht öffentlichen Drive-Ordner) – noch nicht umgesetzt

## Entwicklung

```bash
cd app
npm install
npm run dev        # Entwicklungsserver (Demo-Modus, solange apiUrl leer ist)
npm test           # Tests des Demo-Modus
npm run build      # Produktions-Build nach app/dist

node apps-script/test/backend.test.mjs   # Ablauftest Backend (vom Repo-Hauptordner aus)
```

## Weitere Anleitungen
- [Anleitung für Mitglieder](docs/Anleitung-Mitglieder.md)
- [Anleitung für Regionalleiter und Admins](docs/Anleitung-Admins.md)
- [Anleitung für Behörden](docs/Anleitung-Behoerden.md)
- [Google-Tabelle: Aufbau](docs/Google-Sheet-Vorlage.md)
