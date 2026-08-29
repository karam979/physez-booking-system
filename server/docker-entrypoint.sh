#!/bin/sh
# Runs pending migrations, then hands off to the container command.
#
# Migrations run before the API starts so new code never meets an old schema.
# Set RUN_MIGRATIONS=false to skip this and run `npm run migrate:up` yourself
# as a separate step — do that if you ever run more than one API replica, so
# they do not race each other.

set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "==> Running database migrations"
  npm run migrate:up
else
  echo "==> Skipping migrations (RUN_MIGRATIONS=false)"
fi

echo "==> Starting the PhysEZ API"
exec "$@"
