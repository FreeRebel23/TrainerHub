# PocketBase für TrainerHub – feste Version mit Prüfsumme, läuft ohne Root-Rechte.
# Build-Kontext: Repository-Wurzel (siehe deploy/compose.yaml).
FROM alpine:3.20

ARG PB_VERSION=0.40.4
ARG PB_SHA256_AMD64=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa
ARG PB_SHA256_ARM64=86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418
ARG TARGETARCH=amd64

# Nur BusyBox-Bordmittel (wget, unzip, sha256sum) – keine zusätzlichen Pakete
RUN case "$TARGETARCH" in amd64) SUM="$PB_SHA256_AMD64";; arm64) SUM="$PB_SHA256_ARM64";; *) echo "Architektur $TARGETARCH nicht unterstützt"; exit 1;; esac \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && echo "$SUM  /tmp/pb.zip" | sha256sum -c - \
 && mkdir -p /pb && unzip -q /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip \
 && adduser -D -H -u 10001 pocketbase \
 && mkdir -p /pb/pb_data && chown pocketbase:pocketbase /pb/pb_data

# Anwendung (Binary), Migrationen und Hooks sind Teil des Images; Daten liegen im Volume.
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY pocketbase/pb_hooks /pb/pb_hooks

USER pocketbase
WORKDIR /pb
EXPOSE 8090
VOLUME /pb/pb_data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--hooksWatch=false"]
