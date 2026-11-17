# SOS Hund – Anleitung für Regionalleiter und Admins

Regionalleiter haben alle Rechte eines Mitglieds und verwalten zusätzlich **ihre eigenen Regionen**. Admins verwalten alles.

## Öffentliche Meldungen prüfen
Meldungen von Personen ohne Zugang kommen als **„ungeprüft“** an. Du bekommst eine Push-Nachricht (Anlass „Verwaltung“).
1. Meldung öffnen und den Melder kurz anrufen.
2. **Freigeben** – jetzt bekommen die Helfer der Region eine Push-Nachricht.
   **Verwerfen** – z. B. Spam, doppelt oder erledigt.
3. Gehört die PLZ zu keiner Region, zuerst über **Bearbeiten** eine Region zuordnen.

## Einladen und freigeben
1. **Verwaltung → Einladungen → Einladen**: Rolle (Mitglied oder Behörde; Admins auch Regionalleiter und Admin) und Regionen wählen, Notiz eintragen.
2. Den Code bzw. Link per WhatsApp oder E-Mail verschicken. Er gilt einmal und läuft nach der eingestellten Zahl von Tagen ab.
3. Die Person registriert sich. Unter **Warten auf Freigabe** siehst du die Angaben.
4. **Freigeben** – der PIN wird **einmal** angezeigt. Direkt per WhatsApp, SMS oder E-Mail weitergeben.

## Zugänge verwalten
Unter **Verwaltung → Zugänge**: Regionen ändern, **Neuer PIN** (bei PIN vergessen), **Deaktivieren** (z. B. bei Austritt). Admins können zusätzlich Rollen ändern und deaktivierte Zugänge löschen.

## Anfragen steuern
- **Bearbeiten**: Angaben korrigieren, Region ändern (die neue Region wird benachrichtigt).
- **Übernahme aufheben**: Wenn sich jemand nicht meldet, gibst du die Anfrage wieder frei.

## Mitteilungen
**Verwaltung → Mitteilung senden**: Push an deine Regionen (Admins: an alle oder ausgewählte Regionen), z. B. „Treffen am Samstag“.

## Nur für Admins
- **Regionen**: Name, PLZ (`85737`, `857*`, `80331-81929`) und Nachbarregionen. Die genaueste Angabe gewinnt.
- **Einstellungen**: Info-Text, Notfallkontakte, Datenschutzhinweis (Markdown), Eskalationszeiten, Anonymisierungsfrist, E-Mail an Auftraggeber.
- **Zugriffsprotokoll**: Wer hat welche Anfrage angesehen, geändert oder exportiert.
- Anfragen **ohne Region** (PLZ passt zu keiner Region) sehen nur Admins.

## Eskalation
Alle 5 Minuten prüft das Backend offene Anfragen. Ist eine Anfrage nach der eingestellten Zeit (Standard 30 Minuten, „akut“ 10 Minuten) nicht übernommen, bekommen die Helfer der **Nachbarregionen** eine Push-Nachricht, und die Regionalleitung wird informiert.
