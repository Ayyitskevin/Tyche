import type { ApiConfig } from '../env';

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Pluggable transactional-email sender. Mirrors the audit-sink pattern: the
 * foundation ships a keyless console sender (the default — it logs the message
 * so flows like password reset are fully exercisable with no provider) and an
 * HTTP sender that POSTs the message to an operator-provided endpoint (a
 * transactional-email provider's HTTP API, or a thin SMTP relay). Tyche never
 * bundles an email provider — you bring your own, the same way you bring your
 * own market-data keys.
 */
export interface EmailSender {
  readonly name: string;
  send(email: OutboundEmail): Promise<void>;
}

/** Logs the email to stdout instead of delivering it. Default; keyless. */
export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console';
  send(email: OutboundEmail): Promise<void> {
    console.info(`[email] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`);
    return Promise.resolve();
  }
}

/**
 * POSTs `{ to, subject, text }` (with an optional `from`) as JSON to a webhook
 * URL — point it at your transactional provider's HTTP API or your own relay,
 * optionally authenticated with a bearer token. Throws on a non-2xx so the
 * caller can record the delivery failure (the reset endpoint still answers 200
 * so it can't be used to probe which addresses exist). `fetch` is resolved at
 * call time so tests can stub the global.
 */
export class HttpEmailSender implements EmailSender {
  readonly name = 'http';
  constructor(
    private readonly url: string,
    private readonly token: string | null = null,
    private readonly from: string | null = null,
    private readonly fetchImpl: (input: string, init: RequestInit) => Promise<Response> = (input, init) =>
      fetch(input, init),
  ) {}

  async send(email: OutboundEmail): Promise<void> {
    const body = this.from ? { from: this.from, ...email } : email;
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`email webhook responded ${res.status}`);
  }
}

/**
 * Build the configured email sender. Falls back to the console sender unless the
 * http sink is selected AND a webhook URL is set, so a misconfigured http sink
 * degrades to "logged, not sent" rather than crashing outbound mail.
 */
export function createEmailSender(config: ApiConfig): EmailSender {
  if (config.emailSink === 'http' && config.emailWebhookUrl) {
    return new HttpEmailSender(config.emailWebhookUrl, config.emailWebhookToken, config.emailFrom);
  }
  return new ConsoleEmailSender();
}
