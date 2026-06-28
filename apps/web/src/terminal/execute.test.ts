import { describe, it, expect, beforeEach } from 'vitest';
import { executeInput } from './execute';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTerminalStore } from '../state/terminalStore';

describe('executeInput (kernel → effects → stores)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().newWorkspace('Test');
    useTerminalStore.setState({ activeInstrument: null, messages: [] });
  });

  it('"AAPL DES" opens the description panel and sets the active instrument', () => {
    executeInput('AAPL DES');
    expect(useTerminalStore.getState().activeInstrument?.symbol).toBe('AAPL');
    const panels = useWorkspaceStore.getState().panels;
    expect(panels).toHaveLength(1);
    expect(panels[0]?.moduleId).toBe('description');
    expect(panels[0]?.symbol).toBe('AAPL');
  });

  it('"QM" opens the quote monitor', () => {
    executeInput('QM');
    expect(useWorkspaceStore.getState().panels[0]?.moduleId).toBe('quote-monitor');
  });

  it('"HELP" opens the help panel', () => {
    executeInput('HELP');
    expect(useWorkspaceStore.getState().panels[0]?.moduleId).toBe('help');
  });

  it('free text opens a search panel', () => {
    executeInput('show me something');
    const panel = useWorkspaceStore.getState().panels[0];
    expect(panel?.moduleId).toBe('search');
    expect(panel?.state.query).toBe('show me something');
  });

  it('"DES" with no active instrument warns instead of opening a panel', () => {
    executeInput('DES');
    expect(useWorkspaceStore.getState().panels).toHaveLength(0);
    const messages = useTerminalStore.getState().messages;
    expect(messages.at(-1)?.level).toBe('warn');
  });
});
