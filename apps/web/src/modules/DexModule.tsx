import { useEffect, useState } from 'react';
import type { DexPool } from '@tyche/contracts';
import type { ModulePanelProps } from '@tyche/module-sdk';
import { changeToneClass, DataTable, formatPercent, type Column } from '@tyche/ui';
import { api } from '../providers/apiClient';
import { useApiData } from '../providers/useApiData';
import { useElementSize } from '../providers/useElementSize';
import { ModuleBody, useReportProvenance, useReportSummary } from './common';
import { TableExport } from './TableExport';
import { defaultDexQuery, formatPoolPrice, formatUsdCompact } from './dexView';

const POLL_MS = 60_000;
const LIMIT = 15;

/**
 * DEX — on-chain liquidity pools for a token: which venues and chains carry
 * its market, at what price, and with how much depth. The query defaults to
 * the active symbol's base token and can be retyped; pools link out to their
 * source page when the provider supplies one.
 */
export function DexModule({ symbol, state, setState, missingCapabilities, reportProvenance, reportSummary }: ModulePanelProps) {
  const query =
    typeof state.query === 'string' && state.query.trim() ? state.query.trim().toUpperCase() : defaultDexQuery(symbol);
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPoll((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const pools = useApiData<DexPool[]>(() => api.getDexPools(query, LIMIT), [query, poll]);
  useReportProvenance(reportProvenance, pools.provenance);
  const top = pools.data?.[0];
  useReportSummary(
    reportSummary,
    top
      ? `DEX pools for ${query}: ${pools.data?.length ?? 0} pools, deepest ${top.dex} on ${top.chain} (${formatUsdCompact(top.liquidityUsd)} liq)`
      : null,
  );
  const [ref, size] = useElementSize<HTMLDivElement>();

  const columns: Array<Column<DexPool>> = [
    {
      key: 'pair',
      header: 'Pair',
      width: '1.6fr',
      value: (p) => `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
      render: (p) => (
        <span className="text-zinc-200">
          {p.baseToken.symbol}
          <span className="text-zinc-500">/{p.quoteToken.symbol}</span>
        </span>
      ),
    },
    { key: 'dex', header: 'DEX', render: (p) => <span className="text-zinc-300">{p.dex}</span> },
    { key: 'chain', header: 'Chain', render: (p) => <span className="text-zinc-400">{p.chain}</span> },
    { key: 'price', header: 'Price $', align: 'right', value: (p) => p.priceUsd, render: (p) => formatPoolPrice(p.priceUsd) },
    {
      key: 'chg',
      header: '24h %',
      align: 'right',
      value: (p) => p.change24hPct,
      render: (p) => <span className={changeToneClass(p.change24hPct)}>{formatPercent(p.change24hPct)}</span>,
    },
    { key: 'vol', header: 'Vol 24h', align: 'right', value: (p) => p.volume24hUsd, render: (p) => formatUsdCompact(p.volume24hUsd) },
    { key: 'liq', header: 'Liquidity', align: 'right', value: (p) => p.liquidityUsd, render: (p) => formatUsdCompact(p.liquidityUsd) },
    {
      key: 'link',
      header: '',
      align: 'right',
      width: '32px',
      value: (p) => p.url ?? '',
      render: (p) =>
        p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer noopener"
            title="Open pool at source"
            className="text-sky-400 hover:text-sky-300"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        ) : null,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <form
        className="flex items-center gap-1 border-b border-zinc-900 px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const next = draft.trim().toUpperCase();
          if (next) setState({ query: next });
        }}
      >
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Token</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label="DEX pool search token"
          className="w-24 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs text-zinc-200 outline-none focus:border-sky-500"
        />
        <button type="submit" className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800">
          Search
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">deepest liquidity first</span>
          <TableExport name={`dex-${query}`} columns={columns} rows={pools.data ?? []} provenance={pools.provenance} />
        </div>
      </form>
      <div ref={ref} className="min-h-0 flex-1">
        <ModuleBody state={pools} missingCapabilities={missingCapabilities} emptyMessage="No pools found.">
          {(rows) =>
            rows.length === 0 ? (
              <div className="p-4 text-xs text-zinc-500">No pools found for “{query}”.</div>
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={(p) => `${p.chain}-${p.pairAddress}`}
                height={size.height || 320}
                rowHeight={22}
              />
            )
          }
        </ModuleBody>
      </div>
    </div>
  );
}
