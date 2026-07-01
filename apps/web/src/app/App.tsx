import { useEffect, useRef, useState } from 'react';
import { TerminalShell } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { AuthScreen } from './AuthScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { PaywallScreen } from './PaywallScreen';
import { useTerminalStore } from '../state/terminalStore';
import { usePreferencesStore } from '../state/preferencesStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { CommandBarContainer } from '../terminal/CommandBarContainer';
import { executeInput } from '../terminal/execute';
import { comboFromEvent, resolveBindings } from '../terminal/keybindings';
import { WorkspaceGrid } from '../workspace/WorkspaceGrid';
import { restoreWorkspace, saveCurrentWorkspace } from '../workspace/persistence';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { EntitlementBanner } from './EntitlementBanner';

export function App() {
  const commandInputRef = useRef<HTMLInputElement>(null);
  const [auth, setAuth] = useState<'checking' | 'required' | 'expired' | 'ready'>('checking');
  const [onboarding, setOnboarding] = useState(false);
  const [bootNonce, setBootNonce] = useState(0);

  // Hydrate from the API: capabilities, providers, preferences, last workspace.
  // In hosted mode, gate the boot behind a session (AuthScreen when absent).
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const health = await api.getHealth();
      if (mounted && health) {
        useTerminalStore.getState().setCapabilities(health.capabilities);
        useTerminalStore.getState().setMode(health.mode);
        useTerminalStore.getState().setAppMode(health.appMode ?? 'selfhost');
      }
      if (health?.appMode === 'hosted') {
        const me = await api.authMe();
        if (!mounted) return;
        if (!me.ok || !me.data) {
          setAuth('required');
          return;
        }
        useTerminalStore.getState().setUser(me.data.user);
        // Trial over and no subscription (and billing is on): paywall instead
        // of a terminal whose every request would answer 402.
        const billing = me.data.user.billing;
        if (health.billing !== 'none' && billing.plan !== 'pro' && Date.parse(billing.trialEndsAt) <= Date.now()) {
          setAuth('expired');
          return;
        }
      }
      const providers = await api.getProviders();
      if (mounted && providers.ok && providers.data) {
        useTerminalStore.getState().setProviders(providers.data);
      }
      const prefs = await api.getPreferences();
      if (mounted && prefs.ok && prefs.data) {
        usePreferencesStore.getState().setPreferences(prefs.data);
      }
      await restoreWorkspace();
      // Demo builds (VITE_DEMO_WORKSPACE=1) seed a starter layout on a truly
      // first run, so the terminal never opens to an empty grid. Self-host
      // only: in hosted mode the role-preset onboarding below owns first-run
      // (the same Docker image serves both).
      if (
        mounted &&
        import.meta.env.VITE_DEMO_WORKSPACE === '1' &&
        health?.appMode !== 'hosted' &&
        useWorkspaceStore.getState().panels.length === 0
      ) {
        useWorkspaceStore.getState().rename('Demo');
        for (const line of ['AAPL GP', 'AAPL DES', 'W', 'TOP']) executeInput(line);
      }
      // Hosted first login: nothing restored and no role picked yet → offer
      // the role presets instead of an empty grid.
      if (
        mounted &&
        health?.appMode === 'hosted' &&
        useWorkspaceStore.getState().panels.length === 0 &&
        usePreferencesStore.getState().preferences.onboardingRole == null
      ) {
        setOnboarding(true);
      }
      if (mounted) setAuth('ready');
    })();
    return () => {
      mounted = false;
    };
  }, [bootNonce]);

  // Global keyboard shortcuts.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Rebindable global chords (read live from preferences, so changes apply
      // immediately without re-registering the listener). A modifier-less custom
      // chord must not hijack a keystroke while the user is typing in a field.
      const hasPrimaryModifier = mod || event.altKey;
      const combo = comboFromEvent(event);
      if (combo && (hasPrimaryModifier || !isTypingTarget(event.target))) {
        const { byCombo } = resolveBindings(usePreferencesStore.getState().preferences.keymap);
        const action = byCombo.get(combo);
        if (action) {
          event.preventDefault();
          if (action === 'focusCommandBar') commandInputRef.current?.focus();
          else if (action === 'saveWorkspace') void saveCurrentWorkspace();
          else if (action === 'reopenPanel') useWorkspaceStore.getState().undoClose();
          return;
        }
      }

      // Fixed contextual keys.
      if (key === 'tab' && !mod && !isTypingTarget(event.target)) {
        // Cycle panel focus; never hijack Tab while typing in a field/command bar.
        event.preventDefault();
        if (event.shiftKey) useWorkspaceStore.getState().focusPrevPanel();
        else useWorkspaceStore.getState().focusNextPanel();
      } else if (key === 'escape') {
        commandInputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (auth === 'required') {
    return (
      <AuthScreen
        onAuthed={(user) => {
          useTerminalStore.getState().setUser(user);
          setAuth('checking');
          setBootNonce((n) => n + 1);
        }}
      />
    );
  }

  if (auth === 'expired') {
    return <PaywallScreen email={useTerminalStore.getState().user?.email ?? ''} />;
  }

  if (auth === 'ready' && onboarding) {
    return <OnboardingScreen onDone={() => setOnboarding(false)} />;
  }

  return (
    <TerminalShell
      header={<Header />}
      commandBar={<CommandBarContainer ref={commandInputRef} />}
      statusBar={<StatusBar />}
    >
      <EntitlementBanner />
      <WorkspaceGrid />
    </TerminalShell>
  );
}
