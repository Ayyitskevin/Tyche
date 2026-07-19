import type { AssetClass } from '@tyche/contracts';

/**
 * Research "desks" for the LAUNCH launchpad — curated bundles of panels that open
 * together for a symbol (or, for the macro desk, symbol-free). Each desk is just a
 * list of command lines run through the real command path, so a desk is exactly as
 * capable as the commands it names (and each panel degrades on its own capability
 * gap). Descriptive research only — nothing here is advice.
 */
export type DeskId = 'research' | 'forensic' | 'crypto' | 'macro';

export interface Desk {
  id: DeskId;
  title: string;
  blurb: string;
  /** 'symbol' desks scope every panel to the launchpad's symbol; 'macro' desks are symbol-free. */
  scope: 'symbol' | 'macro';
  /** Command lines opened, in order. Symbol desks carry the command token only (the symbol is prefixed at open time). */
  commands: string[];
}

export const DESKS: Desk[] = [
  {
    id: 'research',
    title: 'Equity research',
    blurb: 'Profile, price chart, financials, and SEC filings.',
    scope: 'symbol',
    commands: ['DES', 'GP', 'FA', 'CF'],
  },
  {
    id: 'forensic',
    title: 'Forensic',
    blurb: 'Altman / Piotroski / Beneish scorecard, financials, insiders, and 8-K events.',
    scope: 'symbol',
    commands: ['SCORE', 'FA', 'INSD', 'MEVT'],
  },
  {
    id: 'crypto',
    title: 'Crypto desk',
    blurb: 'Profile, price chart, the L2 order book, and perp funding.',
    scope: 'symbol',
    commands: ['DES', 'GP', 'BOOK', 'FUND'],
  },
  {
    id: 'macro',
    title: 'Macro desk',
    blurb: 'World indices, GDP, the Treasury curve, and the release calendar.',
    scope: 'macro',
    commands: ['WEI', 'ECO GDP', 'YCRV', 'ECOC'],
  },
];

/**
 * The command lines a desk opens. Symbol-scoped desks prefix each command with the
 * symbol (`AAPL DES`); a symbol desk with no symbol yields `[]` (nothing to open).
 * Macro desks are symbol-free and return their lines verbatim.
 */
export function deskSeeds(desk: Desk, symbol: string | null): string[] {
  if (desk.scope === 'macro') return [...desk.commands];
  if (!symbol) return [];
  return desk.commands.map((c) => `${symbol} ${c}`);
}

/** The desk recommended for an asset class — crypto for crypto, research otherwise. */
export function recommendedDesk(assetClass: AssetClass | null): DeskId {
  return assetClass === 'crypto' ? 'crypto' : 'research';
}
