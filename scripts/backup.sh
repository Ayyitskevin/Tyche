#!/usr/bin/env sh
# Cold, consistent backup of the hosted-mode data volume — accounts (users.json),
# every per-user store, and the durable audit log — to a timestamped tarball.
# The whole volume is captured, so it is backend-agnostic (file OR sqlite+WAL)
# and survives future layout changes. The API is stopped for the snapshot so
# nothing is written mid-tar; graceful shutdown checkpoints the SQLite WAL first,
# so the stop is quick.
#
#   ./scripts/backup.sh [output-dir]     # default ./backups
#
# Schedule it from cron and copy the tarball OFF this box — see
# docs/LAUNCH.md → "Backup & restore". Prereqs: the deploy from scripts/deploy.sh.
set -eu

cd "$(dirname "$0")/.."

OUT_DIR=${1:-./backups}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

command -v docker >/dev/null 2>&1 || { echo "error: docker is required" >&2; exit 1; }
[ -f .env.prod ] || { echo "error: .env.prod not found — run scripts/deploy.sh first." >&2; exit 1; }

# The named volume is prefixed with the compose project name (the directory).
VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)tyche-data$' | head -n1 || true)
[ -n "$VOLUME" ] || { echo "error: tyche-data volume not found — is Tyche deployed?" >&2; exit 1; }

mkdir -p "$OUT_DIR"
ABS_OUT=$(cd "$OUT_DIR" && pwd)
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="tyche-$TS.tar.gz"

echo "Backing up volume '$VOLUME' -> $ABS_OUT/$NAME"

# Stop the API for a quiescent snapshot; ALWAYS bring it back, even if tar fails,
# so a backup can never leave the service down.
$COMPOSE stop tyche
trap '$COMPOSE start tyche >/dev/null 2>&1 || true' EXIT

docker run --rm -v "$VOLUME":/data:ro -v "$ABS_OUT":/backup alpine:3 \
  tar czf "/backup/$NAME" -C /data .

$COMPOSE start tyche
trap - EXIT

SIZE=$(du -h "$ABS_OUT/$NAME" | cut -f1)
echo "Done: $ABS_OUT/$NAME ($SIZE)"
echo "Now copy it OFF this box (rclone/S3/scp) — see docs/LAUNCH.md."
