# Obtaining & configuring API keys and secrets

This guide explains **where to get every credential** the taxi fleet app needs and
**which setting consumes it**. It covers third-party services you have to sign up
for (Mapy.com, an SMS provider, backup storage, a DNS token) and the secrets you
generate yourself (JWT, VAPID web-push, tracking HMAC, the database password).

The production source of truth is [`infra/.env.example`](../infra/.env.example) —
copy it to `infra/.env` and fill in real values. For local development, most values
already have working defaults in `api/src/Taxi.Api/appsettings.Development.json`.

> **You can run the whole app locally without paying for anything.** SMS defaults to
> the `Console` provider (messages are logged, not sent), the dev JWT/VAPID/tracking
> secrets are pre-filled, and the app still works with no Mapy key — you just get a
> degraded map (a "map unavailable" banner) and no address autocomplete/routing.
> Only Mapy.com requires a (free) signup to get full map functionality even in dev.

---

## Overview

| Service | External signup? | Where configured | Needed for |
|---|---|---|---|
| **Mapy.com** (maps, geocoding, routing) | ✅ Yes (free tier) | Per-fleet DB columns → env/appsettings fallback | Full maps, address autocomplete, route ETA |
| **SMS provider** (GoSMS / SMSbrána) | ✅ Yes (prod only) | `infra/.env` → `Notifications` section | Customer/driver SMS in production |
| **Web Push (VAPID)** | ❌ Self-generated | `infra/.env` → `Notifications` section | Browser push notifications |
| **JWT signing key** | ❌ Self-generated | `infra/.env` → `Jwt` section | Signing auth tokens |
| **Tracking HMAC key** | ❌ Self-generated | `infra/.env` → `Tracking` section | Signing customer tracking links |
| **PostgreSQL** | ❌ Self-generated | `infra/.env` → `ConnectionStrings` | Database access |
| **DNS-01 TLS token** (Cloudflare / Hetzner) | ✅ Yes (prod only) | `infra/.env` | Wildcard HTTPS certificates |
| **S3-compatible backups** (Hetzner / Backblaze) | ✅ Yes (prod only) | `infra/.env` | Off-site DB backups |

> **Config key notation.** .NET reads settings from `appsettings.json` (nested keys
> like `Jwt:Key`) or from environment variables, where a nested key uses a double
> underscore (`Jwt__Key`). Both forms below refer to the same setting.

---

## 1. Mapy.com — maps, geocoding, routing

Mapy.com (by Seznam.cz) powers the map tiles, address autocomplete (`suggest`),
geocoding, reverse geocoding, and route distance/duration used across all three
clients. This is the **only external service you need even for local development**
to see fully working maps.

### 1.1 The two keys

The app uses **two separate keys**:

| Key | Secret? | Used by | Purpose |
|---|---|---|---|
| **Server key** | 🔒 Secret — never sent to the browser | Backend (`MapyClient`) | `suggest`, `geocode`, `rgeocode` (reverse), `routing/route` |
| **Browser key** | 🌐 Public — embedded in tile URLs | Frontend (Leaflet) | Map tiles `https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=…` |

The backend serves the browser key to the frontend through the anonymous
`GET /geo/config` endpoint; the server key is **structurally never** included in
that response.

### 1.2 How to obtain the keys

> ⚠️ **Best-effort steps.** The exact Mapy.com developer-portal flow and the tile
> URL format below were sourced from general Mapy.com knowledge. Confirm the current
> steps, tariff limits, and tile path against the live docs at
> <https://developer.mapy.com> before relying on them in production.

1. Go to the Mapy.com REST API developer portal: <https://developer.mapy.com>.
2. Create an account (or sign in with a Seznam.cz account).
3. Create a project / application and generate an **API key**. Note the free-tier
   monthly request/credit quota.
4. If the portal lets you scope or create separate keys, create **one key for the
   REST API** (server-side: suggest/geocode/routing) and **one key for web/tiles**
   (browser-side). If it only issues a single key, you can use the same value for
   both the server and browser settings below — but keep in mind the browser key is
   exposed publicly in tile requests, so prefer a separate, tile-scoped key when
   possible.
