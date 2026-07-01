# Roadmap

Tyche is a **foundation**, not a finished terminal. The goal of this milestone was a clean, durable
architecture with a working vertical slice — favoring depth on the spine over many half-wired panels.

## Done (foundation)

- **Contracts** — full domain modeled with Zod (`market`, `instruments`, `fundamentals`, `filings`,
  `news`, `options`, `portfolio`, `workspace`, `alerts`, `ai`, `provider`, provenance) + a schema
  registry.
- **Terminal kernel** — tolerant parser, validated command registry, effect-producing executor,
  active context, shortcuts, help generation, and the canonical command surface.
- **Provider plane** — capability model, deterministic `MockProvider` (8 seed instruments + synthesis
  for any symbol), 4 disabled provider scaffolds, provider registry, cache interface, and a reusable
  conformance suite.
- **Module SDK** — manifest contract, validation, registry, capability-gap helpers, panel props.
- **API** — Fastify REST for all initial loads, SSE quote streaming hub, file persistence
  (versioned, atomic), optional auth, and an audit interface.
- **Web** — command bar, tiling workspace (drag/resize/min/max, link groups, undo-close,
  save/load, import/export JSON), and stable modules: DES, GP, HP, QM, W, N, CF, FA, SECF, HELP, AI,
  SETTINGS, plus functional NOTE.
- **Quality** — strict TypeScript with no errors, 90 unit/contract/API tests, and a Playwright e2e
  smoke test (open panels → save → reload → restore).

## Competitive research (clean-room)

A public, source-backed research pass on Gödel Terminal — the closest browser-native benchmark — now
lives in [`docs/research/godel/`](./docs/research/godel/). It benchmarks feature **categories** only
(original implementation, no cloning) and produced:

- a **12-milestone competitive roadmap** — [`tyche-competitive-roadmap.md`](./docs/research/godel/tyche-competitive-roadmap.md),
- a **~30-ticket backlog** — [`docs/roadmap/tickets/`](./docs/roadmap/tickets/),
- a decision record — [ADR-0004](./docs/adr/0004-public-competitor-research-clean-room-roadmap.md).

Research method + its limits (direct page-fetch was egress-blocked; WebSearch was the channel):
[`RESEARCH_BLOCKED.md`](./docs/research/godel/RESEARCH_BLOCKED.md).

## Planned milestones (research-derived)

Detailed in the competitive roadmap; summary:

| # | Milestone |
| --- | --- |
| M1 | Foundation hardening / CI / release hygiene |
| M2 | SEC filings (real EDGAR) + filing viewer |
| M3 | Quote monitor v2 + watchlist tabs + batch import + FOCUS |
| M4 | Financials v2 + export |
| M5 | News v2 + filters + alert hooks |
| M6 | Options chain + time & sales |
| M7 | Estimates, earnings, ratings, holders, events |
| M8 | Multi-security comparison + world indices + charting v2 |
| M9 | AI research copilot v2 (citations + workspace context) |
| M10 | Notes/research journal + read-only portfolio analytics |
| M11 | Self-hosting hardening (SQLite, provider/entitlement dashboard) |
| M12 | Provider marketplace / plugin SDK |

> Several M6–M8 modules are **data-ready** in `MockProvider` (options, trades, estimates, ratings,
> holders) — only their UIs are pending.

## Research-backed opportunities (benchmarked; not yet scheduled in detail)

`EVT` events · `MEMB` index membership. See the
[competitive feature matrix](./docs/research/godel/competitive-feature-matrix.md).

Shipped since this list was drafted: `EQS` screener + `MOST` movers, candlesticks/SMA·EMA·RSI
charting (`GP`), a second **real** adapter — **FRED** economic data (`ECO`, `economicSeries`)
alongside SEC EDGAR (`filings`), the pure-compute tools `OVME` (Black–Scholes option pricer) +
`CALC` (financial calculator) on `@tyche/analytics`, and the self-host-trust pair: a durable file
audit-log sink (`TYCHE_AUDIT_SINK=file`) with a `GET /api/audit` read endpoint + a SETTINGS activity
view, customizable keyboard shortcuts (rebind under SETTINGS, persisted in preferences), and `GIP`
hi-res intraday charting (1m–1h bars on the shared technical-chart surface, gated on `intradayPrices`).

## Next 30 days (post-revamp plan)

The five-cycle revamp (charting realism, command palette, layouts, events, deploy) closed the last
research-backed gaps. The next 30 days focus on depth over breadth:

**Week 1 — charting depth.** Zoom/pan on the canvas charts, log scale, keyboard crosshair;
volume-bar alignment polish in line mode.

**Week 2 — palette + data depth.** Argument-level autocomplete (FRED series ids, screen fields,
watchlist names); recency-weighted command ranking; `MEMB` index membership as a new capability
(mock constituents; licensing notes for real sources).

**Week 3 — real-data breadth.** A third real adapter behind the capability flags (candidates: SEC
company-facts → real `fundamentals`, or a free IEX-style quote source pending terms review);
real events from EDGAR 8-K parsing as an `events` upgrade.

**Week 4 — self-host & share.** Layout keyboard chords (mod+1..9), watchlist-scoped events/news
defaults, CSV/JSON export parity across every table module, and a versioned demo dataset so the
Docker demo is identical everywhere.

Ongoing: restore the independent adversarial-review gate for every PR (agent quota), and keep the
unit/e2e suites growing with each surface.

## Intentionally NOT planned (non-goals)

- **Order placement / brokerage linking** (incl. the competitor's `BROK`) — Tyche places no orders.
- **Personalized buy/sell/hold advice** — the AI declines and stays grounded.
- **Bundled proprietary/licensed market data** — live data is bring-your-own behind capability flags.
- **Private-company data, teams/org billing, community chat, expert-network contacts DB** — outside a
  research-terminal core.
- **Latency-edge marketing** ("beat the market") — data-dependent and advice-adjacent.
