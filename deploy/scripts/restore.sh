#!/usr/bin/env bash
# Stellt PocketBase-Daten aus einer Sicherung wieder her.
#
#   deploy/scripts/restore.sh <backup.tar.gz | pocketbase-backup.zip>
#
# Der aktuelle Datenstand wird NICHT gelöscht, sondern nach pb_data.before-restore-<zeit>
# verschoben. Danach startet PocketBase mit dem wiederhergestellten Stand und wird geprüft.
set -euo pipefail

ARCHIVE="${1:?Aufruf: restore.sh <backup.tar.gz|backup.zip>}"
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"
set -a; [ -f .env ] && . ./.env; set +a
PB_DATA_DIR="${PB_DATA_DIR:-./data/pb_data}"
STAMP="$(date +%Y%m%d-%H%M%S)"

[ -f "$ARCHIVE" ] || { echo "Archiv nicht gefunden: $ARCHIVE" >&2; exit 1; }
if [ -f "$ARCHIVE.sha256" ]; then ( cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" ); fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
case "$ARCHIVE" in
  *.tar.gz) tar -C "$STAGE" -xzf "$ARCHIVE"; SRC="$(find "$STAGE" -mindepth 1 -maxdepth 1 -type d | head -1)";;
  *.zip)    mkdir -p "$STAGE/pb_data"; unzip -q "$ARCHIVE" -d "$STAGE/pb_data"; SRC="$STAGE/pb_data";;
  *) echo "Unbekanntes Format" >&2; exit 1;;
esac
[ -f "$SRC/data.db" ] || { echo "Keine PocketBase-Datenbank im Archiv" >&2; exit 1; }

docker compose stop pocketbase >/dev/null 2>&1 || true
if [ -d "$PB_DATA_DIR" ]; then mv "$PB_DATA_DIR" "${PB_DATA_DIR}.before-restore-${STAMP}"; fi
mkdir -p "$(dirname "$PB_DATA_DIR")"
cp -a "$SRC" "$PB_DATA_DIR"
# Container läuft als UID 10001
chown -R 10001:10001 "$PB_DATA_DIR" 2>/dev/null || echo "Hinweis: chown nicht möglich – ggf. mit sudo ausführen"

docker compose up -d pocketbase >/dev/null
for i in $(seq 1 30); do
  if docker compose exec -T pocketbase wget -q -O /dev/null http://127.0.0.1:8090/api/health 2>/dev/null; then
    echo "Wiederhergestellt aus $ARCHIVE. Vorheriger Stand: ${PB_DATA_DIR}.before-restore-${STAMP}"
    exit 0
  fi
  sleep 1
done
echo "PocketBase meldet sich nicht gesund – Logs: docker compose logs pocketbase" >&2
exit 1
