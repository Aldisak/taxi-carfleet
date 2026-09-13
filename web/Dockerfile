# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Web image: build the Vite SPA/PWA with Node, then serve the static dist with
# stock caddy:2-alpine. This internal Caddy does NOT terminate public TLS or
# rate-limit — that is the EDGE Caddy (infra/caddy/, infra/Caddyfile) which needs
# the DNS + ratelimit plugins. This inner Caddy only:
#   - serves the SPA with correct cache headers (index.html no-cache, hashed
#     /assets 1y immutable) and history-API fallback to index.html
#   - reverse-proxies /api/* and /hubs/* to the `api` service WITH WebSocket
#     upgrade (SignalR) — reverse_proxy passes Upgrade/Connection automatically.
#
# BUILD CONTEXT is the repo root (see infra/docker-compose.prod.yml), so this file
# can COPY both web/ (the app) and infra/web/Caddyfile (the static config) — that
# keeps the static Caddyfile inside infra/ rather than under web/, per scope.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20 AS build
WORKDIR /app

COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ ./
# tsc -b && vite build → dist/ (see web/package.json "build" script)
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM caddy:2-alpine AS final
# Static config lives in infra/ (COPYed from the repo-root build context).
COPY infra/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
# caddy:2-alpine's default ENTRYPOINT runs `caddy run --config /etc/caddy/Caddyfile`.
