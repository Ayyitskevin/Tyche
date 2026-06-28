import { create } from 'zustand';
import type { UserPreferences } from '@tyche/contracts';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'dark',
  density: 'compact',
  defaultProvider: 'mock',
  defaultCommandId: 'DES',
  keymap: {},
  flags: {},
  updatedAt: new Date().toISOString(),
};

interface PreferencesState {
  preferences: UserPreferences;
  setPreferences: (preferences: UserPreferences) => void;
  patch: (partial: Partial<UserPreferences>) => void;
}

export const usePreferencesStore = create<PreferencesState>()((set) => ({
  preferences: DEFAULT_PREFERENCES,
  setPreferences: (preferences) => set({ preferences }),
  patch: (partial) =>
    set((state) => ({ preferences: { ...state.preferences, ...partial, updatedAt: new Date().toISOString() } })),
}));
