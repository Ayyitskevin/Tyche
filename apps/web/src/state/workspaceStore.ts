import { create } from 'zustand';
import type { InstrumentIdentifier, Panel, Workspace } from '@tyche/contracts';
import { WORKSPACE_GRID_COLS, WORKSPACE_ROW_HEIGHT, LINK_COLORS } from '../constants';

export interface OpenPanelInput {
  moduleId: string;
  commandId: string;
  symbol: string | null;
  title: string;
  w: number;
  h: number;
  state?: Record<string, unknown>;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WorkspaceState {
  id: string;
  name: string;
  panels: Panel[];
  activePanelId: string | null;
  cols: number;
  rowHeight: number;
  closedStack: Panel[];

  openPanel: (input: OpenPanelInput) => string;
  closePanel: (id: string) => void;
  undoClose: () => void;
  setActivePanel: (id: string | null) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  applyLayout: (items: LayoutItem[]) => void;
  setPanelState: (id: string, state: Record<string, unknown>) => void;
  cyclePanelLink: (id: string) => void;
  rename: (name: string) => void;
  clearAll: () => void;
  newWorkspace: (name?: string) => void;
  loadWorkspace: (workspace: Workspace) => void;
  toWorkspace: (activeInstrument: InstrumentIdentifier | null) => Workspace;
}

function freshId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function emptyState(name = 'Untitled workspace'): Pick<WorkspaceState, 'id' | 'name' | 'panels' | 'activePanelId' | 'closedStack'> {
  return { id: freshId('ws'), name, panels: [], activePanelId: null, closedStack: [] };
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...emptyState('Default'),
  cols: WORKSPACE_GRID_COLS,
  rowHeight: WORKSPACE_ROW_HEIGHT,

  openPanel: (input) => {
    const { panels, cols } = get();
    const w = Math.min(input.w, cols);
    const x = Math.min(panels.length % 2 === 0 ? 0 : 6, Math.max(0, cols - w));
    const panel: Panel = {
      id: freshId('p'),
      moduleId: input.moduleId,
      commandId: input.commandId,
      symbol: input.symbol,
      title: input.title,
      grid: { x, y: 1000, w, h: input.h },
      state: input.state ?? {},
      linkGroup: null,
      minimized: false,
      maximized: false,
      createdAt: new Date().toISOString(),
    };
    set({ panels: [...panels, panel], activePanelId: panel.id });
    return panel.id;
  },

  closePanel: (id) =>
    set((state) => {
      const panel = state.panels.find((p) => p.id === id);
      return {
        panels: state.panels.filter((p) => p.id !== id),
        closedStack: panel ? [...state.closedStack, panel].slice(-20) : state.closedStack,
        activePanelId: state.activePanelId === id ? null : state.activePanelId,
      };
    }),

  undoClose: () =>
    set((state) => {
      const restored = state.closedStack[state.closedStack.length - 1];
      if (!restored) return state;
      return {
        panels: [...state.panels, restored],
        closedStack: state.closedStack.slice(0, -1),
        activePanelId: restored.id,
      };
    }),

  setActivePanel: (id) => set({ activePanelId: id }),

  toggleMinimize: (id) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === id ? { ...p, minimized: !p.minimized, maximized: false } : p,
      ),
    })),

  toggleMaximize: (id) =>
    set((state) => ({
      activePanelId: id,
      panels: state.panels.map((p) =>
        p.id === id ? { ...p, maximized: !p.maximized, minimized: false } : p,
      ),
    })),

  applyLayout: (items) =>
    set((state) => {
      const byId = new Map(items.map((i) => [i.i, i]));
      let changed = false;
      const panels = state.panels.map((p) => {
        const item = byId.get(p.id);
        if (!item) return p;
        if (p.grid.x !== item.x || p.grid.y !== item.y || p.grid.w !== item.w || p.grid.h !== item.h) {
          changed = true;
          return { ...p, grid: { x: item.x, y: item.y, w: item.w, h: item.h } };
        }
        return p;
      });
      return changed ? { panels } : state;
    }),

  setPanelState: (id, patch) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === id ? { ...p, state: { ...p.state, ...patch } } : p,
      ),
    })),

  cyclePanelLink: (id) =>
    set((state) => ({
      panels: state.panels.map((p) => {
        if (p.id !== id) return p;
        const current = p.linkGroup ? LINK_COLORS.indexOf(p.linkGroup as (typeof LINK_COLORS)[number]) : -1;
        const next = current + 1;
        return { ...p, linkGroup: next >= LINK_COLORS.length ? null : LINK_COLORS[next]! };
      }),
    })),

  rename: (name) => set({ name }),

  clearAll: () => set((state) => ({ panels: [], activePanelId: null, closedStack: state.panels })),

  newWorkspace: (name) => set({ ...emptyState(name ?? 'Untitled workspace') }),

  loadWorkspace: (workspace) =>
    set({
      id: workspace.id,
      name: workspace.name,
      panels: workspace.panels,
      activePanelId: workspace.activePanelId,
      cols: workspace.cols,
      rowHeight: workspace.rowHeight,
      closedStack: [],
    }),

  toWorkspace: (activeInstrument) => {
    const state = get();
    const now = new Date().toISOString();
    return {
      id: state.id,
      name: state.name,
      version: 1,
      panels: state.panels,
      activeInstrument,
      activePanelId: state.activePanelId,
      cols: state.cols,
      rowHeight: state.rowHeight,
      createdAt: now,
      updatedAt: now,
    };
  },
}));
