---
name: financial-terminal-reference
description: >-
  The finance math and standards AS IMPLEMENTED in Tyche's @tyche/analytics package and the
  SEC/XBRL fundamentals adapter — each formula tied to exact source. Load this when you are
  reading, changing, testing, or debugging any financial calculation and need to know how it is
  actually coded here (not a textbook). Triggers: valuation multiples (P/E, P/S, EV/EBITDA,
  bands), forensic scores (Altman Z, Piotroski F, Beneish M, M-Score, F-Score, Z-Score),
  market sensitivity (beta, alpha, R2, up/down capture), performance (trailing returns, Sharpe,
  drawdown, volatility, VaR), technical indicators (RSI, MACD, Bollinger, ATR, ADX, Ichimoku,
  VWAP, stochastic), options (Black-Scholes greeks, implied volatility, payoff, breakevens,
  max pain, IV skew), TVM/DCF/reverse-DCF/WACC/CAPM, seasonality, Treasury yield-curve spreads,
  funding rates, order-book depth, DEX pools; and the SEC company-facts / XBRL fiscal-frame
  model (why AAPL/MSFT balance sheets came back empty), the us-gaap concept mappings, and the
  MISLABEL TRAPS (CommonStockSharesIssued vs shares-outstanding; LVGI total-liabilities vs
  debt+current-liabilities double-count). Also load when a number renders "—" and you need to
  know which degenerate-input guard nulled it. Descriptive/educational analytics only — never
  investment advice.
---

# Financial Terminal Reference (as implemented in Tyche)

This is the domain-theory pack for `@tyche/analytics` and the SEC/XBRL fundamentals adapter.
It documents the finance math **as coded here**, with file:line and the formula the code
actually computes — because the code deliberately diverges from textbook forms in named,
load-bearing ways (private-firm Altman, a double-count-free LVGI, all-or-null scoring,
data-anchored dates). When the code and a textbook disagree, **the code is the spec**; if you
think the code is wrong, that is a change-control matter (see below), not a silent "fix".

**All paths are relative to `/home/user/Tyche`. Line numbers are dated 2026-07-19** — re-verify
with the commands in the Provenance section before quoting them.

## The two rules that shape every formula here

1. **Descriptive / educational only — never advice.** Every module docstring says so. Product
   Invariant #1 is research-only: no buy/sell/hold, no signal, no rating. A "score" is a
   descriptive read of reported filings, not a recommendation. Keep that framing in any UI copy,
   AI answer, or doc you write. (Rationale/history lives in **tyche-change-control**.)
2. **Null, never fabricate.** On degenerate input (missing line item, `<2` observations, a flat
   series, a non-positive denominator) the code returns `null` / `'—'`, never a fabricated `0`,
   negative multiple, `NaN`, or `Infinity`. Calibrated composites (Altman, Beneish) are
   **all-or-null**: a partial score is meaningless, so it is `null` unless every component is
   present. This is a *domain* invariant, not just defensive coding.

> **Cross-references — do not restate the detail here:**
> - *Why* analytics is a pure, dependency-free layer (the design rule) → **tyche-architecture-contract**.
> - *How to golden-test / prove* one of these formulas (fixed input → hand-computed output,
>   determinism, mislabel-detection method) → **tyche-proof-and-analysis-toolkit**.
> - The adapter roster (which providers are keyless / BYO-key, env vars) → **tyche-config-and-flags**.
> - Any change to a formula, threshold, or concept mapping routes through **tyche-change-control**.

## When NOT to use this skill (use the sibling instead)

| You are doing… | Use instead |
|---|---|
| Wiring a new capability/route/module (the vertical) | **tyche-vertical-slice-campaign** |
| Understanding the dependency spine / capability-gap / purity *as a design rule* | **tyche-architecture-contract** |
| Writing a golden test or proving a calc stays correct | **tyche-proof-and-analysis-toolkit** |
| Finding which env var / provider serves a symbol | **tyche-config-and-flags** |
| A symptom → fix triage ("beta renders —", "empty balance sheet") | **tyche-debugging-playbook** (then come here for the math) |
| The chronicle of a past bug (why it happened) | **tyche-failure-archaeology** |
| Running conformance / the app / diagnostics | **tyche-diagnostics-and-tooling**, **tyche-run-and-operate** |

