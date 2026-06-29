import type {
  AIContextPacket,
  AINoteRef,
  AIPanelRef,
  AISelection,
  DataProvenance,
  InstrumentIdentifier,
  Note,
  Panel,
} from '@tyche/contracts';
import type { PanelAiContext } from '../state/aiContextStore';

export interface BuildContextInput {
  activeInstrument: InstrumentIdentifier | null;
  recentCommands: string[];
  panels: Panel[];
  /** Per-panel provenance/summary published by PanelHost (keyed by panelId). */
  panelContext: Record<string, PanelAiContext>;
  notes: Note[];
  watchlistSymbols: string[];
  selection?: AISelection | null;
}

/**
 * Assemble the AI context packet from the live workspace: open panels (with each
 * panel's data summary + provenance), notes, watchlist symbols, and the
 * deduplicated provenance set the copilot cites. Pure + unit-testable.
 */
export function buildContextPacket(input: BuildContextInput): AIContextPacket {
  // Gap provenance (an empty/errored panel) carries tier 'unknown'. It belongs on
  // the panel footer for attribution, but must NOT be cited as a grounding source
  // — otherwise the copilot would claim to be "grounded" in a panel with no data.
  const isGrounding = (prov: DataProvenance | null | undefined): prov is DataProvenance =>
    !!prov && prov.freshness.tier !== 'unknown';

  const openPanels: AIPanelRef[] = input.panels.map((p) => {
    const ctx = input.panelContext[p.id];
    return {
      moduleId: p.moduleId,
      symbol: p.symbol,
      title: p.title,
      ...(ctx?.summary ? { summary: ctx.summary } : {}),
      ...(isGrounding(ctx?.provenance) ? { provenance: ctx.provenance } : {}),
    };
  });

  // Deduplicate grounding provenance across panels by provider:capability.
  const seen = new Set<string>();
  const provenance: DataProvenance[] = [];
  for (const p of input.panels) {
    const prov = input.panelContext[p.id]?.provenance;
    if (!isGrounding(prov)) continue;
    const key = `${prov.provider}:${prov.capability}`;
    if (seen.has(key)) continue;
    seen.add(key);
    provenance.push(prov);
  }

  const notes: AINoteRef[] = input.notes.slice(0, 12).map((n) => ({
    id: n.id,
    title: n.title,
    symbol: n.symbol,
    excerpt: n.body.slice(0, 160),
  }));

  return {
    activeSymbol: input.activeInstrument?.symbol ?? null,
    activeAssetClass: input.activeInstrument?.assetClass ?? null,
    openPanels,
    selection: input.selection ?? null,
    recentCommands: input.recentCommands,
    watchlistSymbols: [...new Set(input.watchlistSymbols)].slice(0, 50),
    provenance,
    ...(notes.length > 0 ? { notes } : {}),
  };
}
