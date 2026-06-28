# Tyche vs. Gödel — competitive feature matrix

Benchmarks Gödel's **public** feature categories against Tyche's **current** implementation, with
the data/architecture requirements and the recommended **original** build style for each. Gödel
evidence is `WebSearch`-sourced (tiers in `sources.md`).

**Legend** — Tyche status: ✅ done · 🟡 beta/partial · ❌ missing · ⛔ intentionally out of scope.
Solo priority: P0–P3 / X. Difficulty: S/M/L. Clean-room risk: Low/Med (we copy *categories*, never
UI/code, so risk is uniformly Low unless noted).

| Feature area | Gödel evidence (cmd) | Tyche status | Tyche gap | Data/provider need | Architecture need | Solo prio | Diff. | C-room risk | Recommended Tyche style | Milestone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Command parser | backtick grammar | ✅ | tolerance already richer | none | kernel | P0 | S | Low | original tolerant grammar (done) | M1 |
| Command autocomplete | command bar | 🟡 suggestions | fuzzy + recents + args | none | web | P1 | S | Low | registry-driven palette | M1 |
| Keyboard shortcuts | backtick, Tab cycle | ✅ basic | category parity (not key-copying) | none | kernel/web | P1 | S | Low | original keymap, configurable | M3 |
| Window manager | 6 panels, link-by-color | ✅ tiling+links | active-ticker sync across link group | none | web | P1 | M | Low | RGL + link propagation | M3 |
| Quote monitor | QM (≤400, latency) | ✅ streaming | tabs, batch, latency col, scale | quotes/batch | SSE | P0 | M | Low | virtualized + SSE (done), extend | M3 |
| Watchlists | QM named lists | 🟡 single | multiple named tabs, reorder | quotes | persistence | P1 | M | Low | tabbed watchlists | M3 |
| Batch import | QM batch import | ❌ | paste/CSV bulk add + validate | search | web | P1 | S | Low | textarea/CSV importer | M3 |
| Charting | G/GIP (Nasdaq/TV) | ✅ canvas | candlesticks, overlays, intraday | historical/intraday | analytics | P1 | M | Low | dependency-free canvas + indicators | M8 |
| Historical prices | HP | ✅ | longer ranges, intervals | historicalPrices | adapters | P1 | S | Low | done; extend ranges | M4 |
| Multi-security comparison | HMS | 🟡 COMP | normalized overlay + colors | historicalPrices | analytics | P2 | M | Low | normalized returns overlay | M8 |
| Company description | DES | ✅ | richer profile blocks | quotes/fundamentals | — | P0 | S | Low | done | M1 |
| Filings | CF (EDGAR) | 🟡 mock | real SEC adapter | filings (EDGAR) | adapters | P0 | M | Low | EDGAR adapter (public, UA) | M2 |
| Filing document viewer | CF render in-pane | ❌ | in-panel doc viewer | filings | web | P1 | M | Low | iframe/sanitized HTML viewer | M2 |
| Standardized financials | FA | ✅ | standardization tags | fundamentals | contracts | P0 | M | Low | done; tag line items | M4 |
| Excel/CSV/JSON export | FA export | 🟡 (HP csv) | FA/table exports + provenance | — | ui/web | P1 | S | Low | export util w/ provenance header | M4 |
| News | N | ✅ | — | news | adapters | P0 | S | Low | done | M1 |
| News filters | N filters, TOP | ❌ | source/keyword/date/watchlist + TOP | news | contracts/web | P1 | M | Low | filter contract + global TOP | M5 |
| Alerts | (BROK-adjacent) | 🟡 stub | rule eval vs stream | quotes/news | stream | P2 | M | Low | rules engine on SSE | M5 |
| World indices | WEI | 🟡 beta | regioned board | quotes | — | P2 | S | Low | index board module | M8 |
| Estimates | EM | 🟡 beta | matrix + implied multiples | estimates | contracts | P2 | M | Low | estimates matrix | M7 |
| Earnings | ERN | 🟡 beta | history vs actual | estimates | contracts | P2 | M | Low | earnings module | M7 |
| Analyst ratings | ANR | 🟡 beta | ratings table | analystRatings | contracts | P2 | S | Low | ratings module | M7 |
| Holders / 13F | HDS | 🟡 beta | holders table | ownership | contracts | P2 | M | Low | holders module | M7 |
| Options chain | OMON | 🟡 beta | chain grid + Greeks UI | options | contracts | P2 | M | Low | chain grid (mock ready) | M6 |
| Greeks / option pricer | OVME | ❌ (data ✅) | BS pricer module | options | analytics | P3 | M | Low | original BS pricer | M6 |
| Time & sales | TAS | 🟡 beta | print tape stream UI | trades | stream | P2 | M | Low | virtualized tape + SSE | M6 |
| All quotes | ALLQ(?) | ❌ | per-venue composite | quotes/orderBook | contracts | P3 | M | Low | venue-quote view | M6 |
| Focus / live quote | FOCUS | ❌ | single big live quote | quotes | web | P2 | S | Low | focus panel module | M3 |
| Portfolio analytics | PORT/BROK | 🟡 stub | positions + P&L (read-only) | portfolio | persistence | P2 | M | Low | manual/import positions, **no broker** | M10 |
| Index membership | MEMB(?) | ❌ | constituents | index-membership | adapters | P3 | M | Low | membership module | M8 |
| Screeners | EQS | ❌ | criteria filter | fundamentals/quotes | adapters | P3 | L | Low | local screener over cache | M10 |
| Private company data | — | ⛔ | — | licensed | — | X | L | Low | out of scope | — |
| Public data API | (Excel/API hints) | 🟡 (app REST) | documented public API | — | api | P2 | M | Low | document + version REST | M11 |
| Teams / org billing | $/seat | ⛔ | — | — | — | X | L | Low | out of scope (self-host) | — |
| Audit logs | — | 🟡 scaffold | persist audit sink | — | api/persistence | P3 | M | Low | durable audit sink | M11 |
| Chat / community | CHAT | ⛔ | — | — | — | X | M | Low | out of scope (privacy stance) | — |
| AI copilot | "AI Analyst" (roadmap) | ✅ grounded mock | workspace-grounded + live adapter | (optional model) | api/contracts | P1 | M | Med* | grounded, no-advice, cited | M9 |
| Source provenance | (not emphasized) | ✅ **(Tyche-ahead)** | keep extending | — | contracts | P0 | S | Low | provenance on every panel | M1 |
| Data licensing / entitlements | bundled sub | ✅ scaffold | per-capability entitlement UI | — | adapters | P1 | S | Low | capability dashboard + warnings | M11 |
| User preferences | SETTINGS | ✅ | pinned cmds, theme tokens | — | contracts | P1 | S | Low | prefs (done) + pins | M3 |
| Account / billing | $/seat, FINRA | ⛔ | — | — | — | X | M | Low | out of scope (foundation) | — |
| Onboarding / demo mode | free trial | ✅ **(Tyche-ahead)** | guided demo workspace | mock | web | P1 | S | Low | mock-by-default + demo template | M1 |

