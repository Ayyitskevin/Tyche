# Final report — Gödel Terminal research → Tyche clean-room roadmap

Date: 2026-06-28 · Method: `WebSearch` only (`WebFetch` egress-blocked; see `RESEARCH_BLOCKED.md`).
Clean-room: category benchmarking only — **no competitor UI, copy, assets, private APIs, or trade
dress reproduced.**

## 1. Research summary

Gödel Terminal (by **DL Software Inc.**, co-founded by Martin Shkreli, CTO Ralph Holzmann) is a
**browser-native, command-driven** financial terminal positioned as a low-cost Bloomberg alternative
for **"modern research teams"** and individual traders. It is in **public beta**, funded by a **$2M
pre-seed (2024)** and a later **$5M seed (Infinitum)**, priced around **$996/seat/yr**, and covers
real-time equities (Nasdaq TotalView L2), options (Greeks), filings (EDGAR), news (<100ms claim),
crypto, futures, FX, and bonds. Its public command surface maps cleanly onto Tyche's existing
capability model. Tyche cannot win on licensed-data breadth, so its strategy is to win on **delivery
model + transparency** (self-host, mock-by-default, provenance-everywhere, BYO-data, open SDK,
grounded no-advice AI). Output: a full dossier, a 12-milestone roadmap, ADR-0004, and 30 tickets.

## 2. Source counts by reliability tier

| Tier | Description | Count (approx.) |
| --- | --- | --- |
| T1 | Official Gödel/DL Software (site, docs, X) | ~20 |
| T2 | Reputable press/finance/tech (PRNewswire, FinSMEs, CNBC, Crunchbase, Capterra, listicles) | ~11 |
| T3 | Video/demo (YouTube) | 10 |
| T4 | Affiliate/SEO/forum (sentiment only) | ~12 |

Full list: [`sources.md`](./sources.md) / [`sources.csv`](./sources.csv).

## 3. Official Gödel feature pillars (public)

Browser-native · command-driven (backtick grammar) · real-time multi-asset data · sub-100ms speed
claims · affordability vs. Bloomberg · research-team + individual audiences · expert-network/contacts
DB · in-terminal community chat · "AI Analyst" on roadmap. [T1/T3]

## 4. Public command taxonomy summary

~25–30 commands across research (DES, EVT), market-data (QM, FOCUS, MOST, WEI), charting (G/GIP, HP,
HMS), news (N, TOP), fundamentals (FA, CF, EM, ERN), research/ownership (ANR, HDS, EQS), options
(OMON, OVME), tools (CALC), portfolio (BROK), and system/social (HELP, SETTINGS, CHAT). Grammar:
ticker + asset-class + command (security-scoped) or bare (global). Detail:
[`command-taxonomy.md`](./command-taxonomy.md).

## 5. Company milestone timeline

2016 Gödel Systems (predecessor, CNBC) → 2024-07-22 **$2M pre-seed** (dao5/Naval/Evolve) →
later **$5M seed** (Infinitum; godeldiscount claims ~$7M total) → ongoing public beta, NYC hiring,
pricing evolution ($80→$118/mo, $996/yr). Confidence-labeled: [`company-timeline.md`](./company-timeline.md).

## 6. Video insights summary

10 Shkreli/demo videos identified; **transcripts unavailable, no view counts** surfaced. Themes:
Bloomberg-"killer" positioning, news/press-release speed edge, browser CLI demos, expert networks,
and an **AI Analyst roadmap** promise. Detail: [`video-notes.md`](./video-notes.md).

## 7. Tyche-vs-Gödel gap summary

Tyche is already at **category-parity on the core analyst slice** (parser, window manager, DES, GP,
HP, QM, N, CF, FA, AI) — in mock mode, with several beta modules **data-ready** in `MockProvider`.
Biggest credible gaps: a **real filings adapter + viewer**, **QM v2 / watchlist tabs / batch
import**, **financials export**, **news filters + alerts**, and promoting the data-ready beta modules.
Tyche is **ahead** on provenance, mock-by-default, self-host, and open SDK. Detail:
[`competitive-feature-matrix.md`](./competitive-feature-matrix.md), [`tyche-gap-analysis.md`](./tyche-gap-analysis.md).

## 8. Top 10 Tyche opportunities

