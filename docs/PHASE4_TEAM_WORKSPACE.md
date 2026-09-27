# Phase 4 – Team Workspace & Saisonbetrieb

> TrainerHub organisiert die Arbeit. Der Trainer trainiert die Mannschaft.
> So viel Kontext wie nötig, so wenig Bedienung wie möglich.

Stand: 27.09.2026, Branch `trainerhub-phase4-team-workspace` (abgezweigt von `trainerhub-phase3` @ f2953fd,
inklusive der abgenommenen Sports-Data-Integration). `main` und GitHub Pages bleiben unverändert.

Ziel dieser Phase ist ein zusammenhängender Arbeitsraum aus
**Organisation → Abteilung → Team → Saison → tägliche Trainerarbeit**. Die Struktur im Hintergrund
soll die Bedienung vorne einfacher machen.

---

## 1. Fachliches Saisonmodell

Es gibt kein zweites Saisonmodell. Die bestehende Collection `seasons` (team, name, startDate,
endDate, phase, gamedays) wird erweitert:

| Neu | Zweck |
|---|---|
| `seasons.goals` (JSON) | wenige freie Saisonziele `[{ id, text, tags }]` |
| `roster_entries` (neu) | Saisonkader: Person ↔ Team ↔ Saison |
| `observations` (neu) | Trainerbeobachtungen |

```
Team U16w ──┬── Saison 2025/26 ── Kader (roster_entries) ─┐
            └── Saison 2026/27 ── Kader (roster_entries) ─┼── Person (players) ── Beobachtungen
                    │                                      │
                    └─ Trainings/Planungen/Beobachtungen/Spiele über Team + Datum
```

Trainings, Planungen und Beobachtungen bekommen **keine** eigene Saison-Referenz. Sie gehören wie
seit Phase 2 über **Team + Datum** zu einer Saison (`getSeasonSessions`, `seasonAt`). Begründung:

- Bestehende Phase-2/3-Daten müssen nicht umgeschrieben werden.
- Es gibt keine doppelte Wahrheit (Saison-ID *und* Datum könnten sich widersprechen).
- Die Saisonzuordnung ändert sich richtig mit, wenn ein Training verschoben wird.

Eine explizite Team-Saison-Tabelle (`teamSeason`) ist nicht nötig: `seasons` hängt bereits genau an
einem Team und **ist** die Team-Saison. Sports Data verknüpft seine Wettbewerbsteilnahme optional mit
genau diesem Datensatz (`team_competitions.season`).

## 2. Aktive Saison

Eine einzige Regel (`getActiveSeason` in `src/lib/data.js`, verwendet von Workspace, Auswertung und
Teams, identisch in der Migration):

1. nicht abgeschlossen **und** heute im Zeitraum → aktiv
2. sonst die jüngste nicht abgeschlossene Saison (z. B. Vorbereitung vor Saisonbeginn)
3. sonst keine (das Team funktioniert trotzdem, siehe §11)

Die aktive Saison ist abgeleitet und wird nicht gespeichert. So gibt es keinen Zustand, den zwei
Trainer:innen gegeneinander umschalten könnten. Eine Saison wird historisch, wenn sie
abgeschlossen ist oder ihr Ende hinter heute liegt.

## 3. Team Workspace

Der Tab **Start** ist der Team Workspace des aktuellen Teams (`src/views/Workspace.jsx`). Es gibt
keine Kachelwand, sondern Listen in zeitlicher Reihenfolge:

| Bereich | Inhalt |
|---|---|
| Kopf | Teamname = Teamwechsel (Sheet), darunter Saison + Phase |
| Primäraktion (genau eine) | heute geplant → **Training starten** · heute erfasst → **Beobachtung** · sonst **Training planen** |
| „Heute auch: U14w 17:00“ | andere eigene Teams mit Training heute – ein Tipp wechselt |
| Noch nicht erfasst | vergangene, offene Planungen |
| Als Nächstes | nächstes Training, nächstes Spiel (manuell oder Sports Data) |
| Zuletzt | letztes Training, letztes Spiel, letzte Beobachtungen, „+ Beobachtung“ |
| Mannschaft | Kader (Anzahl, pausiert) |
| Saison | Saisonziele, Trainingsinhalte (Phase-2-Auswertung, vorausgewählt), Trainingsbuch, alle Saisons |

