# 0001 — Clean-room terminal foundation

- Status: Accepted
- Date: 2026-06-28

## Context

We want a browser-native financial research terminal for solo operators and small teams: fast,
keyboard-first, modular, inspectable, and data-provider agnostic. The space has well-known
proprietary incumbents, and there is a reference project (Midas) demonstrating the general shape
(command bar, tiling panels, provider ideas, terminal-style parsing).

The legal and product constraint is firm: this must be an **original, lawful competitor
foundation** — not a copy of any proprietary product, and not a derivative that leans on private
APIs, copied UI/assets, trade dress, or undocumented behavior.

## Decision

Build a **clean-room** foundation:

- Use *publicly documented* terminal feature categories only as market benchmarks (what kinds of
  modules exist), never as a source of UI, copy, assets, or behavior to reproduce.
- Author an **original** dark terminal aesthetic, an **original** command grammar (tolerant of, but
  not dependent on, Bloomberg-style "yellow keys"), and an **original** module/provider architecture.
- Make **mock mode** the default and first-class: the product is fully usable with synthetic,
  clearly-labeled data and **no external credentials**. Live/paid data is strictly optional and
  behind capability flags, with the user responsible for entitlements.
- Encode the product's values in the architecture: **no order placement**, **no personalized
  advice**, and **provenance on every datum**.

## Consequences

- The foundation runs and is testable without any third-party accounts, which keeps development and
  CI hermetic and lawful.
- We accept some up-front cost (a deterministic mock provider that models the whole capability
  surface) in exchange for a clean, self-contained product and a conformance target for real
  providers.
- "Clean-room" is an ongoing discipline, not a one-time check: contributors must not import
  proprietary copy/assets/behavior. See `SECURITY.md` and `CONTRIBUTING.md`.
