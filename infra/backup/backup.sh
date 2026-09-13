#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Nightly backup: pg_dump -Fc | gzip → S3-compatible storage via rclone, plus the
# per-fleet logo files under /data/fleets. Retention: 14 daily + 8 weekly.
#
# Env (from the backup service in docker-compose.prod.yml):
#   PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD   — Postgres connection
#   RCLONE_REMOTE                                — e.g. s3:taxi-backups
#   RCLONE_CONFIG_S3_*                           — rclone S3 remote config (env-driven)
#   RETAIN_DAILY (default 14)  RETAIN_WEEKLY (default 8)
#
# The dump uses the custom (-Fc) format so infra/restore.sh can pg_restore it.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

RETAIN_DAILY="${RETAIN_DAILY:-14}"
RETAIN_WEEKLY="${RETAIN_WEEKLY:-8}"
REMOTE="${RCLONE_REMOTE:?RCLONE_REMOTE is required}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DOW="$(date +%u)"          # 1=Mon .. 7=Sun; weekly snapshot taken on Sunday
WORKDIR="$(mktemp -d)"
DB_FILE="taxi-${STAMP}.dump.gz"
LOGO_FILE="fleets-${STAMP}.tar.gz"

log() { echo "[backup] $(date -Iseconds) $*"; }
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

log "start db=${PGDATABASE} host=${PGHOST}"

# ── 1. Database: pg_dump -Fc → gzip ──────────────────────────────────────────
pg_dump -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE" -Fc \
    | gzip -9 > "${WORKDIR}/${DB_FILE}"
log "pg_dump done size=$(du -h "${WORKDIR}/${DB_FILE}" | cut -f1)"

# ── 2. Logo files (best-effort — absence is not fatal) ───────────────────────
if [ -d /data/fleets ]; then
    tar -czf "${WORKDIR}/${LOGO_FILE}" -C /data fleets || log "logo tar failed (continuing)"
fi

# ── 3. Upload: daily/ always; weekly/ additionally on Sundays ────────────────
rclone copy "${WORKDIR}/${DB_FILE}"  "${REMOTE}/daily/"  --s3-no-check-bucket
[ -f "${WORKDIR}/${LOGO_FILE}" ] && rclone copy "${WORKDIR}/${LOGO_FILE}" "${REMOTE}/daily/" --s3-no-check-bucket
if [ "$DOW" = "7" ]; then
    rclone copy "${WORKDIR}/${DB_FILE}"  "${REMOTE}/weekly/" --s3-no-check-bucket
    [ -f "${WORKDIR}/${LOGO_FILE}" ] && rclone copy "${WORKDIR}/${LOGO_FILE}" "${REMOTE}/weekly/" --s3-no-check-bucket
fi
log "upload done"

# ── 4. Retention: keep the newest N in each prefix ──────────────────────────
prune() {
    prefix="$1"; keep="$2"
    # List files newest-first, drop the first `keep`, delete the rest.
    rclone lsf "${REMOTE}/${prefix}/" --files-only 2>/dev/null \
        | sort -r \
        | tail -n +"$((keep + 1))" \
        | while IFS= read -r f; do
            [ -n "$f" ] || continue
            log "prune ${prefix}/${f}"
            rclone deletefile "${REMOTE}/${prefix}/${f}" || true
        done
}
# Daily prefix holds both db + logo files, so keep 2× the retention count to hold
# RETAIN_DAILY of EACH kind; weekly likewise.
prune daily  "$((RETAIN_DAILY * 2))"
prune weekly "$((RETAIN_WEEKLY * 2))"

log "complete"