---

## THE MISLABEL TRAPS (domain hazards — read before touching fundamentals)

The costliest recurring bug class in this repo is **silently mislabeling a datum**: reading a
concept that is *almost* the right one, giving a plausible-but-wrong number a correct-looking
label. Two are enshrined in code comments as permanent guardrails. **Never undo these.**

### Trap 1 — shares outstanding is NOT `CommonStockSharesIssued`
`SecEdgarProvider.ts:967-969` maps `sharesOutstanding` to **`CommonStockSharesOutstanding` only**,
with an explicit "never fall back to `CommonStockSharesIssued`" comment.

- **Issued shares include treasury stock** (repurchased shares the company still holds).
  **Outstanding shares exclude treasury.** They differ, often materially, for any firm that has
  bought back stock.
- Using issued-as-outstanding inflates the share count → **understates EPS-derived and
  per-share metrics** (P/E via reported EPS is unaffected, but `salesPerShare = revenue/shares`
  in `valuationHistory.ts:97` and any per-share DCF output would be wrong), and corrupts the
  Piotroski `noDilution` signal (`scoring.ts:141`).
- **Rule:** shares-outstanding = `CommonStockSharesOutstanding`. If it is absent, the value is
  `null` (and the dependent metric renders `—`) — do **not** substitute issued shares.

### Trap 2 — Beneish LVGI uses total-liabilities/total-assets, NOT (debt + current liabilities)
`scoring.ts:225-228`. The published Beneish LVGI numerator is *(current liabilities + long-term
debt) / total assets*. Naively coding that here **double-counts** the current portion of
long-term debt:

- The mapped `totalDebt` line item = `LongTermDebtNoncurrent + LongTermDebtCurrent` (SEC concept
  map — see `references/technicals-and-xbrl.md`). The **current portion of long-term debt is
  already inside `currentLiabilities`.** Adding `totalDebt + currentLiabilities` counts it twice.
- The code therefore uses a **double-count-free proxy**: `LVGI = (totalLiabilitiesᵀ / totalAssetsᵀ)
  ÷ (totalLiabilitiesᴾ / totalAssetsᴾ)` — the year-over-year ratio of the leverage ratio. This is
  a disclosed simplification (docstring `scoring.ts:188-189`), equivalent in intent, immune to the
  double-count.
- **Rule:** LVGI reads `totalLiabilities` and `totalAssets`. Do not "correct" it to
  `totalDebt + currentLiabilities`.

### The general rule (from BUILD_MANUAL doctrine)
**Never silently mislabel a datum.** When a concept is *close* but not exact, either map it
correctly, compute it from parts (as `grossProfit`, `totalLiabilities`, `totalDebt`,
`freeCashFlow` are — see `references/`), or return `null`. When in doubt, `null` and render `—`.

---

## Valuation multiples — `valuationHistory.ts`, `relativeValue.ts`

**`posRatio(a, b)`** (`valuationHistory.ts:59`) is the guard behind every multiple:
`null` when `a` or `b` is null **or `b <= 0`**, else `a/b` (null if non-finite). A **P/E is
`null` when EPS ≤ 0** — a negative or infinite multiple is not meaningful, never fabricated.

`valuationHistory(statements, candles, symbol)` (`:84`) — **annual periods only**:
- Per fiscal year: `eps` = reported diluted EPS line item; `salesPerShare = totalRevenue /
  sharesOutstanding` (null when shares ≤ 0, `:97`); `price` = latest close **on or before the
  fiscal date** (`priceAsOf`, `:49`); `pe = posRatio(price, eps)`; `ps = posRatio(price,
  salesPerShare)`.
