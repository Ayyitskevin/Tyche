# Contributing

Thanks for helping build Tyche. This guide covers local development and the conventions that keep
the foundation coherent.

## Prerequisites

- Node ≥ 20.10
- pnpm 10+ (`corepack enable` will provision it)

## Setup

```bash
pnpm install
pnpm dev          # API on :4010, web on :5173 (mock mode, no keys)
```

## Everyday commands

| Command            | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `pnpm dev`         | Run API + web together                                  |
| `pnpm dev:api`     | API only                                                |
| `pnpm dev:web`     | Web only                                                |
| `pnpm typecheck`   | Strict `tsc --noEmit` across every package              |
| `pnpm test`        | Vitest unit/contract/API tests (Node)                   |
| `pnpm test:watch`  | Vitest in watch mode                                    |
| `pnpm test:e2e`    | Playwright browser smoke test                           |
| `pnpm build`       | Production web bundle                                   |
| `pnpm format`      | Prettier write                                          |

CI-equivalent gate before a PR: `pnpm typecheck && pnpm test && pnpm build`.

## Repository layout

```
packages/   contracts · terminal-kernel · data-adapters · module-sdk · ui · analytics
apps/       api (Fastify) · web (React + Vite)
tests/e2e/  Playwright specs
docs/adr/   architecture decision records
```

Dependency rule: **everything depends on `@tyche/contracts`**; the web app talks to the API only
over HTTP/SSE and never imports server packages. Don't introduce import cycles between packages.

## Conventions

- **TypeScript everywhere, strict.** `verbatimModuleSyntax` is on — use `import type` for type-only
  imports. `noUncheckedIndexedAccess` is on — guard or assert array/index access.
- **Contracts first.** Model new domain data as a Zod schema in `@tyche/contracts` and derive the
  type with `z.infer`. Add it to the `Schemas` registry.
- **No build step for libraries.** Packages export `src/index.ts`; Vite/tsx/tsc consume source
  directly. Don't add `dist/` build outputs to libraries.
- **Provenance is mandatory.** Any new provider method returns `Envelope<T>` with `DataProvenance`.
- **Graceful, never crashing.** Surface missing capabilities/providers and errors via
  `EmptyState`/`ErrorState`, not exceptions in render.
- **No advice, no orders.** Don't add features that give personalized buy/sell/hold guidance or place
  trades.
- Formatting via Prettier (`.prettierrc.json`). Keep new code matching the surrounding style.

## How to add things

### A command
Edit `packages/terminal-kernel/src/commands.ts` and add a `CommandDescriptor` to `DEFAULT_COMMANDS`.
Add a parser test if it introduces new grammar. See [`COMMANDS.md`](./COMMANDS.md).

### A module
1. Declare its command(s) (above).
2. Add the React component in `apps/web/src/modules/` and register it in `modules/components.ts`.
   See [`MODULE_SDK.md`](./MODULE_SDK.md).

### A provider
Implement `DataProvider` (or extend `StubProvider`), register it in `providerRegistry.ts`, and run
`checkProviderConformance()`. See [`DATA_PROVIDERS.md`](./DATA_PROVIDERS.md).

## Testing expectations

- New parser grammar → a parser test.
- New command/module metadata → it must pass registry/manifest validation (covered by existing tests).
- New provider capability → it must pass the conformance suite.
- New API route → a `fastify.inject` smoke test in `apps/api/src/app.test.ts`.
- Keep `pnpm typecheck` and `pnpm test` green.

## Commit / PR

- Small, focused PRs with a clear description of *what* and *why*.
- Run the CI gate locally first.
- Note any new env vars in `.env.example` and the relevant doc.

## Decision records

Significant architectural choices are captured as ADRs in [`docs/adr/`](./docs/adr/). Add a new ADR
when you make a decision future contributors would otherwise have to reverse-engineer.
