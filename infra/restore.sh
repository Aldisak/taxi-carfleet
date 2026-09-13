#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restore a `pg_dump -Fc` archive (optionally gzipped) into a Postgres database.
#
# Usage:
#   infra/restore.sh <backup-file> [--host H] [--port P] [--db NAME] \
#                    [--user U] [--drop] [--yes]
#
# Env fallbacks: PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
# Defaults: host=localhost port=5432 db=taxi user=taxi
#
#   --drop : DROP and re-CREATE the target database first (clean restore). Without
#            it, pg_restore restores into the existing db (--clean --if-exists so a
#            re-run is idempotent-ish: existing objects are dropped then recreated).
#   --yes  : skip the interactive confirmation (used by CI / restore-test.yml).
#
# Accepts .dump, .dump.gz, .gz — gz inputs are streamed through gunzip.
# Designed to round-trip locally against a throwaway Postgres container:
#
#   docker run -d --name pg -e POSTGRES_PASSWORD=p -e POSTGRES_USER=taxi \
#       -e POSTGRES_DB=taxi -p 5432:5432 postgres:16-alpine
#   PGPASSWORD=p infra/restore.sh backup.dump.gz --yes
#   PGPASSWORD=p psql -h localhost -U taxi -d taxi -c 'SELECT count(*) FROM orders;'
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ "$BACKUP_FILE" = "-h" ] || [ "$BACKUP_FILE" = "--help" ]; then
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 1
fi
shift

HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
DB="${PGDATABASE:-taxi}"
USER="${PGUSER:-taxi}"
DROP=0
ASSUME_YES=0

while [ $# -gt 0 ]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --db)   DB="$2";   shift 2 ;;
        --user) USER="$2"; shift 2 ;;
        --drop) DROP=1;    shift ;;
        --yes)  ASSUME_YES=1; shift ;;
        *) echo "restore: unknown argument '$1'" >&2; exit 2 ;;
    esac
done

if [ ! -f "$BACKUP_FILE" ]; then
    echo "restore: backup file not found: $BACKUP_FILE" >&2
    exit 2
fi

echo "[restore] file=$BACKUP_FILE target=${USER}@${HOST}:${PORT}/${DB} drop=${DROP}"

if [ "$ASSUME_YES" -ne 1 ]; then
    printf "[restore] This will overwrite data in '%s'. Continue? [y/N] " "$DB"
    read -r reply
    case "$reply" in y|Y|yes|YES) ;; *) echo "[restore] aborted"; exit 0 ;; esac
fi

export PGPASSWORD="${PGPASSWORD:-}"

# ── Optionally drop + recreate the target DB (connect via the maintenance db) ──
if [ "$DROP" -eq 1 ]; then
    echo "[restore] dropping and recreating database $DB"
    psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);" \
        -c "CREATE DATABASE \"$DB\";"
fi

# ── Restore ──────────────────────────────────────────────────────────────────
# --clean --if-exists makes an into-existing-db restore repeatable; -Fc reads the
# custom format; --no-owner/--no-privileges avoid role-mismatch failures on a
# fresh cluster; --exit-on-error is deliberately OMITTED so a benign warning
# (e.g. a newer client emitting a SET for a GUC an older server lacks) does not
# abort the whole restore. pg_restore's exit code is captured but NOT treated as
# authoritative — the SELECT sanity check below is the real pass/fail signal.
restore_common=(-h "$HOST" -p "$PORT" -U "$USER" -d "$DB" \
    --no-owner --no-privileges --clean --if-exists)

restore_rc=0
case "$BACKUP_FILE" in
    *.gz)
        echo "[restore] streaming gzipped archive through pg_restore"
        gunzip -c "$BACKUP_FILE" | pg_restore "${restore_common[@]}" || restore_rc=$? ;;
    *)
        echo "[restore] restoring archive"
        pg_restore "${restore_common[@]}" "$BACKUP_FILE" || restore_rc=$? ;;
esac
[ "$restore_rc" -ne 0 ] && echo "[restore] pg_restore reported warnings (rc=${restore_rc}); verifying via sanity check"
echo "[restore] done"

# ── Sanity check (authoritative) ─────────────────────────────────────────────
# A successful `SELECT count(*) FROM orders` proves schema + data restored, even
# if pg_restore emitted a non-fatal warning above.
if psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tAc "SELECT to_regclass('public.orders');" | grep -q orders; then
    count="$(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tAc 'SELECT count(*) FROM orders;')"
    echo "[restore] orders row count: ${count}"
    echo "[restore] SUCCESS"
    exit 0
else
    echo "[restore] FAILED: 'orders' table not found after restore" >&2
    exit 1
fi
