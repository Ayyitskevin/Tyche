import { useState, type FormEvent } from 'react';
import type { ModulePanelProps } from '@tyche/module-sdk';
import type { FilingSearchHit } from '@tyche/contracts';
import { api, type EnvelopeResult } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance } from './common';
import { safeHref } from './markdown';

function noQuery(): Promise<EnvelopeResult<FilingSearchHit[]>> {
  return Promise.resolve({ ok: true, data: [], provenance: null });
}

/**
 * FTS — cross-issuer filing full-text search (SEC EDGAR). A free-text query is
 * submitted on Enter (not per keystroke, since it hits a rate-limited public
 * index) and resolves to matched filings with a direct document link.
 */
export function FilingSearchModule({ args, state, setState, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const query = ((state.query as string | undefined) ?? args.join(' ')).trim();
  const [draft, setDraft] = useState(query);
  const results = useApiData(() => (query ? api.searchFilings(query) : noQuery()), [query]);
  useReportProvenance(reportProvenance, results.provenance);

  function submit(event: FormEvent) {
    event.preventDefault();
    setState({ ...state, query: draft.trim() });
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-b border-zinc-800 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search filing text (e.g. climate risk)…"
          aria-label="Filing search query"
          spellCheck={false}
          autoFocus
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100 focus:border-sky-500/40 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
        >
          Search
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto">
        {query === '' ? (
          <div className="p-4 text-xs text-zinc-500">Enter a term to search filing full text across all issuers.</div>
        ) : (
          <ModuleBody state={results} missingCapabilities={missingCapabilities} emptyMessage="No filings matched.">
            {(hits) => (
              <table className="w-full border-collapse font-mono text-[11px]">
                <thead className="sticky top-0 bg-zinc-900/95 text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Form</th>
                    <th className="px-2 py-1 text-left font-medium">Filer</th>
                    <th className="px-2 py-1 text-right font-medium">Filed</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h, i) => {
                    const href = h.url ? safeHref(h.url) : null;
                    return (
                      <tr
                        key={`${h.accessionNumber ?? h.entity}-${i}`}
                        className="border-b border-zinc-900 hover:bg-zinc-900/40"
                      >
                        <td className="px-2 py-1 text-sky-300">{h.form}</td>
                        <td className="px-2 py-1 text-zinc-300">
                          {href ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {h.entity}
                            </a>
                          ) : (
                            h.entity
                          )}
                        </td>
                        <td className="px-2 py-1 text-right text-zinc-400">{h.filedAt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ModuleBody>
        )}
      </div>
      <p className="shrink-0 border-t border-zinc-900 px-3 py-1.5 text-[10px] text-zinc-600">
        SEC EDGAR full-text search · public filings only.
      </p>
    </div>
  );
}
