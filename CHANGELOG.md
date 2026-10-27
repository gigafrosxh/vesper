# Changelog

Alle nennenswerten Änderungen an VESPER stehen in dieser Datei.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionsnummern folgen [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.1.0] - 2026-10-26

Erster spielbarer Vertical Slice (Meilensteine M1–M8), etwa 60–90 Minuten Spielzeit.

### Hinzugefügt
- Kapitel 1 „Clockfall Village“ mit den Missionen 01.01–01.04 und der Beginn von
  „Forest of False Wishes“ (02.01) mit Abspann.
- Nebenquest „Hespers immer gleicher Tag“ mit Dialogverzweigung und bleibender Entscheidung.
- Zeitmechanik: Zurückspulen mit Vorschau und Bestätigung, Zeitanker, StoryLedger.
- Kampf gegen den Sentinel, Rätsel (Steg, Zahlenrad, Gegengewicht-Tür, Glocke).
- Deterministische Simulation mit festen 60 Hz, Three.js-Darstellung mit prozeduraler Welt,
  WebAudio-Synthese für Klänge, Musik und Ambiente (keine Fremd-Assets).
- Menüs, HUD, Tagebuch, Karte, Untertitel; Lokalisierung Deutsch/Englisch.
- Frei belegbare Steuerung für Tastatur/Maus und Controller, Voreinstellungen für Barrierefreiheit.
- Atomares Speichersystem mit Prüfsumme und Sicherungskopie (`%APPDATA%\VESPER\saves\`).
- Desktop-Builds (Electron): Windows x64 als Installer, portable `.exe` und ZIP;
  macOS (Universal, Apple Silicon und Intel) als DMG und ZIP.
- 39 Unit- und Integrationstests (Vitest), 6 Browser-Tests (Playwright), Desktop-Smoke-Test.
- Dokumentation: Anforderungs-Nachweis, Lizenzinventar, Fehlerregister, Playtest-Vorlage, Machbarkeit.

### Bekannte Einschränkungen
- 60 FPS auf Referenz-Hardware, saubere Windows-Installation und zwei Blind-Playtests sind
  noch nicht von Menschen bestätigt (siehe `docs/FEHLERREGISTER.md` und `docs/PLAYTEST.md`).
- Die Installer baut der Release-Workflow auf Windows- und macOS-Runnern; sie sind noch nicht
  auf echten Rechnern getestet und nicht mit einem Entwicklerzertifikat signiert
  (Warnungen von SmartScreen bzw. Gatekeeper, siehe Release-Notizen).

[Unreleased]: https://github.com/gigafrosxh/vesper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gigafrosxh/vesper/releases/tag/v0.1.0
