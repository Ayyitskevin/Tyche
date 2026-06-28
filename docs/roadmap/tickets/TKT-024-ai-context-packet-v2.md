# TKT-024 — AI context packet v2 (workspace + notes + citations)

**Priority:** P1  ·  **Milestone:** M9  ·  **Status:** proposed  ·  **Clean-room risk:** Low

## Source evidence
- https://www.youtube.com/watch?v=VFddHFgutis — "Godel Terminal Will Have AI Analyst": a *future/roadmap* AI capability claim, not shipped (see `docs/research/godel/video-notes.md:18,29`).
- https://www.youtube.com/watch?v=sDLElLOpg5w — "Godel Terminal's Product Roadmap" (`docs/research/godel/video-notes.md:19,30`): AI is positioned on the roadmap.
- `docs/research/godel/video-notes.md:37-38` — product lesson: "'AI Analyst' is a roadmap promise. Tyche already ships a *grounded, no-advice* copilot — an opportunity to be **more rigorous** (citations, workspace-grounded) than a hype-led AI feature." This ticket implements that "workspace-grounded + citations" rigor. Category benchmark only; no Gödel UI/copy reproduced.

## Problem
The copilot is already grounded and no-advice (`apps/api/src/ai/copilot.ts`), but the context it receives is thin. `AiModule.tsx:34-42` builds an `AIContextPacket` with `selection: null`, `watchlistSymbols: []`, `provenance: []`, and `openPanels` that carry only `{moduleId, symbol, title}` — no panel data, no selected rows, no notes. So the copilot can only restate which panels are open; it cannot summarize what they show, cite the data behind them, or reference the user's notes. The contract already has the *slots* (`AISelectionSchema` with `rows`, `AICitationSchema`, `provenance`) — they are simply never populated. This is a context-enrichment ticket: feed the copilot real on-screen data summaries, selected rows, and notes, and have it cite those sources.

## User story
As a solo operator/analyst, I want the copilot to summarize the data in my open panels, the rows I've selected, and my saved notes — and cite each claim back to its provider/source — so that "summarize what's on screen" gives a grounded, attributable answer instead of just a list of panel names.