Der Weg **Team öffnen → Training sehen → Training starten** ist ein einziger Tipp vom Start aus. Der
Phase-2-Ablauf (Durchführen, Entwurf, Abschluss) ist unverändert erreichbar.

**Teamwechsel:** Tipp auf den Teamnamen öffnet ein Sheet. Oben stehen die eigenen Teams
(coach-Profil), darunter weitere sichtbare Teams (z. B. für Vereins-Admins), darunter die Saisons des
Teams. Die zuletzt verwendete Mannschaft merkt sich das Gerät (`trainerhub_ui`, nicht synchronisiert,
also keine Sync-Änderung). Reihenfolge der Vorauswahl: ausdrücklich gewählt → zuletzt verwendet →
eigenes Team → erstes Team. Die Rechte entscheidet weiterhin der Server.

## 4. Saisonkader – Player vs. Roster Membership

**Warum ist eine Person nicht dasselbe wie ihre Team-/Saisonzugehörigkeit?**

- `players` = **Person** in der Abteilung: Name, Jahrgang, verletzt.
- `roster_entries` = **diese Person gehört in Saison X zu Team Y**: Trikotnummer, Position/Rolle,
  Status `active | paused | left`.

Wechselt Ina 2027/28 von der U16w in die U18w, bekommt sie einen neuen Kadereintrag. Der Eintrag
für U16w 2026/27 bleibt unverändert. Ihre Beobachtungen und Anwesenheiten hängen an der Person
(und am Training) und nicht am Kader. Deshalb bleibt die Historie richtig, egal wie sich spätere
Kader zusammensetzen. Eine einfachere Lösung (Nummer/Position an der Person, Kader weiter als
`teams.players`) hätte genau das nicht leisten können: Jede Kaderänderung hätte die Vergangenheit
umgeschrieben.

- **Aus dem Kader nehmen** setzt den Status auf „nicht mehr im Kader“ (`left`). Es wird nichts
  gelöscht, und die Person bleibt für die Trainer:innen des Teams sichtbar.
- **Pausiert**: bleibt im Kader, erscheint aber nicht in der Anwesenheitsliste neuer Trainings.
- **Anwesenheit** eines neuen Trainings kommt aus dem Kader der Saison dieses Tages (nur `active`).
  Gespeicherte Anwesenheiten enthalten die Personen-IDs selbst und ändern sich nie durch spätere
  Kaderänderungen.
- IDs von Kadereinträgen sind deterministisch (`saison + person`). Legen zwei Geräte offline
  denselben Eintrag an, wird daraus kein Duplikat.
- **Bisherige Teamliste** (`teams.players`): Sie bleibt als Rückfall für Teams ohne Saisonkader
  bestehen (z. B. ohne Saison). Sie gilt nur für „jetzt“; vergangenen Saisons wird sie nicht als
  Kader untergeschoben. Beim ersten Kader-Schritt eines solchen Teams wird die Liste einmalig zum
  Kader der aktiven Saison. Die Liste selbst wird nicht verändert (Rückweg bleibt möglich).

Das Spielerprofil ist bewusst schlank: Name, Jahrgang, Nummer, Position/Rolle, Status, verletzt,
Beobachtungen. Es gibt keine Kontakt-, Adress-, Eltern-, Bank- oder medizinischen Daten.

## 5. Beobachtungen

Eine Beobachtung ist **ein** Datensatz (`observations`: team, player, date, session?, plan?,
gameRef?, text, tags, createdBy, authorName, capturedAt). Er gehört zugleich zum Ereignis und zur
Person. Die Trainingsansicht und das Spielerprofil lesen denselben Datensatz, es gibt keine Kopie.

