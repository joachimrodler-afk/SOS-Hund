# Google-Tabelle: Aufbau

`setup()` im Apps Script legt alle Blätter mit den passenden Spaltenköpfen automatisch an. Neue Spalten aus späteren Updates ergänzt das Script selbst.

> **Bitte nichts von Hand ändern** – keine Spalten verschieben, keine Zeilen sortieren. Die `json`-Spalten schreibt die App.

| Blatt | Spalten | Inhalt |
|---|---|---|
| **Mitglieder** | `id`, `vorname`, `nachname`, `rolle` (mitglied/regionalleiter/admin/behoerde), `regionen` (IDs, kommagetrennt), `telefon`, `email`, `organisation`, `salt`, `hash`, `aktiv`, `verfuegbar`, `profil` (JSON), `erstellt`, `letzteAnmeldung` | Alle Zugänge. Der PIN steht **nur als Hash** darin |
| **Sitzungen** | `token`, `mitgliedId`, `ablauf` | Anmeldungen (laufen nicht ab; enden durch Abmelden, neuen PIN oder Deaktivieren) |
| **Einstellungen** | `schluessel`, `wert` (JSON) | Texte, Eskalation, Anonymisierungsfrist |
| **Regionen** | `id`, `name`, `plz`, `nachbarn`, `aktiv` | Regionen mit PLZ-Angaben und Nachbarregionen |
| **Einladungen** | `code`, `rolle`, `regionen`, `notiz`, `erstelltVon`, `erstellt`, `ablauf`, `genutzt` | Einladungscodes |
| **Registrierungen** | `id`, `code`, `vorname`, `nachname`, `telefon`, `email`, `organisation`, `rolle`, `regionen`, `nachricht`, `erstellt`, `status`, `bearbeitet` | Registrierungen nach Einladung (offen/freigegeben/abgelehnt) |
| **Anfragen** | `id`, `nummer` (SOS-JJJJ-NNNN), `region`, `status`, `dringlichkeit`, `quelle`, `erstellt`, `erstelltVon`, `uebernommenVon`, `uebernommenName`, `uebernommenAm`, `helfer` (JSON), `eskaliertAn`, `eskaliertAm`, `geaendert`, `abgeschlossenAm`, `anonymisiert`, `json` | SOS-Anfragen; Hund, Adresse und Auftraggeber stehen in `json` |
| **Verlauf** | `id`, `anfrageId`, `zeit`, `mitgliedId`, `name`, `aktion`, `status`, `notiz` | Verlauf jeder Anfrage |
| **Protokoll** | `zeit`, `mitgliedId`, `name`, `aktion`, `anfrageId` | Zugriffsprotokoll (wird nach der Anonymisierungsfrist gelöscht) |
| **PushAbos** | `fcmToken`, `mitgliedId`, `einstellungen` (JSON), `erstellt` | Geräte mit eingeschaltetem Push |

**Zugriff:** Die Tabelle gehört nur dem Konto des Netzwerks und wird **nicht geteilt**. Sie enthält Adressen und Telefonnummern.
