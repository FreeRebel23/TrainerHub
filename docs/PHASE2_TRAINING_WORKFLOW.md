# TrainerHub – Phase 2: Trainingsplanung und -dokumentation

Ziel: Die Excel-Liste für Trainingsplanung und -dokumentation wird überflüssig.
Zyklus: **planen → vorbereiten → durchführen → abschließen → wiederverwenden → Saison verstehen.**

## Ausgangslage (vor Phase 2)

| Objekt | Felder | Lücke |
| --- | --- | --- |
| Geplantes Training (`plannedSessions[]`) | `id, teamId, trainingTypeId, durationMinutes, date, venueId, recordedId` | keine Uhrzeit, kein Inhalt, keine Übungen, nicht bearbeitbar |
| Erfasstes Training (`sessions[]`) | `…, attendance[], note, checklist[{id,text,done}], erfasstVon` | Schwerpunkt nur in der freien Notiz, keine Themen, keine Übungsdauer |
| Verbindung | `plan.recordedId → session.id` | beim Erfassen wird vom Plan nur der Rahmen übernommen |
| Import | CSV/XLSX: Datum, Trainingstyp, Dauer_min, Halle, Notiz | Spalte „Notiz“ wurde verworfen |

## Produktentscheidungen

1. **Zwei Objekte bleiben zwei Objekte.** Planung (`plannedSessions`) und Durchführung
   (`sessions`) werden nicht zusammengelegt. Die Planung zeigt, *was geplant war*, das erfasste
   Training, *was tatsächlich passiert ist*. So bleibt der Unterschied „geplant vs. tatsächlich“
   erhalten, ohne das bestehende Schema umzubauen.
2. **Gleiche Inhaltsfelder an beiden Objekten:** `time`, `focus`, `tags`, `checklist`, `note`
   (Plan) bzw. `note` als Beobachtung (Training). Beim Durchführen wird der vorbereitete Inhalt in
   das Training kopiert (Übungen unerledigt), der Plan bleibt unverändert und verweist über
   `recordedId` auf das Training. Das Training merkt sich `planId`.
3. **Schwerpunkt = Freitext, Themen = Tags.** Freitext beschreibt das Konkrete („Ballbewegung gegen
   aggressive Verteidigung“), Themen strukturieren für die Saisonauswertung. Themen sind einfache
   Strings: Vorschläge plus alles, was schon verwendet wurde. Es gibt keine Themenverwaltung.
4. **Übungen** behalten das Format der bisherigen Checkliste und werden erweitert:
   `{ id, text, done, minutes?, note? }`. Die Reihenfolge ist die Reihenfolge im Array. Umsortiert
   wird mit Hoch/Runter-Buttons in der aufgeklappten Übung, ohne Drag-&-Drop-Bibliothek; das ist
   per Touch zuverlässig.
5. **Status wird abgeleitet, nicht gespeichert:** *geplant* (Termin), *vorbereitet* (Schwerpunkt
   oder Übungen vorhanden), *durchgeführt* (`recordedId`). Es gibt keine Status-Maschine.
6. **Wiederverwenden = Duplizieren.** Jede Planung und jedes erfasste Training kann als neue
   Planung dupliziert werden. Übernommen werden Art, Dauer, Team, Halle, Uhrzeit, Schwerpunkt,
   Themen, Übungen samt Reihenfolge und Dauer sowie die Vorbereitungsnotiz. Nicht übernommen werden
   Datum (wird neu gewählt), Anwesenheit, Erledigt-Status und Beobachtungsnotizen. Eine separate
   Vorlagenverwaltung ist nicht nötig.
7. **Ein Planungsweg:** ein Planungsformular (`plan_edit`), erreichbar aus dem Trainingsbuch, dem
   Kalendertag und über „Duplizieren“. Das bisherige Inline-Formular im Kalendertag entfällt.
8. **Saisonübersicht** (Auswertung → Inhalte) zählt nur, was die Daten hergeben: Einheiten und
   Minuten je Thema (Minuten = Dauer der Einheiten mit diesem Thema, Mehrfachzählung wird
   ausgewiesen), Einheiten je Monat, häufigste Schwerpunkte, Anteil der Einheiten ohne Thema.

## Datenmodell (Phase 2)

```
plannedSessions[] {
  id, teamId, trainingTypeId, durationMinutes, date, venueId, recordedId   // unverändert
  time?:      "HH:MM" | ""       // lokale Uhrzeit, optional
  focus?:     string             // Schwerpunkt, Freitext
  tags?:      string[]           // Themen
  checklist?: Drill[]            // vorbereitete Übungen (Reihenfolge = Array)
  note?:      string             // Vorbereitungsnotiz
}
sessions[] {
  …unverändert…
  time?, focus?, tags?          // aus der Planung übernommen bzw. beim Erfassen gesetzt
  planId?:    string            // Rückverweis auf die Planung
  checklist:  Drill[]           // tatsächlich durchgeführte Übungen (done = erledigt)
}
Drill { id, text, done, minutes?: number, note?: string }
```

**Kompatibilität:** Alle neuen Felder sind optional und werden beim Lesen mit Defaults behandelt
(`src/lib/training.js`). Gespeicherte Daten werden **nicht** umgeschrieben. Alte Backups, Sync-Dateien
und Importe bleiben gültig. Der Storage-Key bleibt `trainerhub_v1`.

## Umsetzungspakete

1. Fachlogik `src/lib/training.js` (Normalisierung, Status, Duplizieren, Plan → Training, Suche,
   Saisonaggregation, Defaults) mit Tests
2. Planungsformular + Planungsdetail, Übungseditor mit Dauer/Beschreibung/Reihenfolge, Themenauswahl
3. Durchführen aus der Planung (direkt zur Anwesenheit, Übungen abhaken/ergänzen), Trainingsdetail
   mit Schwerpunkt/Themen, Duplizieren
4. Trainingsbuch/Start/Kalender: Uhrzeit, Status, Suche über neue Felder, Themenfilter
5. Saisonübersicht in der Auswertung
6. Import (Kopfzeilen-Erkennung, Notiz/Uhrzeit/Schwerpunkt/Themen optional), Trainingsbuch-Export,
   Druck der Planung
7. Abnahme: Browser, Breakpoints, PWA/Offline, Kompatibilität
