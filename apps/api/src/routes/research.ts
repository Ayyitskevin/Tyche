import type { FastifyInstance } from 'fastify';
import { FiscalPeriodSchema, StatementTypeSchema } from '@tyche/contracts';
import type { AppContext } from '../context';
import { serveCapability } from './helpers';

export function registerResearchRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/news', async (request, reply) => {
    const { symbol, q } = request.query as { symbol?: string; q?: string };
    await serveCapability(reply, ctx.registry, 'news', (p) =>
      p.getNews({
        ...(symbol ? { symbol } : {}),
        ...(q ? { query: q } : {}),
      }),
    );
  });

  app.get('/api/filings/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    await serveCapability(reply, ctx.registry, 'filings', (p) => p.getFilings(symbol));
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
}
