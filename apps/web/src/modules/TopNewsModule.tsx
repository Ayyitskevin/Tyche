import type { ModulePanelProps } from '@tyche/module-sdk';
import { NewsFeed } from './newsCommon';

/** TOP — the always-global headline tape with the same filter bar. */
export function TopNewsModule({ missingCapabilities, reportProvenance }: ModulePanelProps) {
  return <NewsFeed symbol={null} global missingCapabilities={missingCapabilities} reportProvenance={reportProvenance} />;
}
