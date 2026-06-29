# TKT-038 — Option pricer (OVME)

**Priority:** P3  ·  **Milestone:** M16  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` P3 list: *"option pricer (OVME) via @tyche/analytics."*
- Black–Scholes–Merton pricing is standard public-domain finance math; benchmarked only at the
  category level.

## Problem
Tyche could display an option *chain* (`OMON`) but had no way to value a hypothetical contract or
inspect its Greeks — a basic options-research tool.

## Technical design
Pure compute — **no provider, capability, route, or persistence**.
- `@tyche/analytics/options.ts`: `blackScholes(input)` returning price + delta/gamma/vega/theta/rho +
  intrinsic + d1/d2, with a dependency-free `normCdf`/`normPdf`. Degenerate inputs (T≤0 or vol≤0)
  collapse to discounted intrinsic with no NaN. Unit-tested against textbook values and put-call parity.
- `OVME` command (aliases `OPRICE`/`OPTVAL`, `moduleId: option-pricer`, `requiredCapabilities: []`,
  category `analytics`, stable).
- `OptionPricerModule`: call/put toggle + inputs (spot, strike, days, vol%, rate%, div%), all persisted
  on panel state; outputs value + Greeks (vega per 1%, theta per day). Spot **prefills best-effort** from
  the active symbol's quote (never required — works fully offline).

## Acceptance criteria
- [x] `OVME` prices a European call/put and shows its Greeks; `AAPL OVME` prefills spot from the quote.
- [x] Works with no provider/keys (pure compute); inputs persist on the panel.
- [x] Clearly labeled educational; no order/advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Black–Scholes is public-domain math implemented originally. No competitor UI/copy/private API is
reproduced; no licensed data is used.

## Non-goals (later)
- American/exotic options; implied-volatility solving; a payoff diagram; binomial/Monte-Carlo models.
