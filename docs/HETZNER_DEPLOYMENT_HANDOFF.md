# TrainerHub – Hetzner-Deployment (Handoff)

Diese Anleitung ist für die **spätere lokale Claude-Code-Session bzw. dich** mit echtem SSH-Zugang.
Die Cloud-Session, die Phase 3 gebaut hat, konnte den Server nicht erreichen. Anwendung, Docker-Stack,
Backup/Restore und Tests sind lokal verifiziert (siehe [`PHASE3_SYNC_AND_SERVER.md`](PHASE3_SYNC_AND_SERVER.md)).
**Über den realen Server ist nichts festgelegt** – alle serverspezifischen Werte entstehen erst aus
der Bestandsaufnahme in Schritt 2.

Grundsätze: nichts Bestehendes ersetzen, stoppen oder umkonfigurieren, was nicht zu TrainerHub
gehört. Keine Ports blind belegen. Keine bestehende Domain ändern. Die GitHub-Pages-Produktion
bleibt unangetastet. Zuerst nur Staging.

## 1. Annahmen von Phase 3 über die Zielumgebung

| Annahme | Warum | Falls nicht erfüllt |
| --- | --- | --- |
| Linux x86_64 (amd64) oder arm64 | PocketBase-Image mit Prüfsummen für beide | andere Architektur: Dockerfile-ARG ergänzen |
| Docker Engine ≥ 24 mit **Compose v2 ≥ 2.24** | `docker compose`, `--wait`, `!reset` im Proxy-Override | Compose aktualisieren lassen (nicht selbst ohne Absprache) |
| Ein vorhandener Reverse Proxy terminiert TLS für neue Subdomains | TrainerHub bringt bewusst keinen öffentlichen Proxy mit | Proxy-Technik nach Bestandsaufnahme wählen |
| Der Proxy erreicht TrainerHub entweder über `127.0.0.1:<port>` **oder** über ein gemeinsames Docker-Netzwerk | genau ein Upstream (`web`, Port 8080 im Container) | – |
| Der Proxy setzt `X-Forwarded-For` und `X-Forwarded-Proto` | echte Client-IP für Rate-Limits | ohne: Rate-Limit trifft alle gemeinsam (funktional ok, nur schwächer) |
| Der Server kann ausgehend GitHub erreichen (git fetch, PocketBase-Download beim Image-Build) und Docker Hub (Basis-Images) | Build auf dem Server | alternativ Images in CI bauen und in eine Registry pushen (nicht umgesetzt) |
| Freier Speicher ≥ 2 GB, RAM ≥ 512 MB frei | Build-Images (~500 MB Build-Cache), Laufzeit < 100 MB | – |
| Ein Verzeichnis außerhalb von `pb_data` bzw. ein externes Ziel für Backups | Backups nicht nur auf derselben Platte | Hetzner Storage Box o. Ä. |
| DNS für die Staging-Domain ist setzbar | `trainerhub-staging.florianfreiberger.de` (Wunsch) | anderen Namen nach bestehender Struktur wählen und hier dokumentieren |

Nicht angenommen: welcher Proxy (nginx, Caddy, Traefik, …), welche Ports frei sind, wie
Verzeichnisse organisiert sind, ob und wie gesichert wird, Firewall-Regeln.

## 2. Read-only Bestandsaufnahme vor dem Deployment

Zu klären (nur lesen, nichts ändern):

1. Betriebssystem, Architektur, Zeitzone, CPU/RAM/Platte
2. Docker- und Compose-Version, laufende Container, Compose-Projekte und deren Verzeichnisse
3. Docker-Netzwerke (insbesondere ein Netz, über das ein Proxy-Container Upstreams erreicht)
4. Lauschende Ports (Host) – welche sind belegt, welcher Bereich ist frei
5. Reverse Proxy: welche Software, als Dienst oder Container, wo liegt die Konfiguration, wie werden
   neue Sites/Subdomains üblicherweise angelegt (Datei je Site? Labels? Caddyfile-Block?)