1. **SEC EDGAR adapter + filing viewer** — the one real adapter that turns demo into useful (M2).
2. **Quote monitor v2 + watchlist tabs + batch import** — the daily driver (M3).
3. **News filters + global feed + alerts** — the "stay informed" loop (M5).
4. **Promote data-ready beta modules** (options, TAS, estimates, ratings, holders) — cheap wins (M6–M7).
5. **Financials export with provenance** — analyst-grade + a trust signal (M4).
6. **Provenance/freshness everywhere** (errors, exports, AI citations) — the moat (M5).
7. **Grounded AI copilot v2** (workspace + notes + citations, no advice) (M9).
8. **Local-first notes/research journal** — a differentiator Gödel doesn't offer (M10).
9. **Self-host hardening** (SQLite, provider/entitlement dashboard, Docker) (M11).
10. **Provider marketplace / plugin SDK** — open ecosystem vs. closed SaaS (M12).

## 9. Top 10 clean-room / legal risks (and mitigations)

1. Copying UI/copy/layout → **mitigated:** original components; no reproduction.
2. Reproducing command docs text → **mitigated:** abstracted taxonomy; mnemonics are industry-standard.
3. Implying we license data → **mitigated:** BYO-only + entitlement warnings (TKT-027).
4. Order placement creep (Gödel `BROK`) → **mitigated:** explicit non-goal; no execution path.
5. Personalized advice → **mitigated:** AI refusal guard + grounding tests.
6. Latency-edge marketing claims → **mitigated:** dropped; show freshness instead.
7. Scraping behind login/paywall → **mitigated:** none done; public WebSearch only.
8. Storing copyrighted transcripts → **mitigated:** summaries only, no transcripts stored.
9. Treating sentiment as fact → **mitigated:** Tier-4 labeled low-confidence sentiment.
10. Trademark/branding confusion → **mitigated:** original name/brand; competitor named only as benchmark.

## 10. Recommended next implementation milestone

**Milestone 1 — Foundation hardening / CI** (tickets TKT-001…005): add CI, fix the workspace
`createdAt` bug, validate imported workspace JSON, align env/docs, deepen contract/registry
validation. It's low-risk, fully local, and earns the credibility to build M2 (SEC EDGAR) on.

## 11. Files created / updated

**Created (research dossier):** `docs/research/godel/{README, RESEARCH_BLOCKED, sources.md,
sources.csv, company-timeline, product-positioning, command-taxonomy.md, command-taxonomy.json,
workflow-teardown, video-notes, competitive-feature-matrix, tyche-gap-analysis,
solo-operator-strategy, tyche-competitive-roadmap, FINAL_REPORT}.md` · `docs/adr/0004-…md` ·
`docs/roadmap/tickets/00-INDEX.md` + **30 ticket files** (`TKT-001…TKT-030`).
**Updated:** `ROADMAP.md`, `ARCHITECTURE.md`, `COMMANDS.md` (research pointers; no overstated
features).

## 12. Exact sources consulted

See [`sources.md`](./sources.md) / [`sources.csv`](./sources.csv) (≈50 URLs across T1–T4), including
godelterminal.com (+ /docs/commands/{fa,omon,hms}, /careers, /traders, /start), docs.godelterminal.com,
dl.software/news, PRNewswire + FinSMEs + CNBC + Crunchbase + Capterra, 10 YouTube videos, X posts
(pre-seed/seed/changelog), and T4 affiliate/forum sites (labeled sentiment).

## 13. What could not be verified

- **Direct page content** of official pages (WebFetch egress-blocked) — facts via WebSearch only.
- **Authoritative current pricing** (sources conflict: $80/$118/mo, $996/yr).
- **YouTube transcripts + view counts** (unavailable).
- **Traction specifics** (revenue, paying seats, "$1B individual assets", "marquee institutions" are
  company claims, not independently verified).
- **Exact founding dates** of DL Software / Godel Terminal (only the 2024 pre-seed is firmly dated).
- **Unconfirmed commands** (`ALLQ`, `MEMB`, `PORT`-as-command, `NS`, exact `SETTINGS` id) — verify
  against official docs.

Operator follow-ups to close these gaps are listed in [`RESEARCH_BLOCKED.md`](./RESEARCH_BLOCKED.md).
