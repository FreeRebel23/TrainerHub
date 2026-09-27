# Spielbetrieb & Verbandsdaten – Architektur

> **Leitsatz:** Externe Verbandsdaten werden einmal sauber synchronisiert und stehen danach allen
> TrainerHub-Modulen und angeschlossenen Diensten als gemeinsame Wahrheit zur Verfügung.
> Nicht möglichst viele Daten importieren – nur das, was TrainerHub, GameDay und Scoreboard brauchen.

Stand: 27.09.2026, Branch `trainerhub-phase3-sports-data`. Prototyp mit Tests. Die Berechtigungsprofile
sind unverändert, ebenso alle bestehenden Collections.

```
basketball-bund.net (/rest, öffentlich)
        │  höflich: nacheinander, Pausen, Cache je Lauf
        ▼
Provider-Adapter  server/sports/providers/basketball-bund.js   ← einzige Stelle, die das Quellformat kennt
        │  normalisierte, provider-neutrale Objekte
        ▼
Sync  server/sports/sync.js  (idempotent, je Abteilung, Superuser im internen Netz)
        │
        ▼
PocketBase  team_links · competitions · team_competitions · games · standings ·
            basketball_player_game_stats · player_links · sync_runs
        │                                   │
        ▼                                   ▼
TrainerHub-App (angemeldet, Regeln)     öffentlicher Feed v1  /api/trainerhub/sports/v1/…
                                            │
                                            ▼
                                  GameDay · Scoreboard (eigene Dienste)
```

---

## 1. Externe Quelle

**basketball-bund.net (TeamSL)**. Am 27.09.2026 mit insgesamt etwa 15 einzelnen, nacheinander gestellten
Anfragen untersucht.

| Weg | robots.txt | Stabile IDs | Verwendung |
|---|---|---|---|
| `spielplanReportSearch.do?reqCode=list` (Vereinsspielplan, HTML) | erlaubt | **keine** (nur Liganame, Spielnummer, Mannschaftsname) | nicht verwendet |
| `index.jsp?Action=103` (Ergebnisse je Liga, HTML), von GameDay genutzt | **gesperrt** | – | **nicht verwendet** |
| `index.jsp?Action=106`, `public/archiv/archiv_ergebnisse.jsp` (Archiv) | **gesperrt** | – | nicht verwendet |
| `statistik.do?reqCode=statTeam` | **gesperrt** | – | nicht verwendet |
| **`/rest/…` (JSON)** – dieselbe Schnittstelle nutzt die Webseite selbst | nicht ausgeschlossen, ohne Anmeldung | **ja, durchgehend** | **verwendet** |

Verwendete Endpunkte (alle `GET`, ohne Cookies, ohne Anmeldung):

| Endpunkt | Inhalt |
|---|---|
| `/rest/club/id/{clubId}/actualmatches?justHome=false&rangeDays=21` | Vereinsspiele der nächsten Tage (Quelle begrenzt auf ca. 3 Wochen, auch bei größerem Wert) – **Entdeckung** der Wettbewerbe |
| `/rest/competition/spielplan/id/{ligaId}` | kompletter Spielplan eines Wettbewerbs inkl. Endständen, `abgesagt`, `verzicht`, `ergebnisbestaetigt` |
| `/rest/competition/table/id/{ligaId}` | offizielle Tabelle |
| `/rest/match/id/{matchId}/matchInfo` | Viertel (`matchResult`), Halle (`spielfeld`) |
| `/rest/match/id/{matchId}/boxscore` | Spielerwerte beider Mannschaften |

Antworthülle: `{ status: "0" | "1", message, data }`. `status "1"` = Fehler (z. B. `no competition found with id …`).
Archivierte Wettbewerbe (Vorsaisons) sind über `/rest` **nicht** abrufbar (geprüft mit Liga 48109, Saison 2025).

**Bezug zu GameDay** (`~/Projekte/Developer/GAMEDAY`, `src/adapters/basketball_bund.py`): Die dort
verifizierten Fachregeln werden übernommen – `00:00` = Uhrzeit unbekannt, abgesagt statt gelöscht,
Verlegungen aktualisieren dasselbe Spiel, Viertel inkl. Verlängerung, Saisonwechsel am 1. Juli,
keine stillen Fixture-Fallbacks im Live-Betrieb, Herkunft je Datensatz. Den HTML-Scraper übernehme ich
**bewusst nicht**. Seine Ergebnisquelle `Action=103` ist per robots.txt gesperrt. Außerdem ordnet er
Mannschaften über Namen zu, und alle Bretten-Mannschaften heißen in der Quelle gleich
(„TV Bretten TITANS“). Das Beispiel aus GameDay (kumuliert 13:10 → 26:20 → 43:30 → 65:58, Viertel
13:10 · 13:10 · 17:10 · 22:28) liefert der JSON-Adapter identisch (Spiel 2946251, als anonymisierte
Fixture im Test).

