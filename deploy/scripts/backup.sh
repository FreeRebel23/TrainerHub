#!/usr/bin/env bash
# Konsistente Sicherung der PocketBase-Daten des TrainerHub-Stacks.
#
#   deploy/scripts/backup.sh            # aus dem Verzeichnis deploy/ oder mit DEPLOY_DIR
#
# Ablauf: PocketBase kurz anhalten (wenige Sekunden) → pb_data als .tar.gz sichern →
# PocketBase wieder starten → Prüfsumme schreiben → alte Sicherungen aufräumen (BACKUP_KEEP).
# Zusätzlich legt PocketBase selbst täglich Backups in pb_data/backups an (siehe Migration);
# diese sind in jedem Snapshot enthalten.
# Für eine Kopie außerhalb des Servers: BACKUP_DIR auf ein eingebundenes Ziel legen oder
# danach per rsync übertragen (Ziel ist Teil der Server-Bestandsaufnahme).
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$DEPLOY_DIR"
set -a; [ -f .env ] && . ./.env; set +a

PB_DATA_DIR="${PB_DATA_DIR:-./data/pb_data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
PROJECT="${COMPOSE_PROJECT_NAME:-trainerhub-staging}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/${PROJECT}-pb_data-${STAMP}.tar.gz"

[ -d "$PB_DATA_DIR" ] || { echo "PB_DATA_DIR $PB_DATA_DIR fehlt" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

was_running=0
if [ -n "$(docker compose ps -q --status running pocketbase 2>/dev/null)" ]; then
  was_running=1
  docker compose stop pocketbase >/dev/null
fi
restart() { if [ "$was_running" = 1 ]; then docker compose start pocketbase >/dev/null; fi; }
trap restart EXIT

tar -C "$(dirname "$PB_DATA_DIR")" -czf "$TARGET.partial" "$(basename "$PB_DATA_DIR")"
mv "$TARGET.partial" "$TARGET"
restart; trap - EXIT

( cd "$BACKUP_DIR" && sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256" )
tar -tzf "$TARGET" >/dev/null   # Archiv lesbar?

# Aufräumen: nur eigene Snapshots dieses Projekts, die neuesten BACKUP_KEEP behalten
ls -1t "$BACKUP_DIR"/"${PROJECT}"-pb_data-*.tar.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  rm -f -- "$old" "$old.sha256"
done

echo "Backup: $TARGET ($(du -h "$TARGET" | cut -f1))"
