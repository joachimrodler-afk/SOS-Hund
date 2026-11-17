# Auftrag: „SOS Hund“ – App für ein Netzwerk zur Sicherung auffälliger Hunde

Baue eine Web-App (PWA) „SOS Hund“ für ein Netzwerk, das auffällige, entlaufene oder herrenlose Hunde
sichert. Mitglieder melden sich nach Einladung für ihre Region an. Eine Anfrage löst eine Push-Nachricht
an alle einsatzbereiten Helfer der Region aus, wer annimmt, wird sofort für alle sichtbar markiert.
Die Oberfläche ist komplett deutsch, für das Handy gebaut und ohne App-Store installierbar.

## Technik
- **Frontend:** Vite + React + TypeScript + Tailwind, PWA mit eigenem Service Worker (`src/sw.ts`),
  installierbar auf Android und iPhone, Grundseiten (Info, Notruf) auch offline. HashRouter, damit
  GitHub Pages ohne Server-Regeln funktioniert.
- **Backend:** Google Apps Script (`apps-script/Code.gs`) als Web-App, Google-Tabelle als Datenbank,
  kein eigener Server. Eine zentrale Aktionstabelle mit Rechte-Stufe je Aktion
  (offen, angemeldet, helfer, leitung, admin). Rechte **immer im Backend** prüfen, nicht nur im Frontend
  ausblenden. Schreibzugriffe mit `LockService` absichern (z. B. gegen doppelte Übernahme).
- **Geheimnisse** nur in den Script Properties, nie im Code: `SHEET_ID`, `ERSTER_ADMIN`
  (wird von `setup()` angelegt und danach gelöscht), `FCM_SERVICE_ACCOUNT`, `APP_URL`, `SUPER_ADMIN`,
  `FOTO_ORDNER_ID` (wird automatisch angelegt).
- **Alle Links und Einstellungen** des Frontends zentral in `app/src/config.ts`.
- **Push:** Firebase Cloud Messaging, Versand aus dem Apps Script. Jedes Mitglied stellt selbst ein,
  welche Push-Nachrichten es bekommt, mit Test-Nachricht und iPhone-Hinweis (Push nur, wenn die App vom
  Home-Bildschirm geöffnet wird). Push-Texte enthalten nie Adressen oder Namen.
- **E-Mail** über MailApp als Ergänzung bzw. Ersatz, solange Push nicht eingerichtet ist.
- **Zeitgesteuert:** alle 5 Minuten Eskalation prüfen, täglich um 3 Uhr anonymisieren.
- **Veröffentlichung** über GitHub Pages mit einem Workflow (`deploy.yml`): Frontend-Tests,
  Backend-Ablauftest, Build der App und zusätzlich der Demo unter `/demo/`.
- **Tests:** Vitest für das Frontend, Node-Ablauftest für das Backend. Dafür eine Nachbildung der
  Google-Dienste (`gasMock.js`: Tabelle, Properties, Cache, Lock, Geocoder, MailApp, Drive, UrlFetch),
  mit der `Code.gs` unverändert in Node und im Browser läuft.
- **Demo-Modus:** Ist keine `apiUrl` gesetzt (bzw. beim Demo-Build), läuft dasselbe `Code.gs` im Browser
  mit der Nachbildung, Daten im Gerätespeicher. Eigener Speicher-Präfix für Demo und echte App, damit
  sie sich auf derselben Adresse nicht stören. Der Service Worker der echten App darf `/demo/` nicht
  abfangen.
- **Robust bei vollem Gerätespeicher:** Ist der Browser-Speicher der Adresse voll, zuerst den
  Zwischenspeicher leeren, notfalls die Anmeldung im Arbeitsspeicher halten, in der Demo zuerst die Fotos
  opfern. Eine Anmeldung darf nie stillschweigend verloren gehen.