## 2. Provider-Adapter

`server/sports/providers/basketball-bund.js`, `createBasketballBundProvider({ http })` liefert:

- `clubMatches(clubId)`, `schedule(ligaId)`, `standings(ligaId)`, `gameDetails(matchId)`, `boxscore(matchId)`, `seasonFor(date)`
- reine Normalisierer (`normalizeMatch`, `normalizePeriods`, `normalizeStandings`, `normalizeBoxscoreSide`), einzeln getestet

Der Sync kennt nur die normalisierten Objekte. Ein zweiter Provider (z. B. Handballverband) braucht
einen weiteren Adapter mit derselben Schnittstelle. Datenmodell und Sync bleiben gleich.

HTTP (`server/sports/http.js`): streng nacheinander, mindestens 1,5 s Abstand, 15 s Timeout, höchstens
2 Wiederholungen und nur bei Netzwerkfehler/5xx/429 (mit Pause), bei 4xx keine Wiederholung.
Außerdem gibt es einen Cache je Lauf und einen ehrlichen User-Agent. Es gibt keine Maßnahmen gegen
Zugangsschutz oder Schutzmechanismen, und es werden nur die nötigen Seiten abgerufen.

## 3. Externe IDs

| Objekt | ID der Quelle | Stabilität | TrainerHub-Feld |
|---|---|---|---|
| Verein | `clubId` (TV Bretten = 484) | stabil | `team_links.externalClubId` |
| Mannschaft (wettbewerbsübergreifend) | `teamPermanentId` | stabil über Wettbewerbe; über Saisons **angenommen**, nicht prüfbar (Archiv nicht per `/rest`) | `team_links.externalTeamId` |
| Mannschaft in einem Wettbewerb | `seasonTeamId` (= `teamCompetitionId`) | je Wettbewerb | `team_competitions.externalTeamId` |
| Wettbewerb/Liga einer Saison | `ligaId` | stabil; Name ändert sich (z. B. „… Update 21.09.2026“) | `competitions.externalId` |
| Saison | `seasonId` (2026 = 2026/2027) | stabil | `competitions.season` |
| Spiel | `matchId` | global eindeutig | `games.externalId` |
| Spielnummer | `matchNo` | **nur je Liga eindeutig** (in einer Liga z. B. „14“) | `games.matchNo` (Anzeige) |
| Halle | `spielfeld.id` | stabil | `games.venueExternalId` |
| Person | `person.id` | stabil; bei anonymisierten Personen `0` | `…externalPlayerId` |
| Spielberechtigung | `playerId` | je Person/Team | nicht gespeichert |

Fehlende IDs: Die Quelle liefert **keinen Änderungszeitstempel** je Datensatz, deshalb bleibt
`sourceUpdatedAt` leer (das Feld ist für Provider mit Zeitstempel vorgesehen). Verlegungen werden nicht
eigens gekennzeichnet (das HTML-Symbol „Spiel zeitlich verlegt“ gibt es im JSON nicht). Namen dienen
nirgends als Identität.

## 4. Datenmodell

Migration `pocketbase/pb_migrations/1760000300_sports_data.js`. Die Kette lautet
**Organisation → Abteilung → Team → Wettbewerbsteilnahme → Wettbewerb**, und jeder Datensatz trägt
`section`. Dazu kommen je nach Tabelle `provider`, `externalId`, `lastSyncedAt` und `lastSeenAt`.

