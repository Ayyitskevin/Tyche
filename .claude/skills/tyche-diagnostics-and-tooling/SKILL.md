---
name: tyche-diagnostics-and-tooling
description: >-
  MEASURE the Tyche system instead of eyeballing it or trusting a doc count. Load this when you
  need to know "how many X are there really?" (capabilities, commands, modules, tests, e2e specs),
  when a README/BUILD_MANUAL/ADR number looks stale or two docs disagree, when a new module/command
  "doesn't open" or a panel shows an unexpected capability-gap and you must find the broken wiring
  point, when you want to know which adapter serves a capability, or when you need the built-in
  measurement tools (the conformance suite, the /api/providers + /api/health provider dashboard, the
  in-app SETTINGS provider/audit viewer, assertModuleCoverage). Triggers: "recount", "how many
  commands/capabilities/modules/tests", "is this count right", "doc says 41/24 but code says…",
  "wiring audit", "why doesn't my module render", "orphan module", "which providers supply X",
  "conformance report", "provider dashboard", "audit log". Ships three runnable read-only scripts in
  scripts/. NOT for changing behavior (route through tyche-change-control) and NOT for symptom→fix
  triage (tyche-debugging-playbook).
---

# Tyche Diagnostics & Tooling

**What this skill owns:** the shipped diagnostic scripts (`recount.sh`, `wiring-audit.sh`,
`capability-providers.sh`) and how to run the built-in measurement tools. Its job is to make you
**measure the repo, never trust a remembered or documented number** — Tyche has known doc drift
(§ "The drift problem"), so a figure you eyeball or copy from a doc is probably wrong.

Everything here is **read-only**. Nothing in this skill changes system behavior. If measuring leads
you to a fix, the fix routes through **tyche-change-control** like any other change.

---

## When NOT to use this skill (use the named sibling instead)

| You actually want to… | Go to |
|---|---|
| Change a count/wiring (add a command, module, capability) | **tyche-vertical-slice-campaign** (the executable recipe) → gated by **tyche-change-control** |
| Understand the capability MODEL (routing, `servesSymbol`, degrade-never-crash) — not just measure it | **tyche-architecture-contract** |
| Learn the conformance suite as a **test gate** (how to write/extend probes, what it guards in CI) | **tyche-validation-and-qa** |
| Map a symptom (500 error, blank panel, failing test) to a fix | **tyche-debugging-playbook** |
| Know what each env var/flag does or which adapter needs which key | **tyche-config-and-flags** |
| Run the full gate / understand the build & CI | **tyche-build-and-env** |
| Fix the stale numbers in the docs themselves | **tyche-docs-and-writing** (owns the drift register) |
| Understand a domain formula (Altman/beta/BSM) or a mislabel trap | **financial-terminal-reference** |

This skill **measures**. Those skills **explain, change, or fix**. Do not restate their rules here —
point to them.

---

## The drift problem (why this skill exists)

`docs/BUILD_MANUAL.md:1382-1383` already documents the discipline: README/CONTRIBUTING/BUILD_MANUAL
counts **drift as slices land**, so a builder must **recount** rather than trust the doc figure.
Observed contradictions (verified 2026-07-19 — trust the CODE column):

| A doc claims | Code reality | Where the stale claim lives |
|---|---|---|
| "24 typed capabilities" | **28** keys | README:114; BUILD_MANUAL:345,1410; ADR-0002 |
| "41 stable commands" (also "45" elsewhere) | **60** commands | README; BUILD_MANUAL:1417 / :1407 |
| Mock "declares 22 of 24" | **26 of 28** (all but `bonds`, `portfolio`) | BUILD_MANUAL:1410 |
| "~520+ tests / 66 files" | recount — see `recount.sh` | BUILD_MANUAL:1324,1407 |

**Rule: never write a raw count into a doc, PR, or skill without pairing it with the recount command
that produced it.** The scripts below exist so you never have to guess.

---

## Shipped scripts (`scripts/`)

All three are **read-only, deterministic, no network, no build**. They resolve the repo root via
`git rev-parse --show-toplevel`, so you can run them from anywhere. Run with `bash scripts/<name>.sh`.

### 1. `recount.sh` — recount the drift-prone figures

```bash
bash scripts/recount.sh
```

Counts, straight from the source-of-truth files:

| Figure | Source of truth |
|---|---|
| `PROVIDER_CAPABILITY_KEYS` | `packages/contracts/src/provider.ts` (the `as const` tuple) |
| `DEFAULT_COMMANDS` | `packages/terminal-kernel/src/commands.ts` (one `cmd({` each) |
| `moduleComponents` | `apps/web/src/modules/components.ts` (one `lazy(` entry each) |
| vitest test files (`.test.ts`) | what `vitest.config.ts` collects (excludes e2e) |
| e2e spec files (`.spec.ts`) | `tests/e2e/` (Playwright `testDir`) |

