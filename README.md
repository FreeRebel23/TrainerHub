# TrainerHub

Trainingsmanagement für Vereine (gestartet mit TV Bretten Basketball) — Spieler, Teams,
Trainingsarten, Hallen, Trainingsplanung, -erfassung und Statistiken. Läuft als installierbare,
offlinefähige PWA (iPhone & MacBook). Ohne Server rein lokal (`localStorage`); im Servermodus
(Phase 3) zusätzlich mit Konten, Team-Rechten und Sync über PocketBase.

## Entwicklung

Voraussetzung: Node 22+ (CI nutzt Node 24).

```bash
npm ci             # Abhängigkeiten exakt nach package-lock installieren
npm run dev        # Dev-Server (Vite)
npm run lint       # ESLint
npm test           # Unit-Tests (Vitest)
npm run test:integration  # Integrationstests gegen echte PocketBase (lädt die gepinnte Version)
npm run build      # Production-Build nach dist/
npm run preview    # Production-Build lokal testen (inkl. Service Worker)
npm run check      # lint + test + test:integration + build
npm run icons      # PWA-Icons aus scripts/gen-icons.mjs neu generieren
```

Servermodus lokal ausprobieren: `npm run pb:fetch`, PocketBase mit `pocketbase/pb_migrations`
starten und die App mit `VITE_SYNC_SERVER=http://127.0.0.1:8090 npm run dev` bauen – oder den
Docker-Stack in `deploy/` verwenden (siehe `docs/PHASE3_SYNC_AND_SERVER.md`).

**Deployment:**
- GitHub Pages (Produktion, rein lokal): ausschließlich bei Push auf `main`, erst nach Lint und Tests.
- Staging (Hetzner, Servermodus): Docker-Stack aus `deploy/`, per GitHub Actions nur nach grünen
  Checks und nur, wenn ausdrücklich freigeschaltet – siehe `docs/HETZNER_DEPLOYMENT_HANDOFF.md`.

## Aufbau

| Pfad | Zweck |
|---|---|
| `src/App.jsx` | Verdrahtung: Daten, Navigation, Theme, Ansichten |
| `src/sync/` | Phase 3: Sync-Schicht – Abbildung lokal ↔ Server (`mapping.js`), Dreiwege-Abgleich (`engine.js`), Durchlauf (`runner.js`), REST-Client (`client.js`), Konto/Status/Erstübernahme (`controller.js`), Altdaten-Übernahme (`legacy.js`), React-Anbindung (`useSyncedData.js`) |
| `src/lib/` | Fachlogik ohne UI: Daten/Persistenz (`data.js`), Trainingszyklus (`training.js`), Entwurf laufender Trainings (`draft.js`), Datum/Feiertage (`dates.js`), Import/Export/Druck (`io.js`), Navigation (`nav.js`), Theme (`theme.js`) |
| `src/views/` | Screens: Start, Trainingsbuch, Kalendertag, Erfassen, Training, Teams, Saisons, Auswertung, Einstellungen |
| `src/components/` | App-Shell, UI-Primitive, Anwesenheit/Übungen |
| `src/styles/` | Design-Tokens (`tokens.css`, Light/Dark) und Komponenten-CSS (`app.css`) |
| `src/usePwaUpdate.js` | Service-Worker-Update (Banner + manueller Check) |
| `vite.config.js` | Build + PWA-Manifest (Offline-Cache via Workbox) |
| `pocketbase/` | Server: Migrationen (Schema + Zugriffsregeln), Hooks, Dockerfile, gepinnte Version |
| `deploy/` | Docker-Compose-Stack, nginx für die PWA, Backup/Restore/Deploy/Status, read-only Server-Inspektion |
| `scripts/pb-admin.mjs` | Verein, Abteilung, Konten, Teams und Zugriffe verwalten |
| `test/integration/`, `e2e/` | Integrationstests (echte PocketBase) und Browser-Ende-zu-Ende |
| `docs/` | Architektur, UX-Refresh, Phase 2, Phase 3 (Sync & Server), Hetzner-Handoff |

Daten liegen lokal unter `localStorage["trainerhub_v1"]`, die Theme-Wahl unter
`localStorage["trainerhub_theme"]`, der Entwurf eines laufenden Trainings unter
`localStorage["trainerhub_draft"]`. Im Servermodus zusätzlich Konto/Status unter
`trainerhub_sync` und der letzte gemeinsame Stand mit dem Server unter `trainerhub_sync_base`.

## Stand

- ✅ Installierbare PWA, offline nutzbar
- ✅ UX Refresh (Phase 1): Trainingsbuch, Light/Dark, Mobile & Desktop – siehe `docs/UX_REFRESH.md`
- ✅ Trainingsplanung & -dokumentation (Phase 2): planen, vorbereiten, durchführen, duplizieren,
  Saisonübersicht – siehe `docs/PHASE2_TRAINING_WORKFLOW.md`
- ✅ Zentraler Sync, Konten, Team-Rechte, Erstübernahme, Docker-Stack (Phase 3) – siehe
  `docs/PHASE3_SYNC_AND_SERVER.md`; Staging auf Hetzner: `docs/HETZNER_DEPLOYMENT_HANDOFF.md`

Leitbild und Prinzipien: [`NORTH_STAR.md`](NORTH_STAR.md).