\* **AI clean-room risk = Med** only in the sense that AI features must stay *no-advice* and grounded;
the implementation is original. All other rows are Low risk because Tyche reaches the **category**
with original contracts/UI/code and never reproduces Gödel's docs, copy, or layout.

## Reading of the matrix

- **Tyche is already at category-parity** on the core analyst slice (parser, window manager, DES, GP,
  HP, QM, N, CF, FA, AI) — in **mock mode**. The mock provider even already returns options/Greeks,
  estimates, ratings, holders, and trades, so several "beta" rows are **data-ready, UI-pending**.
- **Biggest credible-competitor gaps:** a **real filings adapter + viewer** (M2), **QM v2 / watchlist
  tabs / batch import** (M3), **financials export** (M4), **news filters + alerts** (M5), and
  promoting the data-ready beta modules (M6–M8).
- **Where Tyche is already ahead of Gödel's public posture:** **provenance/freshness on every panel**,
  **mock-by-default demo mode**, **self-hostable / local-first**, **transparent provider adapters**,
  and an **open module SDK**. These are the differentiators to lean into (see
  `solo-operator-strategy.md`).
- **Deliberate non-goals:** brokerage linking/order placement (BROK), private-company data, teams/org
  billing, community chat, expert-network contacts DB — out of scope for the foundation.
