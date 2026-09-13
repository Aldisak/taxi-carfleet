# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Custom Caddy build for the EDGE proxy.
#
# Stock caddy:2-alpine cannot do wildcard DNS-01 TLS or rate limiting, so we
# xcaddy-build Caddy with:
#   - github.com/caddy-dns/cloudflare   (wildcard DNS-01 via Cloudflare)
#   - github.com/caddy-dns/hetzner      (wildcard DNS-01 via Hetzner DNS)
#   - github.com/mholt/caddy-ratelimit  (rate_limit directive — /api/v1/auth/*)
#
# Only the DNS plugin matching your DNS host is used at runtime; both are compiled
# in so the same image works for either provider (see infra/Caddyfile acme_dns).
# ─────────────────────────────────────────────────────────────────────────────

FROM caddy:2-builder-alpine AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/caddy-dns/hetzner \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
