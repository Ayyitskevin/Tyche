# TKT-039 — Financial calculator (CALC)

**Priority:** P3  ·  **Milestone:** M16  ·  **Status:** in-progress  ·  **Clean-room risk:** Low

## Source evidence
- `docs/research/godel/tyche-gap-analysis.md` P3 list: *"financial calculator (CALC)."*
- Time-value-of-money and CAGR are standard public-domain finance formulas.

## Problem
No quick way to run everyday money math (savings growth, loan payments, growth rate) inside the
terminal.

## Technical design
Pure compute — **no provider, capability, route, or persistence**.
- `@tyche/analytics/tvm.ts`: `futureValue`, `presentValue`, `loanPayment`, `cagr` — each handles the
  zero-rate limit linearly (no divide-by-zero) and is unit-tested against textbook values.
- `CALC` command (aliases `FINCALC`/`TVM`, `moduleId: calculator`, `requiredCapabilities: []`,
  category `analytics`, stable).
- `CalculatorModule`: a mode selector (Future value / Present value / Loan / CAGR) with the relevant
  inputs and a result + breakdown (e.g. total contributed/growth; total paid/interest), all persisted
  on panel state.

## Acceptance criteria
- [x] Each mode computes the right value (annual rate ÷ periods/year internally); switching modes works.
- [x] Works with no provider/keys (pure compute); inputs persist on the panel.
- [x] Clearly labeled educational; no advice surface. typecheck/test/build/e2e green.

## Clean-room notes
Standard public-domain finance formulas implemented originally. No competitor artifact reproduced.

## Non-goals (later)
- A full TVM solver (solve for rate/nper via Newton's method); bond price/yield; IRR/NPV; amortization
  schedules.