- `currentPe = posRatio(latestClose, mostRecentAnnualEps)` — **trailing** (uses reported EPS,
  not a forward estimate).
- `peBand`/`psBand` = min/avg/max over the historical points **excluding** the current figure
  (`band`, `:65`; empty → all null).

`relativeValue.ts` — peer comps. `ratioPosDen(a,b)` (`:45`): null unless denominator **strictly
positive** (numerator may be signed). `compMultiples` (`:52`):
- `enterpriseValue = marketCap + totalDebt − cash`
- `ebitda = operatingIncome + depreciationAmortization`
- `pe = mktCap/netIncome`, `ps = mktCap/revenue`, `pb = mktCap/totalEquity`,
  `evEbitda = EV/ebitda`, `evSales = EV/revenue`, `fcfYield = FCF/mktCap`, margins as ratios,
  `revenueGrowth = revenue/priorRevenue − 1` (only when priorRevenue > 0).
- `peerMedians` (`:88`) drops nulls before the median; `premiumToPeers` (`:106`) = `value/ref − 1`
  (null unless ref > 0).

## Forensic scorecards — `scoring.ts` (all-or-null; each is an ANNUAL metric)

`fundamentalScorecard(statements, symbol)` (`:277`) uses **annual periods only**; the two most
recent annual bundles drive year-over-year signals; `insufficientHistory = true` when `<2` annual
periods. Line items are read via `lineItem` (null-safe); ratios via `ratio` (null when operand
null or denom 0). All three are **descriptive screens, not accusations or ratings.**

### Altman Z′-Score (`altmanZScore`, `:46`) — private-firm variant, NO price input
Five weighted components; **score is `null` unless all five are present**. EBIT proxied by
**operating income**; X4 uses **book equity** (not market cap) so the whole score comes from
statements alone.

| Xᵢ | Ratio (as coded) | Weight |
|---|---|---|
| x1 | working capital (`currentAssets − currentLiabilities`) / totalAssets | 0.717 |
| x2 | retainedEarnings / totalAssets | 0.847 |
| x3 | operatingIncome (EBIT) / totalAssets | 3.107 |
| x4 | totalEquity (book) / totalLiabilities | 0.42 |
| x5 | totalRevenue / totalAssets | 0.998 |

Score = Σ(weight·value), rounded to 2 dp. **Zones** (`:76`): `> 2.9` safe · `1.23 ≤ z ≤ 2.9`
grey · `< 1.23` distress. (This is the Z′ / Z-prime private-company band set — do **not**
substitute the original public-firm Z bands 1.81/2.99.)

### Piotroski F-Score (`piotroskiFScore`, `:119`) — 9 binary signals, YoY
`score` = count of passing signals (0–9). `evaluable` = signals with all inputs present;
`complete` = all 9 evaluable. **A signal needing the prior year is `null` when it is absent** —
never counted as a pass or fail. `score` sums only `pass === true`; a partial checklist is never
inflated to 9.

| # | key | Passes when |
|---|---|---|
| 1 | roaPositive | netIncome/totalAssets > 0 |
| 2 | cfoPositive | operatingCashFlow > 0 |
| 3 | roaRising | ROA(cur) > ROA(prior) |
| 4 | accruals | operatingCashFlow > netIncome |
| 5 | leverageFalling | (totalDebt/totalAssets) fell YoY |
| 6 | currentRatioRising | currentRatio rose YoY |
| 7 | noDilution | sharesOutstanding(cur) ≤ sharesOutstanding(prior) |
| 8 | grossMarginRising | grossMargin rose YoY |
| 9 | assetTurnoverRising | revenue/totalAssets rose YoY |

Signal 5 uses **total-debt/assets** (docstring `:113-117`: the mapped balance sheet exposes
total, not strictly long-term, debt — a disclosed choice). **Band** (only when complete, `:150`):
`≥7` strong · `4–6` moderate · `≤3` weak.