5. Review the **attribution requirement** — Mapy.com terms require the
   "© Seznam.cz, a.s. a další" attribution to be shown on every public map. The app
   already renders this (see `MapyConstants.AttributionHtml`); do not remove it.

### 1.3 How to configure the keys

There are two ways to supply the keys. The **per-fleet database columns are the
intended (multi-tenant) path**; the env/appsettings fallback is convenient for a
single-fleet or self-hosted setup.

**Option A — per-fleet, in the database (recommended, multi-tenant).**
Each fleet's keys live on the `fleet_settings` row:

| Column | Property | Stored as |
|---|---|---|
| `mapy_server_key` | `FleetSettings.MapyServerKey` | Encrypted (ASP.NET Data Protection) |
| `mapy_browser_key` | `FleetSettings.MapyBrowserKey` | Encrypted (ASP.NET Data Protection) |

Because both columns are encrypted at rest via `IFleetKeyProtector`, you cannot just
paste a raw key into the DB — it must be written through the app's protector.

**Setting keys via the admin UI (recommended).** Navigate to `/admin`, find the fleet
in the fleet list, and click **Edit**. The settings page (`/admin/fleets/:fleetId/settings`)
lets you paste a plaintext key into the **Mapy server key** or **Mapy browser key** field
and save — the backend encrypts the value before storing it.

> **Write-only server key contract.** The Mapy server key field always loads **blank**
> in the UI. Submitting the form without touching the field leaves the existing key
> unchanged (`null` = keep). Pasting a new key overwrites it (encrypted). The value is
> never returned by `GET admin/fleets/{id}/settings` — only a `mapyServerKeyConfigured`
> flag is returned to confirm that a key is currently set.

> ⚠️ **Data Protection key ring.** Encrypted Mapy keys can only be decrypted with the
> app's Data Protection key ring, persisted to `DataProtection:KeysDirectory`
> (the `/keys` Docker volume in production). **Never delete or prune this volume** —
> losing it makes every stored Mapy key (and other protected secrets)
> permanently undecryptable.

**Option B — environment / appsettings fallback (single-fleet / self-host).**
If a fleet has no key in the DB, the app falls back to configuration:

- **Browser key** — read from config key `Mapy:BrowserKey`
  (`GeoConfigEndpoint`). Set it as:
  ```jsonc
  // appsettings.json / appsettings.Development.json
  "Mapy": { "BrowserKey": "your-mapy-browser-key" }
  ```
  or as an environment variable:
  ```bash
  Mapy__BrowserKey=your-mapy-browser-key
  ```

- **Server key** — read from the **flat** config key `Mapy__ServerKey`
  (`MapyKeyResolver`, `configuration["Mapy__ServerKey"]`). Note the literal double
  underscore *inside* the key name, which differs from the browser key. The most
  reliable way to set it is a **root entry in appsettings.json**:
  ```jsonc
  // appsettings.json (root level, not nested under "Mapy")
  "Mapy__ServerKey": "your-mapy-server-key"
  ```
  > ⚠️ **Env-var caveat.** Because .NET translates `__` in env-var names to `:`, a
  > plain `Mapy__ServerKey=…` env var becomes config key `Mapy:ServerKey`, which the
  > code does **not** read. To set this particular value from an environment variable
  > you would need `Mapy____ServerKey=…` (four underscores) so it resolves to the
  > literal key `Mapy__ServerKey`. Prefer the appsettings.json root entry or a
  > command-line argument (`--Mapy__ServerKey=…`) to avoid confusion, or use the
  > per-fleet DB column (Option A).

### 1.4 Map center / defaults (optional)

Not credentials, but configured alongside the keys per fleet:
`fleet_settings.map_center_lat` / `map_center_lng` / `map_zoom`
(default Prague: `50.08`, `14.42`, zoom `12`). The base API URL is
`Mapy:BaseUrl` (defaults to `https://api.mapy.cz/`).

### 1.5 Verify

