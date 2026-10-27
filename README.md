# VESPER: The Shattered Firmament (Vertical Slice)

Spielbarer Vertical Slice nach den vier Vorgaben (Charter VSP-CHR-002, SRS VSP-SRS-002,
Story Bible VSP-NAR-002, UI/UX VSP-UX-002): Kapitel 1 „Clockfall Village“ (Missionen 01.01–01.04)
und der Beginn von „Forest of False Wishes“ (02.01) mit Abspann, etwa 60–90 Minuten.

| Mission | Inhalt |
| --- | --- |
| 01.01 Asche auf dem Zifferblatt | Erwachen, Bewegung, erstes Zurückspulen (Laterne), Mira |
| 01.02 Die Brücke, die sich erinnert | Rätsel 1: eingestürzten Steg zurückspulen |
| 01.03 Die leere Werkstatt | Hinweise sammeln, Zahlenrad-Rätsel, Gegengewicht-Tür (Rätsel 2) |
| 01.04 Der Wächter am Tor | Kampf gegen den Sentinel, Glocke zurückspulen öffnet seinen Kern |
| 02.01 Eine Straße aus Papiersternen | Wald der falschen Wünsche, Schleifenpfad, Ende des Slice |
| Nebenquest | Hespers immer gleicher Tag (Dialogverzweigung mit bleibender Entscheidung) |

## Versionen und Releases

