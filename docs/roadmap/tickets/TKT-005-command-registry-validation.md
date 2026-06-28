# TKT-005 — Deepen command/module/contract validation

**Priority:** P0  ·  **Milestone:** M1  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- Dossier: `docs/research/godel/tyche-gap-analysis.md` — P0 row "**No numeric constraints on price/qty contracts**" ("Lets NaN/negative slip into UI math", code area `packages/contracts/src/market.ts`) and P0 row "**Command registry validation depth**" ("Catch bad command/module metadata at boot", `packages/terminal-kernel`, `module-sdk`). Both are scoped to this ticket and to Milestone 1.
- Dossier: `docs/research/godel/sources.md` (T1 official) — command surface is the product's spine (`docs.godelterminal.com` command reference, per-command docs `FA`/`OMON`/`HMS`). Category-benchmark only; a coherent, validated command/module surface is table stakes for a Gödel-class terminal.
- Cross-cutting note in `tyche-gap-analysis.md` ("The capability model is the right spine … every gap maps to a `ProviderCapability` + a `ModuleDefinition`") — boot-time coverage assertions protect that spine from drift.

## Problem
Two correctness holes remain in the foundation. (1) `packages/contracts/src/market.ts` types prices and sizes as bare `z.number()`: `Quote.price/bid/ask/open/dayHigh/dayLow/prevClose`, `Candle.o/h/l/c`, `TradePrint.price`, `OrderBookLevel.price`, `VenueQuote.bid/ask/last`. `NaN`, `Infinity`, and negative prices parse cleanly and flow into `@tyche/analytics` (returns/indicators/risk) and `@tyche/ui/format.ts`, producing `NaN`/`Infinity` cells instead of a clean rejection. (2) The web module surface is derived from `DEFAULT_COMMANDS` in `apps/web/src/modules/registry.ts`, and any `moduleId` lacking an entry in `moduleComponents` (`apps/web/src/modules/components.ts`) silently falls back to `BetaPlaceholder`. A `stable`-maturity command with a typo'd or missing component would ship as a placeholder with no failing test. Registration in `CommandRegistry` (`registry.ts`) and `ModuleRegistry` (`ModuleRuntime.ts`) already throws on duplicate ids/alias collisions, but there is no test asserting that invariant nor the command↔component coverage one.

## User story
As a solo operator, I want quote/candle/trade contracts to reject `NaN`/`Infinity`/negative prices and the command surface to be validated at boot, so that bad data fails loudly at the boundary instead of rendering broken numbers, and a stable command never ships as an empty placeholder.

## Technical design
Contracts-first, capability-respecting, no new runtime behavior beyond stricter parsing:
1. `packages/contracts/src/market.ts` — add a shared `const FinitePrice = z.number().finite();` and `const FinitePositivePrice = z.number().finite().positive();`. Apply `.finite()` (allowing zero/negative deltas) to `Quote.change/changePercent`; apply `FinitePositivePrice` to `Quote.price`, `Candle.o/h/l/c`, `TradePrint.price`, `OrderBookLevel.price`. For optional level fields (`Quote.bid/ask/open/dayHigh/dayLow/prevClose`, `VenueQuote.bid/ask/last`) use `FinitePositivePrice.optional()`. Keep existing `.nonnegative()` on size/volume fields but add `.finite()` (`Quote.volume/bidSize/askSize`, `Candle.v`, `TradePrint.size`, `OrderBookLevel.size`, `VenueQuote.volume`). No field renames; `z.infer` types are unchanged.
2. Confirm `MockProvider.ts` deterministic output still satisfies the tightened schemas (it generates positive prices); adjust generator clamps only if a conformance test surfaces a violation.
3. `packages/terminal-kernel` — add `validateCommandSurface(commands)` to `registry.ts` (or a new `validation.ts`) that constructs a fresh `CommandRegistry`, `registerAll(DEFAULT_COMMANDS)` (already throws on dup id / alias collision via `CommandDescriptorSchema.parse`), and additionally returns any descriptors failing `CommandDescriptorSchema` issues as a structured list for tests.
4. `packages/module-sdk` — reuse existing `validateModuleDefinition` (`ModuleDefinition.ts`) and `ModuleRegistry.register` (`ModuleRuntime.ts`); no API change needed.
5. `apps/web/src/modules/registry.ts` — add an exported `assertModuleCoverage()` that, for every `DEFAULT_COMMANDS` entry with `maturity === 'stable'`, asserts `moduleComponents[command.moduleId]` is defined (i.e. not falling back to `BetaPlaceholder`); throw a descriptive error listing offenders. This runs in a boot test (not unconditionally at import, to keep `BetaPlaceholder` valid for beta/stub modules).