## Erscheinungsbild
- Eigenes Logo (Datei liefere ich) im Kopf der App, auf der Startseite und als App-Symbol in allen Größen.
- Farben: Blau für den Kopf, Rot für Notfall und „Hund melden“, klare Karten, große Tippflächen.
- Unten eine Leiste: Start, Anfragen, großer roter Knopf in der Mitte (Neu bzw. Melden), Info,
  Verwaltung bzw. Konto. Hell- und Dunkelmodus.

## Anmeldung und Zugang
- **Persönlicher PIN** (6 Ziffern), in der Tabelle nur als Salt und Hash. Einmal anmelden, dann
  dauerhaft angemeldet. Abmelden, neuer PIN oder Deaktivieren beenden die Sitzung. Sperre nach mehreren
  Fehlversuchen.
- **Zugang nur per Einladung:** Admin oder Regionalleiter erstellt einen Einladungscode bzw. -link
  (einmalig, mit Ablaufdatum, mit Rolle, Regionen und Notiz). Die eingeladene Person registriert sich
  (Name, Handynummer, E-Mail, Regionen, Datenschutz-Zustimmung). Admin bzw. zuständiger Regionalleiter
  gibt frei, danach erscheint der PIN genau einmal und wird per WhatsApp, SMS oder E-Mail mit fertiger
  Nachricht (Link und Kurzanleitung) verschickt.
- Admins können Zugänge auch direkt anlegen.

## Rollen
| Rolle | Rechte |
|---|---|
| **Öffentlich** (ohne Anmeldung) | Infoseite, Notruf 112/110 mit einem Tipp, Verhaltenstipps, Datenschutz und Impressum. **Hund melden** über ein Formular, Status zuerst „ungeprüft“, erst nach Freigabe durch die Regionalleitung geht der Push raus. Sieht keine Anfragen und keine personenbezogenen Daten. |
| **Mitglied (Helfer)** | Regionen wählen, Push einstellen, „Ich bin einsatzbereit“ an/aus, Profil (Telefon, Ausstattung wie Fahrzeug, Transportbox, Fanggeräte), Anfragen der eigenen Regionen sehen, übernehmen, mithelfen, Status pflegen. |
| **Behörde (Veterinäramt)** | Eigener Zugang per Einladung, an Region gebunden. Anfragen stellen (gehen ohne Prüfung sofort raus, Auftraggeber ist vorausgefüllt), eigene Anfragen und alle im Zuständigkeitsbereich verfolgen, zurückziehen, Export als CSV und Druck/PDF. Bekommt Push bei Übernahme und Statuswechsel, optional E-Mail. |
| **Regionalleiter** | Helfer mit Zusatzaufgaben für die eigenen Regionen: öffentliche Meldungen prüfen, freigeben oder verwerfen, Anfragen bearbeiten und neu zuordnen, Übernahme aufheben, Mitglieder und Behörden einladen, freigeben, neuen PIN erzeugen, deaktivieren, Mitteilung (Push) an die eigenen Regionen, **Admin kontaktieren** (siehe unten). |
| **Admin** | Alles: Regionen und PLZ, alle Zugänge und Rollen, Einladungen aller Rollen, Einstellungen, Mitteilungen an alle oder an Regionen, Export, Zugriffsprotokoll, **Deutschlandkarte** und **Nachrichten** (siehe unten). Ein Super-Admin kann von anderen Admins nicht geändert werden. |

## Anfrage (Formular für Melden, Behörde und Mitglieder)
Gleiches Formular in vier Abschnitten:
1. **Was ist passiert?** Dringlichkeit (normal / dringend / akut), Kurzbeschreibung in einem Satz (steht
   im Push), Freitext zum Vorfall (Beißvorfall, entlaufen, aggressiv, Halter verstorben oder im
   Krankenhaus …).
2. **Welcher Hund?** Rasse/Typ, Größe, Farbe, Alter (ca.), Geschlecht, Merkmale, Name, Anzahl.
   Darunter **Fotos**: Knöpfe „Foto machen“ (öffnet die Kamera) und „Foto hochladen“ (Galerie,
   Mehrfachauswahl), bis zu 5 Fotos, Vorschaubilder mit ✕ zum Entfernen. Fotos im Browser verkleinern
   (max. 1600 px, JPEG).