6. TLS: Let's Encrypt über den Proxy selbst (Caddy/Traefik) oder certbot; Wildcard vorhanden?
7. Verzeichnisstruktur bestehender Deployments (`/opt`, `/srv`, `/home/<user>`)
8. Bestehende Backup-Strategie (Cron, Timer, restic/borg/rclone, Storage Box, gemountete Ziele)
9. Firewall (ufw/nftables/iptables) – nur lesen
10. DNS: löst die gewünschte Staging-Domain schon auf? Wohin zeigen andere Subdomains?

## 3. Befehle für die Bestandsaufnahme

Automatisch (empfohlen): Das Skript liest nur, installiert/stoppt/löscht nichts und schreibt nur
auf stdout.

```bash
ssh <server> 'bash -s' < deploy/scripts/inspect-server.sh > server-inventory.txt
# mit mehr Details (Prozesse hinter Ports):  ssh <server> 'sudo bash -s' < deploy/scripts/inspect-server.sh
# andere Domains prüfen:  ssh <server> 'TRAINERHUB_CANDIDATE_DOMAINS="a.example b.example" bash -s' < …
```

`server-inventory.txt` enthält interne Details – **nicht committen** (öffentliches Repository).

Manuell, falls gewünscht (alles lesend):

```bash
uname -a; cat /etc/os-release; nproc; free -h; df -h
docker version; docker compose version
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker network ls; docker network inspect <netz>
ss -tulpn                                   # belegte Ports
systemctl list-units --type=service --state=running
ls /etc/nginx/sites-enabled /etc/caddy /etc/traefik 2>/dev/null
certbot certificates 2>/dev/null; ls /etc/letsencrypt/live 2>/dev/null
crontab -l; systemctl list-timers
ufw status verbose 2>/dev/null
dig +short trainerhub-staging.florianfreiberger.de
```

## 4. Ports, Volumes, Netzwerke

| Ressource | Standard im Stack | Frei wählbar? | Hinweis |
| --- | --- | --- | --- |
| Upstream `web` (Host) | `127.0.0.1:18090` → Container 8080 | **ja** (`WEB_BIND`) | nur an 127.0.0.1 binden; entfällt bei Proxy-Netzwerk-Variante |
| PocketBase-Dashboard | `127.0.0.1:18091` → Container 8090 | **ja** (`PB_ADMIN_BIND`) | niemals öffentlich; Zugriff per SSH-Tunnel |
| Internes Netz | `<projekt>_internal` (wird angelegt) | Name folgt `COMPOSE_PROJECT_NAME` | kollidiert nicht mit Bestehendem |
| Proxy-Netzwerk (optional) | – | **ja** (`PROXY_NETWORK`) | bestehendes externes Netz; wird nur benutzt, nie angelegt oder verändert |
| Daten | `PB_DATA_DIR` (Standard `deploy/data/pb_data`) | **ja** | Besitzer UID/GID 10001 |
| Backups | `BACKUP_DIR` (Standard `deploy/backups`) | **ja** | außerhalb von `PB_DATA_DIR` |

Öffentlich exponiert TrainerHub **keinen** Port; nur der vorhandene Proxy spricht mit `web`.
Die Portnummern 18090/18091 sind Vorschläge – vor der Verwendung mit `ss -tulpn` prüfen.

## 5. Umgebungsvariablen und Secrets auf dem Server

`deploy/.env` (aus `deploy/.env.example`, Rechte `600`, nie committen):

