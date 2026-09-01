#!/usr/bin/env bash
set -euo pipefail

# Camino de actualización de producción. OJO: `git reset --hard` descarta
# commits locales y trabajo sin commitear en este checkout. Para sólo
# rebuildear alcanza con `docker compose up -d --build`.

cd "$(dirname "$0")"

echo "==> Fetching latest changes..."
git fetch origin main

echo "==> Checking out main..."
git checkout main

echo "==> Resetting to origin/main..."
git reset --hard origin/main

echo "==> Rebuilding and restarting containers..."
docker compose up -d --build

echo "==> Done."
