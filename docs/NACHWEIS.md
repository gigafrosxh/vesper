# Anforderungs-Nachweis (Traceability)

Stand: 26.10.2026, Version 0.1.0. Status: **Erfüllt** = umgesetzt und automatisch geprüft,
**Umgesetzt** = umgesetzt, Prüfung nur manuell möglich, **Offen** = braucht Menschen oder Zielhardware.

## Funktionale Anforderungen (SRS §3)

| ID | Prio | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- | --- |
| FR-001 | M | Offline-Spiel, Electron-Paket, keine Netzwerkzugriffe (CSP `connect-src 'self'`) | `tests/desktop/electron.smoke.cjs`; Windows-Neuinstallation | Umgesetzt, Windows-Test offen |
| FR-002 | M | Laufen, Sprinten, Springen, Kanten klettern, hervorgehobene Interaktion (`src/sim/player.ts`) | `playthrough.test.ts` (kompletter Pfad) | Erfüllt |
| FR-003 | M | Schnappschuss-Rücklauf mit einstellbarem Fenster (`src/time/temporal.ts`) | `temporal.test.ts` „restores a fallen object“, „respects its capacity“ | Erfüllt |
| FR-004 | M | StoryLedger: irreversible Fakten, Belohnungen einmalig | TC-TIME-01 (100 Zyklen), „never duplicates rewards“ | Erfüllt |
| FR-005 | M | Zielmarker mit Symbol (◇/✕/⚠), Kosten-Leiste, Fehlergrund als Text, eigener Fehlerklang | „reports every failure branch“; UX-Prüfung | Erfüllt (UX-Test offen) |
| FR-006 | M | Rätsel 1 Steg (Zurückspulen eines Einsturzes), Rätsel 2 Gegengewicht (Zurückspulen bis zum Anschlag) | `playthrough.test.ts` | Erfüllt |
| FR-007 | M | Sentinel: Glocke zurückspulen erzeugt Resonanz und legt den Kern frei | `playthrough.test.ts` | Erfüllt |
| FR-008 | M | Angriff, Ausweichen, Anvisieren mit Zielhilfe, Schaden, Tod und Neustart am Checkpoint | „respawns at the last checkpoint“ | Erfüllt |
| FR-009 | M | Dialoggraphen mit Auswahl, bleibenden Flags, Kennzeichnung unumkehrbarer Entscheidungen | `content.test.ts` (keine Sackgassen), Neuladen im Durchlauf | Erfüllt |
| FR-010 | M | Tagebuch: Ziel, Hinweise/Beweise, Ort, Karte mit Legende | `content.test.ts` „every stage has an objective, a location…“ | Erfüllt |
| FR-011 | M | Atomares Speichern (tmp → prüfen → .bak → main), Prüfsumme, Versionsprüfung | TC-SAVE-03, `save.test.ts`, E2E „corrupt save is recovered“ | Erfüllt |
| FR-012 | M | Tastatur/Maus und Controller, Neubelegung mit Konfliktmeldung | `input-settings.test.ts`, E2E Controller | Erfüllt |
| FR-013 | M | Einstellungen für Audio, Untertitel, Kamera, Barrierefreiheit, getrennt von Spielständen | „persists and reloads“, E2E „settings persist“ | Erfüllt |
| FR-014 | M | Feste Menünavigation, die nicht umbelegt werden kann | E2E Tastatur-only und Controller-only | Erfüllt |
| FR-015 | S | Zeitanker friert ein Objekt ein | „anchor freezes one object“ | Erfüllt |
| FR-016 | S | Drei Hinweisstufen pro Questschritt, Modus aus, auf Anfrage oder stufenweise | `content.test.ts` | Erfüllt |
| FR-017–019 | F | Vollspiel, nicht Teil des Slice | – | Außerhalb des Umfangs |
| FR-020 | F | Texte bereits ausgelagert (EN/DE) und Pseudo-Lokalisierung | `content.test.ts`, E2E Pseudo-Lokalisierung | Vorbereitet |

## Nicht-funktionale Anforderungen (SRS §4)

