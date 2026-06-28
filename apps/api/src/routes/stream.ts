import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';

/**
 * SSE quote stream. `GET /api/stream/quotes?symbols=A,B` opens a text/event-stream
 * connection; the hub pushes `quote` events (a jittered batch) until the client
 * disconnects. SSE keeps the foundation dependency-free vs a WebSocket stack.
 */
export function registerStreamRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/stream/quotes', (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Provide ?symbols=A,B,C' } });
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': ctx.config.webOrigin,
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ symbols: list })}\n\n`);

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
    // Tell Fastify we are managing the raw response.
    reply.hijack();
  });
}