| Variable | Inhalt | Secret? |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | z. B. `trainerhub-staging` | nein |
| `TRAINERHUB_PUBLIC_URL` | exakte Browser-Origin, z. B. `https://trainerhub-staging.florianfreiberger.de` | nein |
| `WEB_BIND`, `PB_ADMIN_BIND` | freie lokale Ports (Schritt 2) | nein |
| `PB_DATA_DIR`, `BACKUP_DIR`, `BACKUP_KEEP` | Pfade/Aufbewahrung | nein |
| `PB_ENCRYPTION_KEY` | `openssl rand -hex 16` – verschlüsselt PocketBase-Einstellungen (z. B. spätere SMTP-Zugangsdaten). **Nie ändern, getrennt sichern** (Passwortmanager) – ohne ihn startet ein Restore nicht | **ja** |
| `PROXY_NETWORK` | nur bei Proxy-Netzwerk-Variante | nein |

Weitere Secrets, die **nicht** in `.env` gehören:

- PocketBase-Superuser (E-Mail/Passwort): einmalig per CLI anlegen (Schritt 9), im Passwortmanager.
- Für den GitHub-Deploy (optional, Schritt 9): Environment `staging` mit `STAGING_SSH_HOST`,
  `STAGING_SSH_USER`, `STAGING_SSH_KEY` (eigener Deploy-Key, nur für diesen Zweck),
  `STAGING_SSH_KNOWN_HOSTS`; Variable `STAGING_DIR`; Repository-Variable `STAGING_DEPLOY_ENABLED=true`.

## 6. Anbindung an den vorhandenen Reverse Proxy

TrainerHub erwartet vom Proxy nur: **HTTPS für die Staging-Domain → HTTP an den `web`-Upstream**,
alle Pfade unverändert (`/`, `/api/…`), Header `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.
Kein Pfad-Präfix, keine Umschreibung, WebSockets nicht nötig. Uploads bis 10 MB.

Zwei Varianten – nach der Bestandsaufnahme eine wählen:

**A. Proxy läuft auf dem Host (nginx/Caddy/Apache als Dienst):** Upstream ist `http://127.0.0.1:<WEB_BIND-Port>`.
Beispiele nur zur Orientierung – an die vorhandenen Konventionen anpassen:

```nginx
# nginx: neue Datei für die Site (nicht in bestehende Sites einfügen)
server {
  server_name trainerhub-staging.example.org;
  # listen/ssl_* wie bei den vorhandenen Sites (certbot o. Ä.)
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:18090;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```caddy
# Caddy: eigener Site-Block (holt das Zertifikat selbst)
trainerhub-staging.example.org {
  reverse_proxy 127.0.0.1:18090
}
```

**B. Proxy läuft als Container (Traefik, caddy-docker-proxy, nginx-proxy):** `web` tritt dem
bestehenden Proxy-Netzwerk bei, ohne Host-Port:

```bash
PROXY_NETWORK=<vorhandenes-netz> docker compose -f compose.yaml -f compose.proxy-network.yaml up -d
```

Upstream ist dann `http://<projekt>-web-1:8080` bzw. der Service-Name `web`. Die für den Proxy
nötigen Labels (Traefik-Router, `caddy`-Labels, `VIRTUAL_HOST` …) werden erst ergänzt, wenn klar
ist, welcher Proxy läuft – am besten in einer weiteren Override-Datei, nicht in `compose.yaml`.

Danach die PocketBase-Origin prüfen: `TRAINERHUB_PUBLIC_URL` muss exakt der Browser-Origin
entsprechen (Schema + Host, ohne Slash). CORS ist darauf begrenzt; App und API teilen sich die Origin.

**PocketBase-Dashboard:** über den Proxy nicht erreichbar (`/_/` → 404 im `web`-Container). Zugriff:

```bash
ssh -L 18091:127.0.0.1:18091 <server>    # dann lokal http://127.0.0.1:18091/_/
```

## 7. Persistente Daten

- Einziger unverzichtbarer Zustand: `PB_DATA_DIR` → im Container `/pb/pb_data` (Bind-Mount).
  Enthält `data.db` (alle Daten und Konten), `auxiliary.db` (Logs), `backups/` (PocketBase-eigene
  tägliche Backups) und später `storage/` (Dateien, derzeit nicht genutzt).