- `GET /geo/config` returns a non-empty `browserKey` and the tile URL template.
- In the dispatcher/customer UI: the map renders real tiles (not the "map
  unavailable" banner), address autocomplete returns suggestions, and creating an
  order shows a route distance/ETA.

---

## 2. SMS provider — GoSMS or SMSbrána

Customer and driver SMS (e.g. the tracking-link message on order creation).

- **Local dev:** no signup needed. The default provider is `Console`
  (`Notifications:SmsProvider = "Console"`) — messages are logged, not sent.
- **Production:** pick **one** provider and set its credentials.

Configuration lives in the `Notifications` section (`NotificationOptions`):

| Setting | appsettings key | Env var (`infra/.env`) |
|---|---|---|
| Provider selection | `Notifications:SmsProvider` | `SMS_PROVIDER` (`Console` \| `GoSms` \| `SmsBrana`) |
| GoSMS client id | `Notifications:GoSms:ClientId` | `GOSMS_CLIENT_ID` |
| GoSMS client secret | `Notifications:GoSms:ClientSecret` | `GOSMS_CLIENT_SECRET` |
| SMSbrána login | `Notifications:SmsBrana:Login` | `SMSBRANA_LOGIN` |
| SMSbrána password | `Notifications:SmsBrana:Password` | `SMSBRANA_PASSWORD` |

**GoSMS** — register at <https://www.gosms.cz>, create API credentials
(OAuth client), and copy the **Client ID** and **Client Secret**. Set
`SMS_PROVIDER=GoSms`.

**SMSbrána** — register at <https://www.smsbrana.cz>, obtain your account **login**
and **password** (or API password). Set `SMS_PROVIDER=SmsBrana`.

> The per-fleet `fleet_settings.sms_sender_name` sets the sender label shown on
> outgoing messages, and `sms_monthly_cap_czk` caps monthly spend.

---

## 3. Web Push (VAPID) — self-generated, no signup

Enables browser push notifications. Generate a key pair once:

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key. Configure them in the `Notifications` section:

| Setting | appsettings key | Env var (`infra/.env`) |
|---|---|---|
| Contact subject | `Notifications:VapidSubject` | `VAPID_SUBJECT` (e.g. `mailto:ops@example.cz`) |
| Public key | `Notifications:VapidPublicKey` | `VAPID_PUBLIC_KEY` |
| Private key (secret) | `Notifications:VapidPrivateKey` | `VAPID_PRIVATE_KEY` |

The **public key** is also what the browser uses to subscribe. Dev placeholder keys
are already present in `appsettings.Development.json` — replace them for production.

---

## 4. JWT signing key — self-generated

Signs the authentication tokens issued by the API. The key must be **at least 32
characters**.

```bash
openssl rand -base64 48
```

| Setting | appsettings key | Env var (`infra/.env`) |
|---|---|---|
| Signing key | `Jwt:Key` | `JWT_KEY` (min 32 chars) |
| Issuer | `Jwt:Issuer` | `JWT_ISSUER` (default `taxi-api`) |
| Audience | `Jwt:Audience` | `JWT_AUDIENCE` (default `taxi-clients`) |

Dev uses a fixed placeholder key in `appsettings.Development.json` — never use it in
production.

---

## 5. Customer tracking-link HMAC — self-generated

Signs the tokens embedded in customer tracking links sent by SMS.

```bash
openssl rand -base64 32
```

| Setting | appsettings key | Env var (`infra/.env`) |
|---|---|---|
| HMAC key | `Tracking:HmacKey` | `TRACKING_HMAC_KEY` |

---

## 6. PostgreSQL — self-generated password

| Setting | appsettings key | Env var (`infra/.env`) |
|---|---|---|
| Database name | (in connection string) | `POSTGRES_DB` (default `taxi`) |
| Username | (in connection string) | `POSTGRES_USER` (default `taxi`) |
| Password | (in connection string) | `POSTGRES_PASSWORD` |
| Full connection string | `ConnectionStrings:Db` | assembled in compose from the three above |

Generate a strong password:

```bash
openssl rand -base64 32
```

Local dev uses the compose default connection string in
`appsettings.Development.json` (`Host=localhost;…;Password=taxi_dev_password`).

---

## 7. Production-only infrastructure keys

These live only in `infra/.env` and are used by the production compose stack
(`infra/docker-compose.prod.yml`). Not needed for local development.

### 7.1 DNS-01 TLS token (wildcard HTTPS)

Caddy obtains wildcard Let's Encrypt certificates via a DNS-01 challenge. Set the
**one** token matching your DNS host (and the `acme_dns` line in `infra/Caddyfile`):

| Provider | Env var | Where to get it |
|---|---|---|
| Cloudflare | `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → **My Profile → API Tokens** → create a token with **DNS edit** permission for your zone |
| Hetzner DNS | `HETZNER_DNS_API_TOKEN` | Hetzner DNS Console → **API tokens** |

Also set `DOMAIN` and `ACME_EMAIL`.

### 7.2 S3-compatible backup storage

Off-site database backups via rclone.

| Env var | Notes |
|---|---|
| `BACKUP_S3_PROVIDER` | `Hetzner` for Hetzner Object Storage, `Other`/`AWS` for Backblaze B2 (S3 API) |
| `BACKUP_S3_ACCESS_KEY_ID` | Access key from your object-storage provider |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret key |
| `BACKUP_S3_ENDPOINT` | e.g. `https://fsn1.your-objectstorage.com` (Hetzner) or `https://s3.<region>.backblazeb2.com` (B2) |
| `BACKUP_S3_REGION` | e.g. `fsn1` |
| `BACKUP_RCLONE_REMOTE` | e.g. `s3:taxi-backups` |

- **Hetzner Object Storage** — create a bucket and generate S3 credentials in the
  Hetzner Cloud console.
- **Backblaze B2** — create a bucket and an **Application Key** at
  <https://www.backblaze.com/b2>.

### 7.3 Other

| Env var | Purpose |
|---|---|
| `GHCR_OWNER` | GitHub owner for the container images (`ghcr.io/${GHCR_OWNER}/taxi-*`) |
| `GRAFANA_ADMIN_PASSWORD` | Admin password for the optional metrics stack (`--profile ops`) |

---

## 8. Quick-start checklists

### Local dev (minimum)

Everything works out of the box **except** full maps. To enable maps:

1. Get a Mapy.com browser key (§1.2).
2. Add it to `appsettings.Development.json`:
   ```jsonc
   "Mapy": { "BrowserKey": "your-mapy-browser-key" }
   ```
3. (Optional, for autocomplete/routing) add a server key as a root entry:
   ```jsonc
   "Mapy__ServerKey": "your-mapy-server-key"
   ```

No SMS/JWT/VAPID/HMAC setup needed — dev defaults are already in place.

### Production (`infra/.env`)

```bash
cp infra/.env.example infra/.env
# then fill in real values:

# self-generated secrets
openssl rand -base64 48   # -> JWT_KEY
openssl rand -base64 32   # -> POSTGRES_PASSWORD
openssl rand -base64 32   # -> TRACKING_HMAC_KEY
npx web-push generate-vapid-keys   # -> VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY

# third-party signups
# - SMS_PROVIDER + GOSMS_* or SMSBRANA_*        (§2)
# - CLOUDFLARE_API_TOKEN or HETZNER_DNS_API_TOKEN (§7.1)
# - BACKUP_S3_* credentials                      (§7.2)
# - DOMAIN, ACME_EMAIL, GHCR_OWNER

# Mapy keys: set per-fleet in the DB (encrypted), or via the fallback config (§1.3)
```

---

## 9. Security notes

- **Never commit `infra/.env`** — it is gitignored. Only `infra/.env.example`
  (placeholders) is committed.
- The legacy `Sms:ApiKey` and `Push:VapidPublic`/`Push:VapidPrivate` sections in the
  base `appsettings.json` are **not used** by the current code — SMS and push are
  configured under the `Notifications` section (§2, §3). Ignore the legacy stubs.
- Secrets (Mapy keys, VAPID private key, JWT key, tracking HMAC, DB password) are
  **never logged**.
- Keep the Data Protection key ring (`/keys` volume) safe and backed up — see §1.3.
