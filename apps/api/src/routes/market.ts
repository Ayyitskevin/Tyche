import type { FastifyInstance } from 'fastify';
import { BarIntervalSchema, HistoryRangeSchema } from '@tyche/contracts';
import { ProviderError } from '@tyche/data-adapters';
import type { AppContext } from '../context';
import { lookupProvider, serveCapability } from './helpers';

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

  app.get('/api/trades/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'trades', (p) => p.getTrades(symbol));
  });
}
