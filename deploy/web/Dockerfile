# TrainerHub-PWA: Production-Build (Node) → statische Dateien in schlankem nginx (ohne Root).
# Build-Kontext: Repository-Wurzel.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# "same-origin": PocketBase unter derselben Domain (/api) – kein CORS nötig
ARG VITE_SYNC_SERVER=same-origin
ENV VITE_SYNC_SERVER=$VITE_SYNC_SERVER
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
