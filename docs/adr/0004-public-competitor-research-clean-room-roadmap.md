# 0004 — Public competitor research & clean-room competitive roadmap

- Status: Accepted
- Date: 2026-06-28

## Context

Tyche's foundation (v0.1) exists. To steer it toward becoming a credible, *direct* competitor to
browser-native research terminals — Gödel Terminal being the closest public benchmark — we ran a
**public, source-backed research pass** and translated it into an **original** roadmap. This ADR
records why we did it, the clean-room boundaries we held to, and the architectural/roadmap
implications. The full dossier is in [`docs/research/godel/`](../research/godel/).

## Why the research was done

To replace guesswork with evidence: understand the competitor's *public* feature categories, command
surface, data coverage, positioning, pricing wedge, and trajectory, so Tyche's roadmap targets the
right **categories** with a defensible **differentiation** (delivery model + transparency), rather
than imitating a product we can't out-fund on data.

## Clean-room boundaries (hard rules we followed)

- **Public information only.** We did not access anything behind login, scrape app surfaces, bypass
  paywalls, use credentials, or reverse-engineer protected systems.
- **Categories, not copies.** We abstracted Gödel's public *feature categories* and *command
  mnemonics* (which are largely industry-standard, Bloomberg-derived) into original Tyche designs. We
  copied **no** UI, assets, screenshots, copy, styling, layout, trade dress, private APIs, or
  undocumented behavior.
- **No transcript hoarding.** YouTube transcripts were unavailable and are **not** stored; videos are
  summarized into titles + claim-themes only, with short/no quotes.
- **Honest sourcing.** Every factual claim cites a source with a reliability tier; conflicts (esp.
  pricing) are recorded, not resolved by invention. Direct page-fetch was egress-blocked, so all
  facts came via `WebSearch` — disclosed in [`RESEARCH_BLOCKED.md`](../research/godel/RESEARCH_BLOCKED.md).

## Source categories used

T1 official (godelterminal.com, docs, X) · T2 reputable press (PR Newswire, FinSMEs, CNBC, Crunchbase,
Capterra, comparison listicles) · T3 video (YouTube demos — low confidence) · T4 affiliate/SEO/forum
(godeldiscount, godelguide, review aggregators, Reddit/HN — **sentiment only**).

## What Tyche WILL emulate (at the category level)

The standard research-terminal surface: a command bar + tolerant grammar; a tiling window manager
with linked panels; quote monitor/watchlists; charting + historical prices + multi-security
comparison; company description; **SEC filings + viewer**; standardized financials + export; news +
filters; estimates/earnings/ratings/holders; options chain + Greeks; time & sales; world indices;
screeners; a grounded AI copilot; user preferences. All built as **original** Tyche modules over the
existing capability model.

## What Tyche will NOT copy or build

- Gödel's UI, copy, command documentation text, visual design, or trade dress.
- **Order placement / brokerage linking** (Gödel `BROK`) — Tyche is not a broker.
- **Personalized buy/sell/hold advice** — the AI declines and stays grounded.
- **Latency-edge marketing** ("beat the market by 30s") — data-dependent and advice-adjacent.
- **Private-company data, teams/org billing, community chat, expert-network contacts DB** — outside a
  research-terminal core.

## Architecture implications

- The research **validates the capability model** (ADR-0002) and **module SDK** (ADR-0003): every
  benchmarked feature maps to a `ProviderCapability` + a `ModuleDefinition`, so growth is additive,
  not structural.
- The highest-leverage architectural move is implementing **one real public adapter (SEC EDGAR)** to
  prove the model under real data — then promoting the **data-ready** mock modules (options, trades,
  estimates, ratings, holders) which already have `MockProvider` data.
- **Provenance/freshness everywhere** is a deliberate divergence from the competitor's public posture
  and should be extended to error payloads, exports, and AI citations.

## Roadmap implications

A 12-milestone plan ([`tyche-competitive-roadmap.md`](../research/godel/tyche-competitive-roadmap.md))
and a ~30-ticket backlog ([`docs/roadmap/tickets/`](../roadmap/tickets/)): M1 hardening/CI → M2 EDGAR
+ viewer → M3–M5 daily-driver surface → M6–M8 promote beta modules → M9 AI depth → M10 solo-operator
moat → M11–M12 self-host + ecosystem.

## Legal / compliance notes

- Tyche bundles **no proprietary/licensed data**; live data is BYO behind capability flags, with the
  user responsible for entitlements/attribution (reaffirms `SECURITY.md`).
- No competitor IP is reproduced. Command mnemonics are industry conventions; Tyche's grammar, parser,
  contracts, and UI are original.
- This ADR + the dossier's `RESEARCH_BLOCKED.md` document the research method and its limits for
  auditability.

## Consequences

Tyche has an evidence-based, differentiated, clean-room path to category-parity. The risk is scope
sprawl; the mitigation is the milestone sequencing (ship the real EDGAR adapter and daily-driver
surface before inventing new modules) and the explicit non-goals above.
