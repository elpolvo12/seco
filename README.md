# Ausgaben – Ausgaben-Tracker für iPhone

Offline-fähige Web-App (PWA) zum Protokollieren von Geldausgaben. Daten bleiben lokal auf dem Gerät.

## Auf dem iPhone installieren
1. Einmalig: Repo → Settings → Pages → Source: **Deploy from a branch**, Branch `main` / `(root)`. Danach wird bei jedem Push auf `main` automatisch deployt.
   URL: https://elpolvo12.github.io/seco/
2. URL in Safari öffnen → Teilen → **Zum Home-Bildschirm**.

## Lokal testen
`python3 -m http.server 8000` und http://localhost:8000 öffnen.

Funktionen: Ausgaben mit Betrag/Kategorie/Notiz/Datum, Monatsübersicht mit Kategorie-Verteilung, Bearbeiten/Löschen, CSV-Export (iOS-Teilen-Menü).