### Beneish M-Score (`beneishMScore`, `:192`) — 1999 8-variable earnings-manipulation screen
`M = −4.84 + Σ(weight·index)`, rounded 2 dp; **`null` unless all 8 indices present**. Each index
is a ratio of year-over-year ratios. **Flag** (`:252`): `M > −1.78` → `elevated` · else `low`.
`elevated` is a prompt to scrutinize earnings quality — a **statistical screen with a high
false-positive rate, NEVER a conclusion of fraud** (docstring `:170-175`).

| key | Index (as coded) | Weight |
|---|---|---|
| dsri | (ARᵀ/salesᵀ) ÷ (ARᴾ/salesᴾ) | 0.92 |
| gmi | (gpᴾ/salesᴾ) ÷ (gpᵀ/salesᵀ) — prior margin ÷ current | 0.528 |
| aqi | assetQuality ratio, `1 − (currentAssets + netPPE)/totalAssets`, YoY | 0.404 |
| sgi | salesᵀ / salesᴾ | 0.892 |
| depi | depRate(prior) ÷ depRate(cur), `dep/(dep+ppe)` | 0.115 |
| sgai | (SG&Aᵀ/salesᵀ) ÷ (SG&Aᴾ/salesᴾ) | −0.172 |
| tata | (netIncome − operatingCashFlow) / totalAssets | 4.679 |
| lvgi | (totalLiabᵀ/totalAssetsᵀ) ÷ (totalLiabᴾ/totalAssetsᴾ) — **see Mislabel Trap 2** | −0.327 |

Two disclosed simplifications (`:186-190`): AQI omits long-term securities (uses currentAssets +
net PP&E); LVGI is the double-count-free total-liabilities proxy. `M_CONSTANT = −4.84`
(`scoring.ts:179`).

## Market sensitivity — `marketBeta.ts` (function is `marketSensitivity`)

`marketSensitivity(assetCandles, benchmarkCandles, symbol, benchmark)` (`:77`). **Filename
`marketBeta.ts` exports `marketSensitivity` — the names differ.**

- Series are **aligned on common trading dates** (`alignByDate`, `:40`), not just trimmed to
  equal length — returns line up even when coverage differs.
- **Whole bundle nulled** when `observations < 2` **OR** either return series is flat
  (`stddev === 0`) (`:105`): a flat benchmark makes beta undefined, a flat asset makes
  correlation/R² undefined. "A degenerate input must render `—`, never a fabricated 0-beta."
- `beta` = cov(rs, rb)/var(rb) (via `portfolioRisk.beta`). `alpha` = daily intercept
  `mean(rs) − beta·mean(rb)`, **annualized ×252**. `rSquared = correlation²`. `correlation` =
  Pearson (clamped to ±1). `upCapture` / `downCapture` (`:62`) = mean asset return ÷ mean
  benchmark return over benchmark up-days / down-days (`>1` up-capture = outperforms in up
  markets; `<1` down-capture = falls less). `PERIODS_PER_YEAR = 252`.

## Performance & risk — `performance.ts`, `risk.ts`

`performanceStats(candles, symbol, riskFreeRate=0)` (`performance.ts:108`) — a multi-horizon
snapshot. **Anchored to the LAST candle's date, NOT the wall clock** (`:116`), so output is
deterministic and reproducible. Candles are sorted ascending defensively; `n===0` → all-null.

- **Trailing returns** for horizons `1W(7d), 1M, 3M, 6M, YTD, 1Y(12m), 3Y(36m)`: `lastClose/ref
  − 1`, where `ref` = close at or just before the horizon cutoff (date-accurate, gap-tolerant).
  Month math clamps to the target month's last day (`subMonths`, `:69`) so "1 month before Mar 31"
  is Feb 28/29, not Mar 2/3. **YTD** uses the last close of the **prior calendar year**; `null`
  when no prior-year candle exists (never a partial-year proxy). A horizon that history can't reach
  is `null` — a short series never fabricates a 3-year return.
