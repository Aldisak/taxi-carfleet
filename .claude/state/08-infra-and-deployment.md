# Assignment 08 — Infra, CI/CD & operations

Read `00-PROJECT-CONTEXT.md` first. Can start after 01's schema is merged. Must be finished before 02 goes to real users.

## Goal

One VPS, one command to deploy, automatic backups, and a runbook a tired founder can follow at 2 a.m.
**Target running cost: under €10/month for one fleet.**

## Scope

**In:** Dockerfiles, Compose for dev and prod, Caddy with automatic HTTPS and wildcard subdomains,
GitHub Actions, backups + restore test, monitoring/alerts on the cheap, secrets, runbook.
**Out:** Kubernetes, Terraform, multi-region, anything with a monthly bill besides the VPS and object storage.

## Deliverables

### 1. Containers
- `/api/Dockerfile`: multi-stage, `mcr.microsoft.com/dotnet/aspnet:9.0` runtime, non-root user, `HEALTHCHECK` hitting `/health/live`, image < 120 MB.
- `/web/Dockerfile`: build with Node, output static files into a Caddy image (`caddy:2-alpine`). Caddy serves the SPA with proper cache headers (`index.html` no-cache, hashed assets 1 year) and proxies `/api/*` and `/hubs/*` to `api` with WebSocket support.
- Images tagged with git SHA and `latest`; pushed to GHCR.

### 2. Compose
- `infra/docker-compose.dev.yml`: `db` (postgres:16, volume), `api` (hot reload via `dotnet watch`), `web` (Vite dev server), `mailhog`-style SMS console is just logs. Seeds on start.
- `infra/docker-compose.prod.yml`: `caddy`, `web`, `api`, `db`, `backup`. Resource limits: api 512 MB, db 1 GB. Restart policies `unless-stopped`. Only Caddy exposes ports 80/443. Postgres has no public port.
- **DataProtection key-ring persistence (UC-010 WI-18):** the `api` service MUST mount a persistent named volume (`dp_keys` in prod, `dev_dp_keys` in dev) at `/keys` and set `DataProtection__KeysDirectory=/keys`. The WI-03 fail-fast guard refuses to boot in Production when this directory is missing/unset. **Do not prune this volume on redeploy** — losing the key-ring makes every encrypted per-fleet Mapy API key permanently undecryptable, forcing every fleet to re-enter its keys.
- `.env.example` documenting every variable. Real `.env` never committed.

### 3. Caddy
- `Caddyfile` with `{$DOMAIN}` and `*.{$DOMAIN}` → wildcard certificate via DNS challenge (use the Caddy DNS plugin for the DNS provider chosen; document Cloudflare and Hetzner DNS variants). If wildcard proves complex, fallback: on-demand TLS per subdomain — document the trade-off.
- Security headers, gzip/zstd, request body limit 1 MB (logo upload endpoint 300 KB), rate limit on `/api/v1/auth/*` (60/min per IP).

### 4. CI/CD (GitHub Actions)
- `ci.yml` on PR: restore, build (warnings as errors), `dotnet test` with Testcontainers, `npm ci`, `lint`, `vitest`, Playwright smoke (3 flows) against compose. Fails on any warning.
- `deploy.yml` on push to `main`: build + push images, then SSH to the VPS, `docker compose pull && docker compose up -d`, run migrations (`api` runs `dotnet ef database update` via an entrypoint flag before starting), then health check `/health/ready` with 60 s timeout; on failure roll back to previous tag automatically (keep previous image tag in a file on the server).
- Secrets: `VPS_HOST`, `VPS_SSH_KEY`, `GHCR_TOKEN` only. Application secrets live in `/opt/taxi/.env` on the VPS.

### 5. Backups
- `backup` container: cron at 02:30 Europe/Prague: `pg_dump -Fc` → gzip → upload to S3-compatible storage (Hetzner Object Storage or Backblaze B2) via `rclone`/`aws-cli`. Keep 14 daily, 8 weekly. Also `/data/fleets` (logos).
- `infra/restore.sh <backup-file>` restores into a fresh DB container. **CI runs a restore test weekly** (`restore-test.yml`): download the latest backup, restore into a throwaway Postgres, run `SELECT count(*) FROM orders`, post result to a GitHub issue if it fails.

