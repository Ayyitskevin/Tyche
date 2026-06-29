import { useMemo, useRef, useState } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { Note, NoteExport } from '@tyche/contracts';
import { NoteExportSchema } from '@tyche/contracts';
import { formatRelativeTime } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { downloadText } from './export';
import { renderMarkdown } from './markdown';

/** Split a comma/whitespace-separated tag string into a clean, deduped list. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const tag = part.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

/** Pinned first, then most-recently-updated. Pure so it can be unit-tested. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function NotesModule({ symbol }: ModulePanelProps) {
  const notes = useApiData(() => api.getNotes(), []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [scope, setScope] = useState<'symbol' | 'all'>(symbol ? 'symbol' : 'all');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function add() {
    if (!title.trim() && !body.trim()) return;
    await api.saveNote({
      title: title.trim() || 'Untitled',
      body: body.trim(),
      tags: parseTags(tags),
      symbol: symbol ?? null,
    });
    setTitle('');
    setBody('');
    setTags('');
    setPreview(false);
    notes.reload();
  }

  async function remove(id: string) {
    await api.deleteNote(id);
    notes.reload();
  }

  async function togglePin(note: Note) {
    await api.saveNote({ ...note, pinned: !note.pinned });
    notes.reload();
  }

  async function exportNotes() {
    setBusy('export');
    const result = await api.exportNotes();
    setBusy(null);
    if (result.ok) {
      downloadText('tyche-notes.json', 'application/json', JSON.stringify(result.data, null, 2));
    }
  }

  async function onImportFile(file: File) {
    setBusy('import');
    try {
      const parsed = NoteExportSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        window.alert('Import failed: file is not a valid Tyche notes export.');
        return;
      }
      const payload: NoteExport = parsed.data;
      const result = await api.importNotes(payload);
      if (!result.ok) {
        window.alert(`Import failed: ${result.error.message}`);
        return;
      }
      notes.reload();
    } catch (err) {
      window.alert(`Import failed: ${err instanceof Error ? err.message : 'could not read file'}`);
    } finally {
      setBusy(null);
    }
  }

  const all = notes.data ?? [];
  const visible = useMemo(() => {
    const scoped = scope === 'symbol' && symbol ? all.filter((n) => n.symbol === symbol) : all;
    return sortNotes(scoped);
  }, [all, scope, symbol]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-1 border-b border-zinc-800 p-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={symbol ? `Note about ${symbol}…` : 'Note title…'}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
        />
        {preview ? (
          <div className="min-h-[3rem] rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
            {body.trim() ? (
              renderMarkdown(body)
            ) : (
              <p className="text-[11px] text-zinc-600">Nothing to preview.</p>
            )}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Body — markdown supported (**bold**, *italic*, `code`, # heading, - bullet)"
            rows={3}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
          />
        )}
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma-separated…"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            {preview ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={() => void add()}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            Save note
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-900 px-2 py-1">
        <div className="flex gap-1">
          {symbol && (
            <>
              <button
                type="button"
                onClick={() => setScope('symbol')}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  scope === 'symbol' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {symbol}
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  scope === 'all' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                All
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 text-[10px] text-zinc-500">
          <button
            type="button"
            onClick={() => void exportNotes()}
            disabled={busy !== null}
            aria-label="Export notes"
            className="hover:text-zinc-300 disabled:opacity-50"
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            aria-label="Import notes"
            className="hover:text-zinc-300 disabled:opacity-50"
          >
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {notes.loading ? (
          <p className="p-3 text-xs text-zinc-600">Loading…</p>
        ) : notes.error ? (
          <p className="p-3 text-xs text-red-400/80">Couldn’t load notes: {notes.error}</p>
        ) : visible.length === 0 ? (
          <p className="p-3 text-xs text-zinc-600">
            {scope === 'symbol' && symbol ? `No notes for ${symbol} yet.` : 'No notes yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {visible.map((note) => (
              <li key={note.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-zinc-200">
                    {note.pinned && <span className="text-amber-400/80" aria-label="Pinned">📌</span>}
                    {note.title}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void togglePin(note)}
                      className={note.pinned ? 'text-amber-400/80 hover:text-amber-300' : 'text-zinc-600 hover:text-zinc-300'}
                      aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                    >
                      {note.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(note.id)}
                      className="text-zinc-600 hover:text-red-400"
                      aria-label="Delete note"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {note.body && <div className="mt-1">{renderMarkdown(note.body)}</div>}
                {note.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span key={tag} className="rounded bg-zinc-800/80 px-1 text-[10px] text-zinc-400">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
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
