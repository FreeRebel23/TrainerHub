# TrainerHub

Trainingsmanagement für TV Bretten Basketball — Spieler, Teams, Trainingsarten,
Hallen, Trainingserfassung und Statistiken. Läuft als installierbare PWA
(iPhone & MacBook), aktuell mit lokaler Speicherung (`localStorage`).

## Entwicklung

```bash
npm install        # Abhängigkeiten installieren (einmalig)
npm run dev        # Dev-Server (Vite)
npm run build      # Production-Build nach dist/
npm run preview    # Production-Build lokal testen
npm run icons      # PWA-Icons aus scripts/gen-icons.mjs neu generieren
```

## Aufbau

| Datei | Zweck |
|---|---|
| `src/App.jsx` | Komplette App (UI + Logik), speichert unter `localStorage["trainerhub_v1"]` |
| `src/main.jsx` | React-Einstiegspunkt |
| `vite.config.js` | Build + PWA-Manifest (Offline-Cache via Workbox) |
| `index.html` | iOS-PWA-Meta-Tags |
| `scripts/gen-icons.mjs` | Generiert die App-Icons (`public/`) |

## Stand

- ✅ Lauffähige, installierbare PWA mit Offline-Cache der App selbst
- ⬜ Offline-First Sync (PocketBase auf Hetzner) — geplante zweite Phase

## Nächste Phase: Geräte-übergreifender Sync (PocketBase)

Damit Florian & Rüdiger dieselben Daten sehen, ersetzt eine dünne Sync-Schicht
das direkte `localStorage`. Erfordert Server-Setup (Hetzner + Domain), siehe
Projektplan. Der App-Code bleibt fast unverändert: `loadData()`/`persist()` in
`src/App.jsx` werden durch eine Funktion ersetzt, die zusätzlich mit dem Server
synchronisiert und offline eine Sync-Queue füllt.
