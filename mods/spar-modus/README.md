# spar-modus

Ein Mod für Claude Code, das dein Kontingent schont: Einfache, kurze Fragen
beantwortet das kleine Modell (Haiku), richtige Arbeit das große Modell deiner
Sitzung. Welches Modell zuletzt geantwortet hat, steht in der Statuszeile und
in einem Seitenfeld, in dem du den Spar-Modus ein- und ausschaltest.

## Installieren

1. Kopiere den Ordner `mods/spar-modus` in den Mod-Ordner deiner Sitzung:
   `~/.claude/dev-mods/<sitzungs-id>/spar-modus/`
   (Claude Code nennt den Ordner, sobald du es bittest, ein Mod zu bauen.)
2. Bestätige die Abfrage „Turn on the mods Claude writes in this session?“
   mit „Turn them on“. Danach lädt das Mod sich selbst.
3. Ohne diesen Schritt kannst du Claude auch bitten: „Lade das Mod aus
   `mods/spar-modus`.“

## Benutzen

- Der Spar-Modus startet eingeschaltet.
- Statuszeile: zeigt nach jeder Antwort „Modell: …“, bei gespartem Modell mit
  dem Zusatz „(Spar-Modus)“.
- Seitenfeld „Spar-Modus“: Knopf zum Ein- und Ausschalten, zuletzt
  antwortendes Modell, Zähler der gesparten Schritte. `/spar` schaltet ebenfalls um.

## Wie entschieden wird

Eine Frage geht an Haiku, wenn sie kurz ist (höchstens 220 Zeichen, 3 Zeilen),
kein Arbeitswort enthält (z. B. bauen, fix, schreib, analysiere) und keinen
Code oder Dateipfad. Sobald in einer Runde ein Werkzeug genutzt wird, läuft
der Rest der Runde auf dem großen Modell. Die Regeln stehen in `hooks/register.tsx`.

## Hinweis

Ein Modellwechsel mitten im Gespräch kostet etwas Prompt-Cache.