| Collection | Inhalt | Eindeutig | Lesen | Schreiben |
|---|---|---|---|---|
| `team_links` | Team ↔ Provider-Mannschaft (+ Verein, `publish`) | (team, provider), (section, provider, externalTeamId) | coach des Teams, Leitung/Admin | nur Sync/Admin |
| `competitions` | Liga/Pokal einer Saison, Metadaten | (section, provider, externalId) | Profil in der Abteilung | nur Sync |
| `team_competitions` | Team nimmt an Wettbewerb teil (`seasonTeamId`, optional TrainerHub-`season`) | (team, competition) | coach des Teams, Leitung/Admin | nur Sync |
| `games` | Spiel (generisch) | (section, provider, externalId) | coach von Heim-/Gastteam, Leitung/Admin | nur Sync |
| `standings` | offizielle Tabelle, aktueller Stand | (competition) | Profil in der Abteilung | nur Sync |
| `basketball_player_game_stats` | Spielerwerte je Spiel, nur eigene Teams | (game, provider, externalPlayerId) | coach des Teams, Leitung/Admin | nur Sync |
| `player_links` | Spieler:in ↔ Provider-Person, manuell bestätigt | (section, provider, externalPlayerId), (player, provider) | Profil in der Abteilung | **anlegen/löschen durch Berechtigte der Abteilung** (mit `confirmedBy` = sich selbst) |
| `sync_runs` | Protokoll je Lauf | – | Leitung/Admin | nur Sync |

Entscheidung **IDs am Objekt statt generischer `externalIdentity`-Tabelle**:

- Provider-eigene Objekte (Wettbewerb, Spiel, Tabelle, Statistik) tragen `provider + externalId` selbst.
  Sie entstehen nur durch den Provider, deshalb gibt es keine Dopplung.
- TrainerHub-eigene Objekte (Team, Spieler:in) bleiben unverändert. Ihre Zuordnung liegt in je einer
  kleinen Link-Collection mit echter Relation. Damit bleiben die API-Regeln relational
  (`team.trainers`), was bei einer generischen Tabelle mit `entityId` als Text nicht ginge, und die
  abgenommene Collection `teams` wird nicht angefasst.

Die neuen Collections sind **nicht** Teil des Offline-Syncs der App (`src/sync/mapping.js` bleibt
unverändert). Die App kann sie später online lesen.

## 5. Generisch vs. Basketball

| generisch (jede Sportart) | basketballspezifisch |
|---|---|
| `competitions`, `team_competitions`, `games`, `standings` | `basketball_player_game_stats` |
| `games.periods` = `[{label, home, away}]`, beliebig viele Abschnitte (Basketball `Q1…Q4, OT1, OT2`, Handball später `H1, H2`) | Labels und die Viertel-Ableitung im Basketball-Adapter |
| Status `planned` · `finished` · `cancelled`, `forfeit` | Punkte, 2er/3er, Freiwürfe, Fouls |

Die Sportart ergibt sich aus der Abteilung (`sections.sport`) und dem Provider, sie ist nirgends fest verdrahtet.

## 6. Team-Mapping

Ein Team wird **einmal** zugeordnet (`team_links`, über `teamPermanentId` + `clubId`). Danach läuft
alles über IDs. Live ermittelt am 27.09.2026 mit `node scripts/sports-sync.mjs discover --club 484`
(1 Anfrage):

| TrainerHub-Team | Provider-Mannschaft (`teamPermanentId`) | Wettbewerb(e) 2026/27 (`ligaId`, `seasonTeamId`) |
|---|---|---|
| Herren | 154713 | BBW2 Kreisliga A Nord Männer (53074, 441934) |
| U18m | 164341 | BBW2 U18 männlich Bezirksliga Nord (53043, 441750) |
| U16m | 164356 | BBW2 U16 männlich Bezirksliga Nord (56605, 471387) |
| **U16w** | **189841** | BBW2 U16 weiblich Bezirksliga (56442, 469433) |
| U14m | 164395 | BBW2 U14 männlich Kreisliga Nord (56441, 470164) |
| U14w | 323401 | BBW2 U14 weiblich Bezirksliga (56492, 469922) **und** Bezirkspokal (56468, 469702) |
| U12mix | 189789 | BBW2 Season Opening U12 (Nord) (53079, 470322) |
| U10mix | – noch nicht sichtbar | U10-Runden beginnen später; die Entdeckung sieht nur ca. 3 Wochen voraus |

Alle Mannschaften heißen in der Quelle „TV Bretten TITANS“. Deshalb **muss** die Zuordnung über die
ID laufen. Die Tabelle ist die fachliche Soll-Zuordnung. Angelegt ist bisher nur, was auf Staging
existiert (siehe §15).

Mannschaften des Vereins ohne Zuordnung werden im Lauf als `unmappedTeams` gemeldet und **nicht**
importiert.

