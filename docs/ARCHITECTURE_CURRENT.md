# TrainerHub – technische Bestandsaufnahme (vor dem UX Refresh)

Stand: 24.09.2026, Branch `main` @ `7ef7ae0`. Dieses Dokument beschreibt den Ausgangszustand
**vor** dem UX Refresh. Den Zielzustand beschreibt [`UX_REFRESH.md`](UX_REFRESH.md).

## Überblick

| Thema | Befund |
| --- | --- |
| Framework | React 18.3 (JSX, kein TypeScript) |
| Build | Vite 6, `@vitejs/plugin-react`, `base: "./"` (relative Pfade) |
| PWA | `vite-plugin-pwa` 0.21 (Workbox `generateSW`, `registerType: "prompt"`) |
| Routing | Keins. `useState({ view, params })` in `App`, Umschalten per `go(view, params)`. Reload landet immer auf Start, Browser-Zurück verlässt die App. |
| State | Ein globaler Datenbaum in `useData()` (`useState` + `update(fn)`), per Props an alle Views |
| Persistenz | Komplett lokal, `localStorage["trainerhub_v1"]`, bei jeder Änderung vollständig serialisiert. Migrationen inline in `loadData()`. |
| Styling | Ausschließlich Inline-Styles, Farbkonstanten `C` und Style-Objekte `ss`, zahlreiche zusätzliche Hex-Werte direkt im JSX. Nur Dark-Design. |
| Icons | `lucide-react` plus viele Emoji (Status, Trainingsarten, Hallen, Phasen, Deko) |
| Schrift | System-Font-Stack (`-apple-system, …`) |
| Tests / Lint / Typecheck | Nicht vorhanden |
| Deployment | GitHub Actions → GitHub Pages, **nur bei Push auf `main`** (plus manuell). Feature-Branches deployen nicht. |

## Code-Struktur

```
src/App.jsx          ~3.350 Zeilen: Konstanten, Helfer, Export-/Import-Logik, alle Views, App
src/main.jsx         React-Einstieg
src/usePwaUpdate.js  Service-Worker-Update (Banner + manueller Update-Check)
vite.config.js       Build + Manifest + Workbox
index.html           iOS-Meta-Tags, Hintergrundfarbe
scripts/gen-icons.mjs  erzeugt PWA-Icons aus SVG (sharp)
```

## Datenmodell (`trainerhub_v1`)

- `players[]` – `{ id, name, birthYear, injured }` (global, teamübergreifend)
- `teams[]` – `{ id, name, playerIds[] }`
- `trainingTypes[]` – `{ id, name, duration, emoji }`
- `venues[]` – `{ id, name, address, emoji }`
- `sessions[]` – erfasste Trainings `{ id, teamId, trainingTypeId, date, durationMinutes, factor, attendance[{playerId,status}], note, venueId, checklist[{id,text,done}], erfasstVon }`
- `plannedSessions[]` – `{ id, teamId, trainingTypeId, durationMinutes, date, venueId, recordedId }`
- `seasons[]` – `{ id, teamId, name, startDate, endDate, phase, gamedays[{id,date,opponent,isHome,result}] }`
- `settings` – `{ trainerName }`

Anwesenheitsstatus: `present`, `injured_present`, `injured_absent`, `excused`, `absent`
mit Punktefaktor (1 / 0,5 / 0 / 0 / 0). Trainingsfaktor = Dauer / 60.

## Hauptbereiche (Views)