## Technical design
Contracts-first; capability model and no-advice guard preserved.
1. **Contract v2 (`packages/contracts/src/ai.ts`).** Extend `AIPanelRefSchema` with an optional `summary: z.string().optional()` (a short, plain-text data digest, e.g. "AAPL quote 187.40 +1.2%; 3 panels") and an optional `provenance: DataProvenanceSchema.optional()` (the panel's reported source). Add `notes: z.array(AINoteRefSchema).optional()` to `AIContextPacketSchema`, where `AINoteRefSchema = z.object({ id, title, symbol: z.string().nullable(), excerpt: z.string() })` — keep the existing free-text `notes?: string` for back-compat or fold it into the array (excerpt only, length-capped). `AISelectionSchema.rows` already exists. No change to `AIChatResponseSchema` / `AICitationSchema` — citations already model `provider`/`capability`/`sourceUrl`/`asOf`.
2. **Web context builder (`apps/web/src/modules/AiModule.tsx`).** Replace the hand-built packet with a small `buildContextPacket()` helper (new `apps/web/src/terminal/aiContext.ts`, original): pull `panels` from `useWorkspaceStore`, map each to `{moduleId, symbol, title, summary, provenance}` using a per-module summarizer (lightweight, derived from `panel.state` + last fetched data the panel exposes — start with quote/history/news modules, fall back to no `summary`); include selected rows from the active panel's `state.selection` (the selection plumbing referenced in `CommandBarContainer.tsx`/`SettingsModule.tsx`); fetch notes via `api.listNotes()` (mapping `Note` → `AINoteRef` excerpt) and watchlist symbols via `api.getWatchlists` for `watchlistSymbols`; aggregate each panel's `provenance` into `context.provenance` (dedup by `provider:capability`).
3. **Copilot enrichment (`apps/api/src/ai/copilot.ts`).** Keep `generateMockAIResponse` deterministic and the `ADVICE_PATTERN` guard intact. Add lines that surface `panel.summary` for open panels, the selection row count + a one-line digest, and matched notes (by `activeSymbol`). Build `citations` from `context.provenance` as today *plus* any `panel.provenance` and a synthetic "notes" citation label when notes are used. `grounded` stays `citations.length > 0`. No model call; mock fallback unchanged.
4. **Route/API.** `apps/api/src/routes/ai.ts` is unchanged structurally — it re-validates against the updated `AIChatRequestSchema` and still records the `ai.chat` audit event. No new endpoint.

## Affected packages / apps
- `packages/contracts` — `ai.ts`: extend `AIPanelRefSchema`, add `AINoteRefSchema`, extend `AIContextPacketSchema`.
- `apps/web` — new `terminal/aiContext.ts` builder; `modules/AiModule.tsx` wired to it; reuses `apiClient.listNotes`/`getWatchlists`, `workspaceStore`, `terminalStore`.
- `apps/api` — `ai/copilot.ts` enrichment only (`routes/ai.ts` re-validates; no shape/route change).
- No changes to `packages/data-adapters` or provider capabilities.

## Data contracts
`packages/contracts/src/ai.ts`: `AIPanelRefSchema` gains `summary?` + `provenance?` (`DataProvenanceSchema`); new `AINoteRefSchema` ({id, title, symbol, excerpt}); `AIContextPacketSchema` gains `notes?: AINoteRef[]`. All additive/optional → back-compat preserved; existing `AISelectionSchema.rows`, `AICitationSchema`, and `AIChatResponseSchema` are reused unchanged.

## Provider capabilities
**None required.** The copilot consumes already-fetched panel data and provenance; it makes no new provider call. Notes/watchlists come from local persistence (`PersistenceStore.listNotes`, `localProvenance('notes')`), not a market provider. Works fully in **mock mode with no keys**; BYO providers contribute richer panel provenance automatically through the same envelope path.

## UI / module behavior
- `AiModule` panel: unchanged chat surface; the empty-state hint stays ("summarize the open panels"), and the no-advice `DISCLAIMER` footer stays.
- Citations render as today (chip row under each assistant message, `AiModule.tsx:82-90`) and now include panel/notes-derived sources; `sourceUrl`, when present, can later become a link (out of scope here — label only).
- Capability-gap / empty: if no panels are open, no rows selected, and no notes exist, the packet is sparse and the copilot says it has nothing to ground on (existing branch, `copilot.ts:64-66`) — graceful, never a crash.
- Provenance honesty: citations carry `asOf` and provider mode from each panel's `DataProvenance`; in mock mode they read as synthetic (`mock`/`eod`), never falsely "live".

## Testing plan
- Contract — `packages/contracts` test area: parse a v2 `AIContextPacket` with panel `summary`+`provenance`, `notes[]`, and `selection.rows`; assert old (sparse) packets still parse (additive/optional).
- Unit (web) — `apps/web/src/terminal/aiContext.test.ts`: `buildContextPacket()` maps panels → summaries, folds notes (`Note`→`AINoteRef`), dedups provenance, and includes selection rows; empty workspace → sparse-but-valid packet.
- Unit (api) — new `apps/api/src/ai/copilot.test.ts`: enriched packet yields panel-summary + notes lines and citations from panel provenance; `ADVICE_PATTERN` still triggers the decline line; empty packet → "nothing to ground" branch; response stays `mode: 'mock'`.
- API — extend `apps/api/src/app.test.ts`: `POST /api/ai/chat` accepts a v2 context, 200s with `grounded:true` + non-empty `citations` when provenance is supplied, and still 400s on malformed bodies.
- e2e (`apps/web` Playwright): open a quote panel + AI panel against mock, ask "summarize what's on screen", assert the answer references the panel and at least one citation chip renders.

## Acceptance criteria
- [ ] `AIContextPacket` carries open-panel data summaries, selected rows, and note excerpts; all new fields are optional and back-compatible.
- [ ] `AiModule` populates the packet via `buildContextPacket()` (panels, selection, notes, watchlist symbols, aggregated provenance) — no more hard-coded `selection:null`/`provenance:[]`.
- [ ] Copilot output references panel summaries + matched notes and returns `citations` derived from panel/notes provenance; `grounded` reflects citation count.
- [ ] No-advice guard (`ADVICE_PATTERN`) and the no-advice disclaimer remain enforced; advice prompts still decline.
- [ ] Mock mode works with no keys; sparse packets degrade gracefully (no crash), and the empty-grounding branch still fires.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` are green.

## Clean-room notes
Original implementation built only from Tyche's own pieces: the existing `AIContextPacket`/`AICitation` contracts, `generateMockAIResponse`, `PersistenceStore` notes, and the workspace panel store. "AI Analyst" is a category feature the competitor *announced as roadmap* (`video-notes.md`); benchmarking confirms only the category and the differentiation thesis (grounded + cited). No Gödel Terminal UI, copy, prompt text, layout, or documentation is reproduced. The copilot remains deterministic, no-advice, and provider-attributed — Tyche's own posture, not a clone.

## Non-goals
- Wiring a live LLM model adapter — the `ctx.config.ai.apiKey` gate in `routes/ai.ts` stays a future slot; this ticket only enriches the deterministic mock copilot.
- Any buy/sell/hold synthesis or personalized advice — explicitly preserved as forbidden.
- Streaming AI responses, multi-turn memory persistence, or RAG over filings/news bodies — separate later tracks.
- New provider capabilities or any market data fetch initiated by the copilot.
- Clickable/served citation source pages (label-only here).