**Erfassen (einhändig in der Halle):** Im laufenden Training öffnet „Beobachtung“ ein Sheet im
Daumenbereich. Dort Person antippen (der Fokus springt ins Textfeld), kurz schreiben, Speichern.
Ein Thema ist optional und nutzt dasselbe Vokabular wie die Trainingsthemen. Anwesende stehen
zuerst. Ab 13 Personen gibt es eine Suche.

- Die Beobachtung wird **sofort** als eigener Datensatz gespeichert, nicht erst beim Abschluss.
  Sie übersteht Abbruch und App-Neustart, und Co-Trainer:innen sehen sie nach dem nächsten Sync.
- Während der Durchführung verweist sie auf die **Planung** (das Training existiert noch nicht).
  Beim **Abschluss** wird sie mit dem Training verknüpft. Welche Beobachtungen zu diesem Ablauf
  gehören, merkt sich der Trainingsentwurf, auch über einen Neustart hinweg.
- Erfassen geht außerdem aus dem Workspace, dem Trainingsdetail und dem Spielerprofil.
- Die bisherige **Notiz zum Training** bleibt unverändert erhalten (Feld `note`). Sie heißt jetzt so,
  um sie von den personenbezogenen Beobachtungen zu unterscheiden.

**Spielerprofil als Zeitverlauf:** Beobachtungen der Saison (neueste zuerst, mit Quelle, Datum und
Autor:in), frühere Saisons auf Wunsch, „Trainings dabei 12 / 15“ als Fakt und **wiederkehrende
Themen** als reine Häufigkeit („Ballhandling · 2×“).

**Keine Bewertungsskalen:** keine Noten, Sterne, Ampeln oder Scores, kein „Fortschritt“.

### Entscheidung: Entwicklungsthemen

Es gibt **kein eigenes Modell**. Themen der Beobachtungen (optionale Tags) ergeben im Profil
„Wiederkehrende Themen“, sobald ein Thema mindestens zweimal vorkommt. Das deckt „Ina: Ballhandling
unter Druck, Pressbreak-Entscheidungen“ ab, ohne Pflege und ohne Kompetenzmanagement. Ein
eigenes Modell (aktiv/erledigt, Zeitraum, Zielbezug) wäre der nächste Schritt, falls sich das in der
Praxis als zu wenig erweist (Backlog).

## 6. Saisonziele und Trainingsinhalte

Ein Saisonziel ist ein kurzer Text und kann optional mit Trainingsthemen verknüpft werden. TrainerHub
zeigt dann nur, was die Daten hergeben: „7 Trainings mit Pressbreak · 540 min“. Ohne verknüpftes
Thema heißt es „Kein Trainingsthema verknüpft“. Es wird nichts geschätzt, und es gibt kein „73 %“.
Die Phase-2-Auswertung (Themen, Schwerpunkte, Monate) ist aus dem Workspace mit Team und Saison
vorausgewählt erreichbar.

## 7. Spiele

Ein Spiel stammt aus einer von zwei Quellen:

| Quelle | Speicherort | im Workspace |
|---|---|---|
| **manuell** | `seasons.gamedays` (wie bisher) | ja |
| **Sports Data** (optional) | `games` + `competitions`, befüllt vom Sports-Data-Adapter, im Client **nur lesend** | ja |

`teamGames()` bildet beide auf eine einheitliche Sicht aus Teamperspektive ab (Gegner,
Heim/Auswärts, Ergebnis, Wettbewerb, Halle). Der übrige Workflow unterscheidet nicht.
Beobachtungen können über `gameRef` (`games:<id>` bzw. `gameday:<id>`) auf ein Spiel verweisen. Eine
Erfassungs-UI direkt am Spiel ist Backlog.

## 8. Sports-Data-Grenze

