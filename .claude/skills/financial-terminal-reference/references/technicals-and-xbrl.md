# Reference: technical-indicator catalog + XBRL concept map

Overflow detail for `financial-terminal-reference`. Load this when you need the exact
default period of an indicator, the warm-up/flat-window convention, or the SEC us-gaap
concept that feeds a `FinancialStatement` line item. All facts carry file:line; re-verify
against the repo before quoting (see the maintenance table at the end).

Date-stamp: **2026-07-19**. Repo paths are relative to `/home/user/Tyche`.

---

## 1. Technical-indicator catalog — `packages/analytics/src/technicals.ts` + `indicators.ts`

**Shared convention.** OHLC-based studies take *parallel numeric arrays* (`highs`, `lows`,
`closes`, `volumes`) — never a candle object — so they stay trivially testable. Every function
returns an array **the same length as its input** (Ichimoku is the sole exception, below),
with `null` during the warm-up window. A **flat window** (e.g. `highestHigh === lowestLow`)
yields a defined *neutral* value, never `NaN`. Nothing here is a trade signal.

### Base builders — `indicators.ts`
| Fn | Signature | Formula / convention | Warm-up |
|---|---|---|---|
| `mean` | `(number[]) → number` | arithmetic mean; `0` on empty | — |
| `stddev` | `(number[]) → number` | **sample** stdev (÷ n−1); `0` when `<2` points | — |
| `sma` | `(values, period) → (number\|null)[]` | rolling mean | `null` for i < period−1 |
| `ema` | `(values, period) → (number\|null)[]` | k = 2/(period+1), **seeded with the SMA** of the first window | `null` for i < period−1 |
| `rsi` | `(values, period=14) → (number\|null)[]` | **Wilder** smoothing of avg gain/loss; 100 when avgLoss=0 | first value at index `period` |

### Studies — `technicals.ts`
| Fn (file:line) | Defaults | Formula as coded | Notes |
|---|---|---|---|
| `rollingMax` / `rollingMin` (16 / 31) | — | trailing window extremum | `null` until window fills |
| `rollingStd` (46) | — | **population** stdev (÷ N) — the Bollinger convention (NOT the ÷n−1 `stddev`) | |
| `macd` (72) | fast 12, slow 26, signal 9 | `emaFast − emaSlow`; signal = EMA of the MACD line's contiguous defined tail, scattered back | histogram = macd − signal |
| `bollingerBands` (101) | period 20, mult 2 | `sma ± mult · rollingStd` (population) | |
| `trueRange` (110) | — | `max(h−l, |h−prevClose|, |l−prevClose|)`; bar 0 = h−l | |
| `atr` (125) | period 14 | Wilder smoothing of TR, seeded with SMA of first `period` TRs | |
| `stochastic` (147) | k 14, d 3 | `%K = 100·(c−LL)/(HH−LL)`; flat window → **%K = 50**; `%D = SMA(%K, d)` | |
| `williamsR` (173) | period 14 | `−100·(HH−c)/(HH−LL)`; flat → **−50**; range [−100, 0] | |
| `typicalPrice` (184) | — | `(h+l+c)/3` | |
| `cci` (192) | period 20 | `(TP − SMA(TP)) / (0.015 · mean abs deviation)`; flat → 0 | |
| `obv` (204) | — | running Σ volume: `+v` on up-close, `−v` on down-close | |
| `vwap` (221) | — | **cumulative/anchored** `Σ(TP·vol)/Σvol` from series start; `null` until any volume | not a rolling VWAP |
| `roc` (236) | period 12 | `100·(v − v[i−period])/v[i−period]` | |
| `momentum` (245) | period 10 | `v − v[i−period]` | |
| `adx` (260) | period 14 | Wilder +DI/−DI/DX; **ADX seeds at index 2·period−1** with mean of first `period` DX, then Wilder-smooths; all in [0,100] | |
| `ichimoku` (337) | conv 9, base 26, spanB 52, disp 26 | Donchian midpoints `(HH+LL)/2`; spanA/spanB displaced **forward**, lagging span **backward** | **output arrays run `displacement` bars LONGER than input** to hold the projected cloud |

---

## 2. `FinancialStatement` line-item keys — the normalized schema

Both the SEC EDGAR adapter and MockProvider emit the **same** `lineItems` key set / label / order
so the fundamentals matrix stays column-aligned regardless of source (SecEdgar `buildFinancialStatements`,
`packages/data-adapters/src/stubs/SecEdgarProvider.ts:918-1088`; mock `buildStatements`,
`MockProvider.ts:1005+`). Analytics reads these keys via `lineItem(statement, key)`
(`packages/analytics/src/fundamentals.ts:13`).

### income (`type: 'income'`)
`totalRevenue, costOfRevenue, grossProfit, researchAndDevelopment, sellingGeneralAdmin,
operatingIncome, interestExpense, incomeTaxExpense, netIncome, eps`

