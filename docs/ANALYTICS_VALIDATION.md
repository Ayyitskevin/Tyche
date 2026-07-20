# Analytics validation, provenance, and model assumptions

Educational / descriptive analytics only. **Nothing in `@tyche/analytics` is
investment advice**, a buy/sell/hold signal, a credit rating, or an accusation
of fraud. Forensic scores (Altman, Piotroski, Beneish) are statistical screens
with material false-positive and false-negative rates.

This document is the developer and user guide for the shared validation layer
added under `packages/analytics` (`validation.ts`, `analyticalMeta.ts`,
`formulas.ts`). It does not restate every formula — those live next to the code
and in the formula registry.

---

## House invariants

1. **Unavailable ≠ 0.** When a metric is mathematically undefined (flat return
   series, non-positive denominator, missing line item for an all-or-null
   composite), the result is `null` (UI: `—`), never a fabricated `0` that looks
   like a valid reading.
2. **Provenance on analytics.** Multi-field results expose an `meta:
   AnalyticalMeta` object with at least:
   - `formulaId` — stable id from the formula registry
   - `status` — `live` | `cached` | `delayed` | `synthetic` | `estimated` |
     `unavailable` | `partial`
   - optional `units`, `currency`, `asOf`, `provider`, `source`, `notes`
3. **Do not invent authority.** If coefficients or a formula source are not
   established in-repo, the registry marks `needsHumanReview: true` and
   `authority: null`. Do not invent weights to make a test pass.
4. **No advice framing.** Disclaimers stay descriptive. Elevated Beneish flags
   mean “scrutinize earnings quality,” not “this is fraud.”

---

## Shared modules

| Module | Role |
|--------|------|
| `validation.ts` | Numeric guards: `posDenomRatio`, `finiteOrNull`, annualization helpers, `reconciles`, `unavailableNotZero` |
| `analyticalMeta.ts` | `AnalyticalMeta` / `annotate` / `unavailable` / `statusFromProvider` / citation formatter |
| `formulas.ts` | Registry of audited formula ids, assumptions, limitations, authority, review flags |

Import from `@tyche/analytics`:

```ts
import {
  analyticalMeta,
  annotate,
  FORMULAS,
  getFormula,
  posDenomRatio,
  reconciles,
} from '@tyche/analytics';
```

---

## Status semantics

| Status | Meaning |
|--------|---------|
| `estimated` | Pure model output under stated assumptions (DCF, WACC, scores) |
| `unavailable` | Inputs missing/degenerate; value must not be treated as zero |
| `partial` | Some components present; composite incomplete (e.g. incomplete F-Score) |
| `live` / `cached` / `delayed` | When analytics wrap data-backed inputs with known freshness |
| `synthetic` | Mock / deterministic synthetic inputs |

A null value forces `unavailable` unless status was explicitly set to `partial`.

---

## Audited formulas (representative set)

| formulaId | Module | Notes |
|-----------|--------|-------|
| `dcf.gordon-growth.v1` | `dcf.ts` | Terminal null when WACC ≤ g |
| `dcf.reverse.v1` | `dcf.ts` | Implied growth via bisection |
| `capm.cost-of-equity.v1` | `capm.ts` | r_f + β·ERP |
| `capm.wacc.v1` | `capm.ts` | Weights null when capital ≤ 0 |
| `risk.correlation.v1` / `risk.beta.v1` | `portfolioRisk.ts` | **null on flat series** |
| `risk.market-sensitivity.v1` | `marketBeta.ts` | Date-aligned beta bundle |
| `scoring.altman-z-prime.v1` | `scoring.ts` | Private-firm Z′; all-or-null |
| `scoring.piotroski-f.v1` | `scoring.ts` | 9 signals; band only if complete |
| `scoring.beneish-m.v1` | `scoring.ts` | M > −1.78 elevated screen only |
| `comps.multiples.v1` | `relativeValue.ts` | Null when denom ≤ 0 |
| `funding.carry.v1` | `fundingAnalytics.ts` | House regime bands |
| `book.depth-slippage.v1` | `bookAnalytics.ts` | No extrapolation beyond depth |
| `yield.curve-spread.v1` | `apps/web/.../yieldCurve.ts` | FRED DGS* spreads |
| `flow.trade-tape.v1` | `tradeFlow.ts` | VWAP / buy-share; unknown side never guessed |
| `dex.pool-structure.v1` | `dexAnalytics.ts` | LWAP / HHI; missing liq ≠ zero |
| `risk.sharpe.v1` / `risk.series-stats.v1` | `risk.ts` | Sharpe null when flat or n&lt;2 |
| `risk.performance.v1` | `performance.ts` | Date-anchored trailing returns |

