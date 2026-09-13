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
