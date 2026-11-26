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
- **Erfassen:** eigener Ziffernblock, Kategorie, Notiz, Datum; Antippen zum Bearbeiten, nach links wischen zum Löschen (mit Rückgängig)
- **Statistik:** letzte 6 Monate mit Budgetlinie, Ringdiagramm nach Kategorie, Kennzahlen (Ø/Tag, größte Ausgabe, Vergleich zum Vormonat)
- **Einstellungen:** Monatsbudget mit Warnung bei 80 %/100 %, eigene Kategorien (Name, Emoji, Farbe), JSON-Backup & Wiederherstellung, CSV-Export
- **Ort:** Wenn aktiviert und du nicht zuhause bist (> 300 m), wird der Ort (Geschäft/Straße, Stadt) automatisch in die Notiz übernommen (Ortssuche über OpenStreetMap). An bekannten Orten werden Notiz und Kategorie vom letzten Mal sofort übernommen und der letzte Betrag vorgeschlagen
- Hell-/Dunkelmodus, offline nutzbar, Daten bleiben lokal auf dem Gerät
