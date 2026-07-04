# Show HN submission

Submit as a **text post**: paste the body into HN's text field and leave the URL field empty, so
both the demo and repo links live in the body. The moment it's live, self-reply with the first
comment below — it answers the #1 question ("where does the data come from?") before anyone asks.
HN has no image attachments; the demo GIF is already in the linked README. Before posting, fill the
two literal placeholders: `[demo URL]` and `[hosted URL]`.

**Title** (76 chars — under HN's 80-char limit; don't lengthen it):

    Show HN: Tyche – a financial research terminal that sells software, not data

---

## Post body

Tyche is a keyboard-first financial research terminal that runs in the browser. You press ⌘K, type a command like `AAPL GP` (price chart with volume + RSI) or `ECO GDP` (a FRED macro series), hit Enter, and a panel opens.

Demo (no signup, read-only): [demo URL]
Code (Apache-2.0): https://github.com/Ayyitskevin/Tyche

A few of the 40+ commands:

    AAPL GP    price chart with volume + RSI
    EQS        equity screener
    NVDA CF    SEC filings for a ticker
    ECO GDP    a FRED macro series
    HEAT       sector treemap of the market
    ETH DEX    on-chain DEX pool liquidity
    BOOK/FUND  crypto order-book depth / perp funding
    FX         ECB reference rates

Panels tile, and you can name and save a workspace layout per task — one for earnings, one for macro — so the desk you want is one command away. Quotes stream over SSE, there are price alerts, portfolios, a research journal, and an AI copilot that cites its sources.

Why I built it: during an earnings print or a macro release I'd end up with five broker tabs, a charting tab, a FRED tab, and a spreadsheet I was hand-pasting numbers into — alt-tabbing to line a chart up against a filing against a GDP series, then retyping the interesting bits. Everything I actually wanted was one keystroke away in a terminal I can't afford, and smeared across a dozen tabs in the tools I can. Tyche collapses that into one keyboard-driven surface.

Now the part I want to be blunt about, because it's the thing that makes Tyche different and also worse in one obvious way, and I'd rather you hear it from me. Tyche sells software and hosting, and nothing else. It does not bundle, mark up, or resell a licensed market-data feed.

What that costs you: the data comes from sources you connect under your own licenses. Five real adapters ship today — SEC EDGAR (filings), FRED (macro), Binance (crypto), ECB FX via Frankfurter, and Dexscreener (on-chain pools). Three are keyless (Binance, Frankfurter, Dexscreener); FRED needs your own free API key, and SEC EDGAR needs only a descriptive User-Agent — no key, no signup. Everything else runs on a deterministic mock provider. So on a fresh install, `AAPL GP` draws a real chart — real axes, a volume pane, RSI — over synthetic prices. US equity numbers are not real until you wire in a feed you're licensed for, and I don't ship one, because I can't legally redistribute one to you. That's the honest gap, and I'm not going to paper over it.

What it costs me: I can't put "real-time data included" on the landing page, and I make zero margin on data — the standard fintech move is to make your margin reselling a feed, and I'm giving that up.

Why do it anyway: redistributing licensed market data means entitlements, per-user usage reporting, and redistribution agreements that a solo dev will eventually get wrong. I didn't want a business that depends on a license I'd inevitably violate. The trade is plain — Tyche is the software, you bring the data — and the upside is that the whole terminal is usable right now, with zero keys and zero signup, because mock covers every command.

The architecture is built around that constraint:

- Capability-gated provider registry. There are 24 typed capabilities (quotes, orderBook, filings, economicSeries, dexPools, fundingRates, …). Providers declare what they supply; modules declare what they need; the kernel computes the gap and hands it to the panel as data — it's never thrown — so a panel with no provider for its capability renders an honest empty state instead of crashing. Mock is always the fallback, and operator-installed adapters must pass the same conformance suite before they're allowed to serve.

- Provenance, end to end. Every adapter method returns an `Envelope<T> = { data, provenance }`, where provenance records provider, mode (mock/public/paid/…), capability, `retrievedAt`, and a freshness tier (live/delayed/eod/…). It shows in the panel footer and — the part I'm weirdly proud of — is carried into CSV exports as comment headers (`# provider=…`, `# freshness.tier=…`), so a number sitting in a spreadsheet still tells you where it came from. There's an audit log too, and you can export your whole account as one JSON file.

