# Research access, methodology & blocked items

**Date of research pass:** 2026-06-28
**Researcher:** Clean-room competitive-intelligence pass for Tyche.

## TL;DR

Live research was **partially available**. `WebSearch` worked and was the sole research
channel. **Direct page fetching (`WebFetch`) was blocked by the environment's egress policy**, and
**no YouTube transcript tooling** was available. All facts in this dossier were therefore gathered
via `WebSearch` (which reads pages server-side and returns cited links), not by directly loading the
pages. Treat that as a sourcing caveat: claims are attributed to the URLs `WebSearch` surfaced, but
they were **not** independently verified by loading those pages byte-for-byte.

## What worked vs. what was blocked

| Capability | Status | Evidence |
| --- | --- | --- |
| `WebSearch` (search + server-side page reading + links) | ✅ Worked | Returned official + third-party results with URLs |
| `WebFetch` (direct page → markdown) | ❌ Blocked | HTTP 403 on **every** external host tried (`godelterminal.com`, `prnewswire.com`, `finsmes.com`, `godeldiscount.com`) |
| Egress proxy | ⚠️ Policy-restricted | `curl $HTTPS_PROXY/__agentproxy/status` showed `connect_rejected … 403 to CONNECT (policy denial)` for general web hosts (e.g. `www.google.com:443`) |
| YouTube transcript retrieval | ❌ Not available | No transcript tool; `WebFetch` blocked. Video facts come from `WebSearch` snippets only |

The proxy README is explicit: a 403/407 from the proxy means the destination host is **not allowed
by the org egress policy for this session**, and we must **report the blocked host, not route around
it**. We complied — no attempt was made to bypass the policy, scrape behind login, or use credentials.

## Consequently NOT directly verified (sourced only via WebSearch)

These official/primary pages could not be loaded directly; their content is represented here only as
`WebSearch` summarized it. An operator with normal browser access should open them to verify/extend:

- `https://godelterminal.com/` (homepage / tagline)
- `https://docs.godelterminal.com/` and `https://godelterminal.com/docs/commands/<id>` (per-command docs)
- `https://godelterminal.com/pricing/`, `https://godelterminal.com/start`, `https://start.godelterminal.com/`
- `https://godelterminal.com/careers`, `https://godelterminal.com/traders/`, `https://godelterminal.com/contact`, `https://godelterminal.com/referral`
- `https://www.dl.software/news`
- `https://www.prnewswire.com/news-releases/dl-software-completes-2-million-pre-seed-investment-round-302226873.html`
- `https://www.finsmes.com/2024/08/dl-software-closes-2m-pre-seed-funding-round.html`
- The six seed YouTube videos (and others discovered) — **transcripts unavailable**; only titles, channels, and search-snippet claims are recorded in `video-notes.md`.

## Manual steps for the operator (to verify or deepen)

1. Open each official URL above and confirm: current pricing/tiers, the exact tagline, the full
   command list, and per-command doc details (inputs, exports, streaming).
2. For the command taxonomy, walk `docs.godelterminal.com` / `…/docs/commands/*` directly and
   reconcile against `command-taxonomy.md` (flag any command we marked `unconfirmed`).
3. For videos, use YouTube's own transcript/caption panel to add timestamped notes to
   `video-notes.md` (do not store full transcripts in-repo — summarize only).
4. Re-run the searches listed in `sources.md` with a normal browser if any claim needs upgrading
   from "via WebSearch" to "verified primary".

## Integrity notes

- Every factual claim in this dossier cites a source URL. Where sources conflict (notably pricing),
  the conflict is recorded with confidence labels rather than resolved by guessing.
- Tier-4 sources (affiliate/discount/SEO/forum sites such as `godeldiscount.com`, `godelguide.com`,
  `flux.ai`, review aggregators, Reddit) are treated as **low-confidence sentiment**, never as fact.
- No competitor UI text, assets, screenshots, styles, or layouts were copied. Findings are
  abstracted into original feature categories for Tyche.
