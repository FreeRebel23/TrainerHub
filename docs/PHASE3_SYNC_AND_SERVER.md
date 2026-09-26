# TrainerHub – Phase 3: Zentraler Sync, Benutzer und Server

Ziel: **Ein Team besitzt die Daten – nicht ein Gerät.** TrainerHub bleibt schnell und
offlinefähig; Trainingsdaten liegen zusätzlich zentral in PocketBase und werden zwischen
berechtigten Trainer:innen und Geräten synchronisiert. Der Trainer muss nicht darüber nachdenken,
auf welchem Gerät seine Daten liegen.

Server-spezifische Schritte (Hetzner, Proxy, DNS, Ports) stehen getrennt in
[`HETZNER_DEPLOYMENT_HANDOFF.md`](HETZNER_DEPLOYMENT_HANDOFF.md).

## Zielarchitektur

```
 Views / Fachlogik (Phase 1/2, unverändert)        ← sehen nur { data, update }
          │
 src/sync/useSyncedData.js  (React-Anbindung, Sync-Zeitpunkte)
          │
 src/sync/controller.js     (Modus, Konto, Erstübernahme, Status, Konflikte)
     ┌────┴───────────────────────┐
 lokal: localStorage             Server: PocketBase (REST, src/sync/client.js)
 trainerhub_v1 (Daten/Cache)     runner.js  → holen, abgleichen, übertragen
 trainerhub_sync (Konto/Status)  engine.js  → Dreiwege-Abgleich (rein, getestet)
 trainerhub_sync_base (Basis)    mapping.js → lokal ↔ Server-Datensätze (rein, getestet)
```

- Die Grenze aus Phase 1/2 (`loadData()`/`persist()` in `src/lib/data.js`) bleibt; sie ist nur
  speicher-injizierbar geworden. Keine View kennt den Server.
- **Offline first:** Die App startet immer aus dem lokalen Stand. Netz, Server und Anmeldung sind
  für das Arbeiten nie Voraussetzung (Ausnahme: die allererste Anmeldung auf einem Gerät).
- **Servermodus ist eine Build-Entscheidung:** `VITE_SYNC_SERVER` leer → TrainerHub verhält sich
  exakt wie Phase 2 (so baut weiterhin GitHub Pages). `same-origin` → PocketBase unter derselben
  Domain (`/api`), kein CORS nötig. Die Staging-Images bauen mit `same-origin`.

## Mandanten- und Datenmodell

Fachliche Hierarchie: **Organisation (Verein) → Abteilung → Team → Saison / Planungen / Trainings.**
Die Organisation ist die oberste Mandantengrenze; das Team ist der zentrale Berechtigungsgegenstand.
Nichts ist auf „TV Bretten“ oder „Basketball“ festgelegt – beides sind Datensätze.

| Collection | Gehört zu | Felder (Auszug) | Warum so |
| --- | --- | --- | --- |
| `organizations` | – | name, **admins**, **members** (→ users) | Mandantengrenze; Mitgliedschaft explizit |
| `sections` | organization | name, sport, **managers** | Abteilung (Basketball, Handball …) |
| `teams` | section | name, **trainers** (→ users), players (→ players) | Berechtigung „User ↔ Teams“ |
| `players` | section | name, birthYear, injured | Spieler:innen wechseln Teams (Jahrgangswechsel) innerhalb der Abteilung |
| `training_types` | section | name, duration | sportartspezifisch |
| `venues` | organization | name, address | Hallen nutzt der ganze Verein |
| `seasons` | team | name, startDate, endDate, phase, gamedays (JSON) | Spieltage sind klein und gehören zur Saison |
| `plans` | team | date, time, trainingType, venue, durationMinutes, focus, tags, checklist, note | Planung = was war vorgesehen |
| `sessions` | team | **plan** (→ plans), date, time, …, factor, attendance (JSON), checklist, recordedBy | Training = was ist passiert |

Alle Collections haben zusätzlich `extra` (JSON), `created`, `updated`.

Entscheidungen:

- **Planung und Training bleiben getrennt** (Phase-2-Entscheidung). Die Verknüpfung liegt
  **nur** am Training (`sessions.plan`, echte Relation). `plan.recordedId` wird im Client daraus
  abgeleitet (bei mehreren Trainings zu einer Planung zählt das älteste). Keine zirkuläre Relation,
  keine doppelt gepflegte Wahrheit. Wird eine Planung gelöscht, leert PocketBase die Relation am
  Training (und dessen `updated` ändert sich, andere Geräte bekommen das mit).
- **Übungen, Anwesenheit, Themen, Spieltage bleiben eingebettetes JSON.** Es gibt (noch) keine
  Übungsbibliothek; eine eigene Collection hätte nur Kosten.
- **Themen** sind weiterhin einfache Strings an Planung/Training – keine Verwaltung, keine Collection.
- **Scope der Stammdaten:** Hallen = Verein (gleiche Halle für alle Abteilungen), Trainingsarten =
  Abteilung (sportartspezifisch), Themen = implizit Team (aus der Nutzung). Keine Kopie je Gerät.
- **Datumsangaben** sind lokale Kalendertage `YYYY-MM-DD` als Text – bewusst kein PocketBase-Datetime
  (UTC), damit kein Training durch Zeitzonen verrutscht (Lehre aus Phase 1).
- **Unbekannte Felder** gehen nicht verloren: alles, was das Schema nicht kennt, landet in `extra`
  und kommt unverändert zurück.
- **Rollen:** nur dort, wo sie sich unterscheiden: Vereins-Admin (alles im Verein, Löschen von
  Stammdaten, Trainer:innen zuordnen), Abteilungsleitung (alles in der Abteilung), Trainer:in
  (eigene Teams). „Co-Trainer“ hat heute keine anderen Rechte als Trainer:in und ist daher keine Rolle.
- **Vereins-Admins sehen alle Teams des Vereins** (auch andere Abteilungen). Wer im Alltag nur die
  eigenen Teams sehen möchte, wird Trainer:in dieser Teams statt Admin.

## Zugriffsregeln (serverseitig)

Die Regeln stehen in `pocketbase/pb_migrations/1760000000_trainerhub_schema.js`. Jede Regel beginnt
mit `@request.auth.id != ""` – ohne diese Klammer trifft in PocketBase `leeresFeld.id ?=
@request.auth.id` bei anonymen Anfragen zu (gefunden durch die Integrationstests: Teams ohne
Abteilungsleitung waren anonym lesbar).

| Collection | list / view | create | update | delete |
| --- | --- | --- | --- | --- |
| organizations | Mitglied/Admin | – (Superuser) | – | – |
| sections | Mitglied des Vereins | – | – | – |
| teams | Team-Zugriff¹ | Abteilungszugriff², nur mit sich selbst als einzige:r Trainer:in | Team-Zugriff; `trainers` nur Admin/Leitung; Abteilung nicht änderbar | Vereins-Admin |
| players | Abteilungszugriff² | Abteilungszugriff | Abteilungszugriff, Abteilung nicht änderbar | Vereins-Admin |
| training_types | Abteilungszugriff | Abteilungszugriff | dto. | Leitung/Admin |
| venues | Vereinsmitglied | Vereinsmitglied | dto., Verein nicht änderbar | Vereins-Admin |
| seasons, plans, sessions | Team-Zugriff | Team-Zugriff auf das Ziel-Team | Team-Zugriff; Verschieben nur in Teams mit Zugriff | Team-Zugriff |
| users | nur sich selbst | – (keine Selbstregistrierung) | sich selbst | – |

¹ Trainer:in des Teams, Leitung der Abteilung oder Admin des Vereins.
² Leitung, Vereins-Admin oder Trainer:in eines Teams in dieser Abteilung.

Ein fremder Datensatz antwortet mit 404 (nicht 403) – seine Existenz wird nicht verraten.
Abgesichert in `test/integration/access.test.js` (10 Tests, u. a. anonym in allen Collections,
Filter-Tricks, Verschieben, fremder Verein, andere Abteilung).

