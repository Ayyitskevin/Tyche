import type { FastifyInstance } from 'fastify';
import { AIChatRequestSchema } from '@tyche/contracts';
import type { AppContext } from '../context';
import { generateMockAIResponse } from '../ai/copilot';

export function registerAiRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post('/api/ai/chat', async (request, reply) => {
    const parsed = AIChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: { kind: 'bad_request', message: 'Invalid AI request', detail: parsed.error.issues } });
      return;
    }
    // The foundation only ships the deterministic, grounded mock responder.
    // A live model adapter would slot in here, gated on ctx.config.ai.apiKey.
    const response = generateMockAIResponse(parsed.data);
    ctx.audit.record({ at: new Date().toISOString(), actor: 'local', action: 'ai.chat', outcome: 'allow' });
    reply.send(response);
  });
}
