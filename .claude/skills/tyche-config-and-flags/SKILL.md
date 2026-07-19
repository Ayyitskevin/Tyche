---
name: tyche-config-and-flags
description: >-
  The complete catalog of every Tyche configuration axis — every environment
  variable, its default, whether it is production or experimental/reserved, its
  fail-closed guard, and how to add a new one. Also owns the ADAPTER ROSTER
  (which data provider is keyless-public vs bring-your-own-key, and which are
  real vs no-op stubs). LOAD THIS when: editing or reading `.env.example`; asked
  "what is the default for X", "what env var turns on Y", "why won't the API
  boot", "how do I enable real data / a provider / a key", "is this flag safe in
  prod", "what does TYCHE_* / VITE_* / STRIPE_* / AI_* do"; wiring a new
  provider, sink, billing driver, or persistence backend; debugging a value that
  isn't taking effect; or reviewing a PR that touches config. Symptoms that
  should trigger it: "requires TYCHE_SESSION_SECRET", "TYCHE_BILLING=stripe
  requires…", "No enabled provider supplies…", a provider you enabled isn't
  serving data, mock data showing when you expected real data.
---

# Tyche config & flags

Every configuration axis in Tyche is an **environment variable** read once at
API boot by `loadConfig()` in `apps/api/src/env.ts`. That file is the single
source of truth (SSOT) for defaults and coercion. `.env.example` is the
documented, blank-valued template (the only env file tracked in git; `.env` and
`TYCHE_DATA_DIR` are git-ignored — no secret is ever committed).

**Core design rule (do not violate):** Tyche runs the ENTIRE terminal on the
deterministic `mock` provider with ZERO keys. Every real feature is an OPTIONAL
adapter behind a flag. Sensitive drivers **fail closed** — an unset or garbage
value picks the SAFE option, never the powerful one.

> The capability-gap *model* (how a missing provider degrades to HTTP 200) lives
> in **tyche-architecture-contract**. Operating with these flags for real
> (dev/deploy/hosted, backup/restore) lives in **tyche-run-and-operate**.
> Entitlement/positioning framing lives in **tyche-external-positioning**.
> This skill owns the FACTS: every var, default, guard, and the adapter roster.

---

## When NOT to use this skill

| You need… | Use instead |
|---|---|
| Why a capability gap returns HTTP 200 not 500; the `Envelope<T>`/capability model | **tyche-architecture-contract** |
| To actually run dev, build the demo, or deploy hosted; persistence backup/restore | **tyche-run-and-operate** |
| The full local gate command + toolchain versions + no-build-step rule | **tyche-build-and-env** |
| Pricing/positioning/non-goals narrative, "sells software not data" framing | **tyche-external-positioning** |
| The step-by-step recipe to build a whole new data vertical or adapter end-to-end | **tyche-vertical-slice-campaign** |
| To CHANGE any of these values in a shipped system (schema/config/deploy/promote) | **tyche-change-control** (route through it; never around it) |
| Running conformance / routing-matrix / wiring-audit diagnostics | **tyche-diagnostics-and-tooling** |

If your task is "what is the default / guard / meaning of a flag" or "which
adapter serves X keyless" — you are in the right place.

---

## How config is parsed (read this before trusting any default)

`apps/api/src/env.ts` — `loadConfig(env = process.env)` returns an `ApiConfig`.
Two helpers govern coercion:

- `bool(v, fallback)` — TRUE only for `1 | true | yes | on` (case-insensitive);
  anything else (including `"false"`, typos) → `fallback`. (env.ts:105-108)
- `list(v, fallback)` — comma-split, trimmed, empties dropped; empty list →
  `fallback`. (env.ts:110-117)

**Re-verify the whole default table any time:**
```bash
sed -n '119,171p' apps/api/src/env.ts   # loadConfig — every default in one place
```
Web-side vars (prefixed `VITE_`) are read by Vite at build/dev time in
`apps/web`, NOT by `env.ts`. Only `VITE_API_BASE_URL` is a documented one.

**Precedence:** a real shell/`.env` value wins over the default. Values are read
ONCE at boot — change a var → restart the API.

---

## The config catalog (grouped)

Legend — **Class:** `prod` = production-safe knob · `dev` = dev/local default ·
`reserved` = declared but NOT YET read by code (setting it is a no-op) ·
`secret` = never commit / never log. **Guard** = fail-closed / boot behavior.