- `annualizedVolatility` / `sharpe` = `null` when `<2` return observations. `maxDrawdown`,
  `currentDrawdown` (from running peak to last close, ≤0), `bestDay`/`worstDay`,
  `positiveRate` (fraction of up days).

`risk.ts` primitives (daily bars, 252/yr):
- `volatility(returns, 252)` = `stddev · √252` (stddev is **sample**, ÷n−1).
- `maxDrawdown(values)` = worst `(v − peak)/peak`, a negative fraction; `0` on empty.
- `sharpeRatio(returns, rf=0, 252)` = `mean(excess)/stddev(excess) · √252`; `0` when `<2` points
  or zero stdev. `rf` is the **annual** rate, de-annualized per period internally.
- `historicalVar(returns, 0.95)` = the return at the `(1−confidence)` quantile of the sorted
  series (a negative number for a loss). `0` on empty.

`fundamentals.ts` ratios (`financialRatios`, `:97`): gross/operating/net/fcf margins, ROA, ROE,
debt/equity, debt/assets, asset turnover, current ratio, **quick ratio** `(currentAssets −
inventory)/currentLiabilities`, interest coverage `operatingIncome/interestExpense`. Every ratio
independently `null` when its inputs are missing. `growth(cur, prior)` = `(cur−prior)/|prior|` —
dividing by **|prior|** keeps the sign pointing in the direction of change even for a negative base.

## Technical indicators — `technicals.ts` + `indicators.ts`

Full catalog (defaults, formulas, warm-up/flat-window conventions) is in
**`references/technicals-and-xbrl.md` §1**. Load-bearing conventions:
- Functions take **parallel numeric arrays** (`highs`, `lows`, `closes`, `volumes`), not candles.
- Output length == input length (except **Ichimoku**, which runs `displacement` bars longer to
  hold the projected cloud). `null` during warm-up. A **flat window yields a neutral value, never
  `NaN`** (stochastic %K → 50, Williams %R → −50, CCI → 0).
- **Two stdev conventions coexist:** `indicators.stddev` is **sample** (÷n−1, for vol/Sharpe);
  `technicals.rollingStd` is **population** (÷N, the Bollinger convention). Don't cross them.
- `vwap` is **cumulative/anchored** from series start, not a rolling window.

## Options — `options.ts` (Black–Scholes–Merton), `optionsAnalytics.ts`

`blackScholes(input)` (`options.ts:67`) — European options with continuous dividend yield `q`.
Inputs `timeYears, rate, vol, dividendYield` are **annualized decimals**. `normCdf` (`:51`) is the
Abramowitz–Stegun 7.1.26 erf approximation (|err| < 1.5e-7) — dependency-free, deterministic.
- `d1 = [ln(S/K) + (r − q + vol²/2)·T] / (vol·√T)`, `d2 = d1 − vol·√T`.
- `price` (call) `= S·e^{−qT}·N(d1) − K·e^{−rT}·N(d2)`; put via put side.
- Greeks: `delta`, `gamma`, `vega` (**per 1.00 vol change** — caller scales to per-1%),
  `theta` (**per year** — caller scales per-day), `rho` (per 1.00 rate).
- **Degenerate collapse:** `T≤0 || vol≤0 || S≤0 || K≤0` → discounted intrinsic, `delta ∈ {0,±1}`,
  all second-order greeks 0 — never `NaN` (`:73`).

`optionsAnalytics.ts`:
- `impliedVolatility(marketPrice, input, opts)` (`:34`) — **bisection** on `[lo=1e-4, hi=5]`
  (robust where vega→0). `null` when the target price is outside the achievable band (e.g. a quote
  below discounted intrinsic) or inputs degenerate. BSM price is monotincreasing in vol.
- Strategy legs: `quantity>0` long, `<0` short. `legPayoff = quantity·(intrinsic − premium)`;
  `strategyPayoff` sums legs; `payoffCurve` samples an evenly-spaced price grid; `breakevens`
  reports exact-zero nodes once and linearly interpolates sign changes; `payoffSummary` =
  max profit / max loss **bounded by the grid** (caller must size the range).
