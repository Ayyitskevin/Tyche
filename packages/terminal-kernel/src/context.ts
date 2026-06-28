import type { InstrumentIdentifier } from '@tyche/contracts';
import { NO_CAPABILITIES } from '@tyche/contracts';
import type { TerminalContext } from './types';

export function createTerminalContext(over: Partial<TerminalContext> = {}): TerminalContext {
  return {
    activeInstrument: over.activeInstrument ?? null,
    recentCommands: over.recentCommands ?? [],
    defaultCommandId: over.defaultCommandId ?? 'DES',
    availableCapabilities: over.availableCapabilities ?? NO_CAPABILITIES,
  };
}

export function withRecentCommand(
  context: TerminalContext,
  raw: string,
  max = 50,
): TerminalContext {
  const recentCommands = [raw, ...context.recentCommands.filter((c) => c !== raw)].slice(0, max);
  return { ...context, recentCommands };
}

export function withActiveInstrument(
  context: TerminalContext,
  instrument: InstrumentIdentifier | null,
): TerminalContext {
  return { ...context, activeInstrument: instrument };
}
