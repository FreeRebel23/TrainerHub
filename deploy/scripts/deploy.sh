#!/usr/bin/env bash
# Aktualisiert den TrainerHub-Stack auf den aktuell ausgecheckten Stand (auf dem Server
# ausführen, im Repository-Checkout). Von GitHub Actions per SSH aufgerufen oder von Hand.
#   1. Sicherung (falls schon Daten existieren)
#   2. Images bauen, Stack starten (Migrationen laufen beim Start von PocketBase)
#   3. Gesundheitsprüfung – bei Fehler Exit ≠ 0 (Rückweg: siehe Handoff-Doku)
# Ausgabe bewusst knapp (öffentliche CI-Logs).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "deploy/.env fehlt" >&2; exit 1; }
set -a; . ./.env; set +a

echo "Stand: $(git -C .. rev-parse --short HEAD)"
if [ -d "${PB_DATA_DIR:-./data/pb_data}" ] && [ -n "$(ls -A "${PB_DATA_DIR:-./data/pb_data}" 2>/dev/null)" ]; then
  ./scripts/backup.sh >/dev/null && echo "Backup erstellt"
fi
export TRAINERHUB_IMAGE_TAG="$(git -C .. rev-parse --short HEAD)"
docker compose build --quiet
docker compose up -d --remove-orphans --wait --wait-timeout 120
curl -fsS "http://${WEB_BIND:-127.0.0.1:18090}/healthz" >/dev/null
curl -fsS "http://${WEB_BIND:-127.0.0.1:18090}/api/health" >/dev/null
echo "TrainerHub läuft (web + api gesund)"
