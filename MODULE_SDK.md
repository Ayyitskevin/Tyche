# Module SDK

A **module** is a self-contained panel: a command (or commands) routes to it, it declares the
provider capabilities it needs, and it renders into a panel frame. Modules are registered through a
single manifest so the product stays extensible and avoids one-off panels.

## Anatomy

`@tyche/module-sdk` defines the contract. A `ModuleDefinition<C>` is generic over the component type
`C` (the web app uses a React component), keeping the SDK UI-agnostic:

```ts
interface ModuleDefinition<C> {
  moduleId: string;             // kebab-case, unique
  title: string;
  commandIds: string[];         // commands that route here
  requiredCapabilities?: ProviderCapability[];
  defaultPanelSize: { w: number; h: number };
  maturity: 'stable' | 'beta' | 'stub';
  exportFormats?: ('csv' | 'json' | 'png' | 'clipboard')[];
  keyboardShortcuts?: KeyboardShortcut[];
  hasStreaming?: boolean;
  component: C;
  loadInitialState?: (ctx) => PanelStateData | Promise<PanelStateData>;
  streamingFor?: (symbols) => StreamingSubscription[];
  exportData?: (input) => ModuleExportResult | null;
  testFixture?: ModuleTestFixture;
}
```

`toManifest(def)` extracts and **validates** the serializable manifest against
`ModuleManifestSchema`. The `ModuleRegistry`:
- validates each manifest on registration,
- rejects duplicate `moduleId`s and commands claimed by two modules,
- indexes `commandId → module`,
- computes capability gaps: `missingFor(moduleId, availableCapabilities)`.

## Panel props

The host renders your component with `ModulePanelProps`:

```ts
{
  panelId: string;
  moduleId: string;
  symbol: string | null;              // resolved symbol (typed or active)
  args: string[];                     // remaining command args
  commandId: string;
  assetClass: AssetClass | null;
  state: Record<string, unknown>;     // serialized panel state (persisted)
  setState: (patch) => void;          // merge into panel state
  missingCapabilities: ProviderCapability[];
  active: boolean;
  reportProvenance?: (p: DataProvenance | null) => void;  // lift provenance to the frame footer
}
```

Persist per-panel UI choices (selected range, statement type, …) via `state` + `setState` — they are
serialized with the workspace.

## How the web app wires modules

In `apps/web` the module surface is **derived from the kernel's `DEFAULT_COMMANDS`** (single source
of truth). `modules/registry.ts` groups commands by `moduleId`, unions their capabilities, and
attaches a component from `modules/components.ts`. Commands without a full component fall back to
`BetaPlaceholder`, which renders an informative scaffold panel.

So adding a module is two steps:

1. **Declare the command** in `packages/terminal-kernel/src/commands.ts` (sets `moduleId`,
   `requiredCapabilities`, `maturity`, `defaultPanelSize`).
2. **Write + register the component** in `apps/web/src/modules/`:

```tsx
// modules/MyModule.tsx
import type { ModulePanelProps } from '@tyche/module-sdk';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, SymbolRequired, useReportProvenance } from './common';

export function MyModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const state = useApiData(() => api.getQuote(symbol ?? 'AAPL'), [symbol]);
  useReportProvenance(reportProvenance, state.provenance);
  if (!symbol) return <SymbolRequired />;
  return (
    <ModuleBody state={state} missingCapabilities={missingCapabilities}>
      {(quote) => <div className="p-3 font-mono">{quote.symbol}: {quote.price}</div>}
    </ModuleBody>
  );
}
```

```ts
// modules/components.ts
export const moduleComponents = {
  // …existing…
  'my-module': MyModule,
};
```

`ModuleBody` is the standard render ladder: **capability gap → loading → error → empty → content**,
so capability gaps and provider errors are handled consistently for free.

## Data hooks

- `useApiData(loader, deps)` — runs an API loader, tracking `loading`/`error`/`provenance` and
  distinguishing a graceful `capability_unavailable` response from a real error. `reload()` re-fetches.
- `useQuoteStream(symbols)` — subscribes to the SSE quote stream and returns a live `symbol → Quote`
  map. Pair it with an initial `useApiData(api.getQuotes(...))` for provenance + first paint.
- `useElementSize()` — for virtualized tables that need a measured height (`DataTable height={…}`).

## UI building blocks

From `@tyche/ui`: `PanelFrame` (chrome + provenance footer), `DataTable` (windowed for large
datasets), `LoadingState`/`EmptyState`/`ErrorState`, `ProvenanceBadge`/`FreshnessBadge`, and
formatters (`formatCurrency`, `formatPercent`, `changeToneClass`, …). Use `EmptyState` for any
"missing capability / provider" message so the user always learns *what* is missing and *why*.

## Validation in tests

`validateModuleDefinition(def)` returns `{ ok, manifest?, error? }` without throwing — handy for
fixtures. See `packages/module-sdk/src/module.test.ts` for manifest + registry tests.
