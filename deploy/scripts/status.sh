#!/usr/bin/env bash
# Kurzer Betriebsstatus des TrainerHub-Stacks (nur lesend).
set -uo pipefail
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"
set -a; [ -f .env ] && . ./.env; set +a
echo "== Container"; docker compose ps
echo "== Health"
curl -fsS "http://${WEB_BIND:-127.0.0.1:18090}/healthz" && echo "web ok" || echo "web FEHLER"
curl -fsS "http://${WEB_BIND:-127.0.0.1:18090}/api/health" >/dev/null && echo "api ok (über web)" || echo "api FEHLER"
echo "== Letzte PocketBase-Logs"; docker compose logs --tail=20 pocketbase
echo "== Backups"; ls -1t "${BACKUP_DIR:-./backups}" 2>/dev/null | head -5
echo "== PocketBase-eigene Backups"; ls -1t "${PB_DATA_DIR:-./data/pb_data}/backups" 2>/dev/null | head -3
echo "== Speicher"; du -sh "${PB_DATA_DIR:-./data/pb_data}" 2>/dev/null; df -h "${PB_DATA_DIR:-./data/pb_data}" 2>/dev/null | tail -1
