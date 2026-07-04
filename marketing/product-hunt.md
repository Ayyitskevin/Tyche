# Product Hunt launch

Fill `[demo URL]` and `[hosted URL]` before publishing (the `github.com` and `ghcr.io` links are
real — keep them verbatim). Post the maker's first comment yourself within seconds of going live
(PH weights early engagement heavily), and reply through the first several hours — the "48 hours /
ship it this week" promise only lands if you actually do it.

**Name:** Tyche
**Tagline** (48 chars — under PH's 60): Keyboard-first market research, priced like SaaS

---

## Description

⌘K. Type `AAPL GP`. Enter. You're on a candlestick chart with volume and RSI — in one keystroke.

That's the whole idea. **Tyche** is a keyboard-first financial research terminal that runs in your browser — priced like the SaaS it actually is, not a five-figure-a-year rental.

**Everything opens from the keyboard.** 40+ commands live in one command bar with fuzzy autocomplete and rebindable chords. Tab cycles panels. Named, tiling workspaces save your desk per task — a macro layout, a research layout — and switch from the command bar. Once it's in your fingers, it's faster than clicking through a dashboard.

**One bar, a lot of market:**
- `AAPL GP` — price chart with volume + RSI
- `EQS` — equity screener
- `ECO GDP` — macro series (FRED)
- `NVDA CF` — SEC filings
- `HEAT` — sector treemap
- `ETH DEX` — on-chain DEX pool liquidity
- `BOOK` / `FUND` — crypto order-book depth + funding rates
- `FX` — ECB reference rates

Plus streaming quotes, price alerts, a research journal, portfolios, and an AI research copilot that cites its sources — and stays quiet when it has none to ground a claim on.

🟢 **The honest part — this is the whole brand.**
- **Never resells data.** Tyche sells software and hosting. It doesn't bundle, mark up, or resell anyone's licensed feed. Live sources connect under *your* licenses — five real adapters ship (SEC EDGAR, FRED, Binance, ECB FX, Dexscreener): three keyless, and two that need only free setup — a FRED API key, and a descriptive contact string for SEC EDGAR (their fair-access policy, not a key). A deterministic mock provider covers everything else, so the whole terminal is fully usable with zero keys and zero setup.
- **Research-only, by design.** No buy/sell/hold advice. No order placement or routing.
- **Provable provenance.** Every response is stamped with where it came from, and that stamp rides into your CSV exports. There's an audit log, and full account export is one JSON file.

Exchange licensing is what makes "cheap terminal with real-time everything" a lie somewhere. So Tyche is priced for what it honestly is — not what sounds good on a landing page.

**Try the whole thing in one command, no signup** (shared read-only demo — reads, streams, the screener and the copilot all work):
```
docker run -e TYCHE_DEMO=true -p 4010:4010 ghcr.io/ayyitskevin/tyche:latest
```
Prefer a link? Live no-signup demo → [demo URL]

**Open-core.** The entire terminal core is Apache-2.0 — self-host free forever with `docker compose`. The hosted plan adds accounts, sync, TLS, backups, and upgrades: **$29/mo, 14-day trial, no card**. Cancel anytime and export everything as JSON — your data waits behind a paywall, it's never deleted.

Self-host → github.com/Ayyitskevin/Tyche · Hosted → [hosted URL]

---

## Maker's first comment (post immediately, from @Nyc_bagels)

Hey Product Hunt 👋 I'm Kevin (@Nyc_bagels). I built Tyche solo, in the open.

The itch: I do most of my market research with a browser and a dozen tabs, because the one tool that does it all in a single window costs around $25k a year. I never wanted to rent someone's data monopoly — I wanted the *interface*. Type a couple of letters, get a panel, keep your hands on the keyboard.

So speed became the product. Charts, a screener, filings, macro, on-chain pools, order-book depth — all from one command bar. `AAPL GP`, Enter, you're charting. `ETH DEX`, Enter, you're looking at pool liquidity. It's keyboard-first muscle memory, without the five-figure-a-year bill.

The part I'm proudest of is the part most fintech tools quietly hide: **Tyche never resells market data.** It sells the software and the hosting. You connect sources under your own licenses — three adapters are keyless (crypto, FX, on-chain), and two need only free setup (a FRED key, and a descriptive contact string for SEC EDGAR) — and a deterministic mock mode makes the whole terminal explorable with zero setup. No advice, no order routing, provenance on every datum down to the CSV. When in doubt, I understate — I'd rather undersell what it is than dress it up.

It's open-core and genuinely built in the open: the whole terminal is Apache-2.0, with a public changelog and roadmap you can read line by line. If you want proof of how fast this moves, that's the receipt. Hosted ($29/mo, 14-day trial, no card) just means I run the servers, sync, and backups so you don't have to — and the read-only demo above needs zero signup.

My one ask: drive it for a real session, then tell me the honest answer to one question — **"what did you look for that wasn't there?"** One sentence is plenty; that answer decides what I ship next, and if it's small there's a real chance it lands in the changelog by this time next week. And please roast the positioning — if "never resells your data" reads as a gimmick to you, that's the feedback I want most. I'll be in the comments for the next 48 hours. What would you type first?

---

## Gallery / shot list (attach in this order)

1. **Hero — `docs/assets/demo.gif`** (reuse the autoplay loop): typing `AAPL GP` → `HEAT` → `ETH DEX` → `FUND` to build a multi-panel desk. Leads with speed; slot 1.
2. **`docs/assets/workspace.png`** — the multi-panel research desk (chart + screener + watchlist), breadth in one window.
3. **`docs/assets/heatmap.png`** — sector treemap (`HEAT`).
4. **`docs/assets/dex.png`** — on-chain DEX pools + perp funding (`ETH DEX`, `FUND`).
5. **New shot:** the ⌘K command bar mid-type, fuzzy autocomplete open — the keyboard-first hook made literal.
6. **New shot:** a panel's provenance stamp + a CSV export carrying it — the honesty posture, made provable.
7. **New shot (optional):** a plain "what Tyche does NOT do" card — no advice · no order routing · never resells data.

`marketing/og.png` is on hand for the social/OG card on the share link.

## Topics

Fintech · Developer Tools · Open Source *(alternates if the picker allows more: SaaS · Artificial Intelligence · Investing · Bootstrapped)*

## Posting notes

- **Timing.** Best launch window is 12:01am PT, Tue–Thu.
- **First comment.** Post it yourself seconds after the launch goes live; PH weights early engagement heavily.
- **Gallery.** Upload the demo GIF as image 1 (it autoplays and sells the speed instantly). Shots 5–7 are quick to grab and worth it — the provenance-in-CSV shot and the "what Tyche does NOT do" card make the honest positioning provable rather than a slogan.
- **Copy-paste.** Keep the `docker run` one-liner as a fenced code block so it stays copy-pasteable.
