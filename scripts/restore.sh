#!/usr/bin/env sh
# Restore the hosted-mode data volume from a backup made by scripts/backup.sh.
# This REPLACES the entire volume — every account, workspace, note, alert, and
# audit entry not in the chosen backup is lost. The API is stopped during the
# swap and started again afterward.
#
#   ./scripts/restore.sh <backup.tar.gz> [--yes]
#
# Run the restore drill in docs/LAUNCH.md once before launch so you trust this.
set -eu

cd "$(dirname "$0")/.."

ARCHIVE=${1:-}
ASSUME_YES=${2:-}
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

command -v docker >/dev/null 2>&1 || { echo "error: docker is required" >&2; exit 1; }
[ -n "$ARCHIVE" ] || { echo "usage: scripts/restore.sh <backup.tar.gz> [--yes]" >&2; exit 1; }
[ -f "$ARCHIVE" ] || { echo "error: archive not found: $ARCHIVE" >&2; exit 1; }

VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)tyche-data$' | head -n1 || true)
[ -n "$VOLUME" ] || { echo "error: tyche-data volume not found — is Tyche deployed?" >&2; exit 1; }

ARCHIVE_DIR=$(cd "$(dirname "$ARCHIVE")" && pwd)
ARCHIVE_FILE=$(basename "$ARCHIVE")

echo "This REPLACES all data in volume '$VOLUME' with:"
echo "  $ARCHIVE_DIR/$ARCHIVE_FILE"
echo "Everything not in this backup will be lost."
if [ "$ASSUME_YES" != "--yes" ]; then
  printf "Type 'restore' to proceed: "
  read -r reply
  [ "$reply" = "restore" ] || { echo "Aborted."; exit 1; }
fi

$COMPOSE stop tyche
# Empty the volume (each top-level entry, incl. dotfiles) then unpack the backup.
# `rm -rf` per entry — not `find -delete`, which busybox (alpine) lacks.
docker run --rm -v "$VOLUME":/data -v "$ARCHIVE_DIR":/backup:ro alpine:3 \
  sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf '/backup/$ARCHIVE_FILE' -C /data"
$COMPOSE start tyche

echo "Restored from $ARCHIVE_FILE. Verify: open the site and sign in."