3. **Wo ist der Hund? (Adresse Hundehalter)** Name, Telefon und E-Mail des Hundehalters (falls bekannt),
   Straße und Hausnummer bzw. Ort, **PLZ** und Ort (Pflicht), Hinweis (z. B. „Schlüssel bei Nachbar“),
   „Meinen Standort verwenden“ per GPS. Koordinaten per Geocoder aus der Adresse.
4. **Ihre Kontaktdaten** (Auftraggeber). Direkt unter der Überschrift der Haken **„Ich bin selbst der
   Hundehalter“**: Er überträgt Name, Telefon, E-Mail, Straße, PLZ und Ort aus Abschnitt 3 und sperrt
   diese Felder. Dann Name, Organisation/Behörde, Telefon, E-Mail, Straße und Hausnummer, PLZ, Ort,
   Erreichbarkeit.

Danach Datenschutz-Zustimmung (öffentlich) und Absenden. Die App zeigt die Anfragenummer
(z. B. SOS-2026-0005) und wie viele Helfer benachrichtigt wurden. Beim Bearbeiten keine Fotos ändern.

**Fotos speichern:** in einem nicht öffentlichen Drive-Ordner „SOS Hund – Fotos“ (bei mir unter
Projects/SOS-Hund). Zugriff über die Drive-API (erweiterter Dienst „Drive“, v3) mit dem Scope
`drive.file`, damit das Script nur selbst angelegte Dateien sieht, nicht das ganze Drive. Eine
Hilfsfunktion `fotoOrdnerEinrichten()` zum einmaligen Ausführen im Editor (Freigabe erteilen, Ordner
anlegen). Fotos werden erst beim Öffnen der Anfrage geladen, nur für alle, die die Anfrage sehen
dürfen, jeder Abruf ins Zugriffsprotokoll, bei der Anonymisierung in den Papierkorb.

## Regionen und Zuordnung
- Regionen pflegt der Admin: Name, PLZ-Angaben kommagetrennt, Nachbarregionen, aktiv/inaktiv.
  Schreibweisen: `85737` (genau diese PLZ), `857*` (beginnt mit), `80331-81929` (Bereich).
  **Die genaueste Angabe gewinnt.**
- Jede Anfrage wird über die PLZ automatisch einer Region zugeordnet, manuell korrigierbar. Passt keine
  Region, werden die Admins informiert.
- **Eskalation:** Übernimmt niemand rechtzeitig, gehen Push-Nachrichten an die Nachbarregionen und die
  Regionalleitung. Standard: nach 30 Minuten (normal/dringend), nach 10 Minuten (akut), in den
  Einstellungen änderbar (mind. 5 Minuten). In der Anfrage das Etikett „an Nachbarregionen“, bei den
  Helfern der Nachbarregion „Nachbarregion“, Eintrag im Verlauf.

## Ablauf eines Einsatzes
- **Ich übernehme**: sofort markiert (wer, wann), alle anderen sehen „übernommen von …“. Doppelte
  Übernahme verhindern; wer zu spät ist, sieht „Schon übernommen von …“. Danach Hinweis, jetzt den
  Auftraggeber anzurufen. Andere Helfer der Region bekommen eine kurze Push-Nachricht (abschaltbar), der
  Auftraggeber optional eine E-Mail.
- **Ich helfe mit** / **Ich helfe doch nicht mit**: weitere Helfer im Team.
- **Status:** offen → übernommen → vor Ort → gesichert → abgeschlossen bzw. abgebrochen, jeder Schritt
  mit Uhrzeit und optionaler Notiz im Verlauf. Dazu „Notiz hinzufügen“.
- **Ich kann doch nicht – zurückgeben**: Anfrage wieder offen, Region erneut benachrichtigt.
- **Anfrage-Ansicht:** Status, Dringlichkeit, Fotos (Vorschau, antippen vergrößert, weiter blättern),
  Ort mit Karte und „Route starten“ (Google/Apple Maps), Hund, Auftraggeber und Team mit Telefonnummern
  zum Antippen, Verlauf, Drucken.