**Interpretation.** A **healthy** run also prints
`OK  DEFAULT_COMMANDS (N) == moduleComponents (N)` — the 1-command-to-1-module invariant. If it
prints `WARN … != …`, there is a real bug: either a command with no module (opens `BetaPlaceholder`)
or a module no command reaches (orphan). Find it with `wiring-audit.sh`. The raw counts themselves
are never "wrong" — they are the live truth; if a doc disagrees, the **doc** is stale (fix via
tyche-docs-and-writing, never by editing code to match a doc).

### 2. `wiring-audit.sh <MODULEID>` — verify one module is fully wired

```bash
bash scripts/wiring-audit.sh order-book     # a data module
bash scripts/wiring-audit.sh valuation      # analytics-only module
bash scripts/wiring-audit.sh calculator     # local module, no capabilities
```

A Tyche feature is wired across five points (the checklist owned by
**tyche-vertical-slice-campaign**). This script greps each and prints `PRESENT` / `MISSING` / `N/A`:

1. **Command entry** — a `DEFAULT_COMMANDS` entry with `moduleId: '<id>'`; prints the command id +
   its `requiredCapabilities`.
2. **`components.ts` lazy entry** — `moduleComponents['<id>'] -> import('./XModule')`.
3. **Component file** — `apps/web/src/modules/XModule.tsx` exists on disk.
4. **API route** — for **each** required capability, a `serveCapability(reply, registry, '<cap>', …)`
   route (in `apps/api/src/routes/`).
5. **apiClient wiring** — the component fetches through the shared client (`api.`/`useApiData`/
   `useQuoteStream`).

**Interpretation — what healthy vs broken looks like:**

| Result | Meaning |
|---|---|
| PRESENT on 1-3, and a route for every required capability | **fully wired** — module works |
| MISSING on 1 | orphan module: nothing opens it (a component with no command) |
| MISSING on 2 or 3 | command exists but renders `BetaPlaceholder`; if the command is `stable`, `assertModuleCoverage()` **throws at boot/test** |
| MISSING on 4 for a required capability | the panel will show a permanent capability-gap (`serveCapability` returns HTTP 200 `capability_unavailable`) |
| **N/A** on 4 & 5 with `requiredCapabilities=[]` | **expected and healthy** for analytics-only or local modules (they reuse existing data or compute client-side — see the analytics-only note in tyche-architecture-contract) |

Point 5 is a heuristic (a module may fetch via a co-located loader or shared hook); an `INFO` there is
a prompt to look closer, not a failure.

### 3. `capability-providers.sh` — which adapter serves each capability

```bash
bash scripts/capability-providers.sh
```

Lists every capability key (read live from `provider.ts`, so the key count can never go stale) and the
adapter files that declare it `true` (multi-line or single-line descriptor blocks; `MockProvider.ts`
is normalised to `mock`).

**Interpretation:**
- **only `mock`** on a key → demo-only capability; no real source ships for it yet.
- `mock` appears on almost every key — it is the **always-last fallback** (registration order puts it
  last; a real adapter enabled via `TYCHE_PROVIDERS` wins routing ahead of it).
- **`(none …)`** (currently `bonds`, `portfolio`) → not served by the provider plane at all;
  `portfolio` is stored/persisted data, not a capability route.
- This script only **measures** the current wiring. The routing model itself (first-match in
  registration order, `servesSymbol` venue-scoping, mock-appended-last) lives in
  **tyche-architecture-contract**; which adapter needs which key/UA lives in **tyche-config-and-flags**.

---

## Built-in measurement tools (already in the codebase)

Beyond the scripts, the system ships its own instrumentation. Use these to measure a **running**
instance or as part of a test.

### A. The conformance suite — `checkProviderConformance(provider)`

- **Where:** `packages/data-adapters/src/conformance.ts` (exported from the package barrel).
- **What it measures:** for every capability a provider declares `true`, it calls the matching method
  and runs `envelope(Schema).safeParse(result)` — validating the **full `{data, provenance}` envelope**
  against the Zod contract. Returns `ConformanceReport { provider, ok, checks[] }`. A declared
  capability with no probe auto-passes ("nothing to verify yet"); `fx` and `futures` have no probe.
- **How to run it:** it runs inside every adapter test. To exercise it read-only:
  `npx vitest run packages/data-adapters` (runs the conformance-backed adapter suites).
- **Cross-ref, do not re-teach:** the conformance suite **as a test gate** (writing/extending probes,
  what it guards in CI, how PluginHost quarantines a non-conformant operator plugin) is owned by
  **tyche-validation-and-qa**. Here it is a *measurement* tool: point a provider at it, read `ok`.

### B. Provider dashboard — `GET /api/providers` and `GET /api/health`

Against a running API (default `http://127.0.0.1:4010`):

```bash
curl -s http://127.0.0.1:4010/api/providers | head    # {data: descriptors[], aggregate: capabilities, provenance:null}
curl -s http://127.0.0.1:4010/api/health   | head    # includes providers[] + aggregate capabilities + mode: mock|mixed
```

- `/api/providers` (`apps/api/src/routes/health.ts:45`) returns every enabled provider's descriptor
  plus `aggregate` = the OR-union capability coverage (`registry.aggregateCapabilities()`).
