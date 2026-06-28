# TKT-014 — Options chain module + Greeks UI

**Priority:** P1  ·  **Milestone:** M6  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- https://godelterminal.com/docs/commands/omon — category benchmark for an options-chain command (confirmed doc page; cited in `docs/research/godel/sources.md:23`).
- `docs/research/godel/competitive-feature-matrix.md:36` — "Options chain | OMON | beta | chain grid + Greeks UI | options | contracts | P2 | M | Low | chain grid (mock ready) | M6" — the named gap this ticket closes.
- `docs/research/godel/command-taxonomy.md:61` — "OMON | options | Options chain: every strike/expiry; bid/ask/last/vol/IV/Greeks" — the column set this UI must surface.
- `docs/research/godel/competitive-feature-matrix.md:63` — "The mock provider even already returns options/Greeks" — confirms the data layer is done and this is a UI/wiring ticket.

## Problem
`OMON` exists in `DEFAULT_COMMANDS` (`packages/terminal-kernel/src/commands.ts:249`, `moduleId: 'options-monitor'`, `requiredCapabilities: ['options']`, `maturity: 'beta'`), the `options` capability is declared (`packages/contracts/src/provider.ts`), `MockProvider.getOptionChain` already returns a full deterministic `OptionChain` with Greeks (`packages/data-adapters/src/MockProvider.ts:723`), and the API already serves it at `GET /api/options/:symbol` (`apps/api/src/routes/research.ts:34`). But there is no `OptionsMonitorModule` in `apps/web/src/modules/`, so `options-monitor` falls through to `BetaPlaceholder` (`apps/web/src/modules/registry.ts:32`). A solo operator running `AAPL OMON` sees a placeholder, not the chain.

## User story
As a solo operator/analyst, I want `AAPL OMON` to render the option chain as an expiry/strike grid with bid/ask/last/volume/OI/IV/Greeks so that I can read the term structure and option pricing for a name without a brokerage account or leaving the terminal.

## Technical design
Contracts-first; capability model preserved; reuse virtualized `DataTable` + `ModuleBody` ladder.
1. **API client method.** Add `getOptionChain(symbol, { expiry? })` to `apps/web/src/providers/apiClient.ts`, calling `GET /api/options/:symbol` (with optional `?expiry=`) and returning the `EnvelopeResult<OptionChain>` from `@tyche/contracts`. No new server route (`/api/options/:symbol` already exists via `serveCapability(... 'options' ...)`).
2. **Module component.** Add `apps/web/src/modules/OptionsMonitorModule.tsx`. Load via `useApiData(() => client.getOptionChain(symbol, query), [symbol, expiry])`; gate on `props.symbol` with `SymbolRequired` from `modules/common.tsx`; render through `ModuleBody` (loading/empty/error/capability-gap ladder). Lift provenance with `useReportProvenance`.
3. **Expiry selector + grid.** From `OptionChain.expirations`, render a compact expiry tab/select; default to the first expiry, persist the choice in `Panel.state` via `ModulePanelProps.state`/`setState` (the untyped `z.record(z.unknown())` bag in `workspace.ts` — no contract change). Build a per-strike grid: one row per `strike`, call columns on the left, put columns on the right (split `OptionChain.contracts` by `type`), pricing the call/put for the selected expiry against the shared strike ladder. Columns: bid / ask / last / volume / openInterest / IV (%) / delta / gamma / theta / vega — sourced from `OptionContract` + `OptionContract.greeks` (`packages/contracts/src/options.ts`). Render with the virtualized `DataTable` from `@tyche/ui`; format numbers/percent via `@tyche/ui` `format.ts`. Mark `inTheMoney` rows with a tone class. Missing optional fields (any of bid/ask/greeks) render as an em-dash, never `NaN`.
4. **Register the component.** Add `OptionsMonitorModule` to the `moduleComponents` map (`apps/web/src/modules/components.ts`) under key `'options-monitor'`, so `registry.ts` stops falling back to `BetaPlaceholder`. Optionally drop `maturity` from `beta` to `stable` for `OMON` in `commands.ts` once shipped (kernel-only metadata change; out of scope if risky).

## Affected packages / apps
- `apps/web` — new `modules/OptionsMonitorModule.tsx`; edit `modules/components.ts` (register); add `getOptionChain` to `providers/apiClient.ts`. Reuses `providers/useApiData.ts`, `modules/common.tsx`, `@tyche/ui` `DataTable`/`format`/state components.
- `packages/terminal-kernel` — optional `maturity` flip for `OMON` in `commands.ts` (no behavior change).
- No changes to `packages/contracts`, `packages/data-adapters`, or `apps/api` — chain, mock, and route already exist.

