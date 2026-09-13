# Runbook

Operational notes for running and deploying the taxi fleet system.

## Multi-tenant subdomain routing (production)

Each fleet is reached at its own subdomain: `{slug}.{domain}` (e.g. `demo.taxiapp.cz`,
`druha-flotila.taxiapp.cz`). The same single-build React SPA/PWA and the single .NET API
serve every tenant — there is **no per-tenant rebuild**. The tenant is resolved at runtime:

- **Web**: `resolveFleetSlug` (in `web/src/features/customer/shell/resolveFleetSlug.ts`)
  reads the slug from the host subdomain first, then `?fleet=`, then `/c/f/{slug}`, then
  falls back to `demo`. The resolved slug is persisted and sent on every API call as the
  `X-Fleet-Slug` header; branding (name, primary color, logo, welcome text) is loaded from
  `GET /public/fleet` and applied to the theme at runtime.
- **API**: `TenantResolutionMiddleware` resolves the fleet from the request (JWT `fleet_id`
  claim for authenticated calls; `X-Fleet-Slug` for anonymous public/auth calls) and EF Core
  global query filters enforce isolation. In production the tenant can equivalently be taken
  from the `Host` header subdomain.

### Caddy wildcard reverse proxy

Point a wildcard DNS `A`/`AAAA` record `*.{domain}` at the server, then terminate TLS with a
wildcard certificate and reverse-proxy to the web static host and the API:

```caddy
*.taxiapp.cz {
    tls {
        dns <provider> <token>        # DNS-01 wildcard cert (HTTP-01 cannot issue *.)
    }

    # API under /api/* → the .NET service. The API reads the tenant from the Host
    # subdomain (or the X-Fleet-Slug header / JWT claim).
    handle /api/* {
        reverse_proxy 127.0.0.1:5249
    }

    # SignalR hub (WebSockets upgrade handled by reverse_proxy automatically).
    handle /hubs/* {
        reverse_proxy 127.0.0.1:5249
    }

    # Per-fleet static logo files stored by POST /fleet/logo at
    # {storageRoot}/fleets/{fleetId}/logo.png. The API exposes the derived URL
    # /fleets/{fleetId}/logo.png?v={ticks}; Caddy serves the file directly.
    handle /fleets/* {
        root * /data
        file_server
    }

    # Everything else → the SPA/PWA build (history-API fallback to index.html).
    handle {
        root * /srv/web/dist
        try_files {path} /index.html
        file_server
    }
}
```

### DNS setup

1. Create a wildcard record: `*.taxiapp.cz A <server-ip>` (and `AAAA` if IPv6).
2. Use a DNS-01 ACME challenge for the wildcard TLS cert (HTTP-01 cannot issue `*.`).
3. Each new fleet created via `POST /admin/fleets` is immediately reachable at
   `{slug}.taxiapp.cz` with **no deploy** — the wildcard covers it.

## Local development — two fleets without wildcard DNS

`*.localhost` is not resolvable by default on most dev machines, so the subdomain path
cannot be exercised locally. Two options:

- **Recommended (used by the E2E):** drive a second fleet with the `?fleet={slug}` override,
  e.g. open `http://localhost:5173/c?fleet=druha-flotila`. `resolveFleetSlug` treats this as
  the localhost fallback; the branding path is identical to production, only the slug SOURCE
  differs. The seeded demo fleet is reachable at `http://localhost:5173/c` (defaults to `demo`).
- **Real subdomains locally (optional):** add hosts entries
  `127.0.0.1 demo.localhost` and `127.0.0.1 second.localhost` (or run dnsmasq with a
  `*.localhost` wildcard), then serve the web + API behind a local Caddy with the wildcard
  block above. `demo.localhost` and `second.localhost` then resolve by subdomain exactly as
  production would.

### Bootstrapping a SuperAdmin (ops)

There is no self-service SuperAdmin signup. Create the initial SuperAdmin from the CLI:

```bash
dotnet run --project api/src/Taxi.Api -- create-superadmin --email you@ops.local --password '<strong>'
```

The command migrates the DB, inserts a `SuperAdmin` user (no fleet), and exits before booting
the web host. It is idempotent (a second run with the same email is a no-op).