## Anmeldung

- PocketBase-`users` (E-Mail + Passwort). Keine Selbstregistrierung; Konten legt der Verein an
  (`scripts/pb-admin.mjs`). Anmeldung gilt 30 Tage und wird bei jedem Online-Start verlängert.
- Erster Start (Servermodus): Anmeldemaske. Danach die normale App.
- **Offline nach erfolgreicher Anmeldung:** Die App öffnet sich wie gewohnt mit den lokalen Daten.
  Ein unerreichbarer Server oder abgelaufener Token macht die App nie unbenutzbar – es erscheint nur
  „Anmeldung abgelaufen – Änderungen bleiben auf dem Gerät“. Nach der erneuten Anmeldung werden
  ausstehende Änderungen übertragen.
- **Sicherheitsgrenzen:** Der lokale Stand enthält nur Daten, die das Konto sehen darf. Abmelden
  entfernt Daten, Sync-Zustand und Entwurf vom Gerät (geteilte Geräte). Mit ausstehenden Änderungen
  fragt die App nach und speichert diese vorher als Backup-Datei. Ein anderes Konto kann sich erst
  nach dem Abmelden anmelden – lokale Daten eines Kontos werden nie in ein anderes hochgeladen.
- Wer auf einem alten Gerät ohne Netz nicht anmelden kann, kann „Ohne Anmeldung weiterarbeiten“
  (verhält sich wie Phase 2) und später in den Einstellungen anmelden und übernehmen.

## Sync

Zeitpunkte: App-Start, nach der Anmeldung, 1,5 s nach jeder lokalen Änderung, Rückkehr in den
Vordergrund, Wieder-online, „Jetzt“ in den Einstellungen. **Kein Polling, keine Realtime-Verbindung**
(bei der Nutzung durch wenige Trainer:innen ohne erkennbaren Nutzen; später ergänzbar).

Ein Durchlauf (`runner.js`): alle sichtbaren Datensätze holen → mit lokalem Stand und Basis
abgleichen (`engine.js`) → Änderungen in Abhängigkeitsreihenfolge übertragen (Stammdaten → Teams →
Saisons → Planungen → Trainings; Löschen umgekehrt) → neuen Stand lokal speichern. Während eines
Durchlaufs lokal Geändertes gewinnt und wird im nächsten Durchlauf übertragen.

**Zustände** (`trainerhub_sync`): synchronisiert · ausstehend (n Änderungen) · offline · Anmeldung
abgelaufen · Fehler (einzelne Einträge abgelehnt) · angehalten (Sicherheitsbremse). Sichtbar in
Einstellungen → „Konto & Synchronisation“; ein Hinweis oben erscheint nur, wenn der Trainer etwas
tun muss. Keine Sync-Konsole.

**Keine Warteschlange:** „ausstehend“ ist alles, was lokal von der Basis (letzter gemeinsamer Stand)
abweicht. Es gibt nichts, was verloren gehen, doppelt ausgeführt oder in falscher Reihenfolge
abgespielt werden kann; ein App-Abbruch mitten im Sync ist unkritisch. Ein Anlegen, dessen Antwort
verloren ging, wird beim nächsten Mal als „existiert bereits“ erkannt und übernommen.

Umfang: Jeder Durchlauf holt alle sichtbaren Datensätze (bei einem Verein: wenige hundert bis
wenige tausend Einträge, < 1 MB). Einfach und robust gegenüber Löschungen und Rechteänderungen.
Inkrementelles Holen (`updated > letzter Sync` + Löschprotokoll) ist die naheliegende Optimierung,
wenn es nötig wird.

## Konfliktstrategie

Dreiwege-Abgleich je Datensatz mit der Basis:

| Lokal | Server | Ergebnis |
| --- | --- | --- |
| geändert | unverändert | lokale Änderung wird übertragen (nur geänderte Felder) |
| unverändert | geändert | Serverstand übernehmen |
| geändert | geändert, **andere Felder** | feldweise zusammenführen, beide Änderungen bleiben – kein Konflikt |
| geändert | geändert, **gleiches Feld, anderer Wert** | **Serverwert gilt** (wer zuerst übertragen hat); lokaler Wert ins Konfliktprotokoll |
| neu | gleiche ID existiert schon | nie überschreiben: Serverstand gilt, Abweichung ins Protokoll |

„Feld“ ist ein Feld des Datensatzes (z. B. Notiz, Übungen, Anwesenheit als Ganzes). Das
Konfliktprotokoll zeigt verständliche Hinweise („Notiz wurde gleichzeitig anderswo geändert“) mit
„Meine Fassung“ (setzt genau dieses Feld zurück und überträgt es) und „OK“. **Nichts verschwindet
still.** Kein Last-write-wins über Gerätezeiten (Uhren von Handys sind keine verlässliche Wahrheit).

## Löschungen

Echte Server-Löschung, keine Tombstones oder Deleted-Flags – die Basis übernimmt deren Rolle:

- Lokal gelöscht, auf dem Server unverändert → auf dem Server löschen. Kommt nicht wieder, auch nicht
  nach Offline-Phasen (getestet).
- Lokal gelöscht, auf dem Server inzwischen geändert → **nicht** löschen, Hinweis.
- Auf dem Server gelöscht (oder Zugriff entzogen) → lokal entfernen; ungesicherte lokale Änderungen
  bleiben im Konfliktprotokoll und sind wiederherstellbar.
- **Sicherheitsbremse:** Würden in einem Durchlauf mehr als 5 und mehr als 25 % der Einträge einer
  Collection gelöscht (z. B. versehentlich altes Backup), wird angehalten: „Löschen bestätigen“ oder
  „Wiederherstellen“.
- Löschen von Spieler:innen, Teams und Stammdaten ist serverseitig Admins vorbehalten; die App löscht
  Spieler:innen ohnehin nie (nur „aus Team entfernen“).

## IDs

- IDs werden **im Client** erzeugt (`uid()`, seit Phase 2 16+ Zeichen) und sind zugleich die
  Server-IDs. Dadurch funktioniert Anlegen offline, und es gibt nie eine Umschlüsselung.
- PocketBase erlaubt dafür 1–40 Zeichen `[a-z0-9]`.
- Bei der Erstübernahme werden nur **ungültige** IDs ersetzt – praktisch die Start-IDs aus den
  Beispieldaten (`t0`, `p1`, `tt1`, `v1` …), die zwischen Vereinen kollidieren würden. Die neue ID
  ist deterministisch aus Konto + Collection + alter ID: zwei alte Geräte desselben Trainers ergeben
  dieselben IDs und erzeugen beim Zusammenführen keine Duplikate. Alle Verweise (Kader,
  Anwesenheit, Team, Trainingsart, Halle, Planung ↔ Training) werden mit umgestellt
  (`src/sync/legacy.js`, Unit- und Integrationstests).

## Erstübernahme eines bestehenden Geräts

Nach der ersten Anmeldung auf einem Gerät mit eigenem Datenstand (nicht nur Beispieldaten):

1. „Daten übernehmen“ zeigt, was auf dem Gerät liegt und was im Konto (in der Ziel-Abteilung) schon
   existiert.
2. **Konto leer** → „Daten übernehmen“: alles wird hochgeladen. Stammdaten gleichen Namens aus der
   Vereinseinrichtung (Standard-Trainingsarten, Hallen) werden wiederverwendet statt verdoppelt.
3. **Konto hat Daten** → bewusste Wahl, nie blind:
   - *Zusammenführen:* nur Neues wird ergänzt; nichts auf dem Server wird überschrieben. Teams,
     Trainingsarten, Hallen gleichen Namens und Spieler:innen gleichen Namens **und** Jahrgangs gelten
     als dieselben; Trainings/Planungen/Saisons werden nur über ihre ID abgeglichen. Abweichende
     Fassungen landen im Konfliktprotokoll.
   - *Serverstand verwenden:* die Gerätedaten werden zuerst als Backup-Datei gespeichert, dann durch
     den Serverstand ersetzt.