## 7. Saison und Wettbewerb

- Team → **Wettbewerbsteilnahme** (`team_competitions`) → Wettbewerb. Mehrere Wettbewerbe je Team
  und Saison sind normal (U14w: Liga + Pokal).
- Die Entdeckung legt Wettbewerb und Teilnahme automatisch an, sobald eine **zugeordnete** Mannschaft
  (per `teamPermanentId`) in einem Wettbewerb spielt. Das ist ID-basiert, nie über Namen.
- Die Teilnahme kann optional mit einer TrainerHub-Saison (`seasons`) verknüpft werden. Die Saison
  der Quelle steht in `competitions.season`.
- Synchronisiert werden nur Wettbewerbe der **laufenden Saison** (`seasonFor(heute)`). Vorsaisons
  bleiben unverändert gespeichert und werden nicht mehr abgefragt (das `/rest`-Archiv gibt es nicht).
- Zweite Saison: gleiche Team-Zuordnung, neue `ligaId`s werden entdeckt, alte Daten bleiben (getestet).

## 8. Spielmodell (`games`)

`section, competition, homeTeam?, awayTeam?` (interne Teams, bei vereinsinternen Duellen beide),
`provider, externalId (matchId), matchNo, matchDay, date (YYYY-MM-DD, lokal), time (HH:MM | "")`,
`previousDate`, `homeTeamName, awayTeamName, homeTeamExternalId, awayTeamExternalId`,
`homeScore, awayScore, status, forfeit, resultConfirmed, periods, venue, venueExternalId, venueAddress`,
`missingCount, detailsSyncedAt, statsCheckedAt, sourceUpdatedAt, lastSyncedAt, lastSeenAt`.

- **Status** nur aus der Quelle: `abgesagt` → `cancelled`, Ergebnis vorhanden → `finished`, sonst
  `planned`. `verzicht` → `forfeit = true`. „postponed“ liefert die Quelle nicht. Eine Verlegung ist
  ein geändertes Datum desselben Spiels (`previousDate`).
- Punkte ohne Ergebnis speichert PocketBase als `0`. Maßgeblich ist deshalb `status`; der Feed gibt
  bei nicht beendeten Spielen `null` aus.
- **Viertel:** Die Quelle liefert Einzelwerte je Viertel. Achtung: `heimHalbzeitstand` ist das
  **2. Viertel** (verifiziert: 13+13+17+22 = 65). Zusätzlich gibt es `Ot1`, `Ot2`. Der Adapter
  prüft Summe = Endstand und erkennt vorsorglich auch kumulative Werte. Unstimmige Werte werden
  verworfen statt geraten.
- Es werden nur Spiele eigener (zugeordneter) Teams gespeichert, nicht die ganze Liga.

## 9. Tabelle

Die offizielle Tabelle aus `/competition/table` wird **nicht selbst berechnet**. Gespeichert wird nur
der **aktuelle Stand** (`standings.entries`, `fetchedAt`), je Eintrag `rank, teamExternalId,
seasonTeamId, clubId, teamName, games, wins, losses, points, pointsAgainst, scored, conceded,
difference, withdrawn`. Das sind genau die Felder der Quelle. Eine Historie bringt derzeit keinen
Mehrwert. Pokale ohne Tabelle (`tableExists = false`) und leere Tabellen werden übersprungen.

## 10. Basketball-Spielerstatistik

`basketball_player_game_stats`: `game, team, player?, externalPlayerId (person.id), jerseyNumber,
externalName, points, twoPointersMade, threePointersMade, freeThrowsMade, freeThrowAttempts, fouls`.

- Nur **eigene** Teams. Personen der Gegner werden nie gespeichert.
- Nur, wenn die Quelle **echte Werte** liefert. Der Boxscore ist strukturell vorhanden, war aber für
  das geprüfte Spiel (Ergebnis noch nicht bestätigt) vollständig mit Nullen gefüllt. Solche
  Schein-Nullen werden nicht gespeichert. **Ob in BBW-Jugendligen nach der Bestätigung tatsächlich
  Spielerwerte erscheinen, ist noch nicht verifiziert** (offener Punkt).
- Anonymisierte Personen (`person.id = 0`) werden nicht gespeichert, weil sie nicht zuordenbar sind.
- Weitere Felder der Quelle (Rebounds, Assists …) werden erst übernommen, wenn sie tatsächlich
  geliefert und gebraucht werden.

