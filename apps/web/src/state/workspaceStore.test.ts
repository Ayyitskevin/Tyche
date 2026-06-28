import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceSchema } from '@tyche/contracts';
import { useWorkspaceStore } from './workspaceStore';

const openTwo = () => {
  const store = useWorkspaceStore.getState();
  const a = store.openPanel({
    moduleId: 'description',
    commandId: 'DES',
    symbol: 'AAPL',
    title: 'AAPL · DES',
    w: 5,
    h: 12,
  });
  const b = useWorkspaceStore.getState().openPanel({
    moduleId: 'quote-monitor',
    commandId: 'QM',
    symbol: null,
    title: 'QM',
    w: 6,
    h: 12,
  });
  return { a, b };
};

describe('workspaceStore serialization', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().newWorkspace('Test workspace');
  });

  it('serializes to a schema-valid workspace', () => {
    openTwo();
    const workspace = useWorkspaceStore.getState().toWorkspace({ symbol: 'AAPL', assetClass: 'equity' });
    const parsed = WorkspaceSchema.safeParse(workspace);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(workspace.panels).toHaveLength(2);
    expect(workspace.activeInstrument?.symbol).toBe('AAPL');
  });

  it('round-trips through save/load', () => {
    openTwo();
    const workspace = useWorkspaceStore.getState().toWorkspace(null);
    useWorkspaceStore.getState().newWorkspace('Empty');
    expect(useWorkspaceStore.getState().panels).toHaveLength(0);
    useWorkspaceStore.getState().loadWorkspace(workspace);
    expect(useWorkspaceStore.getState().panels).toHaveLength(2);
    expect(useWorkspaceStore.getState().name).toBe('Test workspace');
  });

  it('supports undo-close', () => {
    const { a } = openTwo();
    useWorkspaceStore.getState().closePanel(a);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
    useWorkspaceStore.getState().undoClose();
    expect(useWorkspaceStore.getState().panels).toHaveLength(2);
  });

  it('propagates a symbol to every panel in the same link group', () => {
    const { a, b } = openTwo();
    const store = () => useWorkspaceStore.getState();
    store().cyclePanelLink(a); // a -> first link color
    store().cyclePanelLink(b); // b -> same first link color
    store().setLinkedSymbol(a, 'MSFT');
    expect(store().panels.find((p) => p.id === a)?.symbol).toBe('MSFT');
    const pb = store().panels.find((p) => p.id === b);
    expect(pb?.symbol).toBe('MSFT');
    expect(pb?.state.args).toEqual(['MSFT']);
  });

  it('updates only the source panel when it is unlinked', () => {
    const { a, b } = openTwo();
    const store = () => useWorkspaceStore.getState();
    store().setLinkedSymbol(a, 'TSLA');
    expect(store().panels.find((p) => p.id === a)?.symbol).toBe('TSLA');
    expect(store().panels.find((p) => p.id === b)?.symbol).toBeNull();
  });

  it('never touches panels in a different link group', () => {
    const { a, b } = openTwo();
    const store = () => useWorkspaceStore.getState();
    store().cyclePanelLink(a); // a -> color[0]
    store().cyclePanelLink(b); // b -> color[0]
    store().cyclePanelLink(b); // b -> color[1] (different group)
    store().setLinkedSymbol(a, 'NVDA');
    expect(store().panels.find((p) => p.id === a)?.symbol).toBe('NVDA');
    expect(store().panels.find((p) => p.id === b)?.symbol).toBeNull();
  });

  it('cycles panel focus with wrap-around', () => {
    const { a, b } = openTwo();
    const store = () => useWorkspaceStore.getState();
    store().setActivePanel(a);
    store().focusNextPanel();
    expect(store().activePanelId).toBe(b);
    store().focusNextPanel(); // wraps back to a
    expect(store().activePanelId).toBe(a);
    store().focusPrevPanel(); // wraps to b
    expect(store().activePanelId).toBe(b);
  });

  it('focus cycling is a safe no-op with zero panels', () => {
    useWorkspaceStore.getState().newWorkspace('Empty');
    useWorkspaceStore.getState().focusNextPanel();
    expect(useWorkspaceStore.getState().activePanelId).toBeNull();
  });

  it('applies layout changes from the grid', () => {
    const { a } = openTwo();
    useWorkspaceStore.getState().applyLayout([{ i: a, x: 2, y: 3, w: 4, h: 9 }]);
    const panel = useWorkspaceStore.getState().panels.find((p) => p.id === a);
    expect(panel?.grid).toEqual({ x: 2, y: 3, w: 4, h: 9 });
  });

  it('preserves createdAt across save → load → save while advancing updatedAt', () => {
    openTwo();
    const first = useWorkspaceStore.getState().toWorkspace(null);
    expect(first.createdAt).toBeDefined();
    // load it back, then re-serialize
    useWorkspaceStore.getState().loadWorkspace(first);
    const second = useWorkspaceStore.getState().toWorkspace(null);
    expect(second.createdAt).toBe(first.createdAt);
    expect(typeof second.updatedAt).toBe('string');
  });

  it('first save of a fresh workspace yields a valid createdAt', () => {
    useWorkspaceStore.getState().newWorkspace('Fresh');
    const ws = useWorkspaceStore.getState().toWorkspace(null);
    expect(WorkspaceSchema.safeParse(ws).success).toBe(true);
    expect(Number.isNaN(Date.parse(ws.createdAt))).toBe(false);
  });
});
