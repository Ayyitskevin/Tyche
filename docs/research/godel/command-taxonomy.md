# Gödel Terminal — public command taxonomy (clean-room abstraction)

This is an **original abstraction** of Gödel's *publicly documented* command surface, built to
benchmark Tyche. It is **not** a copy of Gödel's docs or UI. Machine-readable form:
[`command-taxonomy.json`](./command-taxonomy.json). Sources via `WebSearch` (direct fetch
egress-blocked); per-command confidence/status is in the JSON.

## Command grammar (public)

- The command bar is opened with the **backtick (`` ` ``)** key (located under ESC) from anywhere, or
  by clicking the "Terminal" label in the upper-left. [T1/T4]
- **Security-scoped commands** take a **ticker + asset-class qualifier before the mnemonic**, e.g.
  `AAPL US Equity DES`, `NVDA US EQ FA`. **Global commands** are entered alone, e.g. `TOP`, `WEI`,
  `MOST`. [T1, corroborated by an official doc page]
- **Ordering caveat:** at least one affiliate guide shows command-first (`DES AAPL`); the
  **ticker-first** order is corroborated by official docs. Recorded as medium-confidence. [T1 vs T4]

> **Tyche contrast (already implemented):** Tyche's kernel parses a *tolerant* grammar where a bare
> symbol defaults to DES, `AAPL DES` and `AAPL US Equity DES` both work, and yellow-key tokens are
> optional. This is an original design that reaches the same category (symbol + qualifier + command)
> without copying Gödel's exact syntax.

## Categories

- **Security research:** DES, EVT
- **Market data / quotes:** QM, FOCUS, MOST, WEI, ALLQ(?)
- **Charting / history:** G (GP), GIP, HP, HMS
- **News:** N, TOP, NS(?)
- **Fundamentals:** FA, CF, EM, ERN
- **Research/ownership:** ANR, HDS, EQS, MEMB(?)
- **Options/derivatives:** OMON, OVME
- **Portfolio:** BROK, PORT(?)
- **Analytics/tools:** CALC
- **System/social:** HELP, SETTINGS, CHAT

`(?)` = requested in scope but **unconfirmed** via WebSearch — verify against official docs.

## Command reference (public, abstracted)

| Cmd | Category | Inst? | Purpose (abstracted) | Status / conf. |
| --- | --- | :--: | --- | --- |
| **DES** | research | ✓ | Security description: business overview, price chart, market cap, EPS estimates, analyst ratings, key dates, shares out, website | confirmed / high |
| **G** (GP) | chart | ✓ | Real-time + historical single-security chart (Nasdaq data, TradingView-style, indicators) | confirmed / med |
| **GIP** | chart | ✓ | High-resolution intraday (minute) chart | confirmed / med |
| **HP** | chart | ✓ | Historical price table (reported 1h intervals up to 365d) | confirmed / med |
| **HMS** | analytics | ✓ | Historical Multiple Security: compare several securities over a date range on one chart | confirmed (doc) / high |
| **QM** | market-data | | Quote monitor / watchlist: bid/ask/change/volume/latency; **up to 400 tickers**, batch import, pop-out, named lists | confirmed / high |
| **FOCUS** | market-data | ✓ | Real-time single-security live quote window | confirmed / med |
| **WEI** | market-data | | World indices: Americas/EMEA/Asia-Pacific, change/%/YTD, ranked | confirmed / med |
| **MOST** | market-data | | Most-active board | confirmed / low |
| **N** | news | | Company/watchlist news, real-time + historical; filter by source/language/ticker/keyword/date | confirmed / high |
| **TOP** | news | | Global top headlines (~60s refresh) | confirmed / med |
| **CF** | fundamentals | ✓ | SEC filings via EDGAR (from inception, real-time, direct links): 10-K/Q, 8-K, S-1, proxies, 13F | confirmed / high |
| **FA** | fundamentals | ✓ | Income / balance / cash-flow; Q & Y toggle; **export Excel/JSON** (Cash Flow also PDF) | confirmed (doc) / high |
| **EM** | fundamentals | ✓ | Earnings Matrix: forward EPS/revenue by Q/Y + implied P/E·P/S·P/CF + ratings/targets | confirmed / med |
| **ERN** | fundamentals | ✓ | Earnings estimates/history for a security | confirmed / med |
| **ANR** | research | ✓ | Analyst ratings, recommendations, price targets | confirmed / high |
| **HDS** | research | ✓ | Institutional holders (13F): value, shares, change, % | confirmed / high |
| **EQS** | research | | Equity screener (sometimes disabled for maintenance per notes) | confirmed / med |
| **EVT** | research | ✓ | Consolidated real-time corporate events | confirmed / med |
| **OMON** | options | ✓ | Options chain: every strike/expiry; bid/ask/last/vol/**IV/Greeks** | confirmed (doc) / high |
| **OVME** | analytics | ✓ | Options Black-Scholes calculator (theoretical price + Greeks); embeddable in CHAT | confirmed / high |
| **TAS** | market-data | ✓ | Time & sales: live trade-by-trade prints | confirmed / high |
| **CALC** | analytics | | Financial calculator (v4.1.2) | confirmed / high |
| **CHAT** | social | | In-terminal community chat (group + per-symbol); embeds components | confirmed / low |
| **BROK** | portfolio | | Link a brokerage account → upcoming portfolio features (waitlist) — **Tyche will NOT implement** | confirmed / med |
| **HELP** | system | | Docs about keystrokes/commands/getting started | confirmed / med |
| **SETTINGS** | system | | Colors (primary/positive/negative/background), theme, pinned commands, window sizes; watchlists persist | confirmed / med |
| **ALLQ** | market-data | ✓ | All/composite venue quotes (requested) | unconfirmed / low |
| **PORT** | portfolio | | Portfolio analytics (requested; BROK implies it's upcoming) | unconfirmed / low |
| **MEMB** | research | ✓ | Index/ETF membership (requested) | unconfirmed / low |
| **NS** | news | | Keyword news polling (sentiment-sourced) | unconfirmed / low |

## Notable behaviors (public)

- **Export:** FA exports to **Excel/JSON** (Cash Flow also PDF) via a download icon. [T1]
- **Streaming:** QM, FOCUS, WEI, TAS, OMON, N are real-time. [T1/T4]
- **Persistence:** named watchlists persist across layouts; pinned commands; color/theme settings. [T4]
- **Window management:** up to **6 movable/resizable panels**, **Tab** cycles panels, **window
  linking by color** syncs the ticker across linked windows. [T4]
- **Versioning:** active changelog (e.g. v4.1.2 introduced OVME/CALC/BROK). [T1]

## Mapping to Tyche's current commands

Tyche already ships (stable or beta) command ids that **category-match** Gödel's: `DES, GP/G, HP,
QM, W, N, CF, FA, EM, ERN, ANR, HDS, OMON, TAS, WEI, HMS (as COMP), PORT, ALERT`. Gödel-observed
categories **not yet in Tyche**: `EVT` (events), `EQS` (screener), `MEMB` (membership), `OVME`
(option pricer), `CALC`, `TOP/MOST` (global news/movers), `CHAT` (community), `FOCUS` (single-quote
window), `GIP` (intraday hi-res). These become **research-backed opportunities** in the gap analysis
and roadmap — to be built as **original Tyche modules**, never copied.
