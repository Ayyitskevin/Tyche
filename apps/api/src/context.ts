import type { ProviderRegistry } from '@tyche/data-adapters';
import type { ApiConfig } from './env';
import type { PersistenceStore } from './persistence/types';
import type { PluginHost } from './plugins/PluginHost';
import type { QuoteStreamHub } from './stream/hub';
import type { AuditSink } from './security/audit';
import type { BillingDriver } from './saas/billing';
import type { UserRegistry } from './saas/users';
import type { UserStores } from './saas/userStores';

export interface AppContext {
  config: ApiConfig;
  registry: ProviderRegistry;
  persistence: PersistenceStore;
  plugins: PluginHost;
  hub: QuoteStreamHub;
  audit: AuditSink;
  /** Hosted-mode account registry (absent in self-host mode). */
  users?: UserRegistry;
  /** Hosted-mode per-user data stores (absent in self-host mode). */
  userStores?: UserStores;
  /** Hosted-mode billing driver (absent when billing is disabled). */
  billing?: BillingDriver;
}