- **Anfragen-Liste:** Laufend / Erledigt / Alle, „Nur meine“, Umschalten auf Karte (OpenStreetMap,
  Leaflet), farbige Marken (ungeprüft, offen, DRINGEND/AKUT, übernommen, vor Ort, gesichert,
  Nachbarregion, meine), Anzahl der Fotos.

## Verwaltung
- **Meldungen prüfen**, **Einladungen & Registrierungen**, **Zugänge** (Suche, Rollen-Filter, Profil
  aufklappen mit Telefon, Rolle, Regionen, Neuer PIN, Deaktivieren, Löschen), **Regionen**,
  **Mitteilung senden**, **Export**, **Einstellungen**, **Zugriffsprotokoll**, **Mein Konto**.
  Zähler (rote Zahl) für Ungeprüftes, Registrierungen und ungelesene Nachrichten.
- **Einstellungen:** Name des Netzwerks, Info-Seite (Markdown), Notfall-Kontakte, Datenschutzhinweis,
  Eskalation an/aus und Minuten, Anonymisierung nach Monaten, E-Mail an Auftraggeber bei Übernahme.
- In der Regionen-Liste die Namen der Regionalleiter anzeigen.

### Deutschlandkarte (nur Admin)
- Unter Verwaltung → Deutschlandkarte alle **2-stelligen PLZ-Bereiche** Deutschlands als Flächen.
  Die Flächen werden genähert aus PLZ-Mittelpunkten (Voronoi je Leitbereich, an der Landesgrenze
  abgeschnitten) und als statische Datei mit der Liste der PLZ je Bereich ausgeliefert; Quellen und
  Lizenzen nennen.
- Zuordnung nach derselben Regel wie im Backend. Farbe = Region mit den meisten PLZ im Bereich,
  kräftiger = höherer Anteil vergeben, grau = frei, rot gestrichelt = Überschneidung (eine PLZ passt
  gleich genau zu mehreren Regionen). Bereichsnummern auf der Karte.
- Oben: Anteil vergebener PLZ in Prozent, Bereiche ganz/teilweise vergeben, freie Bereiche.
  Darunter alle Regionen mit Farbe, Regionalleitung (rot, wenn keine), PLZ-Zahl, Helferzahl und
  Hinweis auf Überschneidungen.
- **Klick auf einen Bereich:** genau ein Regionalleiter im Bereich → direkt zu dessen Profil unter
  Zugänge (aufgeklappt und hervorgehoben). Mehrere → Fenster mit der Aufteilung, Namen antippbar.
  Keiner → Fenster mit vergebenen und freien PLZ. Auch in der Liste sind die Namen Links zum Profil.

### Nachrichten zwischen Regionalleitern und Admins
- **Regionalleiter:** Verwaltung → **Admin kontaktieren**: Telefon und E-Mail aller Admins zum Antippen,
  darunter ein Nachrichtenverlauf wie im Chat mit Eingabefeld.
- **Admin:** ganz oben unter **Anfragen** (und unter Verwaltung) die Zeile **Nachrichten** mit roter Zahl
  für Ungelesenes. Liste aller Regionalleiter, die geschrieben haben, neueste oben; ein Tipp öffnet den
  Verlauf mit Name, Region, Telefon, E-Mail und Antwortfeld.
- Jede Nachricht wird gespeichert (Blatt `Nachrichten`, ein Verlauf je Regionalleiter, gelesen-Status je
  Seite) und zusätzlich per Push und E-Mail gemeldet (Antwort-an = Absender). Beim Öffnen gilt der
  Verlauf als gelesen. Nachrichten an die Admins ins Zugriffsprotokoll.

## Datenschutz (DSGVO)
- Adressen, Namen, Telefonnummern und Fotos sehen nur Helfer der zuständigen Region, die zuständige
  Behörde und Admins. Push-Texte enthalten sie nie.