> **Known gap (2026-09-13):** `POST /auth/staff/login` resolves a user *within a fleet* by slug
> and only accepts Driver/Dispatcher/FleetAdmin, so a fleetless SuperAdmin cannot yet obtain a
> JWT and the `/admin` screen is unreachable in production. Extending staff login (or adding a
> dedicated SuperAdmin login) is required before `/admin` is usable. Tracked as handoff item #1.

---

# Production deployment (UC-008)

> **Status of these steps:** the deployment artifacts (`api/Dockerfile`, `web/Dockerfile`,
> `infra/docker-compose.prod.yml`, `infra/Caddyfile`, the GitHub Actions workflows, backup +
> restore scripts) are produced and locally validated (`docker compose config`, workflow YAML
> parse, `restore.sh` local round-trip). The step-by-step operational procedure below is written
> to be run on **real infrastructure** — a VPS, a real domain, and S3-compatible object storage.
> These operational steps have **not** been executed in the build environment (there is no VPS
> here); record the actual timings and prices the first time you run them.

The whole system runs on **one VPS** from `/opt/taxi`, driven by `infra/docker-compose.prod.yml`
and `/opt/taxi/.env`. Deploy is `git push main` (GitHub Actions builds, pushes to GHCR, SSHes in,
migrates, rolls forward, health-checks, and auto-rolls-back on failure).

## Step 1 — Provision the VPS

1. Create a **Hetzner Cloud CX22** (2 vCPU / 4 GB / 40 GB NVMe), **Ubuntu 24.04**. (See
   `docs/costs.md` for pricing.)
2. Harden and install Docker (SSH in as root):

   ```bash
   # System updates + unattended security upgrades
   apt-get update && apt-get -y upgrade
   apt-get install -y unattended-upgrades fail2ban ufw curl git
   dpkg-reconfigure -plow unattended-upgrades   # enable automatic security updates

   # Firewall: only SSH + HTTP + HTTPS
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable

   # fail2ban with defaults protects SSH
   systemctl enable --now fail2ban

   # Docker (official convenience script) + compose plugin
   curl -fsSL https://get.docker.com | sh
   systemctl enable --now docker
   ```

3. Create the app directory and copy the infra files:

   ```bash
   mkdir -p /opt/taxi
   # Copy infra/docker-compose.prod.yml, infra/Caddyfile, infra/.env.example to /opt/taxi
   # (scp from your machine, or `git clone` the repo and symlink/copy the infra/ files).
   cp infra/docker-compose.prod.yml /opt/taxi/
   cp infra/Caddyfile               /opt/taxi/
   cp infra/.env.example            /opt/taxi/.env      # then edit .env with REAL secrets
   ```

> **AC#5 (Postgres not internet-reachable):** verified by the compose topology — `db` publishes no
> port and lives on an `internal` network; only `caddy` publishes 80/443. Confirm from outside:
> `nmap -Pn <vps-ip>` should show only 22/80/443 open. (Deferred: run this on the real VPS.)

## Step 2 — DNS

1. Point the apex and wildcard at the VPS:
   - `A   {DOMAIN}        → <vps-ipv4>`
   - `A   *.{DOMAIN}      → <vps-ipv4>`   (wildcard — covers every fleet subdomain)
   - add `AAAA` records too if the VPS has IPv6.
2. Create a **DNS API token** for the wildcard TLS challenge (HTTP-01 cannot issue `*.` certs):
   - **Cloudflare:** a token with `Zone:DNS:Edit` on the zone → put in `CLOUDFLARE_API_TOKEN`.
   - **Hetzner DNS:** a DNS API token → put in `HETZNER_DNS_API_TOKEN`, and switch the `acme_dns`
     line in `infra/Caddyfile` from `cloudflare` to `hetzner`.
3. Fill `DOMAIN` and `ACME_EMAIL` in `/opt/taxi/.env`.

Caddy then issues one wildcard cert; **new fleets need no cert and no deploy** — the wildcard
already covers `{slug}.{DOMAIN}`. See the Caddy wildcard section above for the config detail.

## Step 3 — First deploy + create superadmin + first fleet