- Container und Images sind jederzeit ersetzbar (`docker compose down && up -d --build`); Binary,
  Migrationen und Hooks stecken im Image, Daten nie.
- Vor dem ersten Start: `sudo install -d -o 10001 -g 10001 <PB_DATA_DIR>` (Container läuft ohne Root).
- Zusätzlich sichern: `deploy/.env` (enthält `PB_ENCRYPTION_KEY`) – getrennt, z. B. Passwortmanager.

## 8. Backup und Restore

| Was | Wie | Wie oft | Wohin |
| --- | --- | --- | --- |
| PocketBase-Backup (automatisch) | eingebaut, Migration setzt Cron | täglich 02:30 UTC, 14 behalten | `pb_data/backups/` |
| Konsistenter Snapshot | `deploy/scripts/backup.sh` (hält PocketBase wenige Sekunden an) | täglich per Cron + vor jedem Deploy (`deploy.sh`) | `BACKUP_DIR` |
| Kopie außer Haus | vorhandene Strategie aus Schritt 2 (z. B. rsync/restic auf Storage Box) | täglich | extern |
| Schlüssel | `PB_ENCRYPTION_KEY` | einmalig | Passwortmanager |

Cron-Beispiel (Pfad anpassen; vorher bestehende Cron-Struktur ansehen):

```cron
15 3 * * *  cd /pfad/zum/checkout/deploy && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Restore:

```bash
cd deploy
./scripts/restore.sh backups/<projekt>-pb_data-<zeit>.tar.gz     # oder pb_data/backups/<name>.zip
# aktueller Stand wird nach <PB_DATA_DIR>.before-restore-<zeit> verschoben, nicht gelöscht
```

Restore-Probe (einmal auf dem Server wiederholen, **getrennt vom laufenden Staging**): Kopie von
`deploy/` in ein Temp-Verzeichnis, dort `.env` mit anderem `COMPOSE_PROJECT_NAME` und anderen Ports,
`restore.sh <archiv>`, Datensätze vergleichen, danach `docker compose down -v`. Lokal bereits
durchgeführt: beide Formate, alle Collections identisch.

## 9. Staging erstmals starten

1. Bestandsaufnahme (Schritt 2/3) auswerten; Proxy-Variante, Ports, Verzeichnis, Backup-Ziel und
   Domain festlegen und **in diesem Dokument ergänzen** (Abschnitt „Ist-Zustand“ unten).
2. DNS: A/AAAA für die Staging-Domain auf den Server (bzw. vorhandene Wildcard nutzen).
3. Checkout anlegen (Beispiel): `git clone https://github.com/FreeRebel23/TrainerHub.git <dir> && cd <dir> && git checkout trainerhub-phase3`
4. `cd deploy && cp .env.example .env && chmod 600 .env` – Werte eintragen, `PB_ENCRYPTION_KEY` erzeugen.
5. `sudo install -d -o 10001 -g 10001 <PB_DATA_DIR>` und `mkdir -p <BACKUP_DIR>`
6. `./scripts/deploy.sh` (baut, startet, prüft Health)
7. Superuser anlegen, ohne Passwort in der Shell-History:
   ```bash
   read -rs PBPW; docker compose exec -T pocketbase /pb/pocketbase superuser upsert <mail> "$PBPW" \
     --dir /pb/pb_data --encryptionEnv=PB_ENCRYPTION_KEY; unset PBPW
   ```
