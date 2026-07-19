#!/usr/bin/env bash
# recount.sh — recount the drift-prone figures the docs warn about.
# READ-ONLY, deterministic. No writes, no network, no build.
# Usage:  bash recount.sh
# Docs drift as slices land (BUILD_MANUAL.md warns of this). Trust THIS output,
# not any hard-coded count in a README/BUILD_MANUAL/ADR.
set -euo pipefail

# Resolve repo root from git (read-only) so the script works from any cwd.
ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  # Fallback: script lives at <root>/.claude/skills/tyche-diagnostics-and-tooling/scripts/
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
fi
cd "$ROOT"

PROV="packages/contracts/src/provider.ts"
CMDS="packages/terminal-kernel/src/commands.ts"
COMPS="apps/web/src/modules/components.ts"

# 1. PROVIDER_CAPABILITY_KEYS — count quoted entries inside the `as const` tuple.
caps=$(awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next} /\] as const;/{f=0} f' "$PROV" \
       | grep -cE "^\s*'")

# 2. DEFAULT_COMMANDS — one `cmd({` per registered command (1 command : 1 moduleId).
commands=$(grep -c '^  cmd({' "$CMDS")

# 3. moduleComponents — one lazy-import entry per wired web module.
modules=$(grep -cE "^\s+'?[a-zA-Z0-9-]+'?: lazy\(" "$COMPS")

# 4. Vitest test files — exactly what vitest.config.ts collects (*.test.ts, not e2e).
testfiles=$(find packages apps -name '*.test.ts' -not -path '*/node_modules/*' \
            -not -path '*/dist/*' | wc -l | tr -d ' ')

# 5. Playwright e2e specs — testDir is ./tests/e2e.
e2especs=$(find tests/e2e -name '*.spec.ts' 2>/dev/null | wc -l | tr -d ' ')

printf '%-28s %6s   (source of truth)\n' "FIGURE" "COUNT"
printf '%-28s %6s   %s\n' "PROVIDER_CAPABILITY_KEYS"  "$caps"      "$PROV"
printf '%-28s %6s   %s\n' "DEFAULT_COMMANDS"          "$commands"  "$CMDS"
printf '%-28s %6s   %s\n' "moduleComponents"          "$modules"   "$COMPS"
printf '%-28s %6s   %s\n' "vitest test files (.test.ts)" "$testfiles" "vitest.config.ts include"
printf '%-28s %6s   %s\n' "e2e spec files (.spec.ts)"  "$e2especs"  "tests/e2e"

echo
echo "Sanity invariants (a mismatch = a real bug, not just doc drift):"
if [ "$commands" -eq "$modules" ]; then
  echo "  OK  DEFAULT_COMMANDS ($commands) == moduleComponents ($modules)  [1 command : 1 module]"
else
  echo "  WARN DEFAULT_COMMANDS ($commands) != moduleComponents ($modules) — an orphan command or module. Run wiring-audit.sh."
fi
