# TrainerHub

Trainingsmanagement für TV Bretten Basketball — Spieler, Teams, Trainingsarten,
Hallen, Trainingserfassung und Statistiken. Läuft als installierbare PWA
(iPhone & MacBook), aktuell mit lokaler Speicherung (`localStorage`).

## Entwicklung

Voraussetzung: Node 22+ (CI nutzt Node 24).

```bash
npm ci             # Abhängigkeiten exakt nach package-lock installieren
npm run dev        # Dev-Server (Vite)
npm run lint       # ESLint
npm test           # Unit-Tests (Vitest)
npm run build      # Production-Build nach dist/
npm run preview    # Production-Build lokal testen (inkl. Service Worker)
npm run check      # lint + test + build
npm run icons      # PWA-Icons aus scripts/gen-icons.mjs neu generieren
```

**Deployment:** GitHub Actions baut und veröffentlicht auf GitHub Pages – ausschließlich bei
Push auf `main`. Feature-Branches deployen nicht.

## Aufbau

| Pfad | Zweck |
|---|---|
| `src/App.jsx` | Verdrahtung: Daten, Navigation, Theme, Ansichten |
| `src/lib/` | Fachlogik ohne UI: Daten/Persistenz (`data.js`), Trainingszyklus (`training.js`), Entwurf laufender Trainings (`draft.js`), Datum/Feiertage (`dates.js`), Import/Export/Druck (`io.js`), Navigation (`nav.js`), Theme (`theme.js`) |
| `src/views/` | Screens: Start, Trainingsbuch, Kalendertag, Erfassen, Training, Teams, Saisons, Auswertung, Einstellungen |
| `src/components/` | App-Shell, UI-Primitive, Anwesenheit/Übungen |
| `src/styles/` | Design-Tokens (`tokens.css`, Light/Dark) und Komponenten-CSS (`app.css`) |
| `src/usePwaUpdate.js` | Service-Worker-Update (Banner + manueller Check) |
| `vite.config.js` | Build + PWA-Manifest (Offline-Cache via Workbox) |
| `docs/` | Architektur-Bestandsaufnahme und UX-Refresh-Dokumentation |

Daten liegen lokal unter `localStorage["trainerhub_v1"]`, die Theme-Wahl unter
`localStorage["trainerhub_theme"]`, der Entwurf eines laufenden Trainings unter
`localStorage["trainerhub_draft"]`.

## Stand

- ✅ Installierbare PWA, offline nutzbar
- ✅ UX Refresh (Phase 1): Trainingsbuch, Light/Dark, Mobile & Desktop – siehe `docs/UX_REFRESH.md`
- ✅ Trainingsplanung & -dokumentation (Phase 2): planen, vorbereiten, durchführen, duplizieren,
  Saisonübersicht – siehe `docs/PHASE2_TRAINING_WORKFLOW.md`
- ⬜ Geräteübergreifender Sync (PocketBase auf Hetzner) – Phase 3

## Nächste Phase: Geräte-übergreifender Sync (PocketBase)

Damit mehrere Trainer:innen dieselben Daten sehen, ersetzt eine dünne Sync-Schicht das
direkte `localStorage`. Der App-Code bleibt fast unverändert: `loadData()`/`persist()` in
`src/lib/data.js` werden durch eine Funktion ersetzt, die zusätzlich mit dem Server
synchronisiert und offline eine Sync-Queue füllt.

Leitbild und Prinzipien: [`NORTH_STAR.md`](NORTH_STAR.md).