Fertige Builds gibt es unter [Releases](https://github.com/gigafrosxh/vesper/releases),
die Änderungen jeder Version stehen in [CHANGELOG.md](CHANGELOG.md).

Versionierung nach [Semantic Versioning](https://semver.org/lang/de/) (`MAJOR.MINOR.PATCH`):

- **PATCH** (0.1.0 → 0.1.1): Fehlerbehebungen ohne neue Inhalte, Spielstände bleiben kompatibel.
- **MINOR** (0.1.x → 0.2.0): neue Inhalte oder Funktionen, z. B. weitere Missionen oder Kapitel.
- **MAJOR** (0.x → 1.0.0): erste vollständige Veröffentlichung; danach nur bei inkompatiblen
  Änderungen, etwa wenn alte Spielstände nicht mehr geladen werden können.
- Vorabversionen bekommen einen Zusatz, z. B. `0.2.0-beta.1`, und erscheinen als Pre-Release.

Ablauf für eine neue Version:

1. Änderungen unter `## [Unreleased]` in `CHANGELOG.md` eintragen, dann in `## [X.Y.Z] - Datum` umbenennen.
2. `npm version X.Y.Z --no-git-tag-version` setzt die Nummer in `package.json`.
3. Commit und Push auf `main`. Mehr ist nicht nötig.
4. Der Workflow `.github/workflows/release.yml` merkt, dass es zur Version in `package.json` noch
   kein Release gibt, führt die Tests aus, baut auf Windows Installer, portable `.exe` und ZIP,
   legt den Tag `vX.Y.Z` an und veröffentlicht das GitHub Release mit den Notizen aus dem Changelog.
   Ein von Hand gepushter Tag `vX.Y.Z` oder ein manueller Start unter „Actions“ geht ebenso.

**Unity-Port:** Der Port nach Unity 6 setzt dieselbe Versionsreihe fort (eigene Tags `vX.Y.Z`,
gleicher Changelog). Der erste Unity-Build bekommt eine neue MINOR-Version und wird im Changelog
als Unity-Version gekennzeichnet. Solange der Unity-Build nicht im Workflow steckt, werden seine
Builds von Hand an das jeweilige Release gehängt.

## Starten

Voraussetzungen: Node.js 20 oder neuer, ein Browser oder Rechner mit WebGL 2.

```bash
npm install
npm run dev          # Entwicklungsserver, http://localhost:5173
npm run build        # Typprüfung und Produktions-Build nach dist/
npm run preview      # Produktions-Build lokal ausliefern
npm run desktop      # Build und Start als Desktop-App (Electron)
```

URL-Parameter für Tests: `?play` startet sofort ein neues Spiel mit Spielständen nur im Speicher,
`?memory` nutzt den normalen Ablauf, schreibt aber nichts dauerhaft.

## Windows-Paket (Charter: Windows 10/11, 64 Bit)

```bash
npm run dist:win     # auf Windows: NSIS-Installer und portable .exe in release/
```

Der NSIS-Installer braucht Windows (oder Wine). Ohne Windows entsteht ein ZIP mit `VESPER.exe`:

```bash
npx vite build && npx electron-builder --win zip --x64 -c.win.target=zip
```

Spielstände liegen unter `%APPDATA%\VESPER\saves\`. Jeder Schreibvorgang geht in eine temporäre
Datei, wird mit fsync gesichert und dann atomar umbenannt; die vorige Version bleibt als `.bak`.
Das Spiel läuft komplett offline, ohne Konto und ohne Telemetrie (FR-001, NFR-06).

## Steuerung (Standard, alles neu belegbar)

| Aktion | Tastatur/Maus | Controller |
| --- | --- | --- |
| Bewegen / Kamera | WASD oder Pfeiltasten / Maus | linker / rechter Stick |
| Springen, Sprinten, Ausweichen | Leertaste, Shift, C | A, L3, B |
| Angriff, Anvisieren | linke Maustaste, rechte Maustaste oder T | X, LT |
| Interagieren | F | Y |
| Zurückspulen (halten, loslassen bestätigt) | Q | LB |
| Zeitanker | E | RB |
| Hinweis, Tagebuch, Karte, Pause | H, J oder Tab, M, Esc | D-Links, View, D-Hoch, Menu |

Menüs gehen immer mit Pfeiltasten/Enter/Esc bzw. Steuerkreuz/A/B, unabhängig von der Belegung (FR-014).

## Tests

```bash
npm test                 # 39 Unit- und Integrationstests (Vitest), inkl. kompletter Durchlauf 01.01–02.01
npm run test:e2e         # 6 Browser-Tests (Playwright) gegen den Produktions-Build
npm run test:all         # Typprüfung, Unit- und E2E-Tests
xvfb-run -a node tests/desktop/electron.smoke.cjs   # Desktop-Smoke-Test (nach npm run build)
```

Ohne GPU nutzt Playwright Software-WebGL (SwiftShader); dann laufen die Tests langsam, aber stabil.

## Aufbau

```
src/core         Ereignisbus, Lokalisierung (EN/DE, Pseudo-Lokalisierung), Mathe
src/input        Aktionen, Standardbelegung, Eingabe-Router (Tastatur, Maus, Gamepad)
src/time         TemporalService (Schnappschüsse, Vorschau, Bestätigen, Anker), StoryLedger
src/sim          Deterministische Simulation mit festen 60 Hz: Spieler, Mira, Gegner, Requisiten,
                 Dialoge, Quests, Sequenzen. Keine Abhängigkeit zu Darstellung oder DOM.
src/content      Level-Geometrie, Kapitel-Skript, Dialoge, Quests, Texte
src/persistence  Speichersystem (atomar, Prüfsumme, Sicherungskopie), Speicheradapter
src/settings     Einstellungen mit Validierung, Voreinstellungen für Barrierefreiheit
src/view         Three.js-Darstellung: prozedurale Welt, Figuren, Himmel, Kamera, Effekte
src/ui           Menüs, HUD, Tagebuch, Karte, Untertitel
src/audio        WebAudio-Synthese: Klänge, Musik, Ambiente, Positionsaudio
electron         Hauptprozess, Preload-Brücke, Dateispeicher
docs             Nachweise, Lizenzen, Fehlerregister, Playtest-Vorlage
```

Weitere Dokumente: [Anforderungs-Nachweis](docs/NACHWEIS.md), [Lizenzinventar](docs/LIZENZEN.md),
[Fehlerregister](docs/FEHLERREGISTER.md), [Playtest- und Barrierefreiheits-Vorlage](docs/PLAYTEST.md),
[Machbarkeit und Aufwand](docs/MACHBARKEIT.md).
