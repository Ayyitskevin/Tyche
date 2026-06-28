import { create } from 'zustand';
import {
  PROVIDER_CAPABILITY_KEYS,
  type InstrumentIdentifier,
  type ProviderCapabilities,
  type ProviderDescriptor,
} from '@tyche/contracts';

function allCapabilitiesTrue(): ProviderCapabilities {
  return Object.fromEntries(PROVIDER_CAPABILITY_KEYS.map((k) => [k, true])) as ProviderCapabilities;
}

export interface TerminalMessage {
  id: string;
  level: 'info' | 'warn' | 'error';
  text: string;
  at: number;
}

interface TerminalState {
  activeInstrument: InstrumentIdentifier | null;
  recentCommands: string[];
  capabilities: ProviderCapabilities;
  providers: ProviderDescriptor[];
  mode: string;
  messages: TerminalMessage[];

  setActiveInstrument: (instrument: InstrumentIdentifier | null) => void;
  pushRecentCommand: (raw: string) => void;
  setCapabilities: (capabilities: ProviderCapabilities) => void;
  setProviders: (providers: ProviderDescriptor[]) => void;
  setMode: (mode: string) => void;
  pushMessage: (level: TerminalMessage['level'], text: string) => void;
  dismissMessage: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>()((set) => ({
  // Optimistic until /api/health resolves, so the slice is usable immediately.
  activeInstrument: null,
  recentCommands: [],
  capabilities: allCapabilitiesTrue(),
  providers: [],
  mode: 'mock',
  messages: [],

  setActiveInstrument: (instrument) => set({ activeInstrument: instrument }),
  pushRecentCommand: (raw) =>
    set((state) => ({
      recentCommands: [raw, ...state.recentCommands.filter((c) => c !== raw)].slice(0, 50),
    })),
  setCapabilities: (capabilities) => set({ capabilities }),
  setProviders: (providers) => set({ providers }),
  setMode: (mode) => set({ mode }),
  pushMessage: (level, text) =>
    set((state) => ({
      messages: [
        ...state.messages.slice(-4),
        { id: crypto.randomUUID(), level, text, at: Date.now() },
      ],
    })),
  dismissMessage: (id) => set((state) => ({ messages: state.messages.filter((m) => m.id !== id) })),
}));
