# Image production. Target:
#   api  → server API + worker (Node.js)
#   web  → Caddy: file frontend + reverse proxy /api + HTTPS otomatis
# Build context: root repository.

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @manpro/api build \
 && pnpm --filter @manpro/web build
# Buang dependensi development supaya image lebih kecil.
RUN CI=true pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS api
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/repo/apps/api/drizzle \
    STORAGE_DIR=/data/storage
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
# Migrasi database dijalankan setiap kali container API menyala (aman dijalankan berulang).
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
