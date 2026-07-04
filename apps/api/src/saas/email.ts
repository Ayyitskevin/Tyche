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

/**
 * Logs the email to stdout instead of delivering it. Default; keyless — the
 * point is that the reset flow is exercisable in dev with no provider. But the
 * body contains a live reset link (an account-takeover credential), so when
 * `redactBody` is set (hosted mode) only the recipient + subject are logged,
 * never the token — otherwise anyone with production log access could lift it.
 */
export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console';
  constructor(private readonly redactBody = false) {}
  send(email: OutboundEmail): Promise<void> {
    if (this.redactBody) {
      console.info(`[email] to=${email.to} subject=${JSON.stringify(email.subject)} (body redacted: hosted console sink)`);
    } else {
      console.info(`[email] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`);
    }
    return Promise.resolve();
  }
}

/** Webhook is given at most this long to respond before the send fails. */
const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * POSTs `{ to, subject, text }` (with an optional `from`) as JSON to a webhook
 * URL — point it at your transactional provider's HTTP API or your own relay,
 * optionally authenticated with a bearer token. Throws on a non-2xx (or a
 * timeout) so the caller can record the delivery failure. `fetch` is resolved
 * at call time so tests can stub the global.
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
      // Bound the wait so a webhook that accepts the connection but never
      // answers fails in seconds instead of leaving the promise pending.
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`email webhook responded ${res.status}`);
  }
}

/**
 * Build the configured email sender. Falls back to the console sender unless the
 * http sink is selected AND a webhook URL is set, so a misconfigured http sink
 * degrades to "logged, not sent" rather than crashing outbound mail. The caller
 * (buildApp) warns loudly at boot when this degradation happens in hosted mode.
 * In hosted mode the console sender redacts the message body so reset tokens
 * never reach the logs.
 */
export function createEmailSender(config: ApiConfig): EmailSender {
  if (config.emailSink === 'http' && config.emailWebhookUrl) {
    return new HttpEmailSender(config.emailWebhookUrl, config.emailWebhookToken, config.emailFrom);
  }
  return new ConsoleEmailSender(config.mode === 'hosted');
}
