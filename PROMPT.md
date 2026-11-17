# Auftrag: „SOS Hund“ – App für ein Netzwerk zur Sicherung auffälliger Hunde

Baue eine neue Web-App (PWA) „SOS Hund“ in diesem Repository. Technik, Aufbau und Bedienung
sollen sich eng an meiner bestehenden Vereins-App orientieren:
**https://github.com/joachimrodler-afk/MGI-App** – lies dieses Repo zuerst vollständig
(README, docs/, app/src, apps-script/Code.gs) und übernimm Muster, Ordnerstruktur, Stil und Code,
wo es passt.

## Übernehmen aus der MGI-App
- **Frontend:** Vite + React + TypeScript + Tailwind, PWA mit Service Worker (`src/sw.ts`), installierbar
  auf Android und iPhone, offline-fähige Grundseiten.
- **Backend:** Google Apps Script (`apps-script/Code.gs`) als Web-App mit Google-Tabelle als Datenbank,
  kein eigener Server. Geheimnisse nur in den Script-Attributen, nie im Code.
- **Alle Links und Einstellungen** zentral in `app/src/config.ts`.
- **Anmeldung:** Wie in der MGI-App mit persönlichem PIN (in der Tabelle nur als Salt und Hash),
  einmal anmelden und dauerhaft angemeldet bleiben, Sitzungen im Blatt `Sitzungen`.
- **Zugang nur per Einladung:** Ein Admin oder Regionalleiter erstellt einen Einladungslink oder -code
  (einmalig verwendbar, mit Ablaufdatum). Wer eingeladen ist, meldet sich an und wählt seine Region(en).
  Ein Admin bzw. der zuständige Regionalleiter gibt frei, danach wird der PIN wie in der MGI-App per
  WhatsApp oder E-Mail verschickt.
- **Push:** Firebase Cloud Messaging wie in `src/lib/push.ts`, Versand aus dem Apps Script mit
  `FCM_SERVICE_ACCOUNT`. Jedes Mitglied stellt selbst ein, welche Push-Nachrichten es bekommt, und
  sieht den iPhone-Hinweis (Push nur nach „Zum Home-Bildschirm“).
- **Demo-Modus** mit Beispieldaten, solange keine `apiUrl` gesetzt ist, mit Demo-Zugängen für jede Rolle.
- **Veröffentlichung** über GitHub Pages mit demselben `deploy.yml`-Workflow (Tests laufen vor dem Build).
- **Tests:** Vitest für das Frontend, Node-Ablauftests für das Backend wie in `apps-script/test/`.
- **Doku:** README mit Einrichtung Schritt für Schritt sowie in `docs/` eine Anleitung für Mitglieder,
  eine für Admins, eine für Behörden und die Google-Sheet-Vorlage. Die Oberfläche ist komplett deutsch.

## Kernfunktion: SOS-Anfragen
Eine **Anfrage** enthält:
- Kurzbeschreibung (was ist passiert, Dringlichkeit: normal / dringend / akut)
- Hund: Rasse/Typ, Größe, Farbe/Merkmale, Alter (ca.), Geschlecht, optional Foto(s) (verkleinert, Ablage in
  einem nicht öffentlichen Drive-Ordner)
- Was ist passiert (Freitext: Beißvorfall, entlaufen, aggressiv, Halter verstorben/ins Krankenhaus …)
- Adresse des Hundehalters bzw. Ort des Hundes (Straße, PLZ, Ort, optional Standort per GPS)
- Kontaktdaten des Auftraggebers (Name, Organisation/Behörde, Telefon, E-Mail, Erreichbarkeit)

**Regionale Zuordnung:**
- Regionen werden von Admins gepflegt (z. B. Landkreis bzw. eine Liste von PLZ-Bereichen).
- Jede Anfrage wird über die PLZ der Adresse automatisch einer Region zugeordnet (manuell korrigierbar).
- Alle freigegebenen Mitglieder dieser Region mit eingeschaltetem Push bekommen **sofort eine
  Push-Nachricht** (Titel mit Dringlichkeit, Ort und Kurzbeschreibung, **ohne** Halteradresse im Push-Text).
- Optional: Wird eine Anfrage nach X Minuten nicht angenommen, geht eine Push-Nachricht an die
  Nachbarregionen und den Regionalleiter (zeitgesteuerter Trigger im Apps Script, X einstellbar).

**Annehmen und Status:**
- Ein Mitglied tippt „Ich übernehme“. Die Anfrage wird **sofort markiert** (wer, wann) und für die
  anderen als „übernommen von …“ angezeigt. Doppelte Übernahme verhindern (LockService im Apps Script).
