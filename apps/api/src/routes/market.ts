import type { FastifyInstance } from 'fastify';
import { BarIntervalSchema, EconomicSeriesQuerySchema, EconomicReleaseQuerySchema, HistoryRangeSchema } from '@tyche/contracts';
import { ProviderError, type DataProvider } from '@tyche/data-adapters';
import type { AppContext } from '../context';
import { gapProvenance, lookupProvider, serveCapability } from './helpers';

/** Sub-day bar intervals served by the intraday endpoint (gated on `intradayPrices`). */
const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);

export function registerMarketRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const query = (q ?? '').trim();
    // Merge results across every quote-capable provider so venue-scoped
    // adapters (binance) contribute their pairs alongside the general universe.
    const candidates = ctx.registry.list().filter((p) => p.descriptor.capabilities.quotes);
    const providers = candidates.length > 0 ? candidates : [lookupProvider(ctx.registry)];
    const seen = new Set<string>();
    const merged: unknown[] = [];
    let provenance: unknown = null;
    let firstError: unknown = null;
    for (const provider of providers) {
      try {
        const res = await provider.searchInstruments(query, 12);
        provenance = provenance ?? res.provenance;
        for (const hit of res.data) {
          if (seen.has(hit.identifier.symbol)) continue;
          seen.add(hit.identifier.symbol);
          merged.push(hit);
        }
      } catch (err) {
        firstError = firstError ?? err;
      }
      if (merged.length >= 12) break;
    }
    if (merged.length === 0 && firstError) {
      reply.code(502).send({
        error: {
          kind: 'provider_error',
          message: firstError instanceof ProviderError ? firstError.message : String(firstError),
        },
        provenance: null,
      });
      return;
    }
    reply.send({ data: merged.slice(0, 12), provenance });
  });

  app.get('/api/instruments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = ctx.registry.forCapability('quotes', id) ?? lookupProvider(ctx.registry);
    try {
      reply.send(await provider.getInstrument(id));
    } catch (err) {
      reply.code(502).send({
        error: { kind: 'provider_error', message: err instanceof Error ? err.message : String(err) },
        provenance: null,
      });
    }
  });

  app.get('/api/quote/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'quotes', (p) => p.getQuote(symbol), symbol);
  });

  app.get('/api/quotes', async (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide ?symbols=A,B,C' } });
      return;
    }
    // Route each symbol to the provider that actually serves IT, then batch per
    // provider — venue-scoped adapters (binance, frankfurter) only see their own
    // universe and equities still reach a general provider. Resolving batchQuotes
    // once for the whole list (as a plain serveCapability would) sends every
    // symbol to the first batchQuotes provider, so enabling a venue adapter breaks
    // mixed/equity batches. Mirrors QuoteStreamHub.subscribe's per-symbol routing.
    const groups = new Map<string, { provider: DataProvider; symbols: string[] }>();
    for (const symbol of list) {
      const provider = ctx.registry.forCapability('batchQuotes', symbol);
      if (!provider) continue;
      const group = groups.get(provider.descriptor.name) ?? { provider, symbols: [] };
      group.symbols.push(symbol);
      groups.set(provider.descriptor.name, group);
    }
    if (groups.size === 0) {
      reply.code(200).send({
        error: {
          kind: 'capability_unavailable',
          capability: 'batchQuotes',
          message: 'No enabled provider supplies quotes for the requested symbols.',
        },
        provenance: gapProvenance(ctx.registry, 'batchQuotes'),
      });
      return;
    }
    try {
      const quotes = [];
      let provenance: unknown = null;
      let bestCount = 0;
      for (const { provider, symbols: group } of groups.values()) {
        const env = await provider.getQuotes(group);
        quotes.push(...env.data);
        // Attribute the batch to the provider serving the most symbols (usually
        // the only one; a mixed batch names its majority source).
        if (group.length > bestCount) {
          bestCount = group.length;
          provenance = env.provenance;
        }
      }
      reply.code(200).send({ data: quotes, provenance });
    } catch (err) {
      reply.code(502).send({
        error: {
          kind: 'provider_error',
          capability: 'batchQuotes',
          message: err instanceof Error ? err.message : String(err),
        },
        provenance: gapProvenance(ctx.registry, 'batchQuotes'),
      });
    }
  });

  app.get('/api/history/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { range, interval } = request.query as { range?: string; interval?: string };
    const parsedRange = range ? HistoryRangeSchema.safeParse(range) : null;
    const parsedInterval = interval ? BarIntervalSchema.safeParse(interval) : null;
    if (range && parsedRange && !parsedRange.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: `Invalid range "${range}".` } });
      return;
    }
    if (interval && parsedInterval && !parsedInterval.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: `Invalid interval "${interval}".` } });
      return;
    }
    const query = {
      ...(parsedRange?.success ? { range: parsedRange.data } : {}),
      ...(parsedInterval?.success ? { interval: parsedInterval.data } : {}),
    };
    await serveCapability(reply, ctx.registry, 'historicalPrices', (p) => p.getHistory(symbol, query), symbol);
  });

  // Hi-res intraday bars — same provider method as history, but gated on the
  // distinct `intradayPrices` capability (a provider may supply EOD but not intraday).
  app.get('/api/intraday/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { range, interval } = request.query as { range?: string; interval?: string };
    const parsedRange = range ? HistoryRangeSchema.safeParse(range) : null;
    const parsedInterval = interval ? BarIntervalSchema.safeParse(interval) : null;
    if (range && parsedRange && !parsedRange.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: `Invalid range "${range}".` } });
      return;
    }
    // Only intraday intervals belong here — a daily interval would return EOD bars
    // under the `intradayPrices` gate, mislabeling the provenance.
    if (interval && (!parsedInterval?.success || !INTRADAY_INTERVALS.has(parsedInterval.data))) {
      reply.code(400).send({
        error: { kind: 'bad_request', message: `Invalid intraday interval "${interval}". Use one of ${[...INTRADAY_INTERVALS].join(', ')}.` },
      });
      return;
    }
    const query = {
      range: parsedRange?.success ? parsedRange.data : ('1d' as const),
      interval: parsedInterval?.success ? parsedInterval.data : ('5m' as const),
    };
    await serveCapability(reply, ctx.registry, 'intradayPrices', (p) => p.getHistory(symbol, query), symbol);
  });

  app.get('/api/trades/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'trades', (p) => p.getTrades(symbol), symbol);
  });

  app.get('/api/book/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { depth } = request.query as { depth?: string };
    const levels = Math.min(100, Math.max(1, Number(depth) || 20));
    await serveCapability(reply, ctx.registry, 'orderBook', (p) => p.getOrderBook(symbol, levels), symbol);
  });

  app.get('/api/membership/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'membership', (p) => p.getMembership(symbol), symbol);
  });

  // On-chain DEX pools matching a token/pair query, deepest liquidity first.
  app.get('/api/dex', async (request, reply) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    const query = (q ?? '').trim();
    if (!query) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide ?q=<token or pair>' } });
      return;
    }
    const capped = Math.min(50, Math.max(1, Number(limit) || 12));
    await serveCapability(reply, ctx.registry, 'dexPools', (p) => p.getDexPools(query, capped));
  });

  // Perp funding board. `symbols` filters; empty ⇒ the venue's default board.
  app.get('/api/funding', async (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await serveCapability(
      reply,
      ctx.registry,
      'fundingRates',
      (p) => p.getFundingRates(list.length > 0 ? list : undefined),
      list[0],
    );
  });

  app.get('/api/economics/:seriesId', async (request, reply) => {
    const { seriesId } = request.params as { seriesId: string };
    const raw = request.query as { start?: string; end?: string; limit?: string };
    const parsed = EconomicSeriesQuerySchema.safeParse({
      start: raw.start || undefined,
      end: raw.end || undefined,
      limit: raw.limit ? Number(raw.limit) : undefined,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid economic-series query', detail: parsed.error.issues } });
      return;
    }
    await serveCapability(reply, ctx.registry, 'economicSeries', (p) =>
      p.getEconomicSeries(seriesId, parsed.data),
    );
  });

  app.get('/api/econ-releases', async (request, reply) => {
    const raw = request.query as { from?: string; to?: string; importance?: string; limit?: string };
    const parsed = EconomicReleaseQuerySchema.safeParse({
      from: raw.from || undefined,
      to: raw.to || undefined,
      importance: raw.importance || undefined,
      limit: raw.limit ? Number(raw.limit) : undefined,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid release-calendar query', detail: parsed.error.issues } });
      return;
    }
    await serveCapability(reply, ctx.registry, 'economicReleases', (p) => p.getEconomicReleases(parsed.data));
  });

  app.get('/api/institutional/:manager', async (request, reply) => {
    const { manager } = request.params as { manager: string };
    const { limit } = request.query as { limit?: string };
    const m = (manager ?? '').trim();
    if (!m) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'A manager (CIK or name) is required' } });
      return;
    }
    const cap = limit ? Math.min(Math.max(1, Number(limit) || 50), 200) : 50;
    await serveCapability(reply, ctx.registry, 'institutionalHoldings', (p) =>
      p.getInstitutionalHoldings(m, cap),
    );
  });
}
