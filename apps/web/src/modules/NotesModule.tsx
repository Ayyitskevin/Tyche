import { useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatRelativeTime } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';

export function NotesModule({ symbol }: ModulePanelProps) {
  const notes = useApiData(() => api.getNotes(), []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function add() {
    if (!title.trim() && !body.trim()) return;
    await api.saveNote({ title: title.trim() || 'Untitled', body: body.trim(), symbol: symbol ?? null });
    setTitle('');
    setBody('');
    notes.reload();
  }

  async function remove(id: string) {
    await api.deleteNote(id);
    notes.reload();
  }

  const items = notes.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-1 border-b border-zinc-800 p-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={symbol ? `Note about ${symbol}…` : 'Note title…'}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body…"
          rows={2}
          className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void add()}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            Save note
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <p className="p-3 text-xs text-zinc-600">No notes yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {items.map((note) => (
              <li key={note.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-200">{note.title}</span>
                  <button
                    type="button"
                    onClick={() => void remove(note.id)}
                    className="text-zinc-600 hover:text-red-400"
                    aria-label="Delete note"
                  >
                    ✕
                  </button>
                </div>
                {note.body && <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-zinc-400">{note.body}</p>}
                <div className="mt-1 flex gap-2 text-[10px] text-zinc-600">
                  {note.symbol && <span className="font-mono text-sky-400/70">{note.symbol}</span>}
                  <span>{formatRelativeTime(note.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
