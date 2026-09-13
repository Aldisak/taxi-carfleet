# UC-008 — Infra, CI/CD & operations

- **Sequence:** 008
- **Stack:** infra/ops — config + docs (Dockerfiles, Compose, Caddyfile, GitHub Actions, backup/restore scripts, runbook, cost sheet) + a few small backend hooks (migration entrypoint flag, prometheus `/metrics`, `send-sms` CLI, 5xx-counter alert)
- **Complexity tag:** novel (deployment topology, Caddy wildcard TLS, CI/CD with auto-rollback, transactional backup/restore, cheap monitoring)
- **Mode:** autonomous batch run (standing user directive: gates pre-approved; the conductor runs verification itself; keep agent scopes bounded — long subagents hit stream-idle timeouts). No git remote → ship = local commit on a feature branch.
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§12 DoD, stack), `.claude/state/08-infra-and-deployment.md` (deliverables + ACs — authoritative, do not restate), `docs/runbook.md` (UC-007 started the Caddy/DNS section — extend it), `docs/decisions.md`.

## Title

One VPS, one command to deploy, automatic backups, and a runbook a tired founder can follow at 2 a.m. — target running cost under €10/month for one fleet.

## VERIFIABILITY REALITY (read first — defines "done" here)

This sandbox has **no VPS, no real domain/DNS, no S3-compatible object storage, and no external pinger**, so UC-008's acceptance criteria split into two classes:

