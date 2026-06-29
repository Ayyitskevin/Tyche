import type { FastifyInstance } from 'fastify';
import { BarIntervalSchema, EconomicSeriesQuerySchema, HistoryRangeSchema } from '@tyche/contracts';
import { ProviderError } from '@tyche/data-adapters';
import type { AppContext } from '../context';
import { lookupProvider, serveCapability } from './helpers';

/** Sub-day bar intervals served by the intraday endpoint (gated on `intradayPrices`). */
const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);

export function registerMarketRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const provider = lookupProvider(ctx.registry);
    try {
      reply.send(await provider.searchInstruments((q ?? '').trim(), 12));
    } catch (err) {
      reply.code(502).send({
        error: { kind: 'provider_error', message: err instanceof ProviderError ? err.message : String(err) },
        provenance: null,
      });
    }
  });

  app.get('/api/instruments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const provider = lookupProvider(ctx.registry);
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
    await serveCapability(reply, ctx.registry, 'quotes', (p) => p.getQuote(symbol));
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
    await serveCapability(reply, ctx.registry, 'batchQuotes', (p) => p.getQuotes(list));
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
    await serveCapability(reply, ctx.registry, 'historicalPrices', (p) => p.getHistory(symbol, query));
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
    await serveCapability(reply, ctx.registry, 'intradayPrices', (p) => p.getHistory(symbol, query));
  });

  app.get('/api/trades/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'trades', (p) => p.getTrades(symbol));
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
}
