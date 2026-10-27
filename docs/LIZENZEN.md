# Lizenzinventar

Alle Inhalte des Spiels sind original und werden zur Laufzeit erzeugt: Geometrie, Figuren, Texturen
(Zifferblätter, Verläufe), Musik und Klänge. Es gibt keine fremden Modelle, Bilder, Schriften, Klänge
oder Stimmen. Die Schrift kommt vom Betriebssystem (Palatino Linotype, Georgia oder eine Serif-Ersatzschrift).
Story, Namen und Dialogzeilen stammen aus den vom Auftraggeber gelieferten Vorgaben (VSP-NAR-002).

## Mit dem Spiel ausgeliefert

| Paket | Version | Lizenz | Verwendung |
| --- | --- | --- | --- |
| three | 0.186.1 | MIT | 3D-Darstellung (im Bundle) |
| electron | 45.0.0 | MIT; enthält Chromium (BSD-3-Clause u. a.) und Node.js (MIT) | Desktop-Laufzeit; Lizenztexte liegen dem Paket als `LICENSE.electron.txt` und `LICENSES.chromium.html` bei |

## Nur für Entwicklung und Build

| Paket | Version | Lizenz |
| --- | --- | --- |
| vite | 8.3.5 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 5.0.5 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| electron-builder | 26.18.0 | MIT |
| @types/three | 0.186.0 | MIT |

Prüfen mit `npx license-checker --summary` vor jeder Veröffentlichung (Charter-Risiko R4).
