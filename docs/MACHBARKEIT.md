# Machbarkeit und Aufwand für das Vollspiel (OBJ-06)

Dies ist eine Schätzung, kein genehmigtes Budget. Kosten werden nach Charter §8 als
Personenstunden × tatsächlicher Stundensatz + Lizenzen + Assets + Hardware + Gemeinkosten berechnet;
hier stehen bewusst keine Geldbeträge.

## Was der Slice belegt

- Die Kernsysteme tragen: deterministische Simulation, Zurückspulen mit Vorschau und Anker, StoryLedger
  gegen Rücklauf-Exploits, atomares Speichern, Eingabe für Tastatur und Controller, Barrierefreiheit,
  Lokalisierung. Sie sind getestet und lassen sich ohne Umbau für weitere Kapitel nutzen.
- Inhalte (Level, Quests, Dialoge, Sequenzen) sind Daten und Skripte. Neue Kapitel brauchen keine
  Änderungen an den Kernsystemen.
- Die prozedurale Grafik und Musik halten den Slice frei von Fremdlizenzen, reichen aber für ein
  54-Stunden-Spiel nicht an die Erwartungen an Figuren, Animation und Vertonung heran.

## Was im Vollspiel neu dazukommt

| Bereich | Umfang laut Vorgaben | Bemerkung |
| --- | --- | --- |
| Kapitel | 12 Kapitel, ca. 54 Stunden (FR-017) | Slice entspricht etwa 1,5 Stunden |
| Zeitfähigkeiten | 6 statt 2 (FR-019) | Jede Fähigkeit braucht eine Wechselwirkungs-Matrix mit Bewegung und Kampf |
| Enden | 3 Enden mit Flag-Kombinationen (FR-018) | Kombinatorische Tests, Dialogprüfung existiert schon |
| Lokalisierung | ausgelagerte Texte (FR-020) | Struktur steht, Übersetzung und Textlängen fehlen |
| Kunst und Ton | Figuren, Animation, Vertonung | Größter Kostentreiber, im Slice nur prozedural |

## Grobschätzung

Annahme: Der Slice-Plan des Charters (960 Personenstunden für ca. 1,5 Stunden Spielzeit) ist die Basis.
Eine lineare Hochrechnung ist laut Charter ausdrücklich unzulässig, weil Kernsysteme nur einmal entstehen
und Inhalte mit Werkzeugen günstiger werden. Daher getrennt:

| Block | Spanne (Personenstunden) | Treiber |
| --- | --- | --- |
| Kernsysteme erweitern (4 Fähigkeiten, Enden, Werkzeuge) | 2 000 – 3 500 | Fähigkeits-Matrix, Editor-Werkzeuge |
| Inhalte je Spielstunde (Level, Quests, Kämpfe, Dialoge) | 250 – 450 je Stunde, also 13 000 – 24 000 | Wiederverwendung, Werkzeuge |
| Kunst, Animation, Vertonung | 15 000 – 35 000 | Stil, Umfang der Vertonung |
| QA, Usability, Barrierefreiheit | 15 – 20 % der Summe | Regressionen durch Zeitmechanik |
| Projektleitung und Reserve | 15 % (wie Charter) | |

Ergebnis: grob 40 000 bis 80 000 Personenstunden, also ein mehrjähriges Projekt mit einem Team von
15 bis 30 Personen. Die Spanne ist breit, weil Kunststil und Vertonung noch nicht entschieden sind.

## Empfehlung

1. Abnahme des Slice mit den offenen Punkten aus dem Fehlerregister (Referenzhardware, Windows-Installation,
   zwei Blindtests).
2. Entscheidung über Kunststil und Vertonung, weil sie die Schätzung am stärksten verändern.
3. Ein zweites Kapitel als Produktionsprobe, um den Aufwand je Spielstunde zu messen, bevor das Budget
   für das Vollspiel festgelegt wird.
