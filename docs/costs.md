# Running cost sheet

Target: **under €10/month for one fleet, excluding SMS** (assignment 08 §8, AC#7).

All figures are **published provider list prices cited as of 2026-09-13** — they are estimates
for planning, **not measured invoices**. Re-check before committing; providers change prices
(Hetzner raised several cloud plans in 2026). Replace this sheet with the actual first-month
invoice numbers once the system runs on real infra (runbook step 8).

Exchange rate used for CZK figures: ~25 CZK/€ (illustrative; use the current rate at review time).

## Fixed monthly cost — 1 fleet

| Item | Plan / basis | Published price | Notes |
|---|---|---|---|
| VPS | Hetzner Cloud **CX22** (2 vCPU, 4 GB RAM, 40 GB NVMe) | **€4.35 / mo** | Runs api + web + db + caddy + backup in one compose. 4 GB comfortably fits the <700 MB idle target. |
| Object storage (backups) | Hetzner **Object Storage**, base tier | **€4.99 / mo** | Includes 1 TB storage + 1 TB egress — far more than nightly `pg_dump` + logos need. Backups are a few MB/night. |
| Domain | `.cz` domain (e.g. via a Czech registrar) | **~€7 / year ≈ €0.60 / mo** | ~150–200 CZK/yr. One domain covers all fleets via wildcard subdomains. |
| DNS | Cloudflare Free (or Hetzner DNS, free) | **€0 / mo** | Free DNS hosting + API token for the wildcard DNS-01 ACME challenge. |
| TLS certificates | Let's Encrypt via Caddy | **€0 / mo** | Wildcard cert, auto-renewed. |
| Uptime monitoring | UptimeRobot Free / Better Stack Free | **€0 / mo** | External pinger on `/health/ready`, 5-min interval, email/SMS alert. |
| **Fixed subtotal** | | **≈ €9.94 / mo** | **Under the €10/mo target (excluding SMS).** |

### Cheaper storage variant

If backup storage cost matters more than keeping everything at Hetzner, **Backblaze B2** is
pay-per-byte with no base fee: **$6.95 / TB / mo** ($0.00695/GB/mo, first 10 GB free, as of
2026-05-01 price card). Nightly `pg_dump -Fc | gzip` for a 3-car fleet is well under 10 GB kept
(14 daily + 8 weekly), so B2 backup storage is effectively **~€0/mo** at this scale — dropping the
fixed subtotal to **≈ €4.95/mo**. Trade-off: a US-based provider (GDPR: backups may leave the EU;
Hetzner Object Storage keeps them in the EU). `infra/restore.sh` + `backup.sh` use rclone's S3
API and work against either.

## Variable cost — SMS (excluded from the €10 target)

SMS is the only usage-based cost and scales per ride, not per fleet-server.

| Basis | Estimate |
|---|---|
| Rides / month (one small fleet) | ~300 |
| SMS per ride | ~1.5 (order confirmation + "driver arrived"; push covers the rest) |
| Unit price | ~1 CZK / SMS (Czech provider, GoSMS/SMSbrána order-of-magnitude) |
| **SMS / month** | ~300 × 1.5 × 1 CZK = **~450 CZK ≈ €18 / mo** |

SMS is capped per fleet in-app (`FleetSettings.SmsMonthlyCapCzk`, default 500 CZK) so a fleet
cannot run away with the bill; over the cap, non-critical SMS are skipped (push still fires).

## Marginal cost per ADDITIONAL fleet

A new fleet is a **new DB row + a subdomain** (wildcard cert already covers it) — **no new server,
no new deploy**. So the marginal fixed cost is **€0**. The only marginal cost is that fleet's SMS
usage (~€18/mo per active small fleet at the estimate above), which the fleet's own cap bounds.

| | 1 fleet | +1 fleet (marginal) |
|---|---|---|
| Fixed infra | ≈ €9.94 / mo | **€0** |
| SMS (usage) | ~€18 / mo | ~€18 / mo (bounded by per-fleet cap) |

The whole business model — "resell to other fleets, a new fleet is a row not a deployment" — holds:
adding fleets adds only SMS, never infrastructure, until the single CX22 runs out of RAM/CPU (many
small fleets away), at which point the next step is a larger Hetzner plan, not new architecture.

## Sources (published prices, retrieved 2026-09-13)

- Hetzner Cloud CX22 (€4.35/mo): <https://vpsfor.dev/posts/hetzner-cx22-pricing-2026/>, <https://www.hetzner.com/cloud/>
- Hetzner Object Storage (€4.99/mo base, 1 TB incl.): <https://www.hetzner.com/storage/object-storage/>
- Backblaze B2 ($6.95/TB/mo, first 10 GB free): <https://www.backblaze.com/cloud-storage/pricing>
- Hetzner 2026 price changes (verify before committing): <https://northflank.com/blog/hetzner-cloud-server-price-increases>
