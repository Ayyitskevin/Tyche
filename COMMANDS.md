# Command reference

Tyche is keyboard-first. You drive it from the command bar (focus with **⌘/Ctrl+K**). The grammar is
an original, tolerant interpretation of terminal-style commands — it does **not** depend on any
proprietary product's behavior.

## Grammar

A command line is parsed as:

```
<symbol?>  <yellow-key>*  <command?>  <args...>
```

- **Bare symbol** → the default command (DES): `AAPL` ≡ `AAPL DES`.
- **Symbol + command**: `AAPL GP`, `AAPL N`, `AAPL FA`.
- **Command only** → acts on the active instrument: `DES`, `GP`, `HP` use whatever symbol is active.
- **Yellow-key tolerance**: `AAPL US Equity DES` parses exactly like `AAPL DES`. Tokens like
  `US`, `Equity`, `Index`, `Curncy` are recognized and stripped; `Equity`/`Index`/`Curncy`/… also
  hint the asset class. You never *need* them.
- **Search**: `SECF apple` runs a security finder with the query `apple`. The `find`/`search`
  aliases work too: `find tesla`.
- **Free-text fallback**: anything unrecognized (e.g. `show me something`) opens a search panel.
- **Crypto**: `BTC-USD GP` infers the crypto asset class automatically.

Notes:
- Mnemonics win over tickers: a token that matches a command id/alias is treated as a command.
- The parser is pure and fast (< 10ms for common commands, verified by test).

## Keyboard shortcuts

| Shortcut         | Action                         |
| ---------------- | ------------------------------ |
| ⌘/Ctrl + K       | Focus the command bar          |
| ⌘/Ctrl + S       | Save the current workspace     |
| ⌘/Ctrl + Shift + Z | Reopen the last closed panel |
| Tab / Shift + Tab | Cycle focus across panels      |
| Esc              | Blur the command bar           |
| ↑ / ↓ (in bar)   | Walk command history           |

The first three (focus bar, save, reopen) are **customizable** — rebind them under
**SETTINGS → Keyboard shortcuts** (persisted in your preferences). Tab cycling and Esc are fixed.

**Panel link groups:** the ○/● button in a panel header cycles its link color. Panels sharing a
color form a group — retargeting the ticker in one (e.g. the `FOCUS` symbol field) syncs every panel
in that group. Unlinked panels are unaffected.

## Commands

`req?` = requires an instrument. **Capabilities** are what a provider must supply for the module to
show data; in mock mode all of these are available.

### Stable

