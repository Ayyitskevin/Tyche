import { useEffect, useState } from 'react';
import type { DataProvenance, ProviderCapability } from '@tyche/contracts';
import { formatRelativeTime } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance } from './common';

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-red-400',
  neutral: 'bg-zinc-500',
};

/** A `YYYY-MM-DD` date input → ISO datetime at the start/end of that UTC day. */
function toIso(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const ms = Date.parse(`${date}T${end ? '23:59:59' : '00:00:00'}Z`);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export interface NewsFeedProps {
  symbol: string | null;
  /** When true, ignore `symbol` and always query the global tape (TOP). */
  global?: boolean;
  missingCapabilities: ProviderCapability[];
  reportProvenance?: (provenance: DataProvenance | null) => void;
}

/**
 * Shared news surface: a filter bar (source / keyword / date range / watchlist)
 * over the headline list. `NewsModule` and `TopNewsModule` are thin wrappers.
 */
export function NewsFeed({ symbol, global = false, missingCapabilities, reportProvenance }: NewsFeedProps) {
  const [source, setSource] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [watchlistId, setWatchlistId] = useState('');
  const [sourcesSeen, setSourcesSeen] = useState<string[]>([]);

  // Debounce the keyword so typing does not re-query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => clearTimeout(t);
  }, [keywordInput]);

  const watchlists = useApiData(() => api.getWatchlists(), []);
  const effectiveSymbol = global ? null : symbol;
  const sinceIso = toIso(since, false);
  const untilIso = toIso(until, true);

  const news = useApiData(
    () =>
      api.getNews({
        ...(effectiveSymbol && !watchlistId ? { symbol: effectiveSymbol } : {}),
        ...(source ? { source } : {}),
        ...(keyword ? { keyword } : {}),
        ...(sinceIso ? { since: sinceIso } : {}),
        ...(untilIso ? { until: untilIso } : {}),
        ...(watchlistId ? { watchlistId } : {}),
      }),
    [effectiveSymbol, source, keyword, sinceIso, untilIso, watchlistId],
  );
  useReportProvenance(reportProvenance, news.provenance);

  // Accumulate every source we have seen so the dropdown stays populated even
  // while a source filter is active (which narrows the visible items).
  useEffect(() => {
    if (!news.data) return;
    setSourcesSeen((prev) => {
      const set = new Set(prev);
      for (const it of news.data!) set.add(it.source);
      return set.size === prev.length ? prev : [...set].sort();
    });
  }, [news.data]);

  const selectClass =
    'rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5">
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
          <option value="">All sources</option>
          {sourcesSeen.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          aria-label="Keyword"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder="keyword"
          spellCheck={false}
          className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 focus:outline-none"
        />
        <input aria-label="Since" type="date" value={since} onChange={(e) => setSince(e.target.value)} className={selectClass} />
        <input aria-label="Until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={selectClass} />
        <select
          aria-label="Watchlist"
          value={watchlistId}
          onChange={(e) => setWatchlistId(e.target.value)}
          className={selectClass}
        >
          <option value="">{global ? 'All symbols' : 'This symbol'}</option>
          {(watchlists.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ModuleBody state={news} missingCapabilities={missingCapabilities} emptyMessage="No headlines.">
          {(items) =>
            items.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">No headlines match these filters.</div>
            ) : (
              <ul className="divide-y divide-zinc-900">
                {items.map((item) => (
                  <li key={item.id} className="px-3 py-2 hover:bg-zinc-900/50">
                    <a
                      href={item.url ?? '#'}
                      target={item.url ? '_blank' : undefined}
                      rel="noreferrer"
                      className="block"
                      onClick={(e) => {
                        if (!item.url) e.preventDefault();
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {item.sentiment && (
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SENTIMENT_DOT[item.sentiment]}`} />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200">{item.headline}</p>
                          {item.summary && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{item.summary}</p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                            <span>{item.source}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(item.publishedAt)}</span>
                            {item.symbols.length > 0 && (
                              <span className="font-mono text-sky-400/70">{item.symbols.join(' ')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )
          }
        </ModuleBody>
      </div>
    </div>
  );
}