| Tab | Views | Funktion |
| --- | --- | --- |
| Start | `HomeView` | Neues Training, nächste 3 geplante, letzte 8 erfasste Trainings, aktive Saison |
| – | `NewSessionView` → `AttendanceView` | Wizard: Team/Art/Dauer/Halle → Anwesenheit, Notiz, Drill-Checkliste |
| – | `SessionDetailView` | Einheit ansehen, bearbeiten (Notiz, Anwesenheit, Drills), drucken, löschen |
| Kalender | `CalendarView`, `CalendarDayView` | Monatsraster mit Feiertagen/Schulferien BW, Training planen, geplantes Training erfassen |
| Teams | `TeamsView`, `TeamDetailView` | Teams, Kader, Verletzt-Flag, Spieler anlegen/zuordnen |
| – | `SeasonListView`, `NewSeasonView`, `SeasonDetailView`, `JahrgangUpgradeView` | Saisons, Phasen, Spieltage, Jahrgangswechsel |
| Stats | `StatsView` | Partizipations-Ranking, Filter Team/Saison/Art, Druck, Excel |
| Einst. | `SettingsView` | Trainingsarten, Hallen, Trainername, Datei-Sync, Excel-Export, Plan-Import, Backup/Restore, App-Version/Update |

Versteckte Funktionen, die erhalten bleiben müssen: Datei-Sync zwischen Trainern
(`erfasstVon`), CSV/XLSX-Planimport, Druckansichten, Jahrgangs-Upgrade, Migrationen alter
Datenformate in `loadData()`, Update-Banner für neue App-Versionen.

## PWA

- Manifest: Name „TrainerHub TV Bretten“, `display: standalone`, `orientation: portrait`,
  Theme `#f97316`, Hintergrund `#09090f`, Icons 192/512/maskable.
- Service Worker: Precache aller Assets (voll offline), Update per Prompt
  (`usePwaUpdate`), Fallback-Reload für iOS.
- iOS: `apple-mobile-web-app-status-bar-style: black-translucent`, aber **kein Safe-Area-Padding
  oben** → Header liegt in der installierten App unter der Statusleiste.
- Viewport: `maximum-scale=1, user-scalable=no` → Zoom gesperrt (Accessibility).

## Erkennbare technische Schulden

1. **Monolith:** Eine Datei mit ~3.350 Zeilen, Logik und UI vermischt.
2. **Styling:** Inline-Styles mit über 60 verschiedenen Hex-Werten, keine Tokens, kein Light Mode,
   Farben per String-Konkatenation mit Alpha (`color + "50"`).
3. **Datumsfehler:** `todayISO()` und `buildMonthGrid()` nutzen `toISOString()` (UTC).
   In Deutschland ist dadurch der Kalender um einen Tag verschoben (der 24.09.2026, ein
   Donnerstag, steht in der Spalte „Fr“), und zwischen 0 und 2 Uhr gilt „heute“ als gestern.
4. **Navigation:** Kein Verlauf. Zurück führt immer auf fest verdrahtete Ziele (z. B.
   Trainingsdetail → Start), Reload verliert die Position.
5. **Löschen ohne Rückfrage** (Trainings, Spieltage, geplante Trainings).
6. **Kein Datum beim Erfassen:** Trainings können nur für heute (oder ein geplantes Datum)
   erfasst werden, nicht nachgetragen.
7. **Keine Gesamtliste der Trainings:** Die Startseite zeigt nur die letzten 8. Ältere
   Einheiten sind nur über einzelne Kalendertage auffindbar.
8. **Bundle 711 kB** (xlsx ~ 400 kB) in einem Chunk; `xlsx@0.18.5` hat eine bekannte
   ReDoS-Lücke ohne npm-Fix (betrifft nur den Import selbst gewählter Dateien).
9. **Accessibility:** Buttons ohne Labels (Icon-only), keine Fokuszustände, kleine Schrift
   (10–12 px), gesperrter Zoom.
10. Keine Tests, kein Lint.

## Risiken des UX Refreshs

- **Datenkompatibilität:** Schema und Storage-Key dürfen sich nicht ändern. Bestehende
  Installationen und Backups/Sync-Dateien müssen weiter funktionieren.
- **Stille Regressionen** ohne Testnetz, besonders bei Anwesenheit/Punkten, Sync und Import.
  Die Geschäftslogik wird deshalb verschoben statt umgeschrieben.
- **PWA/iOS:** Safe Areas, Statusleiste, Update-Mechanismus und Offline-Cache dürfen
  nicht brechen.
- **Produktion:** Nur ein Merge auf `main` deployt. Auf `trainerhub-next` entwickeln.
