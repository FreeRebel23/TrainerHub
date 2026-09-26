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

## Der Workflow in TrainerHub

| Schritt | Wo | Was passiert |
| --- | --- | --- |
| **Planen** | Trainingsbuch → „Planen“, Kalendertag → „Training planen“, Start | Schnell: Datum wählen, speichern. Team, Art, Dauer, Halle und Uhrzeit sind vorbelegt (letzte Einheit des Teams, bevorzugt gleicher Wochentag). |
| **Vorbereiten** | Planung → „Vorbereiten“/„Bearbeiten“ | Uhrzeit, Schwerpunkt, Themen, Übungen (Dauer, Beschreibung, Reihenfolge), Notiz. Die Summe der Übungsdauern wird neben der Trainingsdauer gezeigt, aber nicht erzwungen. |
| **Durchführen** | Start → „Training starten“ bzw. Planung → „Training starten“ (ab dem Trainingstag) | Direkt zur Anwesenheit; Schwerpunkt, Themen, Vorbereitungsnotiz und Übungen sind da. Übungen abhaken, spontan ergänzen, Schwerpunkt/Themen anpassen, Beobachtungen notieren. Ein Entwurf wird ab der ersten Eingabe laufend gesichert und nach einem Beenden der PWA wiederhergestellt. |
| **Abschließen** | „Training abschließen“ | Das erfasste Training speichert, was tatsächlich passiert ist (inkl. `planId`); die Planung behält, was geplant war, und gilt als durchgeführt. |
| **Wiederverwenden** | Planung oder Training → „Duplizieren“ | Neue Planung mit Inhalt und Übungen, Datum neu wählen. |
| **Saison verstehen** | Auswertung → „Inhalte“ | Themen (Einheiten, Minuten), häufigste Schwerpunkte, Einheiten je Monat, Übungsquote; Standard ist die laufende Saison. |

Status im Trainingsbuch und auf Start: Ring = offen, halb gefüllt = vorbereitet,
gefüllt = durchgeführt (abgeleitet aus den Daten, nie gespeichert).

## Import, Export, Backup, Sync

- **Import (CSV/XLSX):** Spalten werden über die Kopfzeile erkannt (beliebige Reihenfolge):
  Datum, Uhrzeit, Trainingstyp, Dauer_min, Halle, Schwerpunkt, Themen (`;`-getrennt), Notiz.
  Dateien ohne erkannte Kopfzeile nutzen weiter die alte Reihenfolge. Neu: Die Spalte „Notiz“
  wird übernommen (wurde vorher verworfen), eine leere Halle ordnet nicht mehr die erste Halle zu.
- **Export:** „Trainingsbuch“ (Einstellungen → Excel-Export bzw. Auswertung → Inhalte → Excel):
  alle geplanten und erfassten Einheiten mit Uhrzeit, Status, Schwerpunkt, Themen, Übungen,
  Übungsquote, Anwesenheit, Notiz. Anwesenheitsliste und Beteiligungs-Export sind unverändert.
- **Druck:** Planung als Trainingsblatt (für die Halle/Co-Training); der Druck eines Trainings
  enthält jetzt Schwerpunkt, Themen und Übungsdauer.
- **Backup/Restore:** unverändert das gesamte Datenobjekt – neue Felder sind automatisch enthalten
  (getestet: Phase-2-Backup und Phase-1-Backup).
- **Datei-Sync:** unverändert generisch, neue Felder erledigter Trainings werden übertragen
  (getestet). Planungen werden – wie bisher – nicht synchronisiert.

## Kompatibilität (geprüft)

- Phase-1-Datenstand im Browser in allen 16 Ansichten geöffnet, inkl. Planen/Durchführen/Bearbeiten:
  gespeicherter Stand danach byteidentisch (kein stilles Umschreiben).
- Leerer Datenstand (Neuinstallation): Leerzustände, Schnellplanung funktioniert.
- Alte Planung ohne neue Felder: Status „offen“, vorbereitbar, startbar.
- Alte Trainings ohne neue Felder: anzeigen, bearbeiten, duplizieren.
- Alte Trainingsarten/Hallen (mit `emoji`), alte Importdateien, Phase-1-Backups: Tests.

## Bewusst nicht gebaut

- **Serienplanung** (wiederkehrende Termine): kein Bestand im Datenmodell; Duplizieren deckt die
  Wiederverwendung ab. Sinnvoll als späterer Baustein („jeden Di/Do 18:30 bis Saisonende“).
- **Eigene Vorlagenverwaltung:** gute Einheiten sind die Vorlagen (Duplizieren).
- **Minuten je Thema auf Übungsebene:** Themen hängen an der Einheit, nicht an der Übung – genauere
  Minuten wären vorgetäuscht.
- **Sync von Planungen** zwischen Geräten: Phase 3 (Server).

## Umsetzungspakete (erledigt)


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

## Unabhängiges Review vor dem Merge (Hardening)

Zweites Review der Phase-2-Änderungen gegenüber Phase 1 mit Fokus auf Datenintegrität. Gefunden
und behoben (jeweils im Browser gegen den unveränderten Stand reproduziert):

- **Doppeltipp auf „Training abschließen“** speicherte das Training zweimal, verknüpfte die Planung
  mit dem zweiten und verließ über zwei Verlaufssprünge die App. Jetzt: feste Trainings-ID je Ablauf,
  Sperre gegen Mehrfachspeichern, `recordSession()` ist idempotent und überschreibt keine bestehende
  Verknüpfung. Eine bereits durchgeführte Planung lässt sich (z. B. über einen alten Verlaufseintrag)
  nicht erneut erfassen.
- **Entwurf:** Der in Schritt 1 gewählte Rahmen (z. B. Datum eines nachgetragenen Trainings) ging bei
  einem App-Abbruch in Schritt 2 verloren – das Training wurde dann still mit dem heutigen Datum
  gespeichert. „Verwerfen“ legte sofort einen neuen, leeren Entwurf an und setzte die Anwesenheit ggf.
  für das falsche Team zurück.
- **Übungs-IDs** konnten beim Duplizieren vieler Übungen in derselben Millisekunde kollidieren
  (≈ 0,35 % bei 15 Übungen); Abhaken/Entfernen traf dann beide. `uid()` hat jetzt 8 Zufallszeichen.
- **Saisonübersicht:** „Wurf“ und „wurf“ wurden als zwei Themen gezählt; eigene Themen übernehmen die
  bekannte Schreibweise.
- **Suche** stürzte bei nicht-textuellen Feldern in unvollständigen Altdaten ab.
- **Planen ohne Team** endete in einem stummen Speichern-Button; jetzt Hinweis mit Weg zu den Teams.

Die Fachlogik für Abschließen/Löschen (`recordSession`, `removeSession`) liegt jetzt in
`src/lib/training.js` und ist mit Tests abgesichert.