- `maxPain(contracts)` (`:151`) = the listed strike minimizing total intrinsic payout across all
  **open interest** — where the most option value expires worthless. `null` when no OI.
- `ivSkew(contracts, opts)` (`:181`) = contracts carrying a finite `impliedVolatility`,
  optionally filtered by type/expiry, as `{strike, iv}` sorted by strike (the shape a smile plot
  consumes).

## TVM / DCF / reverse-DCF / WACC / CAPM — `tvm.ts`, `dcf.ts`, `capm.ts`

`tvm.ts` — `ratePerPeriod` is a per-period decimal; annuities are ordinary (end of period);
each fn handles the zero-rate limit linearly (no divide-by-zero):
- `futureValue(pv, pmt, r, nper)`, `presentValue(fv, pmt, r, nper)`, `loanPayment(principal, r,
  nper)` (level fully-amortizing payment), `cagr(begin, end, years)` = `(end/begin)^{1/years} − 1`
  (**returns `NaN`** — not null — when any input ≤ 0; this one predates the null convention).

`dcf.ts` — `discountedCashFlow(inputs)` (`:68`): projects `baseFcf·(1+g)^y` over
`forecastYears` (coerced to int ≥1), discounts at `discountRate`, adds a **Gordon** terminal value
`lastFcf·(1+tg)/(discountRate − tg)`, nets `netDebt`, divides by `sharesOutstanding` for
`fairValuePerShare`. **Terminal value and everything downstream is `null` when `discountRate ≤
terminalGrowthRate`** (a divergent perpetuity) — warn, never surface an Infinity.
- `impliedGrowthRate(inputs, targetEquityValue)` (`:121`) — **reverse DCF**: bisection for the
  explicit growth rate that makes equity value = target (typically market cap). `null` when
  `baseFcf ≤ 0`, the terminal diverges, or the target is outside the model's wide-bracket range.
- `dcfSensitivity(inputs, discountRates[], terminalGrowthRates[])` (`:153`) — equity-value grid;
  cells where `discountRate ≤ terminalGrowth` are `null`.

`capm.ts` — `costOfEquity = rf + β·ERP` (`:19`). `afterTaxCostOfDebt = pretax·(1−tax)`. `wacc(i)`
(`:50`): value-weight equity & taxed debt; **weights and WACC are `null` when total capital ≤ 0**.

## Seasonality — `seasonality.ts`

`seasonality(candles, symbol)` (`:62`) — per-calendar-month return stats from **month-end
close-to-close** returns. Month-end = the last close of each calendar month; the return for a
month = that month's close ÷ prior month's close − 1. Output is 12 entries Jan→Dec, each with
mean/median/positiveRate/best/worst/count; **a month never observed is `null`** (not 0).
Empty-safe (12 null months). Docstring warns: ~1 observation/year, **not predictive**.

## Treasury yield curve — `apps/web/src/modules/yieldCurve.ts`

NOTE: this pure helper lives in the **web app module**, not `@tyche/analytics` (it consumes
`EconomicObservation` from FRED `DGS*` series). Command `YCRV` (`commands.ts:783`).
- `TREASURY_TENORS` (`:20`): 11 constant-maturity tenors `DGS1MO…DGS30`, each with a `years` value.
- `asOfYield(observations, targetMs)` (`:53`): latest valued obs **on or before** the target,
  else the earliest valued point; skips null observations.
- `curveSpread(curve, shortId, longId)` (`:81`) = `long − short` (percentage points).
- `KEY_SPREADS` (`:90`): `2s10s` (DGS2→DGS10), `3m10y` (DGS3MO→DGS10), `5s30s` (DGS5→DGS30).
  **Negative = inverted** curve.

## Market-data models (contract shapes, not analytics formulas)

