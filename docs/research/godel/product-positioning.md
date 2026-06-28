# Gödel Terminal — public product positioning analysis

Sources via `WebSearch` (direct fetch egress-blocked). Confidence + tier labels apply; Tier-4
(affiliate/SEO/forum) is treated as low-confidence sentiment.

## Core promise & tagline

- Official homepage positions Gödel as **"a financial terminal for modern research teams."**
  [primary] — [godelterminal.com](https://godelterminal.com/)
- The trial funnel headline: **"Command Your Market Data. Free Trial."**
  [primary] — [start.godelterminal.com](https://start.godelterminal.com/)
- A second audience page targets **"Traders & individuals: real-time market data, democratized."**
  [primary] — [godelterminal.com/traders](https://godelterminal.com/traders/)
- Recurring product promise across sources: a **browser-native, keyboard/command-driven** terminal
  delivering Bloomberg-style workflows with a **sub-tenth-of-a-second** command response.
  [third-party/sentiment] — [thestockdork](https://www.thestockdork.com/godel-terminal-review/), [findmymoat](https://www.findmymoat.com/tools/godel-terminal)

## Target customer

Two overlapping audiences appear in public materials:

1. **Modern research teams / small institutions** — "hedge funds, family offices, asset managers,
   active-equity RIAs." [company-claim/sentiment] — [godelterminal.com](https://godelterminal.com/), [theresearchstack](https://theresearchstack.com/)
2. **Individual traders / retail-pro** — "real-time market data, democratized." [primary] —
   [godelterminal.com/traders](https://godelterminal.com/traders/)

**Implication for Tyche:** Gödel straddles "small research team" and "individual." Tyche's stated
audience (solo operators + small research teams) overlaps the *individual / small-team* slice — the
segment least served by Bloomberg's seat pricing. That is the wedge.

## The pricing wedge (vs. Bloomberg / LSEG / FactSet)

Pricing is the central narrative. Data points (note conflicts; mostly Tier-4 affiliate blogs):

| Product | Reported cost | Confidence | Source |
| --- | --- | --- | --- |
| Bloomberg Terminal (single seat, 2026) | ~$31,980/yr (~$2,665/mo); 2-yr min | [third-party] | [costbench](https://costbench.com/software/financial-data-terminals/bloomberg-terminal/), [godeldiscount](https://godeldiscount.com/blog/bloomberg-terminal-cost-2026) |
| Refinitiv Eikon (LSEG) | ~$14k–$22k/yr | [sentiment] | [godeldiscount](https://godeldiscount.com/blog/financial-terminal-pricing-comparison) |
| FactSet | ~$12k–$18k/yr | [sentiment] | [godeldiscount](https://godeldiscount.com/blog/financial-terminal-pricing-comparison) |
| **Gödel Terminal** | **~$996/yr annual** (also reported **$118/mo**, earlier **$80/mo**); free tier + 14-day trial | [sentiment]/[third-party] | [findmymoat](https://www.findmymoat.com/tools/godel-terminal), [Capterra](https://www.capterra.com/p/10042474/Godel-Terminal/) |

The marketed wedge: **"~32× cheaper than Bloomberg"** for equity/ETF/options workflows. [sentiment]
— [godeldiscount](https://godeldiscount.com/blog/financial-terminal-pricing-comparison)

**Implication for Tyche:** Gödel competes on **price + browser-native delivery**, not on data
breadth parity with Bloomberg. Tyche, with no data budget, cannot win on licensed-data breadth at
all — so it must compete on a *different* axis (self-hostable, local-first, mock-by-default,
transparent provider adapters, open SDK). See `solo-operator-strategy.md`.

## Positioning pillars (abstracted, original wording)

1. **Browser-native** — no terminal hardware/keyboard, runs in a browser. [third-party]
2. **Command-driven workflow** — backtick command bar; `<ticker> <asset-class> <command>` grammar.
   [primary-ish] — [docs.godelterminal.com](https://docs.godelterminal.com/)
3. **Speed** — "under a tenth of a second" command response; "beating the market by 30 sec" news
   framing in demos. [third-party/video] — [YouTube: Jsg43FSsQyA](https://www.youtube.com/watch?v=Jsg43FSsQyA)
4. **Affordability** — single seat ≈ low-thousands/yr vs. tens-of-thousands. [sentiment]
5. **Real-time multi-asset data** — equities (Nasdaq), options, futures, crypto, FX, filings.
   [primary/sentiment] — [godelterminal.com/traders](https://godelterminal.com/traders/)
6. **Research-team angle** — collaboration/teams framing + an expert-network/contacts database.
   [company-claim]
7. **Public beta posture** — free trial, free tier, visible dev branches, active hiring. [primary]

## Enterprise / API / team / compliance posture (what's publicly visible)

- **Teams/seats**: per-seat pricing language ("$996 a seat … the whole desk gets one") implies a
  team/seat model. [sentiment] — [godeldiscount](https://godeldiscount.com/)
- **Compliance**: a reported **+$30 FINRA surcharge** for FINRA-certified users hints at a
  compliance-aware billing path. [sentiment] — [findmymoat](https://www.findmymoat.com/tools/godel-terminal)
- **API**: no clearly documented public data API was found via WebSearch (the "Neets" TTS API is a
  *separate* DL Software product, not Godel data). Recorded as **not found / unconfirmed**.
- **Audit/SSO/org-billing**: no public evidence found. **Unconfirmed.**

## Public roadmap hints

- Frequent changelog-style mentions ("QM can now be popped out again", "WEI: SPX no longer delayed",
  "HMS … now has a help button") indicate **active, iterative development** of existing modules
  rather than a published forward roadmap. [primary] — update notes surfaced via WebSearch on
  godelterminal.com.

## Net read for Tyche

Gödel's public identity = **browser-native, command-driven, real-time multi-asset terminal at a
disruptive price, aimed at research teams and individuals**. It is a *hosted SaaS with licensed
data*. Tyche should treat Gödel's **feature categories** as the benchmark surface to reach
(commands, modules, workflows) while differentiating on **delivery model** (self-hostable,
local-first, mock-by-default, provider-transparent, open SDK) where a solo operator with no data
budget can actually win.
