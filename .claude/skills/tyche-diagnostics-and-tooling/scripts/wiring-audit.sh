#!/usr/bin/env bash
# wiring-audit.sh <MODULEID> — verify every wiring point of one module exists.
# READ-ONLY, deterministic. No writes, no network, no build.
# Usage:  bash wiring-audit.sh order-book
#         bash wiring-audit.sh valuation
# Prints PRESENT / MISSING / N-A per wiring point. See the interpretation guide
# in SKILL.md for what a healthy vs broken result looks like.
set -euo pipefail

MID="${1:-}"
if [ -z "$MID" ]; then
  echo "usage: bash wiring-audit.sh <MODULEID>   (e.g. order-book, chart, valuation)" >&2
  exit 2
fi

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$ROOT" ] && ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

CMDS="packages/terminal-kernel/src/commands.ts"
COMPS="apps/web/src/modules/components.ts"
MODDIR="apps/web/src/modules"
ROUTES="apps/api/src/routes"
APICLIENT="apps/web/src/providers/apiClient.ts"

mark() { # $1 = PRESENT|MISSING|N/A|INFO, $2 = message
  printf '  [%-7s] %s\n' "$1" "$2"
}

echo "Wiring audit for moduleId: '$MID'"
echo "------------------------------------------------------------"

# ---- Point 1: command(s) in commands.ts referencing this moduleId ----------
# Extract each cmd({...}) block; for the target moduleId print its id + requiredCapabilities.
CMD_INFO="$(awk -v target="$MID" '
  BEGIN { q = sprintf("%c", 39) }                       # single quote
  /^  cmd\(\{/ { inblock=1; block=$0 "\n"; next }
  inblock { block = block $0 "\n" }
  inblock && /^  \}\),?$/ {
    inblock=0
    if (block ~ ("moduleId: " q target q)) {
      id="?"
      if (match(block, ("id: " q "[A-Z0-9]+" q))) {
        id=substr(block, RSTART, RLENGTH); sub("id: " q, "", id); sub(q, "", id)
      }
      reqs=""
      if (match(block, /requiredCapabilities: \[[^]]*\]/)) {
        reqs=substr(block, RSTART, RLENGTH)
        sub(/requiredCapabilities: \[/, "", reqs); sub(/\]/, "", reqs)
        gsub(q, "", reqs); gsub(/[ ]/, "", reqs)
      }
      print id "|" reqs
    }
  }
' "$CMDS")"

echo "1) Command entry ($CMDS)"
if [ -z "$CMD_INFO" ]; then
  mark MISSING "no DEFAULT_COMMANDS entry has moduleId: '$MID' (orphan module — nothing opens it)"
  CAPS=""
else
  CAPS=""
  while IFS='|' read -r cid creqs; do
    [ -z "$cid" ] && continue
    mark PRESENT "command $cid  requiredCapabilities=[${creqs}]"
    CAPS="$CAPS ${creqs//,/ }"
  done <<< "$CMD_INFO"
fi

# ---- Point 2: components.ts lazy entry -------------------------------------
echo "2) components.ts lazy entry ($COMPS)"
ENTRY="$(grep -oE "'?${MID}'?: lazy\(\(\) =>[^)]*import\('\./[A-Za-z0-9]+'" "$COMPS" || true)"
IMPORTNAME="$(printf '%s' "$ENTRY" | grep -oE "import\('\./[A-Za-z0-9]+'" | grep -oE "[A-Za-z0-9]+'" | tr -d "'" || true)"
if [ -n "$IMPORTNAME" ]; then
  mark PRESENT "moduleComponents['$MID'] -> import('./$IMPORTNAME')"
else
  mark MISSING "no moduleComponents['$MID'] entry (falls back to BetaPlaceholder — assertModuleCoverage() throws if a STABLE command points here)"
fi

# ---- Point 3: component file on disk ---------------------------------------
echo "3) Component file ($MODDIR/)"
if [ -n "$IMPORTNAME" ] && [ -f "$MODDIR/$IMPORTNAME.tsx" ]; then
  mark PRESENT "$MODDIR/$IMPORTNAME.tsx"
elif [ -n "$IMPORTNAME" ]; then
  mark MISSING "components.ts imports './$IMPORTNAME' but $MODDIR/$IMPORTNAME.tsx does not exist"
else
  mark N/A "no import name resolved from point 2"
fi

# Normalise the collected capability list (dedupe, strip blanks).
CAPS="$(printf '%s\n' $CAPS | sed '/^$/d' | sort -u)"

# ---- Point 4: API route per required capability ----------------------------
echo "4) API route via serveCapability ($ROUTES/)"
if [ -z "$CAPS" ]; then
  mark N/A "command declares no requiredCapabilities — analytics-only or local module (reuses existing data; no dedicated route expected). See tyche-architecture-contract."
else
  while read -r cap; do
    [ -z "$cap" ] && continue
    loc="$(grep -REn "serveCapability\([^)]*'${cap}'" "$ROUTES"/*.ts 2>/dev/null \
           | grep -v '\.test\.ts' | head -1 | cut -d: -f1-2 || true)"
    if [ -n "$loc" ]; then
      mark PRESENT "capability '$cap' served at $loc"
    else
      mark MISSING "no serveCapability(...,'$cap',...) route — panel will hard-gap for this capability"
    fi
  done <<< "$CAPS"
fi

# ---- Point 5: apiClient reaches those routes -------------------------------
echo "5) apiClient wiring ($APICLIENT + component fetch)"
if [ -z "$CAPS" ]; then
  mark N/A "no capability to fetch — module renders from existing data / local state"
else
  # The component (or its co-located loader) must fetch via the shared api client.
  if [ -n "$IMPORTNAME" ] && [ -f "$MODDIR/$IMPORTNAME.tsx" ] \
     && grep -qE "\bapi\.|useApiData|useQuoteStream" "$MODDIR/$IMPORTNAME.tsx"; then
    mark PRESENT "$IMPORTNAME.tsx fetches through the api client (api./useApiData/useQuoteStream)"
  else
    mark INFO "no direct api./useApiData call in $IMPORTNAME.tsx — check for a co-located loader module or a shared hook"
  fi
fi

echo "------------------------------------------------------------"
echo "PRESENT on points 1-3 + a route for every requiredCapability = fully wired."
echo "MISSING on 1/2/3 = broken (see wiring checklist in tyche-vertical-slice-campaign)."
echo "N/A on 4/5 with requiredCapabilities=[] = expected for analytics-only modules."
