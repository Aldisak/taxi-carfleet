# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Product website image: build the Astro static site with Node, then serve the
# static dist with stock caddy:2-alpine. Mirrors web/Dockerfile, but the site is
# PURELY static — this inner Caddy does NOT proxy /api or /hubs (the marketing
# site makes no API calls). Public TLS + rate-limit live in the EDGE Caddy
# (infra/Caddyfile); the edge reverse-proxies the apex domain here.
#
# BUILD CONTEXT is the repo root (see infra/docker-compose.prod.yml + deploy.yml),
# so this file can COPY both product-website/ (the app) and infra/website/Caddyfile
# (the static config), keeping the static Caddyfile under infra/ per scope.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20 AS build
WORKDIR /app

COPY product-website/package.json product-website/package-lock.json* ./
RUN npm ci

COPY product-website/ ./
# astro build → dist/ (static HTML: /, /en/, /_astro/*). See product-website/package.json.
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM caddy:2-alpine AS final
# Static config lives in infra/ (COPYed from the repo-root build context).
COPY infra/website/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
# caddy:2-alpine's default ENTRYPOINT runs `caddy run --config /etc/caddy/Caddyfile`.