Every default below is from `env.ts` (the SSOT); `.env.example` documents the
same. Re-verify any single one with the one-liner in **Provenance** at the end.

### API server / CORS
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `API_HOST` | `127.0.0.1` | prod | Bind host. Loopback by default — bind `0.0.0.0` only behind a proxy. |
| `API_PORT` | `4010` | prod | `Number(...)`; non-numeric → `NaN` (set a real port). |
| `WEB_ORIGIN` | `http://localhost:5173` | prod | CORS allowlist origin; governs BOTH REST and SSE. Restrict for prod. |
| `VITE_API_BASE_URL` | `http://localhost:4010` | prod | Browser→API base URL. Read by Vite (web), not `env.ts`. |

### Persistence
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_DATA_DIR` | `./data` | prod | JSON/SQLite store root (git-ignored). Hosted isolates per user under `users/<id>/`. |
| `TYCHE_PERSISTENCE` | `file` | prod | `file` \| `sqlite`. Anything but `sqlite` → `file`. **sqlite init failure falls back to file — never fails boot.** |
| `TYCHE_SQLITE_PATH` | `<DATA_DIR>/tyche.db` | prod | sqlite only. |
| `TYCHE_RATE_LIMIT_STORE` | `memory` | prod | `memory` \| `sqlite` (shared budget across nodes on ONE host; not NFS/EFS/SMB). Falls back to memory with warning. |
| `TYCHE_RATE_LIMIT_SQLITE_PATH` | `<DATA_DIR>/ratelimit.db` | prod | sqlite store only. |

### Providers / keys — the data plane
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_PROVIDERS` | `mock` | prod | Comma-list; **ORDER = priority** (first provider serving a capability for a symbol wins). `mock` is ALWAYS appended last if you omit it. See roster below. |
| `TYCHE_PLUGINS` | (empty) | prod | Comma-list of LOCAL/installed provider-plugin module specifiers. Tyche never downloads code. Each is conformance-gated; status at `GET /api/plugins`. |
| `SEC_EDGAR_USER_AGENT` | (empty) | prod | Enables `secedgar`. SEC fair-access requires a descriptive UA (name + email). Blank → adapter not registered → mock serves filings. |
| `FRED_API_KEY` | (empty) | secret | Enables `fred` (free key). Sent only as request param, never in provenance. Blank → not registered → mock. |
| `FINNHUB_API_KEY` | (empty) | secret | Enables `finnhub` real-time equity quotes. **Whitespace-only key is trimmed → treated as absent (no boot crash).** Blank → EOD (stooq) / synthetic (mock). |
| `YAHOO_ENABLED` | `false` | **reserved** | NOT read by `env.ts`. Scaffold stub only. Setting it is a no-op today. |
| `CCXT_EXCHANGE` | (empty) | **reserved** | NOT read by `env.ts`. Scaffold stub only. No-op today. |

