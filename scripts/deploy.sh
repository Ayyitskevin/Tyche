#!/usr/bin/env sh
# One-command production deploy: Tyche hosted SaaS behind Caddy auto-HTTPS.
#   ./scripts/deploy.sh            first run creates .env.prod, then deploys
# Prereqs: Docker with the compose plugin; DNS A record for your domain.
set -eu

cd "$(dirname "$0")/.."

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose is required (https://docs.docker.com/compose/install/)" >&2
  exit 1
fi

if [ ! -f .env.prod ]; then
  cp deploy/env.prod.example .env.prod
  # Generate the session secret so a fresh deploy is never silently insecure.
  if command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -base64 32)
  else
    secret=$(head -c 32 /dev/urandom | base64)
  fi
  # BSD/GNU sed portability: write via a temp file.
  sed "s|^TYCHE_SESSION_SECRET=$|TYCHE_SESSION_SECRET=${secret}|" .env.prod > .env.prod.tmp
  mv .env.prod.tmp .env.prod
  echo ""
  echo ".env.prod created (session secret generated)."
  echo "Edit it now — at minimum set TYCHE_DOMAIN — then re-run:"
  echo "  \$EDITOR .env.prod && ./scripts/deploy.sh"
  exit 0
fi

# Refuse to deploy the example domain.
if grep -q '^TYCHE_DOMAIN=terminal.example.com$' .env.prod; then
  echo "error: set TYCHE_DOMAIN in .env.prod to your real domain first." >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

domain=$(grep '^TYCHE_DOMAIN=' .env.prod | cut -d= -f2)
billing=$(grep '^TYCHE_BILLING=' .env.prod | cut -d= -f2 || echo none)
echo ""
echo "Tyche is deploying → https://${domain}"
echo ""
echo "Next steps:"
echo "  1. Ensure DNS A/AAAA for ${domain} points at this machine (Caddy needs it for TLS)."
echo "  2. Open https://${domain} and register — the first account is the admin."
echo "  3. Billing driver: ${billing}. For real charges set TYCHE_BILLING=stripe"
echo "     (+ STRIPE_* keys; webhook URL: https://${domain}/api/billing/webhook)"
echo "     — see docs/BILLING.md, then re-run this script."
echo "  4. Back up before launch: ./scripts/backup.sh — then run the restore"
echo "     drill in docs/LAUNCH.md so you trust it, and schedule it from cron."
echo "  5. Launch checklist: docs/LAUNCH.md"
