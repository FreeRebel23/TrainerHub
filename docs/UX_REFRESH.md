# TrainerHub – UX Refresh (Phase 1)

Stand: 24.09.2026, Branch `trainerhub-next`. Ausgangslage siehe
[`ARCHITECTURE_CURRENT.md`](ARCHITECTURE_CURRENT.md), Leitbild siehe [`../NORTH_STAR.md`](../NORTH_STAR.md).

## Was sich verändert hat

- **Designsprache:** ruhig, neutral, eine Akzentfarbe (Teal wie auf florianfreiberger.de),
  System-Schrift, Hierarchie über Typografie und Weißraum statt über Farben, Emoji und Karten.
  Light und Dark sind zwei eigenständig abgestimmte Paletten.
- **Informationsarchitektur:** Start · Trainingsbuch · Teams · Auswertung, dazu
  „Mehr“/Einstellungen. Der frühere Kalender-Tab ist jetzt eine Ansicht im Trainingsbuch.
- **Trainingsbuch (neu als Kernbereich):** alle Einheiten nach Monat gruppiert, Suche über
  Notizen, Übungen, Halle und Team, Teamfilter, offene und geplante Einheiten, Kalender-Modus.
  Bisher waren nur die letzten 8 Trainings auffindbar.
- **Start:** zeigt nur, was jetzt relevant ist: heute geplantes Training mit direktem
  „Anwesenheit erfassen“, geplante, aber nicht erfasste Einheiten der letzten 14 Tage, die nächsten
  Trainings und das nächste Spiel (chronologisch), die letzten 3 Einheiten.
- **Erfassen:** Datum wählbar (Nachtragen), Team/Art/Dauer/Halle als Chips, „Alle dabei“,
  weitere Status nur auf Wunsch, Notiz und Übungen per Progressive Disclosure, Speichern
  fest im Daumenbereich. Zurück (auch Wischgeste/Android) führt von der Anwesenheit zurück zum
  ersten Schritt, ohne Eingaben zu verlieren.
- **Trainingseinheit:** Inhalt zuerst (Datum, Art, Team, Halle, Kennzahlen, Notiz, Übungen,
  Anwesenheit nach Status). Übungen lassen sich direkt abhaken, zum Beispiel während des
  Trainings. Bearbeiten nutzt dieselben Bausteine wie das Erfassen.
- **Teams/Saison:** ruhige Listen, Verletzt-Status nur sichtbar, wenn zutreffend, nächstes Spiel
  im Team, Spieltage mit Datumsblock, Phasenwahl als Chips, Jahrgangswechsel als Liste.
- **Auswertung:** Kennzahlen inline (Trainings, Stunden, Ø Anwesenheit), Filter als Chips,
  Beteiligung als Rangliste mit dezentem Balken statt Medaillen.
- **Einstellungen:** Darstellung (System/Hell/Dunkel), Profil, Trainingsarten, Hallen,
  Abgleich, Excel, Planimport, Datensicherung, App-Version, klar gruppiert.
- **Sicherheit vor Datenverlust:** Rückfragen vor dem Löschen von Trainings, Planungen,
  Spieltagen, Kaderzuordnungen und vor dem Einspielen eines Backups.

## Designprinzipien

1. Werkzeug vor Dashboard: pro Screen eine erkennbare Hauptaktion.
2. Karten nur für den einen Fokus (Start) und Formularblöcke, sonst Listen mit Haarlinien.
3. Farbe transportiert Bedeutung (Akzent = Aktion/Auswahl, Status = Zustand), nie Dekoration.
4. Keine Emoji in der Oberfläche. Emoji von Trainingsarten und Hallen bleiben als Daten
   erhalten (Einstellungen, Druck).
5. Maximal Schriftgewicht 600, Labels in Normalschreibung, keine Versalien mit Sperrung.
6. Bewegung nur zur Orientierung (Aufklappen, Theme-Wechsel, Update-Hinweis),
   `prefers-reduced-motion` wird respektiert.

## Navigation

| Bereich | Mobil (Tab-Leiste) | Desktop (Sidebar ≥ 900 px) | Ansichten |
| --- | --- | --- | --- |
| Start | Start | Start | `home` |
| Trainingsbuch | Training | Trainingsbuch | `training` (Liste/Kalender), `calendar_day`, `session_detail`, `new_session` |
| Teams | Teams | Teams | `teams`, `team_detail`, `season_*`, `jahrgang_upgrade` |
| Auswertung | Auswertung | Auswertung | `stats` |
| Einstellungen | Mehr | Fußbereich + Theme-Umschalter | `settings` |

`src/lib/nav.js` speichert `{ view, params, depth }` im `history.state`, ohne die URL zu
ändern. Dadurch funktionieren Browser-Zurück und Reload, und die App bleibt unter `./`
(PWA-Scope, GitHub-Pages-Unterordner). Tab-Wechsel setzen die Tiefe auf 0. `back()` geht einen
echten Schritt zurück oder, ohne Verlauf, zur Elternansicht. `finishFlow()` verlässt nach dem
Speichern die Schritte des Assistenten.

Fokusansichten (`new_session`, `new_season`, `jahrgang_upgrade`) blenden die Tab-Leiste aus.
Die Aktionsleiste sitzt dort immer unten.

## Theme-System

- Tokens in `src/styles/tokens.css`: Flächen (`--bg`, `--surface`, `--surface-2/3`), Text
  (`--text`, `--text-2`, `--text-3`), Linien, Akzent, Semantik (success/warning/danger/info/muted,
  jeweils mit `-subtle`), Radius, Abstände (4er-Raster), Schatten, Typografie, Layout, Bewegung.