> **Enabling a real provider connects under YOUR licenses.** Tyche bundles and
> resells NO market data (product invariant #2). Keys are request-scoped and
> never enter provenance or error bodies.

### AI copilot
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `AI_PROVIDER` | `mock` | prod | Unset/`mock` → deterministic mock, NO network, no data leaves the box. The no-advice guard applies regardless (see architecture-contract). |
| `AI_API_KEY` | (empty) | secret | Model key. Never commit. |
| `AI_MODEL` | (empty) | prod | Model id. |

### Observability / audit
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_VERSION` | API package version | prod | Reported by `GET /api/health`. Set to release tag / git SHA. |
| `TYCHE_AUDIT_SINK` | `console` | prod | `console` \| `file` \| `http`. Unknown → `console`. |
| `TYCHE_AUDIT_FILE` | `<DATA_DIR>/audit.log` | prod | file sink only. |
| `TYCHE_AUDIT_WEBHOOK_URL` | (empty) | prod | REQUIRED for http sink; degrades to console + boot warning if missing. |
| `TYCHE_AUDIT_WEBHOOK_TOKEN` | (empty) | secret | Optional bearer for the audit webhook. |

### Transactional email (hosted)
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_EMAIL_SINK` | `console` | prod | `console` \| `http`. Unknown → `console`. Console logs the message (token REDACTED in hosted). Tyche bundles NO email provider — BYO. |
| `TYCHE_EMAIL_WEBHOOK_URL` | (empty) | prod | REQUIRED for http sink; else degrades to console with a loud hosted boot warning. |
| `TYCHE_EMAIL_WEBHOOK_TOKEN` | (empty) | secret | Optional bearer. |
| `TYCHE_EMAIL_FROM` | (empty) | prod | From/sender in webhook payload. Quote it (angle brackets are shell redirection). |

### Auth (self-host bearer guard, optional)
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_AUTH_ENABLED` | `false` | prod | `bool()`; requires bearer on mutating routes + `GET /api/audit`. Coarse foundation guard, not the identity system. |
| `TYCHE_AUTH_TOKEN` | (empty) | secret | The bearer token. |

### Same-origin serving
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_SERVE_WEB` | (empty) | prod | Path to a built web app (e.g. `./apps/web/dist`); API serves it same-origin with SPA fallback (one process/port). Used by `pnpm demo` + Docker. |

### Hosted / SaaS mode (multi-user)
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_MODE` | `selfhost` | prod | Only exact `hosted` turns on accounts/sessions/isolation. Anything else → `selfhost`. |
| `TYCHE_DEMO` | `false` | prod | `bool()`. Read-only public demo: blocks EVERY persistence write with 403; reads/streams/market/screener/AI still work. |
| `TYCHE_SESSION_SECRET` | (empty) | secret | **HARD GUARD: in `hosted` the API THROWS at boot if missing or `< 16` chars.** Signs HMAC sessions. Generate `openssl rand -base64 32`. |
| `TYCHE_TRUST_PROXY_HOPS` | `1` | prod | Trusted proxy hops (XFF spoof / rate-limit-bypass defense). Coerced `max(1, floor(N) || 1)` — always ≥ 1. Hosted only. |
| `TYCHE_SIGNUPS` | `open` | prod | Only exact `closed` blocks new sign-ups after the first/admin account; else `open` (14-day trial). |
| `TYCHE_ADMIN_EMAIL` | (empty) | prod | Email granted admin on registration; else the FIRST account is admin. |
| `TYCHE_SEATS` | (empty → unlimited) | prod | Positive integer = max seats (accounts + outstanding invites); blank/0/non-int → `null` = unlimited. |

### Billing (hosted only — fails closed to `none`)
| Var | Default | Class | Notes / guard |
|---|---|---|---|
| `TYCHE_BILLING` | `none` | prod | `none` (accounts, no paywall) \| `stripe` (prod) \| `mock` (DEV/TEST ONLY — instant free `pro`). **FAILS CLOSED: only exact `stripe`/`mock` select those; unset or garbage → `none`, never `mock`.** |
| `STRIPE_SECRET_KEY` | (empty) | secret | **In `stripe` mode the API THROWS at boot without this + PRICE_ID + WEBHOOK_SECRET.** |
| `STRIPE_PRICE_ID` | (empty) | prod | Required for `stripe`. |
| `STRIPE_PRICE_ID_ANNUAL` | (empty) | prod | Optional annual price (~10× monthly). |
| `STRIPE_WEBHOOK_SECRET` | (empty) | secret | Required for `stripe`. |
| `TYCHE_PUBLIC_URL` | `WEB_ORIGIN` | prod | Public base URL for checkout/portal redirects. |
| `TYCHE_PRICE_MONTHLY` | `29` | prod | Whole units; DISPLAY + admin MRR readout ONLY. Stripe's price object is the billing source of truth. Non-finite → `29`. |

**Boot guards (the fail-closed / no-boot rules), verify at once:**
```bash
sed -n '141,142p;166,167p' apps/api/src/app.ts   # session-secret >=16 ; stripe requires 3 keys
```
- `hosted` + no/short `TYCHE_SESSION_SECRET` → `Error: TYCHE_MODE=hosted requires TYCHE_SESSION_SECRET (>= 16 chars).`
- `TYCHE_BILLING=stripe` missing any of secret/price/webhook →
  `Error: TYCHE_BILLING=stripe requires STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET.`

---

## The adapter roster (data-plane truth table)

A **capability** is a typed data kind (`quotes`, `filings`, `dexPools`, …). A
**provider/adapter** declares a boolean `capabilities` map; routing picks the
first enabled provider (in `TYCHE_PROVIDERS` order) whose map has the needed
capability true AND whose optional `servesSymbol(symbol)` accepts the symbol.
`mock` is ALWAYS appended last as the fallback (createProviderRegistry,
providerRegistry.ts:167-180), so a capability no earlier provider serves for a
symbol degrades to synthetic mock data — never an error.

**Keyless-public** = works with no credential. **BYO-key** = needs the
operator's own credential (env var named). **real** = full working
implementation; **no-op stub** = declares zero capabilities, never wins routing,
throws loudly if a method is somehow called.

| Adapter | Enable name(s) | Capabilities (declared true) | Access | Real? |
|---|---|---|---|---|
| **Mock** | `mock` (auto-appended) | 26 of 28 keys (all EXCEPT `bonds`, `portfolio`) | keyless, NO network | real — always-append fallback |
| **Binance** | `binance` | quotes, batchQuotes, historicalPrices, intradayPrices, trades, orderBook, crypto, fundingRates | keyless-public | real |
| **Frankfurter** | `frankfurter` / `ecb` | quotes, batchQuotes, historicalPrices, fx | keyless-public (ECB) | real |
| **Dexscreener** | `dexscreener` / `dex` | dexPools | keyless-public | real |
| **GDELT** | `gdelt` / `news` | news | keyless-public | real |
| **Stooq** | `stooq` / `equities` | quotes, batchQuotes, historicalPrices (EOD) | keyless-public | real |
| **Finnhub** | `finnhub` | quotes, batchQuotes (real-time) | **BYO-key** `FINNHUB_API_KEY` (mode `user_supplied`) | real |
| **SEC EDGAR** | `secedgar` / `sec` | filings, filingSearch, insiderTransactions, institutionalHoldings, fundamentals | keyless BUT requires `SEC_EDGAR_USER_AGENT` | **real** |
| **FRED** | `fred` | economicSeries, economicReleases | **BYO-key** `FRED_API_KEY` (free) | **real** |
| **Yahoo** | `yahoo` | none | — | **no-op stub** |
| **CCXT** | `ccxt` | none | — | **no-op stub** |

> **"stubs/" is a misnomer.** `SecEdgarProvider` and `FredProvider` live under
> `packages/data-adapters/src/stubs/` but are FULL real implementations. Only
> `YahooProvider` and `CcxtProvider` are genuine no-op scaffolds (declare
> `{...NO_CAPABILITIES}`). Do not "fix" SEC/FRED thinking they are stubs.

**Enable-name aliases and secret-gating are in the `instantiate()` switch:**
```bash
sed -n '113,161p' packages/data-adapters/src/providerRegistry.ts
```
Provider whose required key/UA is missing → `instantiate` returns `null` → it is
silently skipped and the capability falls through (ultimately to mock). This is
why "I set `TYCHE_PROVIDERS=fred` but still see mock data" almost always means
`FRED_API_KEY` is blank.

**Recommended all-real keyless set** (`.env.example:51`):
`TYCHE_PROVIDERS=stooq,binance,frankfurter,dexscreener,gdelt,mock`
Add real-time equities: prepend `finnhub,` and set `FINNHUB_API_KEY`.

Re-verify any adapter's declared capabilities:
```bash
awk '/capabilities:/{f=1} f{print} /},/{if(f)exit}' \
  packages/data-adapters/src/BinanceProvider.ts | grep ': true'
```

---

## How to ADD a new config flag (checklist)

Config is a system-behavior change → **route through tyche-change-control**
(one concern, one PR, adversarial self-review). The mechanical steps:

1. **Add a typed field** to `ApiConfig` (env.ts) with a doc comment.
2. **Read + coerce it** in `loadConfig()`. Use `bool()`/`list()` where they fit.
   Pick a **fail-closed default**: unset/garbage must select the SAFE option
   (mirror `billing` → `none`, `mode` → `selfhost`).
3. **If it selects an implementation** (a sink/driver/store), follow the
   pluggable-driver pattern: interface + **≥2 impls** + config switch in
   `apps/api/src/app.ts`; call sites never change. (This is a Definition-of-Done
   gate — see tyche-change-control / tyche-validation-and-qa.)
4. **If it must block boot** when misconfigured (like a secret), add an explicit
   `throw new Error(...)` in `buildApp()` — fail loud, never limp.
5. **Document it in `.env.example`** with a comment and a blank/safe value. This
   is a hard DoD gate ("`.env.example` + docs updated for any new config").
6. **Test it**: an `app.test.ts` `fastify.inject` case exercising both the
   default and the set path (see tyche-validation-and-qa).
7. If it enables a NEW data provider, the enable-name + gating go in
   `instantiate()`; the rest of the vertical is **tyche-vertical-slice-campaign**.

Never introduce a flag whose default turns ON a paywalled, powerful, or
network-egressing behavior. Defaults are mock, off, closed, none.

---

## Common "why isn't my value taking effect?" triage

| Symptom | Likely cause |
|---|---|
| Enabled a provider, still mock data | Its key/UA is blank → `instantiate` returned `null`. Set `FRED_API_KEY` / `FINNHUB_API_KEY` / `SEC_EDGAR_USER_AGENT`. |
| `YAHOO_ENABLED=true` does nothing | Reserved var, not read by `env.ts`. Yahoo is a no-op stub. |
| Set `TYCHE_BILLING=Stripe`/`MOCK` (wrong case) | Coercion is exact-match lowercase literal → falls to `none`. Use exact `stripe`/`mock`. |
| API won't boot in hosted | Missing/short `TYCHE_SESSION_SECRET` (≥16), or `stripe` mode without the 3 STRIPE_* keys. |
| Provider serves wrong symbol class | `servesSymbol` scoping (e.g. Binance declines `BTC-USD`, Frankfurter only ECB pairs). Check `TYCHE_PROVIDERS` ORDER. |
| Changed a var, no effect | Values load ONCE at boot — restart the API. |
| `VITE_API_BASE_URL` change ignored | It's a Vite build/dev var; rebuild/restart the web dev server, not the API. |

---

## Provenance & maintenance

Repo: `/home/user/Tyche`. All facts below verified **2026-07-19** against the
code (evidence priority: executable code > docs). `env.ts` is the defaults SSOT;
`.env.example` is the template. Re-verify volatile facts with the paired
command. **Known doc drift:** README/BUILD_MANUAL say "24 capabilities" — code
has **28**; docs say mock declares "22 of 24" — code declares **26 of 28**.
Trust the code; recount rather than cite a doc number.

| Volatile fact (2026-07-19) | Re-verify command |
|---|---|
| Every var default & coercion | `sed -n '119,171p' apps/api/src/env.ts` |
| `.env.example` documented surface | `sed -n '1,194p' .env.example` |
| Capability key count = **28** | `grep -oE "^  '[a-zA-Z]+'," packages/contracts/src/provider.ts \| wc -l` |
| Mock declares **26 of 28** (not bonds/portfolio) | `awk '/const MOCK_CAPABILITIES/,/^};/' packages/data-adapters/src/MockProvider.ts \| grep -c ': true,'` |
| Adapter enable-names/aliases + secret gating | `sed -n '113,161p' packages/data-adapters/src/providerRegistry.ts` |
| Mock always appended last as fallback | `sed -n '167,180p' packages/data-adapters/src/providerRegistry.ts` |
| Session-secret ≥16 boot guard (hosted) | `sed -n '141,142p' apps/api/src/app.ts` |
| Stripe-requires-3-keys boot guard | `sed -n '166,167p' apps/api/src/app.ts` |
| Billing fails closed to `none` | `sed -n '137p' apps/api/src/env.ts` |
| Reserved vars NOT read by code | `grep -rn 'YAHOO_ENABLED\|CCXT_EXCHANGE' apps/ packages/ \| grep -v stubs/` (expect: no hits) |
| An adapter's declared capabilities | `awk '/capabilities:/{f=1} f{print} /},/{if(f)exit}' packages/data-adapters/src/<Provider>.ts \| grep ': true'` |
| BYO-key adapters throw without key | `grep -n 'requires an* .*API key' packages/data-adapters/src/FinnhubProvider.ts packages/data-adapters/src/stubs/FredProvider.ts` |

Any change to these values or the roster is a system-behavior change: go through
**tyche-change-control**, update `.env.example`, and re-run the gate
(**tyche-build-and-env**).
