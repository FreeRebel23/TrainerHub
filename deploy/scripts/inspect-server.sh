#!/usr/bin/env bash
# Read-only Bestandsaufnahme eines Servers vor dem ersten TrainerHub-Deployment.
#
#   ssh <server> 'bash -s' < deploy/scripts/inspect-server.sh > server-inventory.txt
#
# Dieses Skript LIEST NUR. Es installiert, startet, stoppt, löscht und verändert nichts:
# keine Paketverwaltung, kein docker run/stop/rm/pull/network create, keine Schreibzugriffe
# außerhalb von stdout. Befehle, die fehlen oder Rechte brauchen, werden übersprungen.
# Mit sudo ausgeführt sieht es mehr (z. B. Prozesse hinter Ports), nötig ist es nicht.
#
# Die Ausgabe kann Domains, interne Pfade und Container-Namen enthalten – nicht öffentlich
# teilen (das Repository ist öffentlich; Ausgabe NICHT committen).

set -u
export LC_ALL=C
section() { printf '\n==================== %s ====================\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
run() { printf '\n$ %s\n' "$*"; timeout 20 "$@" 2>&1 | head -n "${LIMIT:-200}"; }

section "System"
run uname -a
[ -r /etc/os-release ] && run cat /etc/os-release
run uptime
run date -u
have timedatectl && run timedatectl show --property=Timezone --value
run nproc
run free -h
run df -hT -x tmpfs -x devtmpfs -x overlay

section "Docker"
if have docker; then
  run docker version --format 'Client {{.Client.Version}} / Server {{.Server.Version}}'
  run docker compose version
  run docker info --format 'Root: {{.DockerRootDir}} · Storage: {{.Driver}} · Cgroup: {{.CgroupDriver}} · Container: {{.Containers}} ({{.ContainersRunning}} laufend)'
  run docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  run docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}'
  run docker network ls
  for n in $(docker network ls --format '{{.Name}}' 2>/dev/null | grep -vE '^(bridge|host|none)$'); do
    printf '\n-- Netzwerk %s\n' "$n"
    docker network inspect "$n" --format 'Treiber {{.Driver}} · Subnetz {{range .IPAM.Config}}{{.Subnet}} {{end}}· Container: {{range $k,$v := .Containers}}{{$v.Name}} {{end}}' 2>&1
  done
  run docker volume ls
  # Labels verraten Traefik-/caddy-docker-proxy-/nginx-proxy-Konfigurationen
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    labels=$(docker inspect "$c" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' 2>/dev/null | grep -iE 'traefik|caddy|virtual_host|letsencrypt' | head -20)
    [ -n "$labels" ] && printf '\n-- Proxy-Labels %s\n%s\n' "$c" "$labels"
    mounts=$(docker inspect "$c" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null)
    [ -n "$mounts" ] && printf '\n-- Mounts %s\n%s\n' "$c" "$mounts"
  done
else
  echo "docker nicht gefunden"
fi

section "Belegte Ports (lauschend)"
if have ss; then run ss -tulpn; elif have netstat; then run netstat -tulpn; else echo "weder ss noch netstat"; fi

section "Reverse Proxy / Webserver (Erkennung)"
for bin in nginx caddy traefik apache2 httpd haproxy; do have "$bin" && echo "gefunden: $bin ($(command -v "$bin"))"; done
have nginx && run nginx -v
have caddy && run caddy version
have systemctl && run systemctl list-units --type=service --state=running --no-pager
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/caddy /etc/traefik /opt/traefik /etc/apache2/sites-enabled; do
  [ -d "$d" ] && { printf '\n-- %s\n' "$d"; ls -la "$d" 2>&1; }
done
# Nur Servernamen und Upstreams, keine vollständigen Konfigurationen (können Secrets enthalten)
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -r "$f" ] && { printf '\n-- %s\n' "$f"; grep -nE '^\s*(server_name|listen|proxy_pass|root)\b' "$f" 2>/dev/null | head -40; }
done
[ -r /etc/caddy/Caddyfile ] && { printf '\n-- /etc/caddy/Caddyfile (Site-Adressen und reverse_proxy)\n'; grep -nE '^[^[:space:]#].*\{|reverse_proxy|import' /etc/caddy/Caddyfile | head -60; }

section "TLS / Zertifikate"
[ -d /etc/letsencrypt/live ] && run ls -la /etc/letsencrypt/live
have certbot && run certbot certificates
for d in /var/lib/caddy /root/.local/share/caddy; do [ -d "$d" ] && run ls -la "$d"; done

section "Verzeichnisse / vorhandene Deployments"
for d in /opt /srv /var/www /home; do [ -d "$d" ] && run ls -la "$d"; done
LIMIT=80 run find /opt /srv /home -maxdepth 4 \( -name 'docker-compose.y*ml' -o -name 'compose.y*ml' \) -not -path '*/node_modules/*'

section "Backups"
have crontab && run crontab -l
run ls -la /etc/cron.d /etc/cron.daily
have systemctl && run systemctl list-timers --all --no-pager
for d in /var/backups /backup /backups /mnt; do [ -d "$d" ] && run ls -la "$d"; done
for bin in restic borg rclone rsync; do have "$bin" && echo "gefunden: $bin"; done
[ -r /proc/mounts ] && run grep -E 'cifs|nfs|sshfs|fuse' /proc/mounts

section "Firewall (nur lesen)"
have ufw && run ufw status verbose
have nft && run nft list ruleset
have iptables && run iptables -S

section "DNS (Auflösung geplanter Namen)"
for name in ${TRAINERHUB_CANDIDATE_DOMAINS:-trainerhub-staging.florianfreiberger.de}; do
  if have dig; then run dig +short "$name" A; run dig +short "$name" AAAA; else run getent hosts "$name"; fi
done
run hostname -I

section "Ende"
echo "Bestandsaufnahme abgeschlossen – es wurde nichts verändert."
