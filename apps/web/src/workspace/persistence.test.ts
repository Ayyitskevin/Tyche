import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  exportWorkspaceJson,
  importWorkspaceJson,
  orderLayoutsForChords,
  saveCurrentWorkspace,
} from './persistence';
import { api } from '../providers/apiClient';
import { STORAGE_KEYS } from '../constants';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTerminalStore } from '../state/terminalStore';

describe('workspace persistence validation', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().newWorkspace('Test');
    useTerminalStore.setState({ messages: [] });
  });

  it('rejects syntactically invalid JSON and pushes an error', () => {
    expect(importWorkspaceJson('{not json')).toBe(false);
    expect(useTerminalStore.getState().messages.at(-1)?.level).toBe('error');
  });

  it('rejects JSON that does not match WorkspaceSchema', () => {
    expect(importWorkspaceJson(JSON.stringify({ foo: 'bar' }))).toBe(false);
    expect(useTerminalStore.getState().messages.at(-1)?.level).toBe('error');
  });

  it('round-trips a valid exported workspace', () => {
    useWorkspaceStore.getState().openPanel({
      moduleId: 'description',
      commandId: 'DES',
      symbol: 'AAPL',
      title: 'AAPL · DES',
      w: 5,
      h: 12,
    });
    const json = exportWorkspaceJson();
    useWorkspaceStore.getState().newWorkspace('Empty');
    expect(useWorkspaceStore.getState().panels).toHaveLength(0);
    expect(importWorkspaceJson(json)).toBe(true);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
  });
});

// The suite runs in the node environment (no DOM), so stub a minimal in-memory
// localStorage rather than pull in jsdom just for these mirror assertions.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

describe('saveCurrentWorkspace — result handling & mirror namespacing', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemStorage());
    useWorkspaceStore.getState().newWorkspace('Save test');
    useTerminalStore.setState({ messages: [], user: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces a failed save as an error and writes no stale mirror', async () => {
    // fetchEnvelope never throws — a blocked/expired/down save arrives as ok:false.
    vi.spyOn(api, 'saveWorkspace').mockResolvedValue({
      ok: false,
      error: { kind: 'http_error', message: 'HTTP 403' },
      provenance: null,
    });
    await saveCurrentWorkspace();
    const last = useTerminalStore.getState().messages.at(-1);
    expect(last?.level).toBe('error');
    expect(last?.text).toContain('403');
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBeNull();
  });

  it('namespaces the localStorage mirror by user id in hosted mode', async () => {
    useTerminalStore.setState({ user: { id: 'u1', email: 'a@b.com', admin: false } });
    vi.spyOn(api, 'saveWorkspace').mockImplementation((ws) =>
      Promise.resolve({ ok: true, data: ws, provenance: null }),
    );
    await saveCurrentWorkspace();
    expect(localStorage.getItem(`${STORAGE_KEYS.workspace}:u1`)).not.toBeNull();
    // The un-namespaced key stays empty, so another account on the same browser
    // can't read this user's workspace out of it.
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBeNull();
    expect(useTerminalStore.getState().messages.at(-1)?.level).toBe('info');
  });
});

describe('orderLayoutsForChords', () => {
  it('orders by creation time (oldest first) so a layout chord number is stable', () => {
    const ws = [
      { id: 'c', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'a', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', createdAt: '2026-02-01T00:00:00Z' },
    ];
    expect(orderLayoutsForChords(ws).map((w) => w.id)).toEqual(['a', 'b', 'c']);
    // Pure: does not mutate the input.
    expect(ws.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });
});