- TrainerHub konsumiert ausschließlich die bereits normalisierten Datensätze seines eigenen Stores
  (`games`, `competitions`). Sie werden über den normalen Sync als **nur lesende** Collections
  geladen (`readOnly` in `src/sync/mapping.js`). Lokale Änderungen daran werden nie übertragen.
- In React-Komponenten gibt es keine Provider-Logik und keinen Import aus `packages/sports-data`.
- Es gibt keine Abhängigkeit zu GameDay.

## 9. Verhalten ohne Sports Data

Ohne Integration sind `games`/`competitions` einfach leer. Spiele trägt man manuell in der Saison ein
(„Spiel eintragen“), oder der Bereich bleibt leer. Nirgends steht „benötigt basketball-bund.net“.
Mannschaft, Training, Beobachtungen und Saison funktionieren immer. Getestet ist das im Unit-Test
und im lokalen Modus ohne Server.

## 10. Berechtigungen

Die drei Profile (`organisation_admin`, `section_manager`, `coach`) und das Prinzip „Funktion
beschreibt den Menschen, Berechtigung beschreibt, was TrainerHub erlaubt“ sind unverändert. Neu bzw.
angepasst (Migration `1760000400_team_workspace.js`):

| Collection | Lesen | Anlegen | Ändern | Löschen |
|---|---|---|---|---|
| `players` **(angepasst)** | Leitung/Admin der Abteilung; coach nur Personen seiner Teams (Saisonkader irgendeiner Saison oder bisherige Teamliste) | wie bisher: Profil in der Abteilung | nur sichtbare Personen | wie bisher: Leitung/Admin |
| `roster_entries` | Zugriff aufs Team | Zugriff aufs Team, Saison gehört zum Team, Person aus derselben Abteilung | Team/Saison/Person unveränderlich | Zugriff aufs Team |
| `observations` | Zugriff aufs Team | Zugriff aufs Team, Person aus derselben Abteilung, `createdBy` = eigenes Konto | nur Ersteller:in oder Leitung/Admin; Team/Person/createdBy unveränderlich | nur Ersteller:in oder Leitung/Admin |
| `seasons.goals` | wie Saison | wie Saison | wie Saison | – |

**Bewusste Änderung:** Bisher sah jede:r coach alle Personen der Abteilung. Die Vorgabe für Phase 4
(„Ein Coach sieht nur Spieler seiner zugewiesenen Teams“) ist jetzt serverseitig umgesetzt.
Folge: „Bereits bekannt“ beim Hinzufügen zeigt einem coach nur Personen aus seinen Teams. Einen
Wechsel aus einem fremden Team ordnet die Abteilungsleitung zu (oder der coach legt die Person neu
an; Dubletten bleiben möglich, siehe §15).

Interne Beobachtungen sind **nie** öffentlich. Der öffentliche Sports-Data-Feed enthält keine
Personen. Anonymer Zugriff liefert nichts (getestet).

## 11. Offline- und Sync-Verhalten

Die neuen Daten laufen durch **dieselbe** Sync-Architektur: lokaler Stand ↔ letzter gemeinsamer
Stand ↔ Server, Abgleich je Feld, Konfliktprotokoll. `roster_entries` und `observations` sind
normale Sync-Collections, `games`/`competitions` sind nur lesend. Es gibt keine zweite
Sync-Implementierung.

Ohne Netz funktionieren (alles lokal, keine UI wartet auf einen Request): Workspace öffnen, Kader
ansehen, Training öffnen, durchführen und abschließen, Beobachtung erfassen, Spielerprofil mit
lokalen Daten, Saisonziele, Kaderänderungen. Änderungen werden beim nächsten Sync übertragen
(Start, Vordergrund, wieder online, kurz nach einer Änderung).

**Multi-Trainer:** Beobachtungen tragen `createdBy` (Server erzwingt das eigene Konto), `authorName`
und `capturedAt` (Gerätezeit der Erfassung). Trainer B sieht die Beobachtung von Trainer A nach dem
nächsten Sync.

