# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Backup sidecar: nightly pg_dump + logo backup → S3-compatible object storage.
#
# Base is postgres:16-alpine so `pg_dump` matches the server major version exactly
# (a mismatch can refuse to dump). Adds rclone (S3 upload), gzip, tzdata (for the
# Europe/Prague cron), and dcron. The cron fires backup.sh at 02:30 Europe/Prague.
# ─────────────────────────────────────────────────────────────────────────────
FROM postgres:16-alpine

RUN apk add --no-cache rclone gzip tzdata dcron coreutils

ENV TZ=Europe/Prague
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# 02:30 every day, Europe/Prague (container TZ set above). Logs go to the container
# stdout via the redirect so `docker logs taxi_backup` shows each run.
RUN echo '30 2 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1' > /etc/crontabs/root

# Run crond in the foreground (PID 1) so the container stays up and logs stream.
CMD ["crond", "-f", "-l", "8"]
