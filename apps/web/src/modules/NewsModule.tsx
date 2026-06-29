import type { ModulePanelProps } from '@tyche/module-sdk';
import { NewsFeed } from './newsCommon';

export function NewsModule({ symbol, missingCapabilities, reportProvenance }: ModulePanelProps) {
  return (
    <NewsFeed symbol={symbol} missingCapabilities={missingCapabilities} reportProvenance={reportProvenance} />
  );
}
