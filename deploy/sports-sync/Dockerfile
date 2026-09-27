# Sync-Job Spielbetrieb & Verbandsdaten (docs/SPORTS_DATA_ARCHITECTURE.md). Läuft nicht dauerhaft,
# sondern je Aufruf (Host-Cron: docker compose --profile sports run --rm sports-sync …).
# Enthält die produktneutrale Capability packages/sports-data und den TrainerHub-Adapter (server/).
# Keine npm-Abhängigkeiten: Node-Bordmittel (fetch) genügen. Build-Kontext: Repository-Wurzel.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY packages/sports-data ./packages/sports-data
COPY server ./server
COPY scripts/sports-sync.mjs scripts/pb-admin.mjs ./scripts/
COPY src/lib/constants.js ./src/lib/constants.js
USER node
ENTRYPOINT ["node", "scripts/sports-sync.mjs"]
CMD ["status"]