Query review gaps:

```ts
import { formulasNeedingReview } from '@tyche/analytics';
formulasNeedingReview(); // authority null or needsHumanReview
```

---

## Provider failure contracts

Adapter failure modes are covered in
`packages/data-adapters/src/providerContracts.test.ts`:

- timeout / abort → `ProviderError` (not empty authoritative data)
- rate limit (HTTP 429) → explicit error
- malformed payloads → throw or schema-invalid envelope
- schema drift → Zod `safeParse` / conformance failure
- registry fallback → mock is labeled `providerMode: 'mock'`; failed live
  calls are not silently rewritten as successful mock for the same request

Provider responses still use `Envelope<T> = { data, provenance }` from
`@tyche/contracts`. Analytical `meta` is the pure-compute counterpart and does
not replace Envelope provenance on API boundaries.

---

## Testing expectations

When adding or changing a formula:

1. **Golden** — fixed input → hand-computed output with `toBeCloseTo(x, 6)`.
2. **Degenerate** — empty / flat / denom ≤ 0 / missing line item → `null` +
   `meta.status` of `unavailable` or `partial`.
3. **Metamorphic** where exact goldens are weak (correlation symmetry and
   bounds; higher WACC → lower DCF equity; component sum reconciles to total).
4. Register the formula in `formulas.ts` with assumptions, limitations, and
   authority (or `needsHumanReview: true`).

Cross-module suite: `packages/analytics/src/quantValidation.test.ts`.

---

## Human-review requirements

| Item | Reason |
|------|--------|
| Any new composite score weights | Must cite a published source or mark `needsHumanReview` |
| Changing Altman / Beneish / Piotroski coefficients | Change-control + adversarial review; do not “correct” LVGI double-count proxy without reading scoring.ts comments |

---

## Compatibility notes

- **Breaking (wave 1):** `correlation` / `beta` / `covariance` return `null` on flat/short series
  (previously `0`). Correlation UI renders `—`.
- **Breaking (wave 2):** `sharpeRatio`, `sortinoRatio`, `calmarRatio`, and
  `informationRatio` return `null` when the ratio is undefined (short history, zero
  variance / downside / drawdown / tracking error) — never a fabricated 0-skill reading.
- **Breaking (wave 3 / undefined-path trust):**
  - `seriesStats.totalReturn` is `null` when the first price is zero (not a fabricated 0% return).
  - Mixed performance/series bundles use `meta.fieldUnits` and **omit** a single
    top-level `meta.units` so price, return, vol, and Sharpe cannot share one unit claim.
  - Bundle `meta.status` is `partial`/`unavailable` when skill metrics are null — not plain `estimated`.
  - Portfolio risk API path fields (`annualizedReturn`, `annualizedVolatility`,
    `maxDrawdown`, `valueAtRisk`) are **nullable** in the contract; non-finite values
    sanitize to `null`, never silent zero. Legitimate finite zeros still pass through.
- **Additive:** `meta` on DCF, WACC, scoring, market sensitivity, funding, book, comps,
  trade flow, DEX analytics, performance, and series stats; `fieldUnits` and
  `statusFromMetricAvailability`.
- Pure analytics remain clock-free and I/O-free.
