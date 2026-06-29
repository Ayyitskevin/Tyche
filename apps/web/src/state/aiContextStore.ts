import { create } from 'zustand';
import type { DataProvenance } from '@tyche/contracts';

/** What an open panel publishes for the AI copilot to ground on. */
export interface PanelAiContext {
  provenance: DataProvenance | null;
  summary: string | null;
}

interface AiContextState {
  /** Keyed by panelId. Populated by PanelHost as panels report provenance/summary. */
  panels: Record<string, PanelAiContext>;
  setPanelContext: (panelId: string, patch: Partial<PanelAiContext>) => void;
  clearPanelContext: (panelId: string) => void;
}

export const useAiContextStore = create<AiContextState>()((set) => ({
  panels: {},
  setPanelContext: (panelId, patch) =>
    set((state) => ({
      panels: {
        ...state.panels,
        [panelId]: { provenance: null, summary: null, ...state.panels[panelId], ...patch },
      },
    })),
  clearPanelContext: (panelId) =>
    set((state) => {
      if (!(panelId in state.panels)) return state;
      const next = { ...state.panels };
      delete next[panelId];
      return { panels: next };
    }),
}));
