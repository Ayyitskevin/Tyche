import type { ModulePanelProps } from '@tyche/module-sdk';
import { formatRelativeTime } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { ModuleBody, useReportProvenance } from './common';

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-400',
  negative: 'bg-red-400',
  neutral: 'bg-zinc-500',
};

export function NewsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  const news = useApiData(() => api.getNews(symbol ? { symbol } : {}), [symbol]);
  useReportProvenance(reportProvenance, news.provenance);

  return (
    <ModuleBody state={news} missingCapabilities={missingCapabilities} emptyMessage="No headlines.">
      {(items) => (
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
      )}
    </ModuleBody>
  );
}