4. Phase-1-Verknüpfungen (nur `plan.recordedId`) werden am Training ergänzt (`planId`).

Technisch ist die Übernahme kein Sonderweg: vorbereiteter Stand + leere Basis → normaler Sync.

**Wichtig für Staging:** Die Staging-Domain ist eine andere Origin als GitHub Pages; der Browser gibt
die Pages-Daten dort nicht heraus. Weg: in der Pages-App *Einstellungen → Backup herunterladen*, in
Staging anmelden, *Einstellungen → Backup übernehmen* (führt wie „Zusammenführen“ zusammen, ersetzt
nie). Wird später die Produktion auf demselben Origin auf den Servermodus umgestellt, greift die
Übernahme direkt beim ersten Anmelden.

## Bestehende Funktionen im Servermodus

- Alle Phase-2-Workflows laufen unverändert gegen den lokalen Stand (Planen, Vorbereiten, Durchführen
  mit Entwurf, Abschließen, Duplizieren, Suche, Saisonübersicht, Import, Export, Druck).
- **Backup herunterladen:** unverändert. **Backup übernehmen** ersetzt im Servermodus nie (das würde
  auf allen Geräten löschen), sondern ergänzt Fehlendes.
- **Datei-Sync** bleibt als *Datei-Abgleich (alt)* erhalten – Übergang/Fallback, bis der Server-Sync
  überall im Einsatz ist. Importierte Trainings werden danach normal synchronisiert.
- Der Entwurf eines laufenden Trainings bleibt lokal (gerätebezogen, wie Phase 2).

## Docker und Deployment

```
pocketbase/Dockerfile         alpine + PocketBase 0.40.4 (Prüfsumme), UID 10001, Migrationen/Hooks im Image
deploy/web/Dockerfile         node:22 Build → nginx-unprivileged (nur statische Dateien)
deploy/web/nginx.conf         PWA (MIME, Cache-Header, SPA-Fallback), /api → PocketBase, /_/ gesperrt
deploy/compose.yaml           Stack: pocketbase + web, internes Netz, ein Upstream-Port
deploy/compose.proxy-network.yaml  optional: web in ein bestehendes Proxy-Netz statt Host-Port
deploy/scripts/               deploy.sh, backup.sh, restore.sh, status.sh, inspect-server.sh (read-only)
scripts/pb-admin.mjs          Verein/Abteilung/Konten/Teams/Zugriffe anlegen (Superuser-API)
```

- Container sind ersetzbar; unverzichtbar ist nur `pb_data` (Bind-Mount `PB_DATA_DIR`): Datenbank,
  PocketBase-eigene Backups, später evtl. Upload-Dateien (derzeit werden keine Dateien gespeichert).
- Migrationen laufen automatisch beim Start von PocketBase.
- Befehle (in `deploy/`): `docker compose up -d --build` · `docker compose down` (Daten bleiben) ·
  `docker compose logs -f pocketbase` · `./scripts/status.sh` · `./scripts/backup.sh` ·
  `./scripts/restore.sh <archiv>` · Update: `git pull && ./scripts/deploy.sh`.
- **CI** (`.github/workflows/ci.yml`): Lint, Unit-Tests, Integrationstests gegen echte PocketBase,
  Build, Docker-Images und Compose-Smoke-Test bei jedem Push. Der Pages-Workflow prüft vor dem Deploy
  ebenso (erledigt den Backlog-Punkt „Lint/Tests vor dem Deploy“) und baut weiterhin ohne Server.
- **Staging-Deploy** (`deploy-staging.yml`): nur nach grünen Checks, nur wenn die Repository-Variable
  `STAGING_DEPLOY_ENABLED=true` gesetzt ist, per SSH auf den Server (Backup → Build → Start → Health).
  Die Pages-Produktion wird nie berührt.

