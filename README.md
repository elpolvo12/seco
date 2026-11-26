# Seco – Ausgaben-Tracker für iPhone

Offline-fähige Web-App (PWA) zum Protokollieren von Geldausgaben. Daten bleiben lokal auf dem Gerät.

## Auf dem iPhone installieren
1. Einmalig: Repo → Settings → Pages → Source: **Deploy from a branch**, Branch `main` / `(root)`. Danach wird bei jedem Push auf `main` automatisch deployt.
   URL: https://elpolvo12.github.io/seco/
2. URL in Safari öffnen → Teilen → **Zum Home-Bildschirm**.

## Lokal testen
`python3 -m http.server 8000` und http://localhost:8000 öffnen.

## Funktionen
- **Übersicht:** Monatssumme, Budget-Fortschritt (inkl. Tagesbudget), Verteilung nach Kategorien, Suche über alle Monate
- **Ganze Euro:** keine Cent, alle Beträge werden kaufmännisch gerundet
- **Betragsvorschläge:** bis zu 3 passende Beträge je nach Ort und Kategorie (häufig + kürzlich gewichtet)
- **Beleg oder Screenshot scannen:** Kamera-Taste im Eingabefenster. Kassenbon → Betrag, Datum, Geschäft. Banking-Screenshot → alle Abbuchungen als Liste zum Prüfen (Plus-Beträge/Gutschriften und Kontostand werden ignoriert, bereits erfasste Ausgaben erkannt). Texterkennung mit Tesseract direkt auf dem Gerät
- **Text einfügen (Live Text):** Text im Foto/Screenshot mit der iPhone-Texterkennung kopieren („Alle kopieren“) und in Seco auf das Klemmbrett-Symbol tippen – genauer und ohne Download
- **Obergrenze:** Ausgaben gehen nur bis 1000 €; höhere Beträge werden beim Scannen ignoriert
- **Erfassen:** eigener Ziffernblock, Kategorie, Notiz, Datum; Antippen zum Bearbeiten; nach links wischen zeigt „Löschen“, weit nach links wischen löscht sofort (mit Rückgängig)
- **Statistik:** letzte 6 Monate mit Budgetlinie, Ringdiagramm nach Kategorie, Kennzahlen (Ø/Tag, größte Ausgabe, Vergleich zum Vormonat)
- **Einstellungen:** Monatsbudget mit Warnung bei 80 %/100 %, eigene Kategorien (Name, Emoji, Farbe), JSON-Backup & Wiederherstellung, CSV-Export
- **Ort:** Wenn aktiviert und du nicht zuhause bist (> 300 m), wird der Ort (Geschäft/Straße, Stadt) automatisch in die Notiz übernommen (Ortssuche über OpenStreetMap). An bekannten Orten werden Notiz und Kategorie vom letzten Mal sofort übernommen und passende Beträge vorgeschlagen
- Hell-/Dunkelmodus, offline nutzbar, Daten bleiben lokal auf dem Gerät

## Neue Version veröffentlichen
Versionsnummer an drei Stellen erhöhen: `APP_VERSION` in `app.js`, `VERSION` in `sw.js` und `version.json`. Die App zeigt dann beim nächsten Öffnen „Neue Version verfügbar – Aktualisieren“.