### 6. Monitoring & alerts (free tier only)
- Uptime: external pinger (e.g. UptimeRobot free / Better Stack free) on `https://{demo}.{domain}/health/ready` every 5 min → SMS/email to founder. Document setup; do not depend on their API.
- Logs: Serilog JSON to stdout; `docker logs` + `logrotate` limits (max 100 MB per container). No Loki/ELK.
- Metrics: `/metrics` (prometheus-net) exposed on the internal network only; optional local Grafana compose profile `--profile ops` for when we need it. Not running by default.
- Disk alert: a cron script on the VPS that emails/SMS (via our own `ISmsSender` CLI command `dotnet run -- send-sms`) when disk > 85 %.
- Error alerting: API counts 5xx per minute; if > 10, sends one push to FleetAdmin of fleet `ops` (our own fleet) — cheapest possible pager.

### 7. Runbook `docs/runbook.md`
Step-by-step, tested, in plain language:
1. Provision VPS (Hetzner CX22 or equivalent; Ubuntu 24.04; docker install; firewall: 22, 80, 443; fail2ban; unattended-upgrades).
2. DNS: A record for domain and wildcard; DNS API token for Caddy.
3. First deploy; create superadmin; create first fleet.
4. Add a new fleet (10 minutes, no server access needed after step 3).
5. Rotate secrets.
6. Restore from backup (with the exact commands).
7. "Site is down" checklist: Caddy logs → api health → db → disk → rollback.
8. Monthly cost sheet with the actual numbers after first month.
9. **Mapy.com console setup (UC-010).** In the Mapy.com developer console (https://developer.mapy.com):
   - Create a project for the deployment.
   - Create **two API keys** per fleet-tier: a **browser key** and a **server key**. Restrict the **browser key by HTTP referrer** to the fleet domain(s) (`https://*.{domain}`) so a leaked browser key cannot be abused from another origin — the browser key is served publicly via `GET /geo/config`. The **server key** stays in the API only (`Mapy__ServerKey` env / encrypted per-fleet column) and is never sent to the browser.
   - Set a **consumption cap** on the project to bound credit spend; the app additionally enforces per-fleet monthly budgets + 80 %/100 % alerts from `geo_usage` (cache misses only).
   - Demo/first-day fleets use the env fallback keys (`Mapy__BrowserKey` / `Mapy__ServerKey`); per-fleet keys are entered later in fleet settings.
   - **Confirm the DataProtection `dp_keys` volume is mounted before first boot** — encrypted per-fleet Mapy keys depend on the persisted key-ring (see Deliverable 2).

### 8. Cost sheet `docs/costs.md`
Table with VPS, object storage, domain, SMS estimate (e.g. 300 rides × 1.5 SMS × 1 CZK), DNS, and **Mapy.com credit estimate** (UC-010: tile + suggest + geocode + route credits; only cache misses spend credits — see the two-tier cache + `geo_usage` budget in `docs/costs.md`, populated in WI-13). Show total for 1 fleet and marginal cost for each additional fleet (should be ~SMS + Mapy credits only).

## Acceptance criteria

1. Fresh VPS to running system by following the runbook only, in under 45 minutes (record the actual time in the runbook).
2. `git push main` deploys; a deliberately broken health check triggers automatic rollback (test once, document).
3. Backup produced nightly; `restore.sh` restores and the app serves the restored data; weekly restore-test workflow green.
4. HTTPS on `demo.{domain}` and `second.{domain}` with valid certificates, WebSockets work through Caddy (SignalR connects, no long-polling fallback).
5. Postgres not reachable from the internet (nmap from outside shows only 22/80/443).
6. Idle system uses < 700 MB RAM total (measure and record).
7. Cost sheet filled with real prices; total < €10/month excluding SMS.
