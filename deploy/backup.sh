#!/usr/bin/env bash
# PhysEZ nightly backup: PostgreSQL dump + uploads archive, with rotation.
#
# Install as a cron job (see deploy/physez-backup.cron), or test by hand:
#   ./deploy/backup.sh
#
# Restoring is documented in deploy/RESTORE.md.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/physez}"
UPLOAD_DIR="${UPLOAD_DIR:-/srv/physez/server/uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# DATABASE_URL comes from the API's env file so the backup always targets the
# same database the app uses.
ENV_FILE="${ENV_FILE:-/srv/physez/server/.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL is not set and could not be read from $ENV_FILE}"

mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/physez-db-$STAMP.dump"
FILES_FILE="$BACKUP_DIR/physez-uploads-$STAMP.tar.gz"

echo "==> Dumping the database"
# Custom format (-Fc): compressed and restorable with pg_restore.
pg_dump --format=custom --no-owner --dbname "$DATABASE_URL" --file "$DB_FILE"

echo "==> Archiving uploads"
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$FILES_FILE" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
else
  echo "    (no upload directory at $UPLOAD_DIR, skipping)"
fi

# A zero-byte dump means the backup silently failed; catch it now, not during
# a restore.
if [ ! -s "$DB_FILE" ]; then
  echo "ERROR: the database dump is empty" >&2
  exit 1
fi

echo "==> Removing backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'physez-*' -type f -mtime "+$RETENTION_DAYS" -delete

echo "==> Done"
ls -lh "$BACKUP_DIR" | tail -n 5