- Dark: `:root[data-theme="dark"]`, warmes Anthrazit `#1a1918` statt Schwarz, gestufte Flächen,
  gedämpfter Mint-Akzent.
- Präferenz `system | light | dark` in `localStorage["trainerhub_theme"]`, bewusst getrennt von
  den Trainingsdaten (Backups/Sync bleiben unberührt). Ein Inline-Script in `index.html` setzt das
  Theme vor dem ersten Rendern. `useTheme()` folgt dem System live und setzt `theme-color`.
- Umschalten: Einstellungen → Darstellung (drei Optionen), Desktop zusätzlich per Klick in der
  Sidebar.
- Tonalitäten per Klasse (`tone-success` …) setzen `--tone`/`--tone-subtle`. Status, Phasen und
  Hinweise nutzen dieselbe Mechanik.

## Komponenten

`src/components/ui.jsx`: `Button` (primary/secondary/ghost/accent-ghost/danger, sm/lg),
`IconButton` (Label Pflicht), `PageHeader`, `PageIntro`, `Section`, `Row`, `Meta`, `Field`,
`ChoiceChips`, `Segmented`, `Notice`, `EmptyState`, `DateBlock`.
`src/components/training.jsx`: `AttendanceList` und `DrillList` (Erfassen und Bearbeiten),
`quickToggle` (Antippen-Logik inkl. Verletzten-Regel).
`src/components/AppShell.jsx`: Sidebar, Tab-Leiste, Zuordnung Ansicht → Bereich.

Styling liegt ausschließlich in `src/styles/app.css`, ohne Inline-Styles. Einzige Ausnahme ist
die dynamische Balkenbreite in der Auswertung.

## Responsive-Konzept

- Mobile first, geprüft bei 320, 375, 768, 1280 px ohne horizontales Scrollen.
- < 900 px: Tab-Leiste unten (Safe Area), Seitenränder 16 px bzw. 32 px ab 768 px.
- ≥ 900 px: Sidebar 232 px, Inhalt auf 760 px Lesebreite zentriert (Kalender 1040 px).
- Touch-Ziele mindestens 44 px, Eingaben 16 px (kein iOS-Zoom), Zoom wieder erlaubt.
- Safe Areas oben/unten/seitlich (Notch, Home-Indikator, Landscape).
- Sticky-Aktionsleisten über der Tab-Leiste bzw. am unteren Rand in Fokusansichten.

## Technische Änderungen

- `src/App.jsx` von 3.350 auf ca. 90 Zeilen reduziert. Logik in `src/lib/`, Screens in `src/views/`.
- Datumsfehler behoben (lokales Datum statt UTC). Der Kalender war in Deutschland um einen Tag
  verschoben.
- `xlsx`/`papaparse` werden bei Bedarf geladen: Haupt-Bundle 711 kB → 256 kB, weiterhin
  im Precache (offline nutzbar).
- Druckansichten maskieren Nutzereingaben (Schutz bei importierten Sync-Dateien).
- ESLint (`npm run lint`) und Vitest (`npm test`, 19 Tests für Datum, Migration, Ranking,
  Planimport, Sync, Anwesenheitslogik). `npm run check` führt beides plus Build aus.
- PWA: Manifest-Farben neutral, `theme-color` folgt dem Theme, iOS-Statusleiste `default`
  (vorher lag der Header unter der Statusleiste), neue Icons (weißes „TH“ auf Teal).
- Unverändert: Datenformat, Storage-Key `trainerhub_v1`, Migrationen, Sync-/Backup-Format,
  Update-Mechanismus (`usePwaUpdate`), Deployment-Workflow.

## Bekannte offene UX-Punkte

- **Statusleiste iOS:** `apple-mobile-web-app-status-bar-style` wird nur beim Installieren
  gelesen. Wählt man in der App ein anderes Theme als das System, passt die Statusleiste nicht
  zum App-Hintergrund.
- **Icon-Wechsel:** Bereits installierte iOS-Apps behalten ihr altes Icon bis zur Neuinstallation.
- **Kein „Schwerpunkt“-Feld:** Der Schwerpunkt einer Einheit steckt heute in der freien Notiz.
  Ein eigenes Feld (oder Tags) würde Suche und Saisonübersicht deutlich verbessern.
- **Geplante Trainings** lassen sich nicht bearbeiten (nur löschen/neu anlegen) und haben keine
  Uhrzeit.
- **Spieler:innen** lassen sich nicht umbenennen oder global löschen (war vorher auch nicht möglich).
- **Bestätigungen** nutzen `window.confirm`. Das ist funktional, aber optisch nicht im Design.
  Eine kleine Rückgängig-Meldung wäre angenehmer.
- **`xlsx@0.18.5`** hat eine bekannte ReDoS-Lücke ohne npm-Fix (betrifft nur selbst gewählte
  Importdateien). Ein Wechsel auf das SheetJS-CDN-Paket oder eine CSV-only-Lösung ist sinnvoll.
- **Orientierung** im Manifest bleibt `portrait` (bisheriges Verhalten). Für Tablets wäre `any`
  denkbar.

## Sinnvolle nächste Schritte

1. **Trainingsbuch vervollständigen (Phase 2):** Schwerpunkt/Tags je Einheit, geplante Einheiten
   bearbeiten (inkl. Uhrzeit und vorbereiteter Übungen), Einheit als Vorlage duplizieren,
   Saisonübersicht „was wurde wie oft trainiert“. Damit wird Excel überflüssig.
2. Übungen als wiederverwendbare Bibliothek (aus bestehenden Checklisten ableitbar).
3. Danach Phase 3: Sync-Schicht (PocketBase) hinter `loadData()`/`persist()` in `src/lib/data.js`.
