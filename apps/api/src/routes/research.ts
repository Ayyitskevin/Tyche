import type { FastifyInstance } from 'fastify';
import { EventsQuerySchema, FiscalPeriodSchema, NewsQuerySchema, ScreenQuerySchema, StatementTypeSchema } from '@tyche/contracts';
import type { AppContext } from '../context';
import { serveCapability } from './helpers';

export function registerResearchRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/news', async (request, reply) => {
    const raw = request.query as Record<string, string | undefined>;
    const parsed = NewsQuerySchema.safeParse({
      symbol: raw.symbol || undefined,
      source: raw.source || undefined,
      keyword: raw.keyword || raw.q || undefined,
      since: raw.since || undefined,
      until: raw.until || undefined,
      watchlistId: raw.watchlistId || undefined,
      limit: raw.limit ? Number(raw.limit) : undefined,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid news query', detail: parsed.error.issues } });
      return;
    }
    const query = parsed.data;
    // A watchlist scope resolves to that list's symbols (empty list ⇒ empty feed).
    let symbols: string[] | undefined;
    if (query.watchlistId) {
      const lists = await ctx.persistence.listWatchlists();
      symbols = lists.find((l) => l.id === query.watchlistId)?.symbols ?? [];
    }
    await serveCapability(reply, ctx.registry, 'news', (p) =>
      p.getNews({
        ...(query.symbol ? { symbol: query.symbol } : {}),
        ...(symbols ? { symbols } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.keyword ? { keyword: query.keyword } : {}),
        ...(query.since ? { since: query.since } : {}),
        ...(query.until ? { until: query.until } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      }),
    );
  });

  app.get('/api/filings/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'filings', (p) => p.getFilings(symbol));
  });

  app.get('/api/estimates/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'estimates', (p) => p.getEstimates(symbol));
  });

  app.get('/api/ratings/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'analystRatings', (p) => p.getAnalystRatings(symbol));
  });

  app.get('/api/ownership/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'ownership', (p) => p.getOwnership(symbol));
  });

  app.get('/api/financials/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { type, period } = request.query as { type?: string; period?: string };
    const parsedType = type ? StatementTypeSchema.safeParse(type) : null;
    const parsedPeriod = period ? FiscalPeriodSchema.safeParse(period) : null;
    const query = {
      ...(parsedType?.success ? { type: parsedType.data } : {}),
      ...(parsedPeriod?.success ? { period: parsedPeriod.data } : {}),
    };
    await serveCapability(reply, ctx.registry, 'fundamentals', (p) => p.getFinancials(symbol, query));
  });

  app.get('/api/options/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { expiry } = request.query as { expiry?: string };
    await serveCapability(reply, ctx.registry, 'options', (p) =>
      p.getOptionChain(symbol, expiry ? { expiry } : {}),
    );
  });

  app.get('/api/events', async (request, reply) => {
    const raw = request.query as { symbol?: string; days?: string };
    const parsed = EventsQuerySchema.safeParse({
      symbol: raw.symbol || undefined,
      days: raw.days ? Number(raw.days) : undefined,
    });
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid events query', detail: parsed.error.issues } });
      return;
    }
    await serveCapability(reply, ctx.registry, 'events', (p) => p.getEvents(parsed.data));
  });

  app.post('/api/screen', async (request, reply) => {
    const parsed = ScreenQuerySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid screen query', detail: parsed.error.issues } });
      return;
    }
    await serveCapability(reply, ctx.registry, 'screener', (p) => p.screen(parsed.data));
  });
}
