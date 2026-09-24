# TrainerHub – North Star

> **TrainerHub ist das Betriebssystem für Basketballtrainer: Es verbindet Mannschaft,
> Training, Spielbetrieb und Spielerentwicklung in einem gemeinsamen Arbeitsraum,
> automatisiert organisatorische Routinearbeit und hilft Trainern dabei, aus
> Beobachtungen bessere Trainingsentscheidungen zu machen.**

**TrainerHub organisiert die Arbeit. Der Trainer trainiert die Mannschaft.**

## Entwicklungsreihenfolge

1. Erst funktionierende Werkzeuge schaffen.
2. Dann gemeinsame Daten.
3. Dann Workflows verbinden.
4. Dann automatisieren.
5. Dann Intelligenz hinzufügen.

Nicht alles auf einmal bauen. Die Plattform entsteht aus funktionierenden Einzelbausteinen.

## Produktprinzipien

- **Trainerzeit ist die knappste Ressource.** Eine Funktion muss Arbeit reduzieren oder
  Trainerarbeit verbessern. Zusätzliche Administration braucht einen sehr guten Grund.
- **Mobile Nutzung ist ein Kernfall.** Was im Traineralltag wichtig ist, funktioniert
  auch in der Halle, auf der Bank und unterwegs auf dem Smartphone.
- **Kontext vor Dateneingabe.** TrainerHub weiß, welche Mannschaft, Saison oder Einheit
  gemeint ist. Der Trainer wählt so wenig wie möglich erneut aus.
- **Einmal erfassen, mehrfach verwenden.** Informationen werden nicht doppelt gepflegt.
- **Automatisieren, was keinen Trainer benötigt.** Daten abrufen, Grafiken erzeugen,
  Erinnerungen erstellen, Informationen vorbereiten.
- **Der Mensch entscheidet dort, wo Urteil erforderlich ist.** Aufstellungen,
  Bewertungen, Veröffentlichungen, Entwicklungsentscheidungen.
- **Features entstehen aus realen Problemen.** Ausgangspunkt ist der Traineralltag,
  nicht das technisch Interessante.
- **Einfachheit schlägt Funktionsmenge.** Zehn hervorragende Kernfunktionen schlagen
  fünfzig mittelmäßige.
- **Spezialisierte Tools dürfen eigenständig bleiben.** GameDay, Scoreboard, Taktikboard
  und ArcShot werden angebunden, nicht hineingebaut.
- **Kein Big-Bang-Rewrite.** Das bestehende Produkt wird Schritt für Schritt modernisiert.

## Werkzeug vor Dashboard

Der Trainer öffnet TrainerHub, weil er etwas erledigen will: die nächste Einheit ansehen,
Anwesenheit erfassen, ein vergangenes Training finden, die Mannschaft ansehen. Die
Startseite zeigt nur, was jetzt relevant ist. Keine Kennzahlenwände, keine Gamification,
keine Widgets ohne Funktion.

## Der Kern: das Trainingsbuch

Das Trainingsbuch ersetzt die Excel-Liste. Eine Einheit ist schnell erfasst und später
schnell wiedergefunden: Datum, Mannschaft, Dauer, Schwerpunkt, Übungen, Anwesenheit,
Notizen. Daraus entsteht die Trainingshistorie der Mannschaft.

## Phasen

| Phase | Inhalt |
| --- | --- |
| 1 | UX Refresh der bestehenden PWA |
| 2 | Trainingsbuch vollständig machen – Excel wird nicht mehr benötigt |
| 3 | Server und Benutzer (zentrale Datenbasis, Login, Rollen, Hetzner) |
| 4 | Gemeinsame Teamarbeit mehrerer Trainer |
| 5 | GameDay-/Scoreboard-Integration mit Freigabe |
| 6 | Kommunikation und Verteilung nach Freigabe |
| 7 | Spieler- und Mannschaftsentwicklung |
| 8 | Intelligente Assistenz auf Basis echter Daten |

## Was TrainerHub nicht wird

Keine Vereinsverwaltung, keine Mitglieder- oder Beitragsverwaltung, keine ERP-Lösung
für Sportvereine. Automatisierung heißt nie blinde Veröffentlichung:
**automatisch vorbereiten – menschlich freigeben – automatisch verteilen.**

## Maßstab

> TrainerHub soll der Ort sein, an dem aus Beobachtung Training und aus Training
> Entwicklung wird – während Organisation im Hintergrund zunehmend automatisch passiert.

Leitfrage für jede Änderung: *Macht sie das heutige TrainerHub für einen Basketballtrainer
unmittelbar einfacher, klarer oder angenehmer?* Wenn nicht, wird sie dokumentiert und
später gebaut.
