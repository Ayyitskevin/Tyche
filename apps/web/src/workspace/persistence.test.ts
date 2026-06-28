import { describe, it, expect, beforeEach } from 'vitest';
import { exportWorkspaceJson, importWorkspaceJson } from './persistence';
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