- Zugriffsprotokoll: wer welche Anfrage geöffnet, geändert oder exportiert hat.
- Nach einstellbarer Frist (Standard 12 Monate) werden abgeschlossene Anfragen anonymisiert: Namen,
  Adressen, Telefonnummern, Notizen und Fotos weg; Hund, PLZ, Ort und Datum bleiben für die Statistik.
- Datenschutzhinweis und Impressum pflegbar und in der App verlinkt. Die Tabelle wird nicht geteilt.

## Google-Tabelle (Blätter, von `setup()` bzw. beim ersten Zugriff angelegt, fehlende Spalten ergänzen)
`Mitglieder`, `Sitzungen`, `Einstellungen`, `Regionen` (id, name, plz, nachbarn, aktiv),
`Einladungen`, `Registrierungen`, `Anfragen` (id, nummer, region, status, dringlichkeit, quelle,
erstellt, erstelltVon, uebernommenVon/-Name/-Am, helfer, eskaliertAn/-Am, geaendert, abgeschlossenAm,
anonymisiert, json), `Verlauf`, `Protokoll`, `PushAbos`, `Nachrichten`.

## Demo
- Eigener Link zum Verschicken (`…/demo/`), gelbes Band „Demo-Modus – Beispieldaten, nur auf diesem
  Gerät gespeichert“, Schnell-Anmeldung je Rolle: Demo Admin, Rita Regional (Regionalleiterin),
  Max Muster und Mia Helfer (Mitglieder), Vera Veterinär (Behörde), Erik Ebersberger (Nachbarregion).
- Beispieldaten: Regionen LK München, LK Freising, LK Ebersberg mit Nachbarschaft, dazu **20
  Regionalleiter mit eigener Region in ganz Deutschland** (Hamburg bis Regensburg) für die Karte;
  Anfragen in verschiedenen Zuständen, eine ungeprüfte öffentliche Meldung, eine offene Registrierung,
  zwei Beispiel-Unterhaltungen zwischen Regionalleitern und Admin. Der Demo-Admin hat Telefon und E-Mail.
- Eskalation läuft in der Demo in Echtzeit (bei jeder Aktion geprüft), damit man sie selbst ausprobieren kann.

## Dokumentation
- README mit Einrichtung Schritt für Schritt (Apps Script, Script Properties, `setup()`, Bereitstellung
  als Web-App, GitHub Pages, Firebase).
- **Bebilderte Bedienungsanleitung** als Dokument in den Artefakten: App auf einen Blick, Ablauf eines
  Einsatzes, je ein Kapitel für Melden, Zugang, Helfer, Behörden, Regionalleiter, Admins, Datenschutz und
  Hilfe bei Problemen, mit nummerierten Bildschirmfotos aus der Demo.

## Betrieb
- Backend, Tabelle und Fotos im Google-Konto des Netzwerks, bei mir im Drive-Ordner Projects/SOS-Hund.
  Für einen Verein besser Google Workspace (Auftragsverarbeitung, Vereinsadresse als Absender, höhere
  Grenzen).
- Jede Backend-Änderung braucht eine neue Version der Web-App-Bereitstellung (gleiche URL).

## Arbeitsweise
1. **Entscheidungen immer einzeln als Rückfrage** stellen, eine Frage pro Nachricht, gern als Multiple Choice.
2. **Vor dem Zugriff auf ein anderes Programm** (Browser, Google Drive, Apps-Script-Editor, Docs …)
   nachfragen.
3. PINs, Passwörter und Schlüssel (`ERSTER_ADMIN`, `FCM_SERVICE_ACCOUNT`) trage ich selbst ein,
   Google-Freigaben bestätige ich selbst. Keine Testdaten an das echte Backend schicken.
4. Schrittweise umsetzen: Backend und Datenmodell → Anmeldung, Einladung, Rollen → Anfragen und
   Übernahme → Push → Behörden → öffentlicher Bereich → Verwaltung → Karte und Nachrichten → Doku.
5. Nach jedem Schritt Tests ausführen, die Demo lauffähig halten und mit Bildschirmfotos prüfen.