- Streaming is SSE, not WebSocket, at `/api/stream/quotes`. Deliberate: it keeps the core dependency-free and behaves under same-origin hosting. The stream applies a small seeded walk to mock symbols so the demo moves, and leaves live-provider symbols untouched.

Stack: a pnpm/TypeScript monorepo, strict TypeScript throughout, Zod contracts as the single source of truth for the domain, a UI-agnostic command kernel (parser → registry → executor) that's unit-tested headlessly, Fastify (REST + SSE), React + Vite + zustand, an original canvas chart renderer (no charting lib), file or SQLite persistence, one Docker container. ~500 unit tests and 35 Playwright browser journeys.

Two lines I won't move on: no buy/sell/hold advice, and no order placement or routing. Research-only by design; the copilot cites its sources and declines to give personalized advice.

Limitations, upfront: the mock data is synthetic — fine for driving the UI, useless as a quote. Only five real adapters exist so far, and none of them is a US equity price feed. The copilot in mock mode is deterministic; a live one needs your own model key. Some of the long-tail commands are scaffolds that name the capability they'll need. It's built solo, so the roadmap is one person, not a team.

Open-core: the entire terminal core is Apache-2.0. Self-host free forever with `docker compose up`. The hosted plan ([hosted URL], $29/mo, 14-day trial, no card) adds accounts, sync, TLS, backups, and upgrades for people who don't want to run servers — same core code. Cancel anytime and export everything as JSON; if you stop paying, your data waits behind the paywall instead of being deleted.

Try it locally, read-only, one command:

    docker run -e TYCHE_DEMO=true -p 4010:4010 ghcr.io/ayyitskevin/tyche:latest

(Every persistence write returns a friendly 403; reads, streams, the screener, and the copilot all work.)

Built solo, in the open. Happy to answer anything — especially the hard version of "isn't this just worse than a terminal that includes the data?" It is, in one specific way, on purpose, and I'll defend the trade. The capability model and the provenance envelope are the two decisions I'd most like to have poked at.

---

## First comment (post immediately, from @Nyc_bagels)

Maker here (@Nyc_bagels). The first question I always get is "so where does the data actually come from?" — three buckets, and the provenance stamped on every response tells you which one any given number came from:

1. The mock provider — deterministic and seeded, synthetic. It's what runs in the demo and in a fresh checkout with zero keys, so you can drive the whole terminal without connecting anything. It is NOT real market data.

2. Keyless public sources you switch on when you self-host: Binance (crypto — quotes, candles, trades, L2 order book, funding), Frankfurter/ECB (FX), and Dexscreener (on-chain pools). Public endpoints, no account.

3. Sources that use your own free credentials: SEC EDGAR (it just wants a descriptive User-Agent, per their fair-access policy — not an API key) and FRED (a free API key you own) — plus anything else you write an adapter for against the capability interface.

The load-bearing part: Tyche never bundles or resells licensed market data. Specifically, I don't ship a US equity price feed, because I can't legally redistribute one to you for $29 — and I'd rather say that plainly than fake a green ticker. You bring the entitlements you're allowed to use; adding a source is a provider that declares its typed capabilities and passes a conformance suite before it's allowed to serve. That's exactly the seam a licensed equity feed plugs into. No advice, no order routing — research only.

If that trade still sounds bad to you, that's fair, and I get into why I made it anyway in the post.

---

## Posting notes

- **Format.** Text submission (empty URL field). HN strips most markup: blank lines between paragraphs survive, and 4-space-indented blocks render as monospace — the command table and the `docker run` line rely on that indentation, so keep it. `- ` lines show as literal dashes (fine and readable).
- **Timing.** Weekday morning US Eastern, ~8–10am ET. Be at the keyboard for the next 1–2 hours — early substantive replies drive ranking.
- **Engagement.** Self-reply with the first comment within seconds of submitting. Expect and welcome the "isn't this just worse than a terminal that bundles data?" challenge; the post concedes it on purpose, so lean into the trade rather than defending against it.
- **No images.** HN has no attachments — don't try to attach the demo GIF; it's in the linked README for anyone who clicks through.
