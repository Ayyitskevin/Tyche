# Tyche

**A keyboard-first, self-hostable, provider-agnostic financial research terminal — clean-room foundation.**

Tyche is an original, lawful foundation for a browser-native market research terminal aimed at
solo operators and small research teams. It is fast, modular, scriptable, inspectable, and
data-provider agnostic. It runs **fully in mock mode with no paid API keys**, and live/paid
providers slot in as optional adapters behind capability flags.

> **Not financial advice.** Tyche displays market data and educational analysis only. It does
> **not** tell you to buy, sell, or hold any security, and it is **not** a broker — the foundation
> places no orders. Live market data requires appropriate licenses/entitlements; see
> [`SECURITY.md`](./SECURITY.md) and [`DATA_PROVIDERS.md`](./DATA_PROVIDERS.md).

This is a **clean-room** project. It is inspired only by *publicly documented* market-terminal
feature categories used as benchmarks. It does not copy any proprietary product's branding, UI,
assets, private APIs, trade dress, or undocumented behavior.

---

## Quickstart

```bash
# Requirements: Node >= 20.10, pnpm 10+
pnpm install      # install the workspace
pnpm dev          # starts the API (:4010) and the web app (:5173) in mock mode
```

Open <http://localhost:5173> and type commands into the bar:

| Type this            | You get                                            |
| -------------------- | -------------------------------------------------- |
| `AAPL DES`           | Security description + live quote snapshot         |
| `AAPL GP`            | Price chart                                         |
| `AAPL HP`            | Historical price table (CSV export)                |
| `QM`                 | Streaming quote monitor                            |
| `W`                  | Watchlist (streaming, add/remove)                  |
| `AAPL N`             | News for AAPL                                       |
| `AAPL CF`            | Corporate filings                                  |
| `AAPL FA`            | Financial statements                               |
| `SECF apple`         | Security finder (search)                           |
| `AI`                 | Context-grounded copilot (mock mode)               |
| `HELP` or `?`        | Command reference                                  |

`pnpm dev` needs no credentials — everything is served by the deterministic **mock provider**.

### Verify it works

```bash
pnpm typecheck     # strict TS across all packages (no errors)
pnpm test          # unit/contract/API tests (Vitest)
pnpm test:e2e      # Playwright browser smoke test (open panels, save, reload, restore)
pnpm build         # production web bundle
```

---

## What's in the box

A pnpm monorepo with a clean dependency spine (`contracts` is the keystone):

```
packages/
  contracts/        Shared domain types + Zod schemas (the single source of truth)
  terminal-kernel/  Command parser, registry, executor, context, shortcuts, help
  data-adapters/    Provider interface, deterministic MockProvider, stubs, registry, cache, conformance
  module-sdk/       Module manifest + lifecycle/data-hook contracts + module registry
  ui/               Reusable terminal React components (shell, command bar, panel frame, table, states)
  analytics/        Returns, indicators, and risk helpers
apps/
  api/              Fastify REST + SSE streaming hub, file persistence, security scaffold
  web/              React + Vite terminal: command bar, tiling workspace, modules
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

### Highlights

- **Terminal kernel** — a tolerant Bloomberg-style grammar (`AAPL US Equity DES` parses like
  `AAPL DES`) that is fully UI-agnostic and unit-tested. Commands produce declarative *effects*;
  the web app interprets them.
- **Provider capability model** — every provider declares its capabilities; every module declares
  what it needs. Gaps render graceful "missing capability" panels, never crashes.
- **Provenance everywhere** — every API response carries `{ data, provenance }` with the provider,
  mode, and data freshness. Every panel shows it.
- **Deterministic mock provider** — seeded, schema-valid data for AAPL, MSFT, NVDA, TSLA, SPY, QQQ,
  BTC-USD, ETH-USD (and synthesized data for any other symbol), passing a reusable conformance suite.
- **Tiling workspace** — drag/resize/close/minimize/maximize panels, link groups, undo-close,
  save/load, and import/export workspace JSON.
- **Grounded AI** — a copilot that summarizes terminal context with source citations, declines
  personalized advice, and works in deterministic mock mode without a model key.

---

## Extending Tyche

| You want to…        | Do this                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| Add a **command**   | Add a `CommandDescriptor` in `packages/terminal-kernel/src/commands.ts`. |
| Add a **module**    | Add a component + register it (`apps/web/src/modules/`). See [`MODULE_SDK.md`](./MODULE_SDK.md). |
| Add a **provider**  | Implement `DataProvider` in `packages/data-adapters/src/`. See [`DATA_PROVIDERS.md`](./DATA_PROVIDERS.md). |

The command surface in `commands.ts` is the single source of truth: modules and their required
capabilities are derived from it in the web app.

---

## Configuration

Tyche runs with zero config in mock mode. To customize, copy `.env.example` to `.env`:

| Variable               | Default                 | Purpose                                             |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| `API_PORT`             | `4010`                  | API server port                                     |
| `VITE_API_BASE_URL`    | `http://localhost:4010` | Web → API base URL                                  |
| `TYCHE_DATA_DIR`       | `./data`                | Local JSON persistence directory                    |
| `TYCHE_PROVIDERS`      | `mock`                  | Comma-separated enabled providers                   |
| `TYCHE_AUTH_ENABLED`   | `false`                 | Require a bearer token on mutating routes           |
| `AI_PROVIDER`          | `mock`                  | AI copilot backend (`mock` = deterministic, no key) |

See [`.env.example`](./.env.example) for the full list.

---

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design
- [`COMMANDS.md`](./COMMANDS.md) — full command reference + grammar
- [`DATA_PROVIDERS.md`](./DATA_PROVIDERS.md) — capability model + adding providers
- [`MODULE_SDK.md`](./MODULE_SDK.md) — building modules
- [`SECURITY.md`](./SECURITY.md) — security, compliance, entitlements, no-advice policy
- [`ROADMAP.md`](./ROADMAP.md) — what's done and what's next
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — development guide
- [`docs/adr/`](./docs/adr/) — architecture decision records

## License

Apache-2.0. Tyche bundles no proprietary market data; the mock provider's data is entirely synthetic.
