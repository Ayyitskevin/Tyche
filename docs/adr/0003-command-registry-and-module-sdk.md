# 0003 — Command registry and module SDK

- Status: Accepted
- Date: 2026-06-28

## Context

A terminal is a large surface of commands and panels. The failure mode to avoid is a pile of
one-off, half-wired panels with bespoke wiring each. We need the command language, the routing, and
the panels to be **declarative, validated, and extensible**, and we need the grammar to be testable
without a browser.

## Decision

Two cooperating registries plus a UI-agnostic kernel.

### Kernel: parse → execute → effects

- The **parser** is pure: it turns a command line into a structured `CommandParseResult` using only a
  small registry interface. No DOM, no data fetching. This makes the entire grammar unit-testable and
  fast.
- The **`CommandRegistry`** is declarative: each command is a `CommandDescriptor` (id, aliases,
  title, category, `requiresInstrument`, accepted asset classes, `requiredCapabilities`, `moduleId`,
  default panel size, examples, maturity), **validated against a Zod schema** on registration with
  id/alias collision checks.
- The **executor** returns declarative **effects** (`open-panel`, `set-active-instrument`, `search`,
  `message`, `noop`) rather than manipulating UI. The host interprets effects. Capability gaps are
  computed here and attached, never thrown.

### Module SDK: one manifest per module

- A module is registered through a single manifest (validated by `ModuleManifestSchema`) plus a
  component (generic, so the SDK doesn't depend on React) and optional data/lifecycle hooks.
- The `ModuleRegistry` validates manifests, rejects duplicate module ids and double-claimed commands,
  and indexes `command → module`.
- In the web app, the module surface is **derived from `DEFAULT_COMMANDS`** — the command list is the
  single source of truth; modules and their capability requirements come from it. Commands without a
  full component fall back to a `BetaPlaceholder` scaffold.

## Consequences

- Adding a command is a one-line descriptor; adding a module is "declare command + register
  component". Metadata can't drift between command and module because one is derived from the other.
- The grammar and routing are covered by fast headless tests (parser, registry validation, and a
  kernel→effects→stores integration test), independent of the UI.
- The kernel is reusable in non-web hosts (CLI, automation) because it emits effects, not DOM.
- The indirection (effects, two registries, derived modules) is more up-front structure than ad-hoc
  panels — accepted deliberately to keep the product extensible as the command surface grows.
