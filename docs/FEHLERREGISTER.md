# Fehlerregister

Schweregrade: **S1** blockiert Abnahme/Absturz/Datenverlust, **S2** Funktion gestört mit Umweg,
**S3** kleiner Fehler, **S4** kosmetisch. Release-Kandidat erlaubt keine offenen S1 (NFR-02).

## Behoben während der Entwicklung

| Nr. | Bereich | Beschreibung | Grad | Ursache und Behebung | Nachweis |
| --- | --- | --- | --- | --- | --- |
| D-01 | Eingabe | Eine gehaltene Bestätigen-Taste löste im neu geöffneten Menü sofort erneut aus (Controller rutschte von der Einrichtung bis ins Spiel durch) | S2 | `releaseAll` hat gehaltene Tasten gelöscht, der nächste Abruf meldete sie als neuen Druck. Gehaltene Tasten werden jetzt bis zum Loslassen ignoriert; Bestätigen/Zurück wiederholen sich nicht mehr automatisch | Unit-Test UX-06, E2E Controller |
| D-02 | Eingabe | Sehr kurze Tastendrücke gingen bei langsamen Bildern verloren | S2 | Tastendrücke werden bis zum nächsten Abruf gemerkt | E2E Tastatur |
| D-03 | Speichern | Hinweis „Spielstand aus Sicherung wiederhergestellt“ erschien nicht | S3 | Ereignis wurde vor dem Anhängen des HUD gesendet | E2E Wiederherstellung |
| D-04 | Rätsel | Gegengewicht-Tür schloss sich, bevor die Spielfigur sie erreichte | S1 | Lösung neu gestaltet: Gewicht vom Türrahmen aus bis zum Anschlag zurückspulen | Durchlauf-Test |
| D-05 | Zeit | Zielwahl bevorzugte Objekte ohne Verlauf vor geeigneten | S2 | Bewertung bestraft ungeeignete Ziele | Durchlauf-Test |
| D-06 | Kampf | Besiegte Gegner wurden nicht in allen Fällen im StoryLedger vermerkt | S2 | Eintrag zentral beim Ereignis `enemy.defeated` | Durchlauf mit Neuladen |
| D-07 | Dialog | Prüfung meldete fälschlich Sackgassen bei Schleifen | S3 | Erreichbarkeit als Fixpunkt berechnet | `content.test.ts` |
| D-08 | UI | Schnell-Einrichtung oben abgeschnitten | S3 | `justify-content: safe center` | Screenshot |
| D-09 | UI | Erzähler-Untertitel zeigte leeren Sprecher mit „:“ | S4 | Sprecher wird ohne Namen ausgeblendet | Screenshot |
| D-10 | Start | Ohne WebGL blieb das Fenster schwarz | S2 | Verständliche Fehlermeldung (DE/EN) | Electron-Test ohne GPU |

## Offen

| Nr. | Bereich | Beschreibung | Grad | Nächster Schritt |
| --- | --- | --- | --- | --- |
| O-01 | Leistung | 60 FPS auf Referenzhardware nicht gemessen (nur Software-Rendering verfügbar) | S2 bis Nachweis | Messung auf Referenz-PC (NFR-01) |
| O-02 | Installation | NSIS-Installer nur unter Windows baubar; Neuinstallation nicht getestet | S2 bis Nachweis | `npm run dist:win` auf Windows, Test auf frischem System |
| O-03 | Usability | Zwei externe Blindtests stehen aus (OBJ-05, NFR-03) | S2 bis Nachweis | Ablauf nach `PLAYTEST.md` |
| O-04 | Audio | Keine Sprachaufnahmen; Figuren sprechen über Untertitel mit Klangsignal | S4 | Entscheidung Auftraggeber |

## Freigabe

Geprüft von: __________ Datum: __________ Unterschrift: __________

Keine Unterschrift wird vorausgesetzt (Charter §11).