## Affected packages / apps
- `packages/contracts` — `src/market.ts` (numeric constraints) and `src/market.test.ts` (or `schemas.test.ts`).
- `packages/terminal-kernel` — `src/registry.ts`/new `validation.ts`, `src/registry.test.ts`.
- `packages/module-sdk` — consumed only; `src/module.test.ts` extended.
- `apps/web` — `src/modules/registry.ts` (coverage assert) + a new `src/modules/registry.test.ts`.
- `data-adapters` — consumed via conformance only; no source change expected.

## Data contracts
Changed (tightened, non-breaking to `z.infer` types) in `packages/contracts/src/market.ts`: `QuoteSchema`, `CandleSchema`, `TradePrintSchema`, `OrderBookLevelSchema`, `VenueQuoteSchema` gain `.finite()` / `.positive()` constraints on price and `.finite()` on size fields. No new schemas; no new exported types.

## Provider capabilities
None. This ticket touches no `ProviderCapability` key, no `DataProvider` method, and no provider keys. Behavior is identical in mock mode and BYO mode; `MockProvider` must keep working with no keys.

## UI / module behavior
No new panels. Tighter contracts mean a provider returning a malformed quote now fails `safeParse` at the route/adapter boundary, so the panel renders the existing `ErrorState` (clean message) instead of `NaN`/`Infinity` cells — the "never crash" constraint is upheld. Capability-gap modules continue to render `EmptyState`/`BetaPlaceholder` exactly as today. Provenance/freshness badges (`ProvenanceBadge`/`FreshnessBadge`) are unaffected; envelopes still wrap all API responses.

## Testing plan
- Contract (`packages/contracts/src/market.test.ts`): `QuoteSchema`/`CandleSchema`/`TradePrintSchema`/`OrderBookLevelSchema`/`VenueQuoteSchema` reject `NaN`, `Infinity`, `-Infinity`, and negative prices; accept valid fixtures and the `MockProvider` outputs.
- Kernel (`packages/terminal-kernel/src/registry.test.ts`): `validateCommandSurface(DEFAULT_COMMANDS)` passes; duplicate id and alias collision each throw; a descriptor with a lowercase id fails `CommandDescriptorSchema`.
- Module SDK (`packages/module-sdk/src/module.test.ts`): `validateModuleDefinition` rejects empty `commandIds` and bad `defaultPanelSize`; `ModuleRegistry` rejects duplicate `moduleId` and conflicting command mapping.
- Web (`apps/web/src/modules/registry.test.ts`): `assertModuleCoverage()` passes for current `DEFAULT_COMMANDS`; a synthetic stable command with no component throws; beta/stub commands are allowed to fall back.
- Conformance: `checkProviderConformance` over `MockProvider` stays green against the tightened schemas.

## Acceptance criteria
- [ ] `market.ts` price fields reject `NaN`/`Infinity`/negative; size/volume fields reject `NaN`/`Infinity`; `z.infer` types unchanged.
- [ ] `validateCommandSurface(DEFAULT_COMMANDS)` exists and is asserted by a test; duplicate id and alias collision throw.
- [ ] `assertModuleCoverage()` asserts every `stable` command has a real `moduleComponents` entry (not `BetaPlaceholder`) and is covered by a test.
- [ ] `MockProvider` output validates against the tightened schemas; conformance test green.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are all green.

## Clean-room notes
Original implementation derived solely from Tyche's own `market.ts`, `registry.ts`, `ModuleRuntime.ts`, and `modules/registry.ts`. Competitive research is category-benchmark only (a validated terminal command surface as a feature class); no Gödel Terminal UI, copy, command-doc text, code, or layout is reproduced or referenced.

## Non-goals
- No new commands, modules, or capabilities; no new module components beyond fixing coverage gaps surfaced by the assertion.
- No schema-version migration and no changes to `CommandDescriptorSchema`/`ModuleManifestSchema` shape (only `market.ts` numeric refinements).
- No runtime change to executor/parser behavior; no order placement, no personalized advice.
- No provider adapter implementation (SEC EDGAR etc. remain separate M2+ tickets).