These are provider-supplied `@tyche/contracts` shapes — the "math" is a documented field, not a
computed helper. Included here because they carry finance semantics engineers ask about.
- **Funding rate** (`contracts/src/funding.ts`): perp `rate` per interval (decimal, `0.0001` =
  1 bp); `intervalHours` (8 on most venues); **`annualizedPct = rate × (24/intervalHours) × 365 ×
  100`** (`funding.ts:16`); `markPrice?`, `nextFundingAt?`. Served by Binance (`fundingRates`).
- **Order book** (`contracts/src/market.ts:107`): `bids[]` / `asks[]` of `{price, size}` levels
  (`OrderBookLevel`, `:101`). The `BOOK` command (aliases `DOM`/`DEPTH`) renders cumulative
  size, spread, and mid (`commands.ts:505`). Served by Binance (`orderBook`).
- **DEX pool** (`contracts/src/dexpool.ts:18`): on-chain liquidity-pool snapshot — `priceUsd`,
  `volume24hUsd`, **`liquidityUsd`** (the depth behind the price), token pair, `pairAddress`,
  `dexId`. All USD figures nullable → `null` default. Served by Dexscreener (`dexPools`).

---

## SEC company-facts / XBRL fiscal-frame model — `stubs/SecEdgarProvider.ts`

This is the trickiest domain model in the repo and the source of a HIGH-severity bug
(`d63f764`). The adapter reads `data.sec.gov/api/xbrl/companyfacts/CIK*.json` and normalizes
us-gaap **concepts** into `FinancialStatement[]`. Two functions do the work: `classifyFact`
(`:1130`, which period a fact belongs to) and `selectFacts` (`:1099`, dedupe restatements).

### The fiscal-frame quirk (why AAPL/MSFT balance sheets came back EMPTY)
SEC stamps period-end **instant** facts (balance-sheet items) with a *calendar* frame
`CY####Q#I`. The naive assumption is "annual balance instant = `CY####Q4I`". **That is wrong for
any non-December fiscal-year-end filer**, because SEC frames the FY-end instant by the **calendar
quarter in which the fiscal year ends**:

| Filer | FY ends | FY-end balance frame |
|---|---|---|
| December filer | Dec 31 | `CY####Q4I` |
| Apple (AAPL) | late Sep | **`CY####Q3I`** |
| Microsoft (MSFT) | June 30 | **`CY####Q2I`** |

Hardcoding `Q4I` returned an **empty balance sheet** for AAPL/MSFT. The fix (`classifyFact:1147-
1155`): accept **any `CY####Q[1-4]I`** FY-end instant, **gated on `fp === 'FY'`** to exclude an
interim-quarter balance that merely lands in calendar Q4 (e.g. a Sep filer's fiscal-Q1 ending in
December). Annual *durations* (income/cash-flow) are framed `CY####` (no quarter).

### The keying rule (aligns durations + instants + framed/unframed into one column)
Every annual fact is keyed by the **calendar year of its period END** (`f.end.slice(0,4)`,
`:1145`) — which is the fiscal-year label for essentially all US filers (a fiscal year is named by
the year it ends in). This single key collapses, into one column:
- the income/cash-flow **durations** (`CY####` frame), and
- the balance-sheet **instant** (`CY####Q[1-4]I` frame), and
- framed vs. **unframed** facts for the same period,

even for an **off-calendar** filer where SEC's frame *year* differs from the fiscal year. **The
frame only classifies** (is this annual? duration vs FY-end instant) — it **never supplies the
key**. Keying off the frame year (the original bug) produced duplicate/misaligned columns and an
off-by-one year label for off-calendar filers.

### Annual vs quarterly frames
- **Annual** (`classifyFact:1137`): `CY####` non-instant duration, or `CY####Q[1-4]I` FY-end
  instant (fp===FY). Fallback for a just-filed 10-K SEC hasn't framed yet: `fp==='FY'` + an annual
  form (`10-K, 10-K/A, 20-F, 20-F/A, 40-F, 40-F/A`) + (instant, or duration 335–400 days) (`:1158`).