8. Verein, Abteilung, Konten (per SSH-Tunnel auf das Dashboard-Port):
   ```bash
   export PB_URL=http://127.0.0.1:18091 PB_SUPERUSER_EMAIL=<mail>; read -rs PB_SUPERUSER_PASSWORD; export PB_SUPERUSER_PASSWORD
   node scripts/pb-admin.mjs bootstrap --org "TV Bretten" --section Basketball
   node scripts/pb-admin.mjs user --email <florian> --name Florian --org-admin      # gibt Startpasswort einmalig aus
   node scripts/pb-admin.mjs user --email <co-trainer> --name "…"
   # Teams entstehen beim ersten Upload; danach Zugriff geben:
   node scripts/pb-admin.mjs grant --email <co-trainer> --team U16w
   node scripts/pb-admin.mjs overview
   ```
   (Node 22 lokal oder auf dem Server; alternativ alles im Dashboard.)
9. Reverse Proxy anbinden (Schritt 6), Konfiguration testen und neu laden – nur die neue Site.
10. Backup-Cron und Kopie außer Haus einrichten (Schritt 8), Restore-Probe durchführen.
11. Optional GitHub-Deploy: Deploy-Key (nur für diesen Zweck) in `authorized_keys` des Deploy-Users,
    Secrets/Variablen aus Schritt 5 anlegen, `STAGING_DEPLOY_ENABLED=true`. Ab dann deployt jeder
    grüne Push auf `trainerhub-phase3` automatisch nach Staging.

Rückweg bei einem fehlerhaften Update: `git checkout <vorheriger-commit> && ./scripts/deploy.sh`;
falls eine Migration Daten verändert hat: `./scripts/restore.sh <backup vor dem Update>`.

## 10. Erfolgreichen Betrieb prüfen

```bash
cd deploy && ./scripts/status.sh                       # Container, Health, Logs, Backups, Speicher
curl -fsS https://<staging-domain>/api/health           # über Proxy + TLS
curl -s -o /dev/null -w '%{http_code}\n' https://<staging-domain>/_/     # erwartet 404
curl -sI https://<staging-domain>/manifest.webmanifest | grep -i content-type   # application/manifest+json
docker compose logs --tail=100 pocketbase               # PocketBase-Logs
docker compose ps                                       # beide "healthy"
```

Im Browser/iPhone:

1. Staging-Domain öffnen → Anmeldemaske, gültiges Zertifikat.
2. Als Florian anmelden → leeres Konto. In der GitHub-Pages-App *Backup herunterladen*, in Staging
   *Einstellungen → Backup übernehmen* → Teams, Spieler:innen, Planungen, Trainings da.
3. Zweites Gerät anmelden → gleicher Stand. Co-Trainer anmelden → nur freigegebenes Team.
4. Flugmodus: App öffnen, Training durchführen und abschließen → Einstellungen zeigt „Offline – 1
   Änderung wartet“. Flugmodus aus → „Synchronisiert“, anderes Gerät sieht das Training.
5. Zum Home-Bildschirm hinzufügen, offline starten, Update-Hinweis nach einem Deploy.

Automatisiert (lokaler Rechner mit Playwright, gegen Staging mit Testkonten):
`E2E_URL=https://<staging-domain> … node e2e/phase3.e2e.mjs` – siehe Kopf der Datei.

## Ist-Zustand des Servers (nach der Bestandsaufnahme ausfüllen)

| Punkt | Wert |
| --- | --- |
| Hetzner-System / OS / Architektur | _offen_ |
| Installationsverzeichnis (Checkout) | _offen_ |
| Compose-Projekt | _offen_ (Vorschlag `trainerhub-staging`) |
| Docker-Netzwerke (eigenes / Proxy) | _offen_ |
| Reverse Proxy und Anbindung | _offen_ |
| Ports (`WEB_BIND`, `PB_ADMIN_BIND`) | _offen_ |
| `PB_DATA_DIR` | _offen_ |
| `BACKUP_DIR` und Kopie außer Haus | _offen_ |
| Staging-Domain | _offen_ (Wunsch `trainerhub-staging.florianfreiberger.de`) |
| Update-Prozess | `git fetch && git checkout <commit> && deploy/scripts/deploy.sh` bzw. GitHub-Deploy |