## 11. Spielerzuordnung

Reihenfolge: **(1)** stabile externe Personen-ID mit bestätigter Zuordnung (`player_links`) →
**(2)** sonst bleibt `player` leer. Namen erzeugen nur **Vorschläge** (`server/sports/players.js`,
`sports-sync.mjs players`). Es wird **nie automatisch** über Namen zugeordnet.
Gibt es zwei gleiche Namen, ist der Vorschlag „mehrdeutig“ (getestet). Bestätigen können Berechtigte
der Abteilung über die API (`confirmedBy` muss das eigene Konto sein) oder der Admin per
`confirm-player`. Der nächste Lauf überträgt die Zuordnung auf vorhandene Zeilen.

## 12. Sync-Strategie und Datenhoheit

Ablauf je Abteilung (`syncSection`) und für alle Abteilungen mit Zuordnung (`syncAll`):

1. **Entdeckung** (`full`): Vereinsspiele → Wettbewerbe/Teilnahmen zugeordneter Mannschaften.
2. **Spielpläne** der aktiven Wettbewerbe der laufenden Saison → eigene Spiele per
   `provider + externalId` anlegen/aktualisieren (idempotent; unverändert = keine inhaltliche Änderung).
   Fehlt ein Spiel in der Quelle, wird `missingCount` erhöht und nichts gelöscht. Ab 3 Läufen blendet
   der Feed es aus.
3. **Tabellen** direkt nach dem Spielplan.
4. **Details** (Viertel, Halle): beendete Spiele ohne Viertel (bis 7 Tage nachfragen) und anstehende
   Spiele der nächsten 14 Tage ohne Halle bzw. nach einer Verlegung. Höchstens 25 je Lauf.
5. **Statistik**: beendete Spiele, frühestens alle 6 h erneut, bis 7 Tage nach dem Spiel. Höchstens 15 je Lauf.
6. **Protokoll** in `sync_runs` (Status `ok` | `partial` | `error`, Zähler, Anfragen, Fehler).

| Datenhoheit Provider (nur der Sync schreibt) | Datenhoheit TrainerHub (Sync fasst nie an) |
|---|---|
| Termin, Gegner, Halle, Ergebnis, Viertel, Status, Tabelle, offizielle Spielerwerte | Trainings, Planung, Anwesenheit, Beobachtungen, ArcShot, Trainer-Kommentare, interne Spielnotizen |

TrainerHub-eigene Spieldaten (z. B. künftige Spielnotizen) kommen in eigene Collections mit Verweis
auf `games.id`, nicht in Provider-Felder. So kann kein Sync sie überschreiben.

## 13. Update-Frequenzen

Ein Aufruf mit `--mode gameday` ohne eigenes Spiel heute/gestern stellt **keine** Anfrage.

| Zweck | Modus | Host-Cron (Vorschlag) | Anfragen (8 Teams, ~9 Wettbewerbe) |
|---|---|---|---|
| Nacht-Vollabgleich (Entdeckung, Spielpläne, Tabellen, Details, Statistik) | `full` | `30 3 * * *` | ≈ 20–45 |
| Spielplanänderungen tagsüber | `full` | `0 12,18 * * *` | ≈ 20–30 |
| Ergebnisse am Spieltag, danach Tabelle und Viertel | `gameday` | `*/30 10-22 * * *` | 0 ohne Spiel; sonst ≈ 2 je betroffenem Wettbewerb + Details |
| Statistik nach Spielende | in beiden Modi | – | ≤ 1 je beendetem Spiel, frühestens alle 6 h |

```cron
30 3 * * *       cd /opt/trainerhub-staging/deploy && docker compose --profile sports run --rm sports-sync run --mode full    >> /var/log/trainerhub-sports.log 2>&1
0 12,18 * * *    cd /opt/trainerhub-staging/deploy && docker compose --profile sports run --rm sports-sync run --mode full    >> /var/log/trainerhub-sports.log 2>&1
*/30 10-22 * * * cd /opt/trainerhub-staging/deploy && docker compose --profile sports run --rm sports-sync run --mode gameday >> /var/log/trainerhub-sports.log 2>&1
```

Die Cron-Einträge sind **noch nicht eingerichtet**. Das ist erst nach Abnahme des Prototyps vorgesehen.

## 14. Fehlerverhalten

