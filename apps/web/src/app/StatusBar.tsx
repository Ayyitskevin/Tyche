import { useEffect, useState } from 'react';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';

const TONE: Record<string, string> = {
  info: 'text-zinc-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

export function StatusBar() {
  const activeInstrument = useTerminalStore((s) => s.activeInstrument);
  const messages = useTerminalStore((s) => s.messages);
  const dismissMessage = useTerminalStore((s) => s.dismissMessage);
  const panelCount = useWorkspaceStore((s) => s.panels.length);
  const last = messages[messages.length - 1];

  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US'));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-4">
      <span>
        Active: <span className="font-mono text-zinc-300">{activeInstrument?.symbol ?? '—'}</span>
      </span>
      <span>Panels: {panelCount}</span>
      {last && (
        <button
          type="button"
          onClick={() => dismissMessage(last.id)}
          className={`truncate ${TONE[last.level] ?? 'text-zinc-400'}`}
          title="Dismiss"
        >
          {last.text}
        </button>
      )}
      <span className="ml-auto font-mono text-zinc-500">{clock}</span>
    </div>
  );
}
