import type { AIChatRequest, AIChatResponse, AICitation } from '@tyche/contracts';

const NO_ADVICE_DISCLAIMER =
  'Tyche provides data and educational analysis only — not personalized investment advice. ' +
  'It will not tell you to buy, sell, or hold any security.';

const ADVICE_PATTERN =
  /\b(should i|do you recommend|is it a (good )?(buy|sell)|buy or sell|what should i (buy|sell|do)|will it go up|price target for me)\b/i;

/**
 * Deterministic, terminal-grounded mock copilot. It never calls a model: it
 * summarizes the provided terminal context and cites the provenance it was
 * given. If the user asks for personalized advice, it declines and redirects to
 * the data on screen.
 */
export function generateMockAIResponse(request: AIChatRequest): AIChatResponse {
  const { context, messages } = request;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const question = lastUser?.content ?? '';

  const citations: AICitation[] = context.provenance.slice(0, 6).map((p) => ({
    label: `${p.provider}:${p.capability}`,
    provider: p.provider,
    capability: p.capability,
    ...(p.sourceUrl ? { sourceUrl: p.sourceUrl } : {}),
    asOf: p.freshness.asOf,
  }));

  const lines: string[] = [];

  if (ADVICE_PATTERN.test(question)) {
    lines.push(
      "I can't provide personalized buy/sell/hold guidance. I can, however, walk you through the data on screen.",
    );
  }

  if (context.activeSymbol) {
    lines.push(`Active instrument: ${context.activeSymbol}${context.activeAssetClass ? ` (${context.activeAssetClass})` : ''}.`);
  } else {
    lines.push('No active instrument is set. Type a symbol like `AAPL` to focus one.');
  }

  if (context.openPanels.length > 0) {
    const panelList = context.openPanels
      .map((p) => `${p.moduleId}${p.symbol ? `:${p.symbol}` : ''}`)
      .join(', ');
    lines.push(`Open panels: ${panelList}.`);
  }

  if (context.selection) {
    lines.push(`You have a selection in context: ${context.selection.description}.`);
  }

  if (context.recentCommands.length > 0) {
    lines.push(`Recent commands: ${context.recentCommands.slice(0, 5).join(' · ')}.`);
  }

  if (citations.length > 0) {
    lines.push(
      `Grounded in ${citations.length} source${citations.length > 1 ? 's' : ''}: ${citations
        .map((c) => c.label)
        .join(', ')}. All shown data is provider-attributed; in mock mode it is synthetic.`,
    );
  } else {
    lines.push('No data provenance was attached to this context, so I have nothing to ground a claim on yet.');
  }

  lines.push(
    'Ask me to explain a metric, compare panels, or summarize what is on screen. This response is generated in mock mode (no model key configured).',
  );

  return {
    message: { role: 'assistant', content: lines.join('\n'), createdAt: new Date().toISOString() },
    citations,
    grounded: citations.length > 0,
    disclaimer: NO_ADVICE_DISCLAIMER,
    mode: 'mock',
  };
}

export { NO_ADVICE_DISCLAIMER };
