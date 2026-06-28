# Gödel Terminal research dossier (clean-room)

A public, source-backed competitive research pass on **Gödel Terminal / DL Software**, translated
into an **original** Tyche roadmap. **Category benchmarking only — no UI, copy, assets, private APIs,
or trade dress are reproduced.** Research date: **2026-06-28**.

> **Method caveat:** direct page-fetch (`WebFetch`) was blocked by the environment's egress policy;
> **`WebSearch` was the sole channel**. Every claim cites a source + reliability tier; conflicts are
> recorded, not invented. See [`RESEARCH_BLOCKED.md`](./RESEARCH_BLOCKED.md).

## Contents

| File | What it is |
| --- | --- |
| [`RESEARCH_BLOCKED.md`](./RESEARCH_BLOCKED.md) | Access/method + what couldn't be verified + operator steps |
| [`sources.md`](./sources.md) / [`sources.csv`](./sources.csv) | Annotated + machine-readable source list (tiered) |
| [`company-timeline.md`](./company-timeline.md) | Funding/company milestones with confidence labels |
| [`product-positioning.md`](./product-positioning.md) | Positioning, pricing wedge, audience, pillars |
| [`command-taxonomy.md`](./command-taxonomy.md) / [`.json`](./command-taxonomy.json) | Public command surface (abstracted) |
| [`workflow-teardown.md`](./workflow-teardown.md) | Reconstructed workflows + Tyche translations |
| [`video-notes.md`](./video-notes.md) | YouTube demo notes (transcripts unavailable) |
| [`competitive-feature-matrix.md`](./competitive-feature-matrix.md) | Tyche-vs-Gödel feature matrix |
| [`tyche-gap-analysis.md`](./tyche-gap-analysis.md) | Prioritized (P0–P3/X) gaps mapped to code |
| [`solo-operator-strategy.md`](./solo-operator-strategy.md) | How a solo operator competes |
| [`tyche-competitive-roadmap.md`](./tyche-competitive-roadmap.md) | 12-milestone roadmap |
| [`FINAL_REPORT.md`](./FINAL_REPORT.md) | Executive summary (14 sections) |

Related: [ADR-0004](../../adr/0004-public-competitor-research-clean-room-roadmap.md) ·
[ticket backlog](../../roadmap/tickets/) (30 tickets).

## Headline findings (cited in the files above)

- **What it is:** browser-native, command-driven terminal, "a financial terminal for modern research
  teams"; **public beta**. [T1]
- **Company:** DL Software Inc. (CEO/co-founder **Martin Shkreli**; **CTO Ralph Holzmann**, ex-Twitter);
  **$2M pre-seed** (2024, dao5/Naval/Evolve) + a later **$5M seed** (Infinitum); predecessor **Gödel
  Systems (2016)**. [T2]
- **Pricing wedge:** ~**$996/seat/yr** (also $118/mo; older $80/mo) vs. Bloomberg ~$31,980/yr — the
  central pitch. (Mostly T4; conflicts recorded.) [T4/T2]
- **Data:** Nasdaq TotalView L2, EDGAR filings, options Greeks, crypto (BTC/ETH/SOL), global
  equities/ETFs/indices/FX/futures/options/bonds; sub-100ms claims. [T1/T4]
- **Commands:** DES, G/GIP, HP, QM, N/TOP, CF, FA, EM, ERN, ANR, HDS, OMON, OVME, TAS, HMS, WEI, EQS,
  EVT, FOCUS, CALC, CHAT, BROK, … (backtick grammar; ticker+asset-class+command). [T1]
- **Tyche's differentiation:** self-hostable, mock-by-default, provenance-everywhere, provider-
  transparent, open SDK, grounded no-advice AI — the axes a hosted, licensed-data SaaS can't match.
