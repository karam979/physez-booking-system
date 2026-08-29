#!/usr/bin/env bash
# PhysEZ API deploy: pull, install, migrate, restart.
# Run on the VPS as the user that owns the checkout:
#   ./deploy/deploy.sh
#
# The frontends deploy themselves from Git via Netlify; this script only
# handles the API.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/physez}"
SERVICE="${SERVICE:-physez-api}"
BRANCH="${BRANCH:-main}"

echo "==> Deploying PhysEZ API from $APP_DIR ($BRANCH)"
cd "$APP_DIR"

# Refuse to deploy over uncommitted edits made directly on the server.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: the working tree has uncommitted changes. Commit or discard them first." >&2
  exit 1
fi

echo "==> Pulling"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing server dependencies"
cd "$APP_DIR/server"
npm ci --omit=dev

echo "==> Running database migrations"
# Migrations run before the restart so the new code never meets an old schema.
npm run migrate:up

echo "==> Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Waiting for the API to come back"
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "==> Health check passed"
    curl -fsS http://127.0.0.1:3000/api/health
    echo
    exit 0
  fi
  sleep 1
done

echo "ERROR: the API did not become healthy. Check: sudo journalctl -u $SERVICE -n 50" >&2
exit 1
