# Playtest- und Barrierefreiheits-Vorlage

## A. Blindtest „erstes Zurückspulen“ (NFR-03, UX-02, OBJ-05)

Ziel: mindestens 80 % lösen das erste Zurückspulen-Rätsel (Steg in 01.02) ohne Hilfe der Entwickler.

Ablauf pro Person (ca. 30 Minuten):

1. Neue Installation oder `localStorage` leeren, damit Warnung und Schnell-Einrichtung erscheinen.
2. Einleitung vorlesen: „Spiel bitte, als wärst du allein. Denk laut. Wir helfen nicht.“
3. Beobachter notiert Zeiten und Auffälligkeiten, greift nicht ein.
4. Abbruch nach 15 Minuten am Rätsel gilt als „nicht gelöst“.
5. Kurzinterview mit den Fragen unten.

| Feld | Eintrag |
| --- | --- |
| Teilnehmer-ID (keine Namen) | |
| Erfahrung mit Action-Adventures (keine / etwas / viel) | |
| Eingabegerät | Tastatur und Maus / Controller |
| Gewählte Barrierefreiheits-Optionen | |
| Zeit bis zum ersten Zurückspulen (Laterne, 01.01) | |
| Zeit bis Steg-Rätsel gelöst | |
| Ohne Hilfe gelöst? (ja/nein) | |
| Hinweise angefordert (Anzahl, Stufe) | |
| Stellen mit Verwirrung (Zeitpunkt, Ort, Zitat) | |
| Fehlermeldungen beim Zurückspulen gesehen? Verstanden? | |
| Sentinel besiegt? Glocke als Lösung erkannt? | |
| Abstürze oder hängende Eingaben | |

Fragen danach: Was macht das Zurückspulen? Woran hast du erkannt, welches Objekt du zurückspulen kannst?
Was hat dich aufgehalten? Waren Texte und Untertitel gut lesbar?

Auswertung: Anteil „ohne Hilfe gelöst“ = gelöst / Teilnehmer. Funde ins Fehlerregister übertragen.

## B. Barrierefreiheits-Smoke-Test (Charter §11, UX §9)

| Nr. | Prüfung | Erwartung | OK |
| --- | --- | --- | --- |
| B-01 | Erster Start | Lichtempfindlichkeitswarnung, danach Schnell-Einrichtung vor jedem Dialog | |
| B-02 | Nur Controller | Einrichtung, Menüs, neues Spiel, erstes Rätsel, Pause, Tagebuch ohne Maus/Tastatur | |
| B-03 | Nur Tastatur | Gleicher Weg ohne Maus | |
| B-04 | Fokus | Jedes Element zeigt sichtbaren Fokus (Rahmen, ▸, Leuchten) | |
| B-05 | Untertitel 200 % bei 1080p | Lesbar, nicht abgeschnitten, Hintergrund regelbar | |
| B-06 | Textgröße und UI-Größe maximal | Menüs und HUD bleiben bedienbar | |
| B-07 | Hoher Kontrast | Hinweise und Zielmarker deutlich | |
| B-08 | Kamerawackeln aus, Blitze reduziert | Kein Wackeln, Blitze gedämpft | |
| B-09 | Neubelegung | Konflikt wird gemeldet, Interagieren bleibt erreichbar | |
| B-10 | Halten/Umschalten | Sprinten und Zurückspulen funktionieren im Umschaltmodus | |
| B-11 | Farbunabhängigkeit | Ziel-Status auch über Symbole ◇ ✕ ⚠ und Text erkennbar | |
| B-12 | Tod und Neuladen | Keine hängenden Eingaben, Spieler am Checkpoint | |
| B-13 | Pseudo-Lokalisierung | Keine abgeschnittenen Texte in Menüs und HUD | |
| B-14 | Mono-Audio, Lautstärken | Mono wirkt, jeder Bus einzeln regelbar | |

Prüfer: __________ Datum: __________ Build: __________