- Status: `offen` → `übernommen` → `vor Ort` → `gesichert` / `abgeschlossen` / `abgebrochen`, jeder
  Wechsel mit Zeitstempel und optionaler Notiz (Verlauf).
- Die übernehmende Person kann die Anfrage wieder freigeben, dann wird die Region erneut benachrichtigt.
- Bei der Übernahme bekommen die anderen Mitglieder der Region eine kurze Push-Nachricht
  („übernommen“, abschaltbar). Der Auftraggeber bekommt optional eine E-Mail.
- Liste und Karte der offenen Anfragen in meinen Regionen, Filter nach Status und Dringlichkeit,
  „Route starten“ als Link zu Google/Apple Maps.

## Rollen und Zugänge
| Rolle | Rechte |
|---|---|
| **Öffentlich** (ohne Anmeldung) | Infoseite über das Netzwerk, Notfallnummern, Verhaltenstipps bei auffälligen Hunden. Optional ein Meldeformular „Hund melden“ (mit Spam-Schutz, Status zuerst „ungeprüft“, Freigabe durch Regionalleiter/Admin vor dem Push). **Sieht keine Anfragen und keine personenbezogenen Daten.** |
| **Mitglied** | Regionen wählen, Push einstellen, Anfragen der eigenen Regionen sehen, übernehmen, Status pflegen, eigenes Profil (Qualifikation, Fahrzeug/Box vorhanden, Verfügbarkeit an/aus) |
| **Behörde (Veterinäramt)** | Eigener Zugang per Einladung, an Landkreis/Region gebunden. Anfragen anlegen (Auftraggeber wird automatisch eingetragen), Status und Verlauf der eigenen Anfragen und aller Anfragen im eigenen Zuständigkeitsbereich sehen, Export als CSV/PDF |
| **Regionalleiter** (empfohlen, Untergruppe der Admins) | Einladungen und Freigaben für die eigene Region, ungeprüfte Meldungen freigeben, Anfragen neu zuweisen |
| **Admin** | Alles: Regionen und PLZ-Zuordnung, Mitglieder, Behörden, Rollen, Einladungen, Einstellungen (Texte, Notfallnummern, Eskalationszeit), Mitteilungen an alle oder an eine Region, Übersicht und Export |

Rechte **im Backend** prüfen (jede Aktion im Apps Script mit Sitzung und Rolle), nicht nur im Frontend ausblenden.

## Datenschutz (wichtig, DSGVO)
- Halteradresse und Kontaktdaten sind personenbezogen: Sie sind nur für Mitglieder der zuständigen Region,
  die zuständige Behörde und Admins sichtbar. Push-Texte enthalten sie nicht.
- Abgeschlossene Anfragen werden nach einstellbarer Frist (z. B. 12 Monate) automatisch anonymisiert
  (täglicher Trigger).
- Zugriffsprotokoll: wer welche Anfrage geöffnet bzw. geändert hat.
- Datenschutztext und Impressum sind in den Einstellungen pflegbar und in der App verlinkt.
- Die Google-Tabelle gehört nur dem Netzwerk-Konto und wird nicht geteilt.

## Google-Tabelle (Blätter, von `setup()` angelegt)
`Mitglieder` (inkl. rolle, regionen, salt, hash, aktiv), `Sitzungen`, `Einladungen`, `Regionen`
(id, name, plz-Liste, nachbarn), `Behoerden`, `Anfragen` (id, region, status, dringlichkeit,
json, erstellt, uebernommenVon, uebernommenAm), `Verlauf`, `PushAbos`, `Einstellungen`, `Protokoll`.

## Vorgehen
1. Lies die MGI-App und fasse mir kurz zusammen, was du übernimmst und was du neu baust.
2. **Stelle mir offene Entscheidungen einzeln als Rückfrage** (eine Frage pro Nachricht, gern als Multiple Choice),
   z. B.: Darf die Öffentlichkeit selbst Anfragen melden? Werden Regionen über Landkreise oder PLZ geführt?
   Brauchen wir die Rolle „Regionalleiter“? Soll die Eskalation an Nachbarregionen aktiv sein?
3. Danach schrittweise umsetzen: Backend und Datenmodell → Anmeldung, Einladung und Rollen →
   Anfragen und Übernahme → Push → Behördenzugang → öffentlicher Bereich → Verwaltung → Doku.
4. Nach jedem Schritt Tests ausführen und den Demo-Modus lauffähig halten.