- `/api/health` (`:15`) additionally reports `mode` (`mock` if every provider is mock, else `mixed`),
  version, uptime, billing, and the same providers/capabilities — the fastest live check of "what data
  can this instance actually serve right now."
- `GET /api/plugins` (`:54`) lists installed operator plugins and their gate status
  (active / quarantined / disabled).
- Client wrappers: `api.getProviders()`, `api.getPlugins()` (`apps/web/src/providers/apiClient.ts`).

### C. In-app SETTINGS panel — the provider/audit viewer

The `SETTINGS` command opens `apps/web/src/modules/SettingsModule.tsx`, the in-terminal dashboard:
- **Providers section** — one `ProviderCard` per enabled provider with a `CapabilityGrid`, plus an
  **"All providers (union)"** grid greying out any capability no enabled provider supplies (the same
  set the capability-gap logic uses).
- **Recent activity (audit)** — `api.getAudit(50)` rendered inline; the durable trail itself lives in
  the configured sink (`TYCHE_AUDIT_SINK=file` for a real file).

### D. Audit log — `GET /api/audit`

- `apps/api/src/routes/health.ts:65`: newest-first ring buffer (cap 500). In **hosted** mode it is
  **admin-only** (403 for a non-admin tenant); in self-host mode the optional `TYCHE_AUTH_ENABLED`
  bearer guard gates it. `api.getAudit(limit)`. Use it to confirm a mutation actually recorded an audit
  event (a Definition-of-Done requirement).

### E. `assertModuleCoverage()` — the stable-module guarantee

- `apps/web/src/modules/registry.ts:46`: **throws** if any `stable` command's `moduleId` has no real
  component (i.e. would fall back to `BetaPlaceholder`). It is a boot/test guard, tested in
  `registry.test.ts:71`. This is *why* `recount.sh`'s "commands == modules" check matters: a broken
  wiring point is caught here loudly, not silently rendered as a placeholder.

---

## Verified current figures (2026-07-19)

Snapshot only — **do not copy these into a doc; run `recount.sh` instead.** They will drift.

| Figure | Value (2026-07-19) | Re-verify |
|---|---|---|
| `PROVIDER_CAPABILITY_KEYS` | 28 | `bash scripts/recount.sh` |
| `DEFAULT_COMMANDS` | 60 | `bash scripts/recount.sh` |
| `moduleComponents` | 60 | `bash scripts/recount.sh` |
| vitest test files | 97 | `bash scripts/recount.sh` |
| e2e spec files | 1 (`smoke.spec.ts`) | `bash scripts/recount.sh` |
| Mock capabilities | 26 of 28 (all but `bonds`, `portfolio`) | `bash scripts/capability-providers.sh` |
| Real adapters serving ≥1 capability | 8 (Binance, Frankfurter, Stooq, Finnhub, Gdelt, SecEdgar, Fred, Dexscreener) | `bash scripts/capability-providers.sh` |

---

## Provenance & maintenance

Date-stamped **2026-07-19**. Every volatile fact below is paired with a one-line re-verification.
Re-run these if a script breaks or a path moves.

| Fact (volatile) | Re-verify command / location |
|---|---|
| Capability tuple path & count (28) | `awk '/PROVIDER_CAPABILITY_KEYS = \[/{f=1;next}/\] as const;/{f=0}f' packages/contracts/src/provider.ts \| grep -cE "^\s*'"` |
| Commands count (60) & file | `grep -c '^  cmd({' packages/terminal-kernel/src/commands.ts` |
| Module components (60) & file | `grep -cE "^\s+'?[a-zA-Z0-9-]+'?: lazy\(" apps/web/src/modules/components.ts` |
| Test files (97) | `find packages apps -name '*.test.ts' -not -path '*/node_modules/*' \| wc -l` |
| e2e specs (1) & testDir | `find tests/e2e -name '*.spec.ts'`; `playwright.config.ts` `testDir` |
| Mock caps (26/28) | `sed -n '/const MOCK_CAPABILITIES/,/};/p' packages/data-adapters/src/MockProvider.ts \| grep -c ': true'` |
| `checkProviderConformance` location | `grep -n 'export async function checkProviderConformance' packages/data-adapters/src/conformance.ts` |
| `/api/providers`, `/api/health`, `/api/audit`, `/api/plugins` routes | `grep -n "app.get('/api/" apps/api/src/routes/health.ts` |
| SETTINGS provider/audit viewer | `grep -n 'getAudit\|CapabilityGrid\|Providers (' apps/web/src/modules/SettingsModule.tsx` |
| `assertModuleCoverage` location | `grep -n 'export function assertModuleCoverage' apps/web/src/modules/registry.ts` |
| Drift discipline reference | `sed -n '1382,1383p' docs/BUILD_MANUAL.md` |
| `serveCapability` route helper | `grep -n 'export async function serveCapability' apps/api/src/routes/helpers.ts` |

**If a script stops matching** (a file was renamed, a declaration style changed): the scripts grep
literal patterns (`^  cmd({`, `: lazy(`, `<cap>: true`, `serveCapability(...'<cap>'`). Check the
pattern against the current file, update the pattern, and re-run. Keep every script read-only and
deterministic — no writes, no network, no build.
