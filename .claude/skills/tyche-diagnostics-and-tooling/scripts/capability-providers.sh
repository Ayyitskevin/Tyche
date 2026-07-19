#!/usr/bin/env bash
# capability-providers.sh — for each of the typed capability keys, list which
# adapter files declare it true in their descriptor (or MOCK_CAPABILITIES).
# READ-ONLY, deterministic. No writes, no network, no build.
# Usage:  bash capability-providers.sh
#
# A capability with ONLY mock listed = demo-only (no real adapter serves it yet).
# A capability with NO adapter at all (bonds, portfolio) is not served by the
# provider plane — portfolio is stored/persisted data, not a capability route.
# The count of keys is read live from provider.ts so it can never go stale.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$ROOT" ] && ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

PROV="packages/contracts/src/provider.ts"
ADAPTER_DIR="packages/data-adapters/src"

# Live list of capability keys (source of truth — never hard-coded here).
KEYS="$(awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const;/{f=0} f' "$PROV" \
        | grep -oE "'[a-zA-Z]+'" | tr -d "'")"

# Provider source files (exclude tests). MockProvider.ts holds MOCK_CAPABILITIES.
FILES="$(find "$ADAPTER_DIR" -name '*.ts' -not -name '*.test.ts' | sort)"

nkeys=$(printf '%s\n' "$KEYS" | grep -c .)
echo "Capability -> adapters that declare it true   ($nkeys keys from $PROV)"
echo "=================================================================="

for cap in $KEYS; do
  providers=""
  for f in $FILES; do
    # Match `<cap>: true` inside a capabilities/MOCK_CAPABILITIES block, whether
    # multi-line (indented) or single-line (`{ ...NO_CAPABILITIES, news: true }`).
    # The leading non-letter guard stops `quotes` matching inside `batchQuotes`.
    if grep -qE "(^|[^A-Za-z])${cap}: true" "$f"; then
      base="$(basename "$f" .ts)"
      # MockProvider.ts -> mock; stubs/ real impls keep their name.
      [ "$base" = "MockProvider" ] && base="mock"
      providers="$providers ${base}"
    fi
  done
  providers="$(printf '%s' "$providers" | sed 's/^ //')"
  if [ -z "$providers" ]; then
    printf '  %-22s (none — no adapter serves this capability)\n' "$cap"
  else
    printf '  %-22s %s\n' "$cap" "$providers"
  fi
done

echo
echo "Interpretation:"
echo "  - only 'mock' listed  => demo-only capability, no real source shipped yet."
echo "  - 'mock' appears on nearly every key (it is the always-last fallback)."
echo "  - real adapters (Binance/Frankfurter/Stooq/Finnhub/Gdelt/Secedgar/Fred/Dexscreener)"
echo "    win routing BEFORE mock when enabled via TYCHE_PROVIDERS. See tyche-config-and-flags."
echo "  - Capability MODEL (routing, servesSymbol, degrade-never-crash) lives in"
echo "    tyche-architecture-contract — this script only MEASURES the current wiring."
