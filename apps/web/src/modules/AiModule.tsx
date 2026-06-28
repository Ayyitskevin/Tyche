import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { AICitation, AIContextPacket, AIMessage } from '@tyche/contracts';
import { api } from '../providers/apiClient';
import { useTerminalStore } from '../state/terminalStore';
import { useWorkspaceStore } from '../state/workspaceStore';

interface Entry {
  role: AIMessage['role'];
  content: string;
  citations?: AICitation[];
  disclaimer?: string;
}

const DISCLAIMER =
  'Educational analysis only — not personalized investment advice.';

export function AiModule(_props: ModulePanelProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const activeInstrument = useTerminalStore((s) => s.activeInstrument);
  const recentCommands = useTerminalStore((s) => s.recentCommands);
  const panels = useWorkspaceStore((s) => s.panels);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const history: Entry[] = [...entries, { role: 'user', content: text }];
    setEntries(history);
    setInput('');
    setLoading(true);

    const context: AIContextPacket = {
      activeSymbol: activeInstrument?.symbol ?? null,
      activeAssetClass: activeInstrument?.assetClass ?? null,
      openPanels: panels.map((p) => ({ moduleId: p.moduleId, symbol: p.symbol, title: p.title })),
      selection: null,
      recentCommands,
      watchlistSymbols: [],
      provenance: [],
    };
    const messages: AIMessage[] = history.map((e) => ({ role: e.role, content: e.content }));
    const response = await api.aiChat({ messages, context });
    setLoading(false);
    if (response) {
      setEntries((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.message.content,
          citations: response.citations,
          disclaimer: response.disclaimer,
        },
      ]);
    } else {
      setEntries((prev) => [
        ...prev,
        { role: 'assistant', content: 'The AI service is unavailable. Running in mock mode requires the API to be up.' },
      ]);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {entries.length === 0 && (
          <p className="text-xs leading-relaxed text-zinc-500">
            Ask about what's on screen — e.g. "summarize the open panels" or "explain this chart".
            Grounded in terminal context with source citations. No buy/sell/hold advice.
          </p>
        )}
        {entries.map((entry, i) => (
          <div key={i} className={entry.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-xs ${
                entry.role === 'user' ? 'bg-sky-500/15 text-sky-100' : 'bg-zinc-900 text-zinc-200'
              }`}
            >
              {entry.content}
            </div>
            {entry.citations && entry.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.citations.map((c, ci) => (
                  <span key={ci} className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-400">
                    {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-xs text-zinc-500">Thinking…</div>}
      </div>
      <div className="shrink-0 border-t border-zinc-800 p-2">
        <div className="flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            placeholder="Ask the copilot…"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Send
          </button>
        </div>
        <p className="mt-1 text-[10px] text-zinc-600">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