- **Code/config-verifiable HERE (must pass before ship):** the small backend hooks compile under `-warnaserror` and keep `dotnet test` green; `docker compose -f infra/docker-compose.{dev,prod}.yml config` validates (syntax + interpolation); the Caddyfile passes `caddy validate` (if caddy is available, else a structural self-review); `infra/restore.sh` restores a `pg_dump -Fc` into a throwaway Postgres container and `SELECT count(*) FROM orders` succeeds; GitHub Actions YAML is well-formed (`actionlint`/yaml parse); Dockerfiles build locally IF Docker build is feasible here (image-size/HEALTHCHECK assertions), else a structural review + documented expectation.
- **Operational — NOT executable here, documented as tested manual runbook steps (AC#1,2,4,5,6,7 largely):** fresh-VPS-to-running <45 min; `git push main` deploy + auto-rollback on broken health check; HTTPS + WebSockets on `demo.{domain}`/`second.{domain}`; Postgres not internet-reachable (nmap); idle <700 MB RAM; cost sheet with real prices. These are delivered as correct artifacts + step-by-step runbook instructions; their acceptance is a manual step the founder runs on real infra. The spec/WIs must mark each such AC as "artifact produced + runbook-documented; operational verification deferred to real infra."

## Deliverables (per assignment 08 §1–8)

1. **Containers**: `/api/Dockerfile` (multi-stage, aspnet runtime — NOTE: project targets .NET 10, so use the dotnet/aspnet:10.0 runtime tag, not 9.0 as the assignment's example says; document the deviation; non-root, HEALTHCHECK `/health/live`, small image) + `/web/Dockerfile` (Node build → `caddy:2-alpine` static serve, SPA cache headers, `/api/*`+`/hubs/*` proxy with WebSocket). Images tagged git-SHA + latest → GHCR (in CI).
2. **Compose**: `infra/docker-compose.dev.yml` (db + api hot-reload + web Vite + log-only SMS; seeds on start) and `infra/docker-compose.prod.yml` (caddy/web/api/db/backup; resource limits api 512MB/db 1GB; `unless-stopped`; only Caddy exposes 80/443; Postgres no public port). `.env.example` documenting every variable.
3. **Caddy**: `Caddyfile` — `{$DOMAIN}` + `*.{$DOMAIN}` wildcard via DNS challenge (document Cloudflare + Hetzner variants; fallback on-demand TLS documented); security headers, gzip/zstd, 1 MB body limit (logo 300 KB), auth rate-limit 60/min/IP.
4. **CI/CD**: `.github/workflows/ci.yml` (restore, build -warnaserror, dotnet test Testcontainers, npm ci/lint/vitest, Playwright smoke; fails on warning) + `deploy.yml` (build+push images → SSH VPS → pull/up → migrate via api entrypoint flag → health-check `/health/ready` 60s → auto-rollback to previous tag on failure) + secrets list (VPS_HOST, VPS_SSH_KEY, GHCR_TOKEN).
5. **Backups**: `backup` container (cron 02:30 Europe/Prague: `pg_dump -Fc` → gzip → S3 via rclone/aws-cli; 14 daily/8 weekly; + `/data/fleets` logos) + `infra/restore.sh <file>` (restore into a fresh DB) + `.github/workflows/restore-test.yml` (weekly: download latest, restore into throwaway PG, `SELECT count(*) FROM orders`, open an issue on failure).
6. **Monitoring (free tier)**: external uptime pinger docs; Serilog JSON to stdout + `docker logs` + logrotate 100 MB/container; `/metrics` (prometheus-net, internal-network only) + optional Grafana `--profile ops`; disk-alert cron (>85% → `dotnet run -- send-sms`); API 5xx/min counter → if >10, one push to FleetAdmin of the `ops` fleet.
7. **Runbook** `docs/runbook.md` (extend UC-007's): provision VPS → DNS → first deploy + create-superadmin + first fleet → add-a-fleet (10 min) → rotate secrets → restore-from-backup → "site is down" checklist → monthly cost.
8. **Cost sheet** `docs/costs.md`: VPS + object storage + domain + SMS estimate + DNS; total for 1 fleet + marginal per additional fleet (~SMS only).

## Acceptance criteria

The 7 in `.claude/state/08-infra-and-deployment.md` are binding AS ARTIFACTS + runbook steps; operational execution is deferred to real infra per the Verifiability Reality above. Code/config-verifiable slices (app hooks compile + suite green; compose `config` validates; restore.sh round-trips locally; CI YAML well-formed) MUST pass before ship.

## Out of scope

Kubernetes, Terraform, multi-region, anything with a monthly bill beyond the VPS + object storage. Actually provisioning/running a live VPS (no infra in this environment).

## Non-functional requirements

- The backend hooks (migration entrypoint flag, `/metrics`, `send-sms` CLI, 5xx-counter push) follow `.claude/rules` (csharp-style, logging, the existing CLI-arg-intercept pattern from the create-superadmin command, background-job/TimeProvider where relevant), compile under `-warnaserror`, and keep `dotnet test` green. prometheus-net NuGet version-checked for .NET 10.
- Secrets never committed; `.env.example` only. Dockerfiles non-root. No new runtime cost.
- Quality gate (blocking, what's runnable here): `dotnet build -warnaserror` + `dotnet test`; web unchanged unless the web Dockerfile/build touches it (then lint/tsc/test/build/size); `docker compose config` on both files; `infra/restore.sh` local round-trip; YAML lint on the workflows. Operational ACs → runbook-documented.

## Notes for the designer

- Split into WIs: (A-lane, api) the small backend hooks — migration-on-startup entrypoint flag (+ a documented `--migrate` or env switch; ensure `dotnet ef database update` equivalent runs before the app serves), prometheus-net `/metrics` (internal-only), `send-sms` CLI command (reuse the create-superadmin arg-intercept pattern + ISmsSender), the 5xx-per-minute counter → FleetAdmin-of-`ops`-fleet push (reuse UC-005 push). (Infra-lane) the Dockerfiles, both compose files, Caddyfile, the 3 GitHub Actions workflows, backup container + restore.sh, monitoring docs, runbook, cost sheet.
- CRITICAL: mark every operational AC as "artifact + runbook-documented; operational verification on real infra" — do NOT fabricate VPS/deploy/RAM/cost measurements. The cost sheet uses published provider prices (Hetzner CX22, Hetzner/B2 object storage, domain, SMS @ ~1 CZK) cited as of the doc date, not invented.
- Correct the assignment's `aspnet:9.0` to `aspnet:10.0` (the project is .NET 10 — confirm from the csproj/global.json); document the deviation.
- Keep backend-hook WIs test-first where testable (the send-sms CLI + 5xx counter are unit/integration-testable; the entrypoint flag is verified by a compose `config` + a documented run). Verification tools: dotnet-test / dotnet-build for the hooks; the infra WIs are conductor-verified (compose config, restore.sh, yaml lint) — designer may mark them verification tool dotnet-build or note "conductor-verified infra" since the enum has no 'infra' tool.