| Command | Aliases            | Module          | req? | Capabilities                 | Description                              |
| ------- | ------------------ | --------------- | :--: | ---------------------------- | ---------------------------------------- |
| `HELP`  | `?`                | help            |      | —                            | Command reference (searchable)           |
| `SECF`  | `SEARCH`, `FIND`   | search          |      | —                            | Security finder                          |
| `DES`   | `DESC`             | description     |  ✓   | `quotes`                     | Security description + quote snapshot    |
| `GP`    | `G`, `CHART`       | chart           |  ✓   | `historicalPrices`           | Price chart — line / candlesticks, SMA·EMA overlays, RSI study pane |
| `HP`    | `HIST`             | history-table   |  ✓   | `historicalPrices`           | Historical OHLCV table (CSV export)      |
| `QM`    | `QUOTE`, `MON`     | quote-monitor   |      | `quotes`, `batchQuotes`      | Streaming quote monitor (sortable, configurable columns, age) |
| `FOCUS` | `FOC`              | focus           |  ✓   | `quotes`                     | Single instrument, live quote rendered large |
| `W`     | `WATCH`, `WL`      | watchlist       |      | `quotes`                     | Watchlist (tabs, batch import, streaming) |
| `N`     | `NEWS`             | news            |      | `news`                       | News (source/keyword/date/watchlist filters) |
| `TOP`   | `TAPE`, `WIRE`     | top-news        |      | `news`                       | Global headline tape with the same filters |
| `CF`    | `FILINGS`, `FIL`   | filings         |  ✓   | `filings`                    | Corporate filings                        |
| `FA`    | `FIN`, `FINANCIALS`| financials      |  ✓   | `fundamentals`               | Income / balance / cash-flow statements (Annual/Quarterly, CSV/JSON export with provenance) |
| `OMON`  | `OPT`, `OPTIONS`   | options-monitor |  ✓   | `options`                    | Option chain grid (calls/strike/puts, IV + Greeks) |
| `TAS`   | `TIMESALES`        | time-and-sales  |  ✓   | `trades`                     | Streaming time & sales tape (newest on top) |
| `WEI`   | `INDICES`, `WORLD` | world-indices   |      | `quotes`                     | World indices board (Americas/EMEA/APAC, Chg/%/YTD) |
| `COMP`  | `HMS`, `COMPARE`   | compare         |  ✓   | `historicalPrices`           | Normalized multi-security overlay (rebased to 100) |
| `EQS`   | `SCREEN`, `SCREENER` | screener      |      | `screener`                   | Equity screener — filter the universe by price/%chg/mktcap/volume/sector, sortable |
| `MOST`  | `MOVERS`, `GAINERS` | movers         |      | `screener`                   | Market movers — top gainers / losers / most active |
| `ECO`   | `ECON`, `MACRO`    | economics       |      | `economicSeries`             | Macro economic series (GDP, CPI, unemployment, …) — chart + table; quick-pick presets or any series id |
| `OVME`  | `OPRICE`, `OPTVAL` | option-pricer   |      | —                            | Black–Scholes option value + Greeks (spot prefills from the active symbol). Educational, not advice |
| `CALC`  | `FINCALC`, `TVM`   | calculator      |      | —                            | Financial calculator — future/present value, loan payment, CAGR. Educational, not advice |
| `EM`    | `ESTIMATES`        | estimates       |  ✓   | `estimates`                  | Forward EPS/revenue matrix + implied P/E·P/S·P/CF |
| `ANR`   | `RATINGS`          | analyst-ratings |  ✓   | `analystRatings`             | Analyst ratings (firm / action / target) |
| `HDS`   | `HOLDERS`          | holders         |  ✓   | `ownership`                  | Institutional holders (shares / value / % / change) |
| `ALERT` | `ALERTS`, `ALRT`   | alerts          |      | `quotes`                     | Price/%/volume alert rules on the live stream |
| `PORT`  | `PORTFOLIO`        | portfolio       |      | `quotes`                     | Read-only positions, market value, unrealized P&L, weights (manual add + CSV import; no order placement) |
| `AI`    | `COPILOT`, `ASK`   | ai              |      | —                            | Context-grounded copilot (mock fallback) |
| `NOTE`  | `NOTES`, `NB`      | notes           |      | —                            | Markdown research journal (tags, pin, symbol/all filter, JSON export/import) |
| `SETTINGS` | `PDF`, `PREFS`, `SET` | settings   |      | —                            | Preferences + provider capability dashboard (modes, freshness, entitlements) |

### Beta (registered scaffolds)

These commands route and open a panel; the panel clearly explains it's a scaffold and lists the
capability it will use. Wiring their data views is the obvious next step.

| Command | Aliases             | Module           | req? | Capabilities         |
| ------- | ------------------- | ---------------- | :--: | -------------------- |
| `ERN`   | `EARN`, `EARNINGS`  | earnings         |  ✓   | `estimates`          |

## Capability gaps

If a command needs a capability no enabled provider supplies, the panel still opens and shows a
graceful "capability unavailable" state naming the missing capability — never a crash. In the
default mock setup, `fx`, `futures`, and `bonds` are not provided, so commands needing them show that
state; everything else has data. Portfolio positions are user-owned local data; `PORT` only needs
`quotes` to value them, so it works out of the box in mock mode.

## Adding a command

Add a `CommandDescriptor` to `DEFAULT_COMMANDS` in
`packages/terminal-kernel/src/commands.ts`. Set `moduleId`, `requiredCapabilities`, `maturity`,
`defaultPanelSize`, and `examples`. The web app derives the module and its capability requirements
from this list automatically — see [`MODULE_SDK.md`](./MODULE_SDK.md) to attach a component.

## Research-backed command opportunities (not yet implemented)

A clean-room competitive research pass benchmarked the public command surface of a comparable
browser-native terminal. Categories Tyche does **not** yet have a command for — candidates for future,
original modules — include: `EVT` (corporate events), `MEMB` (index membership), and `GIP`
(hi-res intraday). (Shipped since: `EQS` screener, `MOST` movers, `ECO` economic series, `OVME`
option pricer, `CALC` calculator.) These are tracked as research-backed opportunities only — see
[`docs/research/godel/command-taxonomy.md`](./docs/research/godel/command-taxonomy.md) and the
[competitive roadmap](./docs/research/godel/tyche-competitive-roadmap.md). They are **not** shipped,
and any implementation will be original (no competitor UI/copy/docs reproduced).