## Backup und Restore

- PocketBase erstellt täglich 02:30 UTC ein Backup in `pb_data/backups` (14 behalten).
- `deploy/scripts/backup.sh` erstellt einen konsistenten Snapshot von `pb_data` (PocketBase wird
  dafür wenige Sekunden angehalten) nach `BACKUP_DIR` mit Prüfsumme und Aufbewahrung; `deploy.sh`
  ruft es vor jedem Update auf. Täglich per Cron auf dem Server einplanen, und `BACKUP_DIR` auf ein
  Ziel außerhalb des Servers kopieren (siehe Handoff).
- `deploy/scripts/restore.sh` stellt aus einem Snapshot (`.tar.gz`) oder einem PocketBase-Backup
  (`.zip`) wieder her; der aktuelle Stand wird dabei nicht gelöscht, sondern beiseitegelegt.
- **`PB_ENCRYPTION_KEY` gehört zum Backup** (getrennt und sicher aufbewahren): ohne denselben
  Schlüssel startet eine wiederhergestellte Instanz nicht.
- **Geprüft:** Snapshot und PocketBase-Zip jeweils in eine getrennte Instanz (eigenes
  Compose-Projekt, eigene Ports) wiederhergestellt; alle 10 Collections identisch (IDs und
  `updated`), Anmeldung funktioniert.

## Tests

| Ebene | Wo | Inhalt |
| --- | --- | --- |
| Unit | `src/**/*.test.js` (`npm test`) | Abbildung, Dreiwege-Abgleich, Konflikte, Löschen, Sicherheitsbremse, Rebase, ID-Migration, Übernahme, lokaler Modus, alle Phase-2-Tests |
| Integration | `test/integration` (`npm run test:integration`) | echte PocketBase mit den Migrationen: Rechte (10 Tests) und Abläufe (19 Tests): Login/Logout, Erstübernahme, zweites Gerät, Server → lokal, lokal → Server, Planung, Training, Verknüpfung, Löschen, Offline-Phase und App-Neustart offline, Konflikte, zwei Trainer mit unterschiedlichen Rechten, Rechteentzug, Server nicht erreichbar, Zusammenführen ohne Duplikate, Abmelden |
| Browser | `e2e/phase3.e2e.mjs` gegen den Docker-Stack | Ablauf aus dem Auftrag (Punkt 48) inkl. Service-Worker-Offline-Start, 17 Prüfungen |
| Stack | CI-Job `docker` | Images, Health, gesperrtes Dashboard, Manifest-MIME, Backup |

## Bekannte Grenzen

- Konfliktauflösung auf Feldebene: gleichzeitige Änderungen **innerhalb** eines Felds (z. B. zwei
  Trainer haken offline verschiedene Übungen im selben Training ab) sind ein Konflikt; es gilt die
  zuerst übertragene Fassung, die andere liegt im Protokoll und ist mit einem Tipp übernehmbar.
- Jeder Sync holt alle sichtbaren Datensätze (siehe oben); ausreichend für einen Verein.
- Nur ein Entwurf eines laufenden Trainings je Gerät (wie Phase 2); Entwürfe werden nicht synchronisiert.
- Mehrere offene Tabs desselben Browsers teilen sich den lokalen Speicher ohne Abstimmung (wie Phase 2).
- Passwort vergessen: erfordert SMTP in PocketBase (noch nicht eingerichtet) – bis dahin setzt ein
  Admin ein neues Passwort (`pb-admin.mjs user --email … --password …`).
- Abteilungswahl: Neue Teams/Spieler:innen/Trainingsarten landen in der Standard-Abteilung des Kontos
  (dort, wo es Teams betreut). Eine Auswahl der Abteilung in der App gibt es noch nicht (heute eine
  Abteilung je Verein).
- Druckköpfe und die Bezeichnung ohne Server nennen weiterhin „TV Bretten Basketball“ (Beschriftung,
  keine Logik); im Servermodus zeigt die Seitenleiste Verein und Abteilung aus dem Konto.