- Ist die Quelle nicht erreichbar, bekommt der Lauf den Status `error`. Die Fehlermeldung steht in
  `sync_runs.error`, **alle vorhandenen Daten bleiben unverändert**, und die übrige App ist nicht
  betroffen (getestet).
- Ein Fehler in einem Wettbewerb (z. B. unbekannte/entfernte `ligaId`) ergibt den Status `partial`.
  Die anderen Wettbewerbe laufen weiter (getestet).
- Unvollständige Daten (Spiel ohne Datum) werden übersprungen und als `warning` gemeldet. Ein Freilos
  ohne Gegner ist kein Spiel.
- Beim CLI ist der Exit-Code bei `error` ≠ 0, damit Cron-Mails bzw. Monitoring greifen können.
- Es gibt keinen stillen Rückfall auf Fixture-Daten. Testdaten existieren nur in den Tests.

## 15. Anbindung GameDay / Scoreboard

Richtung: **Verbandsquelle → TrainerHub → GameDay/Scoreboard.** GameDay bleibt ein eigener Dienst und
liest statt basketball-bund.net künftig den TrainerHub-Feed.

Ich habe mich für eine **kleine öffentliche Route in PocketBase** entschieden
(`pocketbase/pb_hooks/sports_feed.js`) und gegen öffentliche Collection-Regeln. Gründe:

- Eine Collection-Regel gibt immer den ganzen Datensatz frei, die Route nur eine feste Feldliste.
- Der Vertrag ist stabil und versioniert (`v1`), unabhängig vom internen Schema.
- Veröffentlicht wird **je Team ausdrücklich** (`team_links.publish`, Standard aus).

```
GET /api/trainerhub/sports/v1/games?section=<id>[&from=YYYY-MM-DD&to=YYYY-MM-DD]   (Standard: −14 … +60 Tage)
→ { version: 1, section, from, to, games: [{
     id, provider, externalId, competition: { id, name, externalId, season },
     date, time|null, previousDate|null, status, forfeit, resultConfirmed,
     home: { name, score|null, team: { id, name } | null },   // team nur bei veröffentlichtem eigenem Team
     away: { … }, periods: [{label, home, away}] | null,
     venue: { name, address } | null, lastSyncedAt }] }

GET /api/trainerhub/sports/v1/standings?section=<id>
→ { version: 1, section, standings: [{ competition, team: { id, name, externalId }, entries: [...], fetchedAt }] }
```

Der Feed enthält keine Personen, Trainings- oder Teamobjekte (getestet). Er ist cachebar
(`Cache-Control` 2 bzw. 5 min) und bewusst ohne Anmeldung, weil er nur Daten enthält, die ohnehin
öffentlich beim Verband stehen. GameDay braucht dann nur noch die Abteilungs-ID und den Teamnamen
(`home.team.name` = interner Name wie „U16w“ statt Namensraten). Die GameDay-Seite (`src/adapters/`)
kann auf einen `TrainerHubAdapter` umgestellt werden. Das ist ein eigener Schritt in GameDay.

## 16. ArcShot-Perspektive

Keine Integration. ArcShot kann künftig über die stabile interne `games.id` auf ein Spiel verweisen.
Sie ändert sich bei Verlegung oder Ergebniskorrektur nicht, weil das Upsert über
`provider + externalId` läuft. Wurfdaten bleiben ArcShot-/TrainerHub-Daten und werden nie vom Sync
geschrieben.

## 17. Datenschutz und Sicherheit

- Alle Provider-Daten sind für Benutzer:innen nur lesbar, schreiben kann nur der Sync (Superuser,
  nur im internen Docker-Netz, eigenes Konto `SPORTS_SYNC_PB_*`, getrennt widerrufbar). Die
  Superuser-API bleibt nach außen gesperrt.
- Lesen richtet sich nach den bestehenden Profilen: Spiele sehen der coach von Heim-/Gastteam und
  Leitung/Admin, Spielerwerte nur der coach des Teams und Leitung/Admin, `sync_runs` nur
  Leitung/Admin. Ohne Anmeldung ist nichts lesbar (getestet).
- Personenbezogene Daten werden minimal gespeichert: nur eigene Spieler:innen, nur Name/Nummer/Werte,
  keine Gegner, keine Schiedsrichter:innen (die `matchInfo` enthält Namen, wird aber nur für
  Viertel und Halle ausgewertet).