### balance (`type: 'balance'`)
`totalAssets, currentAssets, cashAndEquivalents, inventory, totalLiabilities, currentLiabilities,
totalDebt, totalEquity, retainedEarnings, sharesOutstanding, accountsReceivable, propertyPlantEquipment`

### cash_flow (`type: 'cash_flow'`)
`operatingCashFlow, depreciationAmortization, shareBasedCompensation, capitalExpenditures,
freeCashFlow, dividendsPaid`

---

## 3. SEC us-gaap concept → line-item mapping (annual & quarterly)

`SecEdgarProvider.buildFinancialStatements` reads `data.sec.gov/api/xbrl/companyfacts/CIK*.json`.
Each line item resolves a **priority-ordered fallback list** of us-gaap concepts (first non-empty wins),
`SecEdgarProvider.ts:946-984`. Some lines are **computed**, not read.

| Line item | us-gaap concept fallbacks (in order) | unit |
|---|---|---|
| totalRevenue | `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues`, `RevenueFromContractWithCustomerIncludingAssessedTax`, `SalesRevenueNet` | USD |
| costOfRevenue | `CostOfRevenue`, `CostOfGoodsAndServicesSold`, `CostOfGoodsSold` | USD |
| grossProfit | `GrossProfit` — else **computed** `revenue − cost` | USD |
| operatingIncome | `OperatingIncomeLoss` | USD |
| netIncome | `NetIncomeLoss`, `ProfitLoss` | USD |
| eps | `EarningsPerShareDiluted`, `EarningsPerShareBasic` | **USD/shares** |
| researchAndDevelopment | `ResearchAndDevelopmentExpense` | USD |
| sellingGeneralAdmin | `SellingGeneralAndAdministrativeExpense`, `GeneralAndAdministrativeExpense` | USD |
| interestExpense | `InterestExpense`, `InterestExpenseNonoperating` | USD |
| incomeTaxExpense | `IncomeTaxExpenseBenefit` | USD |
| totalAssets | `Assets` | USD |
| currentAssets | `AssetsCurrent` | USD |
| inventory | `InventoryNet` | USD |
| totalLiabilities | `Liabilities` — else **computed** `LiabilitiesAndStockholdersEquity − StockholdersEquity` | USD |
| currentLiabilities | `LiabilitiesCurrent` | USD |
| totalEquity | `StockholdersEquity`, `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` | USD |
| retainedEarnings | `RetainedEarningsAccumulatedDeficit` | USD |
| **sharesOutstanding** | **`CommonStockSharesOutstanding` ONLY** — see the mislabel trap in SKILL.md | shares |
| accountsReceivable | `AccountsReceivableNetCurrent`, `ReceivablesNetCurrent` | USD |
| propertyPlantEquipment | `PropertyPlantAndEquipmentNet` | USD |
| cashAndEquivalents | `CashAndCashEquivalentsAtCarryingValue`, `CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents` | USD |
| totalDebt | **computed** `LongTermDebtNoncurrent + LongTermDebtCurrent` (or `DebtCurrent`); falls back to `LongTermDebt` when neither part is present | USD |
| operatingCashFlow | `NetCashProvidedByUsedInOperatingActivities`, `…ContinuingOperations` | USD |
| depreciationAmortization | `DepreciationDepletionAndAmortization`, `DepreciationAmortizationAndAccretionNet`, `DepreciationAndAmortization` | USD |
| shareBasedCompensation | `ShareBasedCompensation`, `ShareBasedCompensationExpense` | USD |
| capitalExpenditures | `PaymentsToAcquirePropertyPlantAndEquipment`, `PaymentsToAcquireProductiveAssets` — **negated** (SEC reports outflow positive) | USD |
| freeCashFlow | **computed** `operatingCashFlow − capex` (capex un-negated) | USD |
| dividendsPaid | `PaymentsOfDividendsCommonStock`, `PaymentsOfDividends` — **negated** | USD |

**Sign convention:** SEC reports capital outflows (capex, dividends) as *positive* amounts;
the adapter **negates** them so the sign matches the mock's convention (`SecEdgarProvider.ts:1080,1082`).
`totalDebt` = long-term-noncurrent + long-term-current (the current portion of long-term debt);
this is *not* the same as `currentLiabilities` — see the LVGI mislabel trap in SKILL.md.

---

## Re-verification commands

| Claim | Command |
|---|---|
| indicator defaults / formulas | `sed -n '60,367p' packages/analytics/src/technicals.ts` |
| base builders | `cat packages/analytics/src/indicators.ts` |
| line-item key set | `grep -n "li('" packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| concept fallback lists | `sed -n '946,984p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
| computed / negated lines | `sed -n '1024,1088p' packages/data-adapters/src/stubs/SecEdgarProvider.ts` |
