# Monitoring & alerts

Cheap monitoring for a one-VPS deployment (assignment 08 §6). Everything here is free-tier or
self-hosted — no Loki/ELK, no paid APM.

## 1. External uptime pinger (do NOT depend on their API)

Set up a free external monitor so you learn the site is down even if the VPS is completely dead.

- **Provider:** UptimeRobot (free) or Better Stack (free). Either works; no code depends on them.
- **Target:** `https://demo.{DOMAIN}/health/ready` (the readiness endpoint checks the DB).
- **Interval:** every 5 minutes.
- **Alert channel:** email to the founder, and SMS if the free tier allows.
- **Why external:** an in-VPS check cannot fire if the VPS is off. This is the outermost safety net.

Add one monitor per active fleet subdomain, or just monitor the apex + `demo` — they share the
same api/db, so one readiness failure implies the whole box is affected.

## 2. Logs — Serilog JSON to stdout + docker logs + rotation

- The API logs **Serilog compact JSON to stdout** in Production (`Program.cs`); `docker logs` and
  `docker compose logs -f api` are the log viewer. No log shipper.
- **Rotation** is enforced per container by the compose `logging` block (json-file driver,
  `max-size: 100m`, `max-file: 3`) — a busy container keeps at most ~300 MB of logs, then rotates.
  This is the logrotate-equivalent required by §6; there is no separate logrotate cron for docker logs.
- Read a specific request by its `CorrelationId` (Serilog enriches every line) — grep the JSON:
  `docker compose -f docker-compose.prod.yml logs api | grep <correlation-id>`.

## 3. Metrics — /metrics (internal only) + optional Grafana

- The API exposes Prometheus metrics at **`/metrics`** (prometheus-net, WI A2).
- **Internal-network only:** the edge Caddy deliberately does **not** proxy `/metrics`, and the
  compose `internal` network has no published port — so `/metrics` is unreachable from the internet.
  Scrape it only from inside the docker network.
- **Optional Grafana + Prometheus** ship behind the compose `ops` profile and are **not running by
  default** (they cost RAM). Start them only when investigating:

  ```bash
  cd /opt/taxi
  docker compose -f docker-compose.prod.yml --profile ops up -d prometheus grafana
  ```

  Prometheus scrapes `api:8080/metrics` (`infra/ops/prometheus.yml`); Grafana is at
  `http://localhost:3000` — reach it via an SSH tunnel (`ssh -L 3000:localhost:3000 vps`), it is
  **not** exposed publicly. Stop it again with `--profile ops down` when done.

## 4. Disk-full alert (cron on the VPS → SMS)

Install a cron on the VPS that SMSes the founder when the root disk exceeds 85%, using the API's
own `send-sms` CLI (WI A1) so no third-party alerting service is needed.

`/etc/cron.d/taxi-disk-alert`:

```cron
# Check every 15 minutes; SMS if / is over 85% full.
*/15 * * * * root /opt/taxi/disk-alert.sh
```

`/opt/taxi/disk-alert.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
THRESHOLD=85
USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$USE" -ge "$THRESHOLD" ]; then
  cd /opt/taxi
  docker compose -f docker-compose.prod.yml run --rm api \
    send-sms --to "$OPS_PHONE" --message "Taxi VPS disk ${USE}% full"
fi
```

Set `OPS_PHONE` (E.164, e.g. `+420...`) in the environment the cron runs with, or hardcode it in
the script. `send-sms` resolves the real `ISmsSender` (GoSMS/SMSbrána) configured via the prod
`.env`, so the disk alert uses the same SMS provider as the app.

## 5. Error pager — 5xx spike → push to the ops fleet

The API counts HTTP **5xx responses per minute** (middleware + `FiveHundredRateAlerter`, WI A3).
When more than **10 in a rolling minute** occur, it sends **exactly one** Web Push to the
**FleetAdmins of the `ops` fleet** (the fleet whose slug is `Ops:FleetSlug`, default `ops`) — the
cheapest possible pager, no external service.

- The alert is deduplicated to one push per one-minute window; the next window can alert again.
- If the `ops` fleet or its FleetAdmin push subscriptions do not exist, the alerter logs a warning
  and no-ops (an infra-alert failure must never cascade into the request path).
- **Setup:** create an `ops` fleet with at least one FleetAdmin, log that admin into the dispatcher
  web on a device, and accept the push permission so a `PushSubscription` row exists. See the
  runbook "first fleet" and "ops fleet" steps.

## Quick reference

| Signal | Where | Alert path |
|---|---|---|
| Site down (whole VPS) | UptimeRobot/Better Stack | email/SMS to founder |
| Readiness / DB down | `/health/ready` (pinger) | email/SMS to founder |
| Disk > 85% | VPS cron `disk-alert.sh` | `send-sms` → founder |
| 5xx spike (>10/min) | API middleware (A3) | one Web Push → ops FleetAdmins |
| Request-level debugging | `docker logs` (Serilog JSON) | grep by CorrelationId |
| Deep metrics | `/metrics` + `--profile ops` Grafana | manual, on demand |