| ID | Umsetzung | Nachweis | Status |
| --- | --- | --- | --- |
| NFR-01 | Feste 60-Hz-Simulation, Interpolation, Qualitätsstufen niedrig/mittel/hoch, 30-FPS-Begrenzung | Messung siehe unten | Offen: Referenzhardware |
| NFR-02 | Fehlgeschlagenes Speichern zerstört nie den letzten gültigen Stand | TC-SAVE-03, E2E Wiederherstellung | Erfüllt |
| NFR-03 | Tutorial-Karten, Hinweise, Zielmarker | Blindtest nach `PLAYTEST.md` | Offen: Blindtest |
| NFR-04 | Untertitel (Größe, Hintergrund, Sprecher), Textskalierung, Neubelegung, Kamerawackeln aus, hoher Kontrast, Symbole statt nur Farbe | E2E, `input-settings.test.ts` | Erfüllt |
| NFR-05 | Simulation ohne DOM/Three.js, Ereignisbus mit Protokoll | 39 Unit-Tests laufen ohne Browser | Erfüllt |
| NFR-06 | Offline, Schlüsselvalidierung im Renderer und Hauptprozess, kein Konto, keine Telemetrie | „validates storage keys“, Desktop-Smoke-Test (Pfad-Ausbruch abgewiesen) | Erfüllt |
| NFR-07 | Lichtempfindlichkeitswarnung und Schnell-Einrichtung vor dem ersten Spiel | E2E „first launch“ | Erfüllt |
| NFR-08 | Welt wird beim Laden aus dem StoryLedger rekonstruiert | Neuladen nach jedem Checkpoint im Durchlauf | Erfüllt |

## UI/UX-Tests (UX §9) und SRS-Testfälle

| Test | Nachweis | Status |
| --- | --- | --- |
| UX-01 / TC-INPUT-02 Controller-only | `tests/e2e/controller.spec.ts` (virtuelles Gamepad: Einrichtung, Menüs, neues Spiel, Pause) | Erfüllt |
| UX-02 / TC-UX-01 Rätselverständnis ≥ 80 % | `PLAYTEST.md` | Offen: Blindtest |
| UX-03 Untertitel bei 1080p und 200 % | Untertitelgröße bis 200 %, Vorschau in den Einstellungen | Umgesetzt, Sichtprüfung offen |
| UX-04 Sichtbarer Fokus | Rahmen, Marker ▸ und Leuchten für jedes Element; E2E prüft Fokus per Tastatur und Controller | Erfüllt |
| UX-05 Bewegungsoptionen | Kamerawackeln aus, Blitze reduziert; Bewegungsunschärfe gibt es nicht | Erfüllt |
| UX-06 Keine hängenden Eingaben nach Tod/Laden | `releaseAll` mit Unterdrückung gehaltener Tasten, Unit-Test | Erfüllt |
| UX-07 Pseudo-Lokalisierung +30 % | E2E prüft alle Einstellungs-Reiter | Erfüllt |
| TC-TIME-01 | `temporal.test.ts` | Erfüllt |
| TC-SAVE-03 | `save.test.ts` | Erfüllt |
| TC-NAR-09 | Vollspiel (FR-018), Dialoggraphen werden bereits auf Erreichbarkeit geprüft | Außerhalb des Umfangs |

## Leistungsmessung (NFR-01)

Gemessen im Container mit Software-Rendering (SwiftShader, keine GPU), Szene: Dorfplatz.

| Qualität | Draw Calls | Dreiecke | Schatten |
| --- | --- | --- | --- |
| Niedrig | 48 | ca. 84 000 | aus |
| Mittel / Hoch | 152 | ca. 171 000 | 1024 / 2048 px |

Diese Werte liegen weit unter dem, was eine GTX-1060-Klasse in 60 FPS schafft. Die Bildrate selbst lässt
sich ohne GPU nicht aussagekräftig messen; sie muss auf der Referenzhardware (Charter: bei M2 festzulegen)
nachgewiesen werden.

## Abnahmekriterien (Charter §11)

| Kriterium | Stand |
| --- | --- |
| Reproduzierbare saubere Installation | Build-Anleitung und Windows-ZIP vorhanden; Test auf frischem Windows offen |
| Kompletter Slice ohne Blocker spielbar | Automatischer Durchlauf 01.01 bis Abspann mit Neuladen an jedem Checkpoint |
| Zwei Rätsel und ein Kampf mit Zurückspulen | Steg, Gegengewicht, Sentinel |
| Speichern/Laden und Einstellungen bleiben erhalten | Unit- und E2E-Tests |
| Lesbare Controller-Hinweise | Hinweise zeigen die Tasten des zuletzt benutzten Geräts (E2E prüft `[A]`, `[Y]`, `[L-Stick]`) |
| Barrierefreiheits-Smoke-Test | Checkliste in `PLAYTEST.md` |
| Unterschriebenes Fehlerregister | `FEHLERREGISTER.md`, Unterschrift offen |
| Quellcode, Build-Anleitung, Lizenzinventar | `README.md`, `LIZENZEN.md` |