- Es gibt keine öffentlichen Spielerprofile und keine öffentlichen Team-/Spielerobjekte.
- Mandanten: Jeder Datensatz ist an eine Abteilung gebunden, jede eindeutige ID schließt die
  Abteilung ein, und kein Import läuft ohne Scope. Zwei Vereine mit derselben Provider-Mannschaft
  erhalten getrennte Datensätze (getestet).
- Testdaten: Die Fixtures sind aus echten Antworten anonymisiert (Personen ersetzt,
  Schiedsrichter:innen entfernt). Die Sync-Tests laufen gegen eine erfundene „Verbandswelt“
  (`test/fixtures/basketball-bund/world.js`).

## 18. Betrieb (Kurzreferenz)

```bash
node scripts/sports-sync.mjs discover --club 484                  # nur lesen, ohne PocketBase
node scripts/sports-sync.mjs link-team --team U16w --provider-team 189841 --club 484 --org "TV Bretten"
node scripts/sports-sync.mjs run --section Basketball --org "TV Bretten" --mode full
node scripts/sports-sync.mjs status --org "TV Bretten"
node scripts/sports-sync.mjs players --team U16w --org "TV Bretten"
node scripts/sports-sync.mjs publish --team U16w --org "TV Bretten" --on
```

Auf dem Server laufen die Befehle als `docker compose --profile sports run --rm sports-sync <befehl> …`
(Image `deploy/sports-sync/Dockerfile`, kein dauerhaft laufender Dienst).

## 19. Tests

- Unit (`server/sports/adapter.test.js`, 12): Normalisierung anhand anonymisierter echter Antworten,
  Viertel (einzeln/kumuliert/OT/unstimmig), Tabelle, leerer Boxscore, `00:00`, abgesagt, Freilos,
  unbekannter Wettbewerb, Saisongrenze, höflicher HTTP-Client (seriell, Abstand, Cache, Retry nur
  5xx), Spielerzuordnung (Vorschlag, mehrdeutig, Vorrang externe ID).
- Integration (`test/integration/sports.test.js`, 24, echte PocketBase): ohne Zuordnung kein Import,
  Team-Mapping, Wettbewerbs-Mapping, mehrere Wettbewerbe je Team, unbekannte Mannschaft,
  wiederholter Sync ohne Duplikate, Verlegung, Ergebnis + Viertel + Verlängerung, Ergebniskorrektur,
  Tabelle, Absage, verschwundenes Spiel, unvollständige Daten, Spielerwerte nur eigener Teams, zwei
  gleiche Namen, externe Personen-ID, manuelle Bestätigung mit Rechten, leerer Boxscore, Ausfall der
  Quelle, unbekannter Wettbewerb, Spieltag-Modus ohne Anfragen, zweite Saison, Mandantentrennung,
  Lese- und Schreibrechte, Trainingsdaten unverändert, öffentlicher Feed (nur veröffentlicht, keine
  Personen, Parameterprüfung).

## 20. Offene Punkte

1. **Spielerstatistik verifizieren**, sobald ein Bretten-Spiel bestätigt ist (`ergebnisbestaetigt`):
   Liefert der Boxscore in BBW-Jugendligen echte Werte? Falls nicht, bleibt die Collection leer.
   Das ist korrekt, aber dann ohne Nutzen.
2. `teamPermanentId` über den Saisonwechsel beobachten (Juli 2027). Ändert sie sich, meldet der
   Lauf die Mannschaft als `unmappedTeams`, und die Zuordnung wird einmal neu gesetzt.
3. U10mix erscheint erst, wenn die U10-Runden im 3-Wochen-Fenster liegen. Alternativ kann die
   `ligaId` einmalig manuell hinterlegt werden (heute nur über das Dashboard; bei Bedarf kommt ein
   CLI-Befehl `link-competition`).
4. Nutzungsbedingungen von basketball-bund.net zur automatisierten Nutzung der `/rest`-Schnittstelle
   klären (robots.txt schließt sie nicht aus; eine ausdrückliche Erlaubnis liegt nicht vor). Bei
   Unsicherheit beim DBB/BBW nachfragen.
5. GameDay ruft heute selbst `Action=103` ab (per robots.txt gesperrt). Empfehlung: GameDay auf den
   TrainerHub-Feed umstellen.
6. Minimale Admin-Oberfläche (Zuordnungen, letzter Lauf) in der App – derzeit genügt das CLI.