## Data contracts
None. `OptionChain`, `OptionContract`, `OptionGreeks`, `OptionType` already exist in `packages/contracts/src/options.ts` and are returned with provenance by `MockProvider`. Selected-expiry UI state persists in the untyped `Panel.state` bag (`packages/contracts/src/workspace.ts`), so no Zod change is required.

## Provider capabilities
Requires `options` (`ProviderCapabilities.options`, `packages/contracts/src/provider.ts`). Satisfied by the deterministic `MockProvider` (returns chain + Greeks), so mock mode works with no keys. BYO providers that declare `options` work unchanged. When `options` is absent, `serveCapability` yields `unavailable`/`missingCapabilities` and `ModuleBody` renders the capability-gap `EmptyState` — never a crash. A non-optionable symbol returns an empty `contracts` array (mock behavior) → empty-state, not error.

## UI / module behavior
- Panel: expiry selector + strike grid (calls | strike | puts) via virtualized `DataTable`; per-strike bid/ask/last/vol/OI/IV/Greeks; ITM rows toned.
- No symbol → `SymbolRequired`; empty `contracts` (non-optionable or empty expiry) → `EmptyState` ("No option chain for {symbol}."); loader error → `ErrorState` with retry; capability gap → capability `EmptyState`. All via `ModuleBody`.
- `ProvenanceBadge`/`FreshnessBadge` in the panel frame reflect the `options` provenance (mock is `delayed`, `delaySeconds: 900`) lifted by `useReportProvenance` — surfaced honestly, no fake "live".

## Testing plan
- Unit (`apps/web/src/modules/OptionsMonitorModule.test.tsx`, RTL + mocked `apiClient`): grid renders call/put columns per strike for the selected expiry; expiry switch round-trips through `state`/`setState`; missing bid/ask/greeks render em-dash; ITM tone applied; empty `contracts` → empty-state; error → `ErrorState`; capability gap → capability `EmptyState`.
- Contract (`packages/data-adapters/src/MockProvider.test.ts` area): assert `getOptionChain` shape parses `OptionChainSchema` and includes Greeks + IV (extend if not already covered); `checkProviderConformance` (`conformance.ts`) still passes.
- API (`apps/api` route tests): `GET /api/options/AAPL` returns `{ data, provenance }` with `provenance.capability === 'options'`; missing-capability registry → graceful unavailable.
- e2e (`apps/web` Playwright): `AAPL OMON` opens the options monitor against mock; assert grid rows + IV/Greeks columns render, switching expiry updates rows, and a non-optionable symbol shows the empty-state.

## Acceptance criteria
- [ ] `AAPL OMON` renders an expiry/strike grid (calls | strike | puts) with bid/ask/last/volume/OI/IV/delta/gamma/theta/vega columns from `OptionChain`/`OptionContract`.
- [ ] Expiry selector drives the grid and persists in `Panel.state` via `setState` with no contract change.
- [ ] `options-monitor` is registered in `moduleComponents` and no longer falls back to `BetaPlaceholder`.
- [ ] Missing optional fields render as em-dash (never `NaN`); ITM rows are toned.
- [ ] Capability gap / empty (non-optionable) / error / no-symbol states render gracefully via `ModuleBody`; mock mode works with no keys.
- [ ] Provenance (`options`, `delayed`) is surfaced via the panel badges; no false "live".
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built entirely from Tyche's own contracts (`options.ts`, `provenance.ts`, `workspace.ts`), the deterministic `MockProvider`, the existing `/api/options/:symbol` route, and `@tyche/ui` components (`DataTable`, `EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`). An option-chain grid with IV/Greeks columns is a standard category feature; the column set is benchmarked from public command docs and Tyche's own dossier, not copied. No Gödel Terminal UI, copy, code, layout, or documentation is reproduced — research is category-benchmark only.

## Non-goals
- Black-Scholes pricer / theoretical-value module (`OVME`, P3/M6 — separate ticket).
- Streaming/real-time option quotes (mock is `delayed`); no SSE for chains here.
- Strategy builder, spreads/multi-leg, payoff diagrams, or P&L modeling.
- Order placement, brokerage, or any trade action — out of scope by foundation constraint.
- New provider capabilities or changes to `OptionChain`/`OptionContract` Zod contracts.