**Konflikte:** Wird dieselbe Beobachtung auf zwei Geräten geändert, gilt der Serverstand, und die
eigene Fassung steht im Konfliktprotokoll (übernehmbar). Saisonziele sind ein JSON-Feld der Saison:
Wird das Feld gleichzeitig auf zwei Geräten geändert, ist das ein Konflikt auf dem ganzen Feld.
Das ist bei wenigen, selten geänderten Zielen vertretbar.

## 12. Löschverhalten

| Aktion | Folge |
|---|---|
| Person aus dem Kader nehmen | Status `left`, **nichts** gelöscht |
| Training löschen | Training weg; Beobachtungen bleiben, nur der Verweis wird geleert (Server: optionale Relation ohne cascade; Client: `removeSession`) |
| Planung löschen | Beobachtungen bleiben (Verweis geleert) |
| Saison löschen | vom Server abgelehnt, solange Kadereinträge daran hängen (Pflichtrelation ohne cascade) |
| Team löschen | wie bisher nur Vereins-Admin; abgelehnt, solange Saisons/Kader/Beobachtungen daran hängen |
| Person endgültig löschen | nur Leitung/Admin; löscht **bewusst** ihre Kadereinträge und Beobachtungen mit (Datenminimierung). Die App bietet dafür keine Schaltfläche |
| Beobachtung löschen | nur Ersteller:in oder Leitung/Admin, mit Rückfrage |

## 13. Historische Saisons

Über den Teamwechsel (Abschnitt „Saison“) oder „Alle Saisons“ lässt sich jede Saison öffnen. Eine
abgeschlossene Saison zeigt ihren Kader, ihre Beobachtungen, Trainings, Spiele und Ziele **nur
lesend**. Es gibt keine Primäraktion und keine Kaderänderung. Änderungen am aktuellen Team
berühren sie nicht, weil Kader je Saison gespeichert sind und Trainings/Beobachtungen am Datum
hängen.

## 14. Saisonwechsel (vorbereitet, minimal umgesetzt)

**Neue Saison anlegen** bietet „Kader übernehmen“ an: Aktive und pausierte Personen der laufenden
Saison sind vorausgewählt und einzeln abwählbar. Die alte Saison und ihr Kader bleiben unverändert.
Der bisherige **Jahrgangswechsel** schreibt jetzt in den Saisonkader des Zielteams (aktive bzw.
jüngste Saison) und schließt die Quellsaison ab. Deren Kader bleibt als Historie erhalten.

Das spätere Zielbild „neue Saison → Kader übernehmen → einzelne wechseln → alte archivieren“ passt
ohne Modelländerung auf dieses Datenmodell. Eine größere Saisonabschluss-Automation wurde bewusst
nicht gebaut.

## 15. Migration bestehender Daten

`1760000400_team_workspace.js` ist rein additiv:

- `seasons.goals` kommt neu hinzu (leer). Die Collections `roster_entries` und `observations` kommen
  hinzu, die Rules für `players` werden angepasst.
- Einmalig erhält die **aktive** Saison jedes Teams die bisherige Teamliste als Saisonkader.
  Historische Saisons bleiben ohne Kader, denn ihre damalige Zusammensetzung ist unbekannt und wird
  nicht erfunden.
- Teams, Teamlisten, Personen, Saisons, Planungen, Trainings, Anwesenheiten und Notizen bleiben
  **bytegleich**. Das ist getestet (`test/integration/migration.test.js`: echter Phase-3-Datenstand,
  vorwärts, Vergleich, zurück, Vergleich).
- Rückweg (`migrate down`): Die Collections `roster_entries`/`observations` entfallen, das Feld
  `goals` ebenfalls, die alten `players`-Rules kommen zurück. Da dabei Kader und Beobachtungen
  verloren gehen, vorher Backup (macht `deploy.sh` automatisch).
- Lokaler Modus/Geräte: `migrate()` schreibt alte Datenstände nicht um. Neue Listen werden beim
  Lesen mit Standardwerten behandelt.

