import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from '../context';
import { AlertEvaluator } from '../stream/alertEngine';
import type { QuoteTick } from '../stream/hub';

function parseSymbols(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function openEventStream(reply: FastifyReply, webOrigin: string, ready: unknown): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': webOrigin,
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write(`event: ready\ndata: ${JSON.stringify(ready)}\n\n`);
}

/**
 * SSE streams. `GET /api/stream/quotes?symbols=A,B` pushes jittered `quote`
 * batches; `GET /api/stream/alerts?symbols=A,B` evaluates the user's active alert
 * rules against the same hub ticks and pushes `alert` frames on a fire. Alerts
 * ride a dedicated connection (one evaluator per connection) so they are never
 * double-counted by the several quote panels that may also stream a symbol. SSE
 * keeps the foundation dependency-free vs a WebSocket stack.
 */
export function registerStreamRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/stream/quotes', (request, reply) => {
    const list = parseSymbols((request.query as { symbols?: string }).symbols);
    if (list.length === 0) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide ?symbols=A,B,C' } });
      return;
    }

    openEventStream(reply, ctx.config.webOrigin, { symbols: list });

    const unsubscribe = ctx.hub.subscribe(list, (tick) => {
      reply.raw.write(`event: quote\ndata: ${JSON.stringify(tick)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    reply.hijack();
  });

  app.get('/api/stream/alerts', (request, reply) => {
    const list = parseSymbols((request.query as { symbols?: string }).symbols);
    if (list.length === 0) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide ?symbols=A,B,C' } });
      return;
    }

    openEventStream(reply, ctx.config.webOrigin, { symbols: list });

    const evaluator = new AlertEvaluator();
    const deliver = async (tick: QuoteTick) => {
      try {
        // Reload each tick so newly-added/toggled rules take effect live.
        const rules = (await ctx.persistence.listAlerts()).filter((r) => r.active && list.includes(r.symbol));
        // Drop edge state for rules no longer active so a resumed rule re-arms.
        evaluator.retain(new Set(rules.map((r) => r.id)));
        if (rules.length === 0) return;
        for (const quote of tick.quotes) {
          for (const rule of evaluator.evaluate(rules, quote)) {
            const firedAt = new Date().toISOString();
            // Compare-and-set: only deliver if this connection actually registered
            // the fire (a oneShot already fired elsewhere returns false → skip).
            const registered = await ctx.persistence.markAlertTriggered(rule.id, firedAt, rule.oneShot);
            if (!registered) continue;
            const fired = { ...rule, lastTriggeredAt: firedAt, active: rule.oneShot ? false : rule.active };
            reply.raw.write(`event: alert\ndata: ${JSON.stringify({ rule: fired, quote, firedAt })}\n\n`);
          }
        }
      } catch {
        // Alert evaluation is best-effort, like the hub itself.
      }
    };

    const unsubscribe = ctx.hub.subscribe(list, (tick) => void deliver(tick));

    const heartbeat = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
    reply.hijack();
  });
}
