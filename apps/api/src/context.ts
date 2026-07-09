import type { ProviderRegistry } from '@tyche/data-adapters';
import type { ApiConfig } from './env';
import type { PersistenceStore } from './persistence/types';
import type { PluginHost } from './plugins/PluginHost';
import type { QuoteStreamHub } from './stream/hub';
import type { AuditSink } from './security/audit';
import type { RateLimitStore } from './security/rateLimitStore';
import type { BillingDriver } from './saas/billing';
import type { EmailSender } from './saas/email';
import type { InviteRegistry } from './saas/invites';
import type { UserRegistry } from './saas/users';
import type { UserStores } from './saas/userStores';

export interface AppContext {
  config: ApiConfig;
  registry: ProviderRegistry;
  persistence: PersistenceStore;
  plugins: PluginHost;
  hub: QuoteStreamHub;
  audit: AuditSink;
  /** Shared-or-local backing store for the auth rate limiter. */
  rateLimitStore: RateLimitStore;
  /** Hosted-mode account registry (absent in self-host mode). */
  users?: UserRegistry;
  /** Hosted-mode per-user data stores (absent in self-host mode). */
  userStores?: UserStores;
  /** Hosted-mode seat-invite registry (absent in self-host mode). */
  invites?: InviteRegistry;
  /** Hosted-mode billing driver (absent when billing is disabled). */
  billing?: BillingDriver;
  /** Hosted-mode transactional email sender (password reset, …). */
  email?: EmailSender;
}