- **Quarterly** (`:1165`): **frames only** — `CY####Q[1-3]` duration or `CY####Q[1-4]I` instant.
  No `fp` fallback: for off-calendar fiscal years SEC frames are **calendar** quarters while `fp`
  is **fiscal**, so an `fp` fallback would key the same period twice.

### Restatement dedupe (`selectFacts:1099`)
Within one period key, sort **framed-first, then latest-`filed`, then latest accession** and take
the winner — i.e. the most recently restated figure. Both annual & quarterly are capped
(annual 3 periods, quarterly 4, `buildFinancialStatements:986`).

### Concept → line-item mapping
The full us-gaap concept fallback lists, computed lines (grossProfit, totalLiabilities, totalDebt,
freeCashFlow), and the outflow-sign negation are in **`references/technicals-and-xbrl.md` §2–3**.
SEC and Mock emit the **same** line-item key set / order so the fundamentals matrix stays aligned
regardless of source — an analytics function never needs to know which provider served the data.

---

## Provenance and maintenance (re-verify before quoting)

Every fact below is **dated 2026-07-19**. Line numbers drift; recount before relying on one. When
sources disagree, deployed/CI > executable code > docs. Any change to a formula, threshold, or
mapping is a **tyche-change-control** matter.

| Volatile fact (as of 2026-07-19) | Re-verify with |
|---|---|
| analytics barrel = **22** modules | `grep -c "export \\* from" packages/analytics/src/index.ts` |
| no wall clock in analytics src (= **0**) | `grep -rn "Date.now(\\|Math.random(" packages/analytics/src --include=*.ts \| grep -v .test.ts \| wc -l` |
| Altman weights 0.717/0.847/3.107/0.42/0.998; zones 2.9 / 1.23 | `sed -n '66,76p' packages/analytics/src/scoring.ts` |
| Piotroski 9 signals; bands 7/4 | `sed -n '131,151p' packages/analytics/src/scoring.ts` |
| Beneish `M_CONSTANT=−4.84`; threshold `−1.78`; 8 weights | `sed -n '179,252p' packages/analytics/src/scoring.ts` |
| P/E null on EPS≤0 (`posRatio`, b≤0) | `sed -n '58,63p' packages/analytics/src/valuationHistory.ts` |
| beta bundle nulled `n<2 \|\| stddev==0`; alpha ×252 | `sed -n '102,118p' packages/analytics/src/marketBeta.ts` |
| performance anchored to last candle, not clock | `sed -n '108,117p' packages/analytics/src/performance.ts` |
| BSM d1/d2, degenerate collapse | `sed -n '67,109p' packages/analytics/src/options.ts` |
| DCF terminal null when discount ≤ terminal growth | `sed -n '85,100p' packages/analytics/src/dcf.ts` |
| **Mislabel 1** shares = `CommonStockSharesOutstanding` only | `sed -n '967,969p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| **Mislabel 2** LVGI = totalLiab/totalAssets | `sed -n '225,228p' packages/analytics/src/scoring.ts` |
| fiscal-frame quirk (Q3I/Q2I FY-end; key by end-year) | `sed -n '1137,1163p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| concept→line-item map | `sed -n '946,984p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| funding annualizedPct formula | `sed -n '16,17p' packages/contracts/src/funding.ts` |
| YCRV tenors / key spreads | `sed -n '20,94p' apps/web/src/modules/yieldCurve.ts` |
| the empty-AAPL/MSFT fix rationale | `git show d63f764` |
| goldens exist for most analytics modules (20 `*.test.ts` for 22 barrelled modules) | `ls packages/analytics/src/*.test.ts \| wc -l` |

**Doc-drift warning:** repo docs quote stale counts (e.g. "24 capabilities", "41 commands"); code
is authoritative (28 capability keys, 60 commands). If you cite any count, pair it with its
recount command above. Do not hard-code drift-prone counts elsewhere.
