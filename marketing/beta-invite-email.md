# Beta invite email template

For the Day-5 soft launch (docs/LAUNCH.md): 10–20 hand-picked traders/analysts. Send personally,
one at a time — the first paragraph should be customized per recipient. Plain text beats HTML for
deliverability and tone at this stage.

---

**Subject:** a market research terminal I think you'll actually use ({{first_name}}, 2-min ask)

Hey {{first_name}},

{{personal_line — why THIS person: "you mentioned fighting three broker tabs during earnings
season" / "your macro threads are why I built the FRED integration"}}.

I've spent the last months building **Tyche** — a keyboard-first financial research terminal that
runs in the browser. Type `AAPL GP` and you're on a candlestick chart with volume and RSI;
`EQS` screens the market; `NVDA CF` pulls SEC filings; `ETH DEX` surfaces on-chain pool liquidity;
`ECO GDP` charts macro series. Tiling panels, streaming quotes, price alerts, a research journal —
all driven from the keyboard.

Two things I want you to know before you look, because they're unusual:

1. **It never resells market data.** Live sources connect under your own licenses — some keyless
   and public (crypto, FX, on-chain DEX), others with your own free keys (SEC EDGAR, FRED) — and a
   deterministic mock mode covers everything else, so the terminal is fully explorable with zero
   setup. Every datum carries its provenance. No advice, no order placement, by design.
2. **It's open-core.** The whole terminal is Apache-2.0 on GitHub; the hosted version just adds
   accounts, sync, TLS, and backups so you don't run servers.

I'm opening **{{n}} beta seats** before the public launch. Yours is here:

→ {{app_url}} — sign up with this email; you'll get a 14-day trial, no card. If you want longer,
reply and I'll extend it — beta feedback is worth more to me than $29.

Prefer to poke around first? {{demo_url}} is a live, no-account read-only demo — the whole
terminal, nothing to save.

The one thing I ask: after your first real session, reply with the answer to a single question —
**"what did you look for that wasn't there?"** One sentence is plenty. That answer decides what I
build next week.

Thanks for looking,
{{your_name}}
{{app_url}} · github.com/Ayyitskevin/Tyche

P.S. Everything you make — workspaces, watchlists, notes — exports as JSON from the ACCOUNT
panel at any time. If Tyche isn't for you, you lose nothing, including your data.