## 16. Tests

| Ebene | Umfang |
|---|---|
| Unit (`src/lib/workspace.test.js`, `prefs.test.js`) | aktive/historische Saison, Team ohne Saison, Kader aufnehmen/entfernen ohne Historienverlust, pausiert, zwei Saisons, Teamwechsel im Folgejahr, deterministische IDs, Beobachtung an Person und Training (ein Datensatz), Training gelöscht, Verlauf/Themen, Ziele ohne Scheingenauigkeit, Spiele mit/ohne Sports Data, Agenda (heute/nächstes/kein Training), aktuelle Mannschaft, Vereinsgröße (450 Trainings, 900 Beobachtungen, 18 Teams < 250 ms) |
| Integration Rechte (`workspace.test.js`) | coach eigenes/fremdes Team, section_manager, organisation_admin, kombiniert, Kader-Kreuzzuordnungen, Beobachtung nur im eigenen Namen, Co-Trainer liest und darf nicht ändern, Cross-Tenant, anonym, Löschverhalten |
| Integration Sync (`workspace-sync.test.js`) | zwei Trainer:innen, Offline-Erfassung + App-Neustart + Sync, Kader über Sync, Beobachtung im Training → Abschluss → Training gelöscht, Konflikt, Sports Data nur lesend, fremder Verein |
| Migration (`migration.test.js`) | Phase-3-Bestand vorwärts/rückwärts |
| Regression | alle Phase-2/3-Unit- und Integrationstests; Phase-3-Browser-E2E (17/17) |
| Browser-E2E (`e2e/phase4.e2e.mjs`) | 19 Schritte laut Auftrag + fremder coach + anonym (23/23) gegen den lokalen Docker/PocketBase-Stack |

## 17. Bekannte Grenzen

- Ein coach sieht beim Hinzufügen nur Personen seiner Teams. Wechsel aus fremden Teams ordnet die
  Leitung zu, sonst entstehen ggf. Dubletten einer Person.
- Saisonziele sind ein JSON-Feld: Gleichzeitige Änderungen auf zwei Geräten führen zu einem
  Feldkonflikt (siehe §11).
- Das Trainingsdatum bestimmt die Saison. Überlappen sich Saisonzeiträume eines Teams, gilt die
  zuerst gefundene (jüngste).
- Nachtragen eines Trainings in einer abgeschlossenen Saison ohne Saisonkader zeigt keine
  Anwesenheitsliste (die damalige Teamliste ist unbekannt).
- Der Kalender im Trainingsbuch markiert weiterhin nur manuelle Spieltage. Sports-Data-Spiele
  erscheinen im Workspace und in der Saison.
- Auf iOS öffnet sich die Tastatur beim Beobachtungs-Sheet aus dem Spielerprofil nicht immer
  automatisch (Fokus nach dem Öffnen des Dialogs), ein Tipp ins Feld genügt. Beim Erfassen im
  Training springt der Fokus direkt mit dem Antippen der Person.
- Lokaler Docker-Stack auf macOS: SQLite-WAL braucht ein Docker-Volume statt Bind-Mount (nur lokal,
  Linux-Server unbetroffen).

## 18. Spätere Erweiterungspunkte (Backlog, nicht gebaut)

- Beobachtung direkt an einem Spiel erfassen (Modell vorhanden: `gameRef`)
- Entwicklungsthemen als eigenes, leichtes Modell (aktiv/erledigt), falls die Häufigkeit nicht reicht
- Saisonabschluss-Assistent (archivieren, Kader übernehmen, Wechsel in Nachbarteams)
- Personenzusammenführung (Dubletten) durch die Abteilungsleitung
- Sports-Data-Spiele im Trainingsbuch-Kalender
- Externe Spielstatistik im Spielerprofil (sobald die Quelle echte Werte liefert, siehe Sports Data)
- Suche über Beobachtungen im Team