1. **Configure GitHub secrets** (repo → Settings → Secrets → Actions):
   `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a deploy key the runner uses to SSH), and `GHCR_TOKEN`
   (a PAT with `read:packages` so the VPS can pull private GHCR images). Application secrets live
   only in `/opt/taxi/.env`, never in GitHub.
2. **First deploy** — either `git push main` (runs `.github/workflows/deploy.yml`), or bootstrap by
   hand on the VPS:

   ```bash
   cd /opt/taxi
   docker login ghcr.io -u <github-user>            # or build locally (uncomment build: in compose)
   docker compose -f docker-compose.prod.yml --env-file .env pull
   docker compose -f docker-compose.prod.yml --env-file .env run --rm api migrate   # EF migrations
   docker compose -f docker-compose.prod.yml --env-file .env up -d
   ```

3. **Create the superadmin** (ops):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env run --rm api \
     create-superadmin --email you@ops.local --password '<strong-password>'
   ```

4. **Create the `ops` fleet** and its first FleetAdmin (used by the 5xx pager, see
   `docs/monitoring.md`). Create it like any other fleet (step 4) with slug matching
   `Ops:FleetSlug` (default `ops`), then log its FleetAdmin into the dispatcher web and accept the
   push permission so the pager has a subscription to send to.
5. **Create the first customer fleet** via the admin flow (`POST /admin/fleets` / the `/admin`
   screen), e.g. slug `demo`. It is immediately reachable at `https://demo.{DOMAIN}`.

> **AC#1 (fresh VPS → running < 45 min):** the above is the full path; record the actual elapsed
> time here the first time you run it. (Deferred: no VPS in the build environment.)
> **AC#4 (HTTPS + WebSockets on demo/second):** after DNS propagates, `https://demo.{DOMAIN}` and
> `https://second.{DOMAIN}` serve with valid wildcard certs and SignalR connects over WSS through
> Caddy (`reverse_proxy` upgrades WebSockets automatically). Verify in the browser network tab
> (the `/hubs/fleet` connection should be `websocket`, not long-polling). (Deferred to real infra.)

## Step 4 — Add a new fleet (≈10 minutes, no server access)

After step 3 the platform is multi-tenant; a new fleet is a DB row + a subdomain the wildcard
already covers:

1. Log into `/admin` as the superadmin (see the known-gap note above about SuperAdmin login).
2. Create the fleet (name, slug, primary color, logo). The slug becomes `{slug}.{DOMAIN}`.
3. Create its FleetAdmin user; hand them the URL. Done — **no SSH, no deploy, no cert step.**

> **AC (add-a-fleet < 10 min):** record the actual time; deferred to real infra.

## Step 5 — Rotate secrets

Secrets live only in `/opt/taxi/.env`. To rotate:

1. Edit `/opt/taxi/.env` with the new value (e.g. `JWT_KEY`, `POSTGRES_PASSWORD`, an SMS key).
2. Apply:

   ```bash
   cd /opt/taxi
   docker compose -f docker-compose.prod.yml --env-file .env up -d   # recreates affected services
   ```

Notes:
- Rotating `JWT_KEY` invalidates all existing access/refresh tokens — users re-login. Do it during
  a quiet window.
- Rotating `POSTGRES_PASSWORD` requires changing it in Postgres too (`ALTER USER ... PASSWORD ...`)
  and in `.env` in one go; take a backup first (step 6).
- Rotating the DNS API token: update `.env`, `up -d caddy`.

## Step 6 — Restore from backup

Backups run nightly at **02:30 Europe/Prague** (the `backup` container): `pg_dump -Fc | gzip` +
`/data/fleets` logos → S3 via rclone, keeping 14 daily + 8 weekly. To restore:

```bash
cd /opt/taxi

# 1. List available backups and pick one
docker compose -f docker-compose.prod.yml --env-file .env run --rm backup \
  rclone lsf "$BACKUP_RCLONE_REMOTE/daily/"

# 2. Download the chosen dump to the host
docker compose -f docker-compose.prod.yml --env-file .env run --rm backup \
  rclone copyto "$BACKUP_RCLONE_REMOTE/daily/taxi-YYYYMMDD-HHMMSS.dump.gz" /data/fleets/restore.dump.gz
# (it lands in the fleet_data volume; or rclone copy to a host path you bind-mount)

# 3. Restore into the running db (drops + recreates the DB — take the site down briefly)
docker compose -f docker-compose.prod.yml --env-file .env stop api web
PGPASSWORD="$POSTGRES_PASSWORD" ./infra/restore.sh <path-to>/restore.dump.gz \
  --host <db-host> --port 5432 --db "$POSTGRES_DB" --user "$POSTGRES_USER" --drop --yes
docker compose -f docker-compose.prod.yml --env-file .env start api web
```

`restore.sh` prints the `orders` row count and `SUCCESS` when done. The **weekly restore-test
workflow** (`.github/workflows/restore-test.yml`) does exactly this against a throwaway Postgres
every Monday and opens a GitHub issue if it fails — so you learn about a bad backup before you need
it. (`restore.sh` was round-trip-verified locally: `pg_dump -Fc | gzip` → restore into a throwaway
`postgres:16` container → `SELECT count(*) FROM orders` succeeds.)

## Step 7 — "Site is down" checklist

Work outermost → innermost:

1. **Is it just you?** Check the external pinger (UptimeRobot/Better Stack) and try from mobile
   data. If the pinger is green, it may be your network/DNS cache.
2. **Caddy / TLS:** `docker compose -f docker-compose.prod.yml logs --tail=100 caddy`. Cert renewal
   failing? DNS token expired? A 502 here means Caddy is up but the upstream (web/api) is not.
3. **API health:** `docker compose ... exec -T api curl -fsS http://localhost:8080/health/live`
   (liveness) then `.../health/ready` (DB check). `docker compose ... logs --tail=200 api` for the
   Serilog JSON — grep the CorrelationId of a failing request.
4. **Database:** `docker compose ... exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.
   If down, `docker compose ... logs --tail=100 db` (disk full? OOM-killed?).
5. **Disk:** `df -h /`. Over 85% the disk-alert cron should already have SMSed you
   (`docs/monitoring.md`). Prune old images: `docker system prune -af`; check log volumes.
6. **Roll back:** if a recent deploy broke it, `deploy.yml` auto-rolls-back on a failed health
   check. **Caveat:** rollback reverts the *image* to the previous SHA but does **not** un-apply the
   migration that ran this deploy. This is safe only if migrations are backward-compatible (the old
   image can run against the new schema) — which is the expected discipline. If a migration was
   destructive/incompatible, image rollback will not fix it; restore from backup instead (step 6).
   To roll back manually, set the image tags in `.env` back to the previous SHA (recorded in
   `/opt/taxi/.previous_tag`) and `up -d`:

   ```bash
   cd /opt/taxi
   PREV=$(cat .previous_tag)
   sed -i "s/^API_TAG=.*/API_TAG=$PREV/;s/^WEB_TAG=.*/WEB_TAG=$PREV/;s/^CADDY_TAG=.*/CADDY_TAG=$PREV/;s/^BACKUP_TAG=.*/BACKUP_TAG=$PREV/" .env
   docker compose -f docker-compose.prod.yml --env-file .env pull
   docker compose -f docker-compose.prod.yml --env-file .env up -d
   ```

> **AC#2 (push-to-deploy + auto-rollback):** `deploy.yml` records the previous tag, migrates, rolls
> forward, polls `/health/ready` for 60 s, and reverts to the previous tag on failure. Test once by
> pushing a deliberately broken health check and confirming the auto-rollback; record the result.
> (Deferred to real infra.)

## Step 8 — Monthly cost

See `docs/costs.md` for the published-price estimate (≈ €9.94/mo fixed for one fleet, excluding
SMS; marginal per additional fleet ≈ SMS only). After the first real month, replace those
estimates with the actual invoice numbers (Hetzner VPS + object storage + domain + SMS provider).

> **AC#6 (idle < 700 MB RAM):** the CX22 has 4 GB; the compose limits are api 512 MB / db 1 GB.
> Measure idle usage on the real VPS with `docker stats --no-stream` and record it here.
> **AC#7 (< €10/mo excl. SMS):** see `docs/costs.md`; confirm against the first invoice.
